// /util/latency/ check. Part one runs the page's own DSP (exported from latency.mjs, inlined into the page) on
// synthetic signals whose delays are known exactly: the chirp is evaluated analytically at t − d, so fractional delays
// need no interpolation. Part two loads the page in Chromium with fake media devices: the fake microphone cannot hear
// the speaker, so the round trip must say so gracefully, and the tap test must recover taps placed a known time after
// each scheduled click.
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'
import { locate, roundTrip, tapOffsets, quantile, SWEEP, BEAT } from './latency.mjs'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }

// ── part one: the DSP ──

// the linear chirp @audio/synth-chirp makes for the page (method 'lin', amp 1, 5 ms raised-cosine fades), at any time t
const chirpAt = fs => {
  const { f0, f1, duration } = SWEEP, n = Math.round(duration * fs), F = Math.max(1, Math.round(0.005 * fs)), k = (f1 - f0) / duration
  return t => {
    const i = t * fs
    if (i < 0 || i > n - 1) return 0
    const g = i < F ? 0.5 - 0.5 * Math.cos(Math.PI * i / F) : i > n - 1 - F ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / F) : 1
    return g * Math.sin(2 * Math.PI * (f0 * t + k * t * t / 2))
  }
}
const refOf = fs => { const c = chirpAt(fs); return Float32Array.from({ length: Math.round(SWEEP.duration * fs) }, (_, i) => c(i / fs)) }
// deterministic Gaussian noise
let seed = 7
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
const chirpRms = Math.SQRT1_2 // a unit sine's RMS; the fades lower it slightly

// locate: known delays with white noise at 0 dB SNR (noise RMS = chirp RMS) at both common rates
for (const fs of [48000, 44100]) {
  const c = chirpAt(fs), ref = refOf(fs), guard = Math.round(fs / 1000)
  for (const d of [0, 3.2, 47.9, 250]) {
    const rec = Float32Array.from({ length: Math.round(0.8 * fs) }, (_, i) => 0.25 * c(i / fs - d / 1000) + 0.25 * chirpRms * gauss())
    const r = locate(rec, ref, { to: Math.round(SWEEP.max * fs), guard }), err = r.lag / fs * 1000 - d
    ok(Math.abs(err) <= 0.1 && r.ratio >= 2, `locate @ ${fs} Hz: ${d} ms in noise at 0 dB SNR → ${(r.lag / fs * 1000).toFixed(4)} ms (error ${err.toFixed(4)} ms, need ≤ 0.1), peak ratio ${r.ratio.toFixed(1)}×`)
  }
}
{
  const fs = 48000, c = chirpAt(fs), ref = refOf(fs), guard = 48
  const inv = Float32Array.from({ length: 0.8 * fs }, (_, i) => -0.25 * c(i / fs - 0.0479) + 0.05 * gauss())
  const r = locate(inv, ref, { to: 0.6 * fs, guard })
  ok(Math.abs(r.lag / fs * 1000 - 47.9) <= 0.1, `locate: inverted polarity still at 47.9 ms (${(r.lag / fs * 1000).toFixed(4)} ms)`)
  const noise = Float32Array.from({ length: 0.8 * fs }, () => 0.1 * gauss())
  ok(locate(noise, ref, { to: 0.6 * fs, guard }).ratio < 1.5, `locate: noise alone scores below 1.5× (${locate(noise, ref, { to: 0.6 * fs, guard }).ratio.toFixed(2)}×)`)
  const tone = Float32Array.from({ length: 0.8 * fs }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 1000 * i / fs))
  ok(locate(tone, ref, { to: 0.6 * fs, guard }).ratio < 1.5, `locate: a steady 1 kHz tone scores below 1.5× (${locate(tone, ref, { to: 0.6 * fs, guard }).ratio.toFixed(2)}×)`)
}

