// The home's chain, run in a worker so the page keeps moving. Every call's result is kept under the calls before
// it, so a call turned on or off recomputes from that call on, the work ahead of it reused. Messages run one at a
// time, in the order sent: load a source, run calls over it, encode a result.
const lib = import('https://esm.sh/audio@2.14.0').then(m => m.default)
let rate, kept = new Map()

// the input as the library takes it: a copy, so what is kept stays as it was
const from = (audio, channels) => audio.from(channels.map(c => c.slice()), { sampleRate: rate })

async function run(audio, calls) {
  let key = '', channels = kept.get(key), i = 0
  for (; i < calls.length && kept.has(key + JSON.stringify(calls[i])); i++) key += JSON.stringify(calls[i]), channels = kept.get(key)
  for (; i < calls.length; i++) {
    const [name, args] = calls[i], a = from(audio, channels)
    a[name](...args)
    channels = await a.read(), key += JSON.stringify(calls[i])
    kept.set(key, channels)
    // the source and the last 24 results
    if (kept.size > 25) kept.delete([...kept.keys()][1])
  }
  return { key, channels }
}

// The source's long-term spectrum and the result's, as stat('spectrum') gives it: dB in mel bands, unweighted, each at
// its centre's frequency (the bands' edges evenly spaced in mel, fMin to fMax). The source's is taken once a load.
const BANDS = 96, mel = f => 2595 * Math.log10(1 + f / 700), hz = m => 700 * (10 ** (m / 2595) - 1)
let heard
async function spectra(audio, result) {
  const fMin = 20, fMax = Math.min(rate / 2, 20000), opts = { bins: BANDS, fMin, fMax, weight: false }
  heard ??= from(audio, kept.get('')).stat('spectrum', opts)
  const step = (mel(fMax) - mel(fMin)) / (BANDS + 1)
  return { hz: Array.from({ length: BANDS }, (_, b) => hz(mel(fMin) + step * (b + 1))), source: await heard, result: await result.stat('spectrum', opts) }
}

const handle = {
  async load(audio, { channels, sampleRate }) { rate = sampleRate, kept = new Map([['', channels]]), heard = null; return { plugins: Object.keys(audio.plugins).length } },
  async run(audio, { calls, spectrum }) {
    const { channels } = await run(audio, calls), result = from(audio, channels), [peak, lufs] = await result.stat(['db', 'loudness'])
    const out = channels.map(c => c.slice())
    return [{ channels: out, sampleRate: rate, peak, lufs, spectra: spectrum ? await spectra(audio, result) : undefined }, out.map(c => c.buffer)]
  },
  async encode(audio, { calls }) {
    const bytes = await from(audio, (await run(audio, calls)).channels).encode('wav')
    return [{ bytes }, [bytes.buffer]]
  }
}
let queue = Promise.resolve()
self.onmessage = ({ data }) => queue = queue.then(async () => {
  try {
    const out = await handle[data.type](await lib, data), [reply, transfer = []] = Array.isArray(out) ? out : [out]
    self.postMessage({ id: data.id, ...reply }, transfer)
  } catch (e) { self.postMessage({ id: data.id, error: e.message }) }
})