// roundTrip: a run as the page records it. `out` holds the ten chirps as sent (exactly zero between them, onsets off
// the sample grid); `mic` holds them `delays[k]` ms later through a room, plus noise and `extra(t)`.
const run = (fs, delays, { room = true, noise = 0.01, extra = null } = {}) => {
  // the room: an echo at half the direct sound 1.7 ms later, another at a third 6.3 ms later, and a diffuse tail
  // (direct-to-reverberant ratio about −5 dB) that starts 3 ms after the direct sound
  const c = chirpAt(fs), ref = refOf(fs), lead = 0.4, len = Math.ceil((lead + SWEEP.at.at(-1) + SWEEP.duration + SWEEP.max + 0.1) * fs)
  const onsets = SWEEP.at.map(at => lead + at + 0.37 / fs)
  const out = new Float32Array(len), mic = new Float32Array(len)
  let tail = null
  if (room) {
    const ir = Float32Array.from({ length: Math.round(0.3 * fs) }, (_, i) => 0.011 * gauss() * Math.pow(10, -3 * i / fs / 0.4))
    tail = new Float32Array(ref.length + ir.length)
    for (let i = 0; i < ref.length; i++) for (let j = 0; j < ir.length; j++) tail[i + j] += ref[i] * ir[j]
  }
  onsets.forEach((o, k) => {
    const d = delays[k] / 1000, a = Math.floor(o * fs), b = Math.min(len, Math.ceil((o + d + 0.02 + SWEEP.duration) * fs))
    for (let i = a; i < a + ref.length + 2; i++) out[i] = 0.25 * c(i / fs - o)
    for (let i = a; i < b; i++) {
      const t = i / fs - o - d
      mic[i] += 0.2 * c(t) + (room ? -0.1 * c(t - 0.0017) + 0.07 * c(t - 0.0063) : 0)
    }
    if (tail) { const s = Math.round((o + d + 0.003) * fs); for (let i = 0; i < tail.length && s + i < len; i++) mic[s + i] += tail[i] }
  })
  for (let i = 0; i < len; i++) mic[i] += noise * gauss() + (extra ? extra(i / fs) : 0)
  return roundTrip(out, mic, ref, fs, { max: SWEEP.max })
}
const N = SWEEP.at.length, flat = d => Array(N).fill(d)
for (const [fs, d] of [[48000, 47.9], [44100, 250]]) {
  const r = run(fs, flat(d))
  ok(r.quality === 'clear' && r.agree === N && Math.abs(r.delay - d) <= 0.1 && r.spread <= 0.1,
    `roundTrip @ ${fs} Hz: ${d} ms through a room (echoes at +1.7 and +6.3 ms, RT60 0.4 s tail) → ${r.quality}, ${r.delay.toFixed(4)} ms, spread ${r.spread.toFixed(4)} ms, ${r.agree}/${r.count} agree, ratio ${r.ratio.toFixed(1)}×`)
}
{
  const jit = [0, 0.6, -0.4, 0.8, -0.8, 0.2, -0.2, 0.5, -0.6, 0.3].map(x => 120 + x), r = run(48000, jit)
  ok(r.quality === 'clear' && Math.abs(r.delay - quantile(jit, 0.5)) <= 0.1 && Math.abs(r.spread - 1.6) <= 0.1,
    `roundTrip: chirps jittering ±0.8 ms around 120 ms → median ${r.delay.toFixed(3)} ms (expect ${quantile(jit, 0.5).toFixed(3)}), spread ${r.spread.toFixed(3)} ms (expect 1.6)`)
  // one chirp drowned by a loud noise burst: the other nine still agree
  const burst = run(48000, flat(30), { extra: t => t > 2.2 && t < 3.0 ? 20 * gauss() : 0 })
  ok(burst.quality === 'clear' && Math.abs(burst.delay - 30) <= 0.1 && burst.agree === 9, `roundTrip: a noise burst over one chirp → ${burst.quality}, ${burst.delay.toFixed(3)} ms, ${burst.agree}/${burst.count} agree`)
  // a dry path; then an echo nearly as loud as the direct sound: same delay, flagged weak
  const fs = 48000, c = chirpAt(fs), echo = run(fs, flat(20), { room: false })
  const twin = (() => {
    const ref = refOf(fs), len = Math.ceil(9.5 * fs), out = new Float32Array(len), mic = new Float32Array(len)
    for (const at of SWEEP.at) {
      const o = 0.4 + at, a = Math.floor(o * fs)
      for (let i = a; i < a + ref.length + 2; i++) out[i] = 0.25 * c(i / fs - o)
      for (let i = a; i < a + Math.round(0.2 * fs); i++) mic[i] = 0.2 * c(i / fs - o - 0.02) + 0.17 * c(i / fs - o - 0.025) + 0.01 * gauss()
    }
    return roundTrip(out, mic, ref, fs, { max: SWEEP.max })
  })()
  ok(echo.quality === 'clear' && Math.abs(echo.delay - 20) <= 0.1, `roundTrip: dry path at 20 ms → ${echo.quality}, ${echo.delay.toFixed(3)} ms`)
  ok(twin.quality === 'weak' && Math.abs(twin.delay - 20) <= 0.1, `roundTrip: an echo at 85 % of the direct sound 5 ms later → ${twin.quality} (ratio ${twin.ratio.toFixed(2)}×), still ${twin.delay.toFixed(3)} ms`)
}
{
  // no loopback: what a fake, muted or buzzing microphone gives
  const fs = 48000, ref = refOf(fs), c = chirpAt(fs), len = Math.ceil(9.5 * fs), out = new Float32Array(len)
  for (const at of SWEEP.at) { const o = 0.4 + at, a = Math.floor(o * fs); for (let i = a; i < a + ref.length + 2; i++) out[i] = 0.25 * c(i / fs - o) }
  const mics = {
    noise: Float32Array.from({ length: len }, () => 0.05 * gauss()),
    'beeps every 0.5 s': Float32Array.from({ length: len }, (_, i) => (i / fs) % 0.5 < 0.05 ? 0.3 * Math.sin(2 * Math.PI * 1000 * i / fs) : 0),
    'a 3 ms click train (a buzz)': Float32Array.from({ length: len }, (_, i) => i % 144 === 0 ? 0.5 : 0),
    'a 20 ms click train (mains buzz)': Float32Array.from({ length: len }, (_, i) => i % 960 === 0 ? 0.5 : 0),
    silence: new Float32Array(len),
  }
  for (const [name, mic] of Object.entries(mics)) {
    const r = roundTrip(out, mic, ref, fs, { max: SWEEP.max })
    ok(r.quality === 'none' && r.count === N && isNaN(r.delay), `roundTrip: microphone hears ${name} → ${r.quality} (${r.count} chirps found in the output, ratio ${(r.ratio || 0).toFixed(2)}×)`)
  }
}

// tapOffsets: clicks every 600 ms from t = 1000 ms, taps 120 ms late with ±10 ms of scatter
{
  const first = 1000, beat = 600, taps = []
  for (let j = 0; j < 20; j++) {
    if (j === 10) continue                                   // a missed click
    const off = j === 12 ? -100 : 120 + 10 * Math.sin(j * 2.1) // one tap ahead of its click
    taps.push(first + j * beat + off)
    if (j === 7) taps.push(first + j * beat + off + 40)       // a double tap: only the first counts
  }
  const offs = tapOffsets(taps, first, beat, { from: 4, to: 20 })
  ok(offs.length === 15 && offs.includes(-100), `tapOffsets: 16 counted clicks, one missed, one double tap → ${offs.length} offsets (expect 15), the early tap kept as −100 ms`)
  ok(Math.abs(quantile(offs, 0.5) - 120) <= 10, `tapOffsets: median ${quantile(offs, 0.5).toFixed(1)} ms (expect 120 ± 10)`)
  const edge = tapOffsets([first + 5 * beat + 449, first + 7 * beat + 451], first, beat)
  ok(edge[0] === 449 && edge[1] === -149, `tapOffsets: a tap 449 ms after a click answers it, 451 ms answers the next (${edge.map(x => x.toFixed(0)).join(', ')})`)
  ok(tapOffsets([NaN, 1500], NaN, beat).length === 0, 'tapOffsets: an unknown clock yields no offsets')
}
ok(quantile([3, 1, 2], 0.5) === 2 && quantile([1, 2, 3, 4], 0.5) === 2.5 && isNaN(quantile([], 0.5)), 'quantile: median of odd, even and empty lists')

// ── part two: the page ──

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(root, rel)
  if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end('404') }
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

// test-side instruments only: keep the page's AudioContext and the times its sounds are scheduled at, and tap Space
// `off` ms after each scheduled click, mapped to performance.now() through the audio clock
const STUB = `
  const AC = window.AudioContext
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctx = this } }
  const start = AudioBufferSourceNode.prototype.start
  window.__starts = []
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) { window.__starts.push(when); return start.call(this, when, ...rest) }
  window.__tapAlong = async off => {
    // performance.now() minus the audio clock, smallest over 150 ms of samples: the moment the clock ticked. Not in the
    // first moments of the context: it renders a burst ahead to prime the output, and its clock runs ahead meanwhile.
    const c = window.__ctx, gaps = []
    while (c.currentTime < window.__starts[0] - 0.3) await new Promise(r => setTimeout(r, 5))
    const end = performance.now() + 150
    while (performance.now() < end) { gaps.push(performance.now() - c.currentTime * 1000); await new Promise(r => setTimeout(r, 1)) }
    const k = Math.min(...gaps)
    for (const w of window.__starts) setTimeout(() => { for (const type of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true })) }, w * 1000 + k + off - performance.now())
  }
`
// a loopback without a room: the microphone source is swapped for a 47.9 ms DelayNode fed by the page's first GainNode
// (its output level), so the whole page (recorder, analysis, report) must find exactly that delay
const LOOP = `
  const source = AudioContext.prototype.createMediaStreamSource, gain = AudioContext.prototype.createGain
  AudioContext.prototype.createMediaStreamSource = function () { const d = this.createDelay(1); d.delayTime.value = 0.0479; this.__loop = d; return d }
  AudioContext.prototype.createGain = function () { const g = gain.call(this); if (this.__loop && !this.__fed) { this.__fed = true; g.connect(this.__loop) } return g }
`
const browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const errors = []
const open = async (width, height, ...scripts) => {
  const context = await browser.newContext({ viewport: { width, height } })
  for (const s of [STUB, ...scripts]) await context.addInitScript(s)
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${base}/util/latency/`)
  return page
}
const rows = (page, id) => page.$$eval(`#${id} > div`, ds => Object.fromEntries(ds.map(d => [d.querySelector('.k').textContent, d.querySelector('.v').textContent])))
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

// round trip, desktop: the fake microphone hears only its own beeps
{
  const page = await open(1280, 900)
  await page.click('#rtStart')
  await page.waitForFunction(() => !/^(Asking|Listening|Chirp|Computing)/.test(document.getElementById('rtMsg').textContent), null, { timeout: 40000 })
  const msg = await page.textContent('#rtMsg'), rt = await rows(page, 'rtReport'), br = await rows(page, 'brReport')
  ok(/^(No loopback|Weak loopback)/.test(msg), `round trip with a fake microphone ends in a loopback warning: "${msg.slice(0, 60)}…"`)
  ok(/×$/.test(rt['Peak ratio'] || '') && parseFloat(rt['Peak ratio']) < 2, `round trip: peak ratio reported and low (${rt['Peak ratio']})`)
  ok(await page.isVisible('#rtViz canvas'), 'round trip: correlation plot drawn')
  ok(/kHz$/.test(br['Sample rate'] || '') && 'Base latency' in br && 'Output latency' in br && 'Input latency' in br, `browser report: sample rate ${br['Sample rate']}, base ${br['Base latency']}, output ${br['Output latency']}, input ${br['Input latency']}`)
  ok(br['Mic processing'] === 'off', `browser report: echo cancellation, noise suppression and auto gain off (${br['Mic processing']})`)
  ok(await page.textContent('#rtStart') === 'Start round-trip test' && !(await page.isDisabled('#tpStart')), 'round trip: controls restored after the run')
  ok(await overflow(page) <= 0, 'no horizontal overflow at 1280 px')
}

// round trip through the 47.9 ms loopback
{
  const page = await open(1280, 900, LOOP)
  await page.click('#rtStart')
  await page.waitForFunction(() => !/^(Asking|Listening|Chirp|Computing)/.test(document.getElementById('rtMsg').textContent), null, { timeout: 40000 })
  const msg = await page.textContent('#rtMsg'), rt = await rows(page, 'rtReport'), got = parseFloat(rt['Round trip'])
  ok(/^Done: 10 of 10/.test(msg) && Math.abs(got - 47.9) <= 0.1, `round trip through a 47.9 ms loopback → ${rt['Round trip']}, spread ${rt.Spread}, ratio ${rt['Peak ratio']}: "${msg}"`)
  ok(await page.evaluate(() => document.querySelector('#rtReport .v').classList.contains('ok')), 'round trip: a clear result is marked ok')
}

// tap test, phone width: taps 100 ms, then 250 ms after each click; a third run stopped part-way
{
  const page = await open(390, 844)
  const tapRun = async off => {
    await page.evaluate(() => window.__starts.length = 0)
    await page.click('#tpStart')
    await page.waitForFunction(n => window.__starts.length === n, BEAT.count)
    await page.evaluate(off => window.__tapAlong(off), off)
    await page.waitForFunction(() => /^(Done|Only|The test)/.test(document.getElementById('tpMsg').textContent), null, { timeout: 30000 })
    return { msg: await page.textContent('#tpMsg'), tp: await rows(page, 'tpReport'), runs: await page.$$eval('#tpRuns li', ls => ls.map(l => l.textContent)) }
  }
  const a = await tapRun(100), heard = parseFloat(a.tp['Delay you hear'])
  ok(/^Done/.test(a.msg) && Math.abs(heard - 100) <= 6, `tap test: taps 100 ms after each click → ${a.tp['Delay you hear']} (expect 100 ± 6)`)
  ok(parseFloat((a.tp.Spread || '').replace('±', '')) <= 5, `tap test: spread of evenly placed taps ${a.tp.Spread}`)
  ok(/^\d/.test(a.tp["Browser's figures"] || '') || a.tp["Browser's figures"] === 'not reported', `tap test: browser's figures ${a.tp["Browser's figures"]}`)
  const b = await tapRun(250), diff = parseFloat(b.tp['Delay you hear']) - heard
  ok(b.runs.length === 2 && /against run 1/.test(b.runs[1]) && Math.abs(diff - 150) <= 6, `tap test: second run 150 ms later is ${diff.toFixed(0)} ms later; runs: ${b.runs.join(' | ')}`)
  await page.click('#tpStart')
  ok(await page.evaluate(() => document.activeElement.id) === 'pad' && !(await page.isDisabled('#pad')), 'tap test: the pad takes focus and accepts taps while running')
  await page.waitForTimeout(1500)
  await page.click('#tpStart')
  ok(await page.textContent('#tpMsg') === 'Stopped.' && await page.isDisabled('#pad') && (await page.$$('#tpRuns li')).length === 2, 'tap test: Stop ends the run without adding one')
  ok(await overflow(page) <= 0, 'no horizontal overflow at 390 px')
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))
await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
