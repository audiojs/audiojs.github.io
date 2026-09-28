// Bench: every method plays one gesture at the caret, in a worker. Its cost is its fastest run: a busy machine only
// slows runs down, and the methods take turns, so a burst of load slows each by the same chance. Its fidelity is
// measured on the gesture's first hold.
import { fft, window } from '../kit.js'
import { methods } from './methods.js'

export const BLOCK = 128

// The gesture: hold the caret 1.5 s, drag it at half speed for 1 s (forward, or back when the sound ends first), hold
// 0.5 s. `at(i)` is the caret during block i.
export function gesture(caret, length, sr) {
  const hold = 1.5 * sr, drag = sr, dir = caret + .5 * drag < length ? 1 : -1
  return { blocks: Math.ceil((hold + drag + .5 * sr) / BLOCK), hold, at: i => caret + dir * .5 * clamp(i * BLOCK - hold, 0, drag) }
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v

// The gesture played by one method: its samples, and how long rendering took (ms)
export function play(name, x, sr, caret, opts = {}) {
  const g = gesture(caret, x.length, sr), out = new Float32Array(g.blocks * BLOCK), block = new Float32Array(BLOCK)
  const voice = methods[name].make(x, sr, caret, opts), start = performance.now()
  for (let i = 0; i < g.blocks; i++) {
    voice.render(block, g.at(i))
    out.set(block, i * BLOCK)
  }
  return { out, ms: performance.now() - start, g }
}

// Mean power spectrum of Hann frames of 2,048 centred at each of `centres`
function spectrum(x, centres, n = 2048) {
  const w = window('hann', n), re = new Float64Array(n), im = new Float64Array(n), power = new Float64Array(n / 2 + 1)
  for (const c of centres) {
    for (let j = 0; j < n; j++) { const i = c - n / 2 + j; re[j] = i >= 0 && i < x.length ? x[i] * w[j] : 0; im[j] = 0 }
    fft(re, im)
    for (let k = 0; k <= n / 2; k++) power[k] += (re[k] * re[k] + im[k] * im[k]) / centres.length
  }
  return power
}
const range = (from, to, step) => Array.from({ length: Math.max(0, Math.floor((to - from) / step) + 1) }, (_, i) => from + i * step)

// The held sound against the caret's own, both as power spectra (Hann 2,048: 21.5 Hz bins at 44.1 kHz) between
// 50 Hz and 16 kHz: the hold from 0.3 s on, averaged over its frames, and the source's frames within 12 ms of the caret.
// Level: their power ratio. Distance: the mean dB difference per bin with levels aligned, anything under −60 dB of the
// source's loudest bin counted as −60. Flutter: how much the hold's loudness moves, the standard deviation of its
// 10 ms RMS in dB. Repeats: how periodically it moves, the highest correlation of its loudness (5 ms RMS, every 1 ms)
// with itself 20 to 400 ms later; a frame played again and again scores near 1, and so does a sound that beats. Null
// where the hold is silent.
export function fidelity(x, y, sr, caret, hold) {
  const n = 2048, from = Math.round(.3 * sr), ref = spectrum(x, range(caret - 512, caret + 512, 256)), out = spectrum(y, range(from + n / 2, hold - n / 2, 512))
  const lo = Math.ceil(50 * n / sr), hi = Math.min(n / 2, Math.floor(16000 * n / sr))
  let a = 0, b = 0, top = 0
  for (let k = lo; k <= hi; k++) { a += out[k]; b += ref[k]; top = Math.max(top, ref[k]) }
  if (!a || !b) return { level: null, distance: null, flutter: null, repeats: null }
  const floor = top * 1e-6, db = v => 10 * Math.log10(Math.max(v, floor))
  let sum = 0, bins = 0
  for (let k = lo; k <= hi; k++) {
    const o = out[k] * b / a
    if (o < floor && ref[k] < floor) continue
    sum += Math.abs(db(o) - db(ref[k]))
    bins++
  }
  const win = Math.round(.01 * sr), levels = []
  for (let i = from; i + win <= hold; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += y[j] * y[j]
    if (e) levels.push(10 * Math.log10(e / win))
  }
  const mean = levels.reduce((s, v) => s + v, 0) / levels.length
  const flutter = Math.sqrt(levels.reduce((s, v) => s + (v - mean) ** 2, 0) / levels.length)
  return { level: 10 * Math.log10(a / b), distance: bins ? sum / bins : 0, flutter, repeats: repeats(y, from, hold, sr) }
}
function repeats(y, from, to, sr) {
  const step = Math.round(.001 * sr), win = Math.round(.005 * sr), env = []
  for (let i = from; i + win <= to; i += step) { let e = 0; for (let j = i; j < i + win; j++) e += y[j] * y[j]; env.push(Math.sqrt(e / win)) }
  const m = env.reduce((s, v) => s + v, 0) / env.length, d = env.map(v => v - m), energy = d.reduce((s, v) => s + v * v, 0)
  let best = 0
  for (let lag = 20; lag <= 400 && lag < d.length / 2; lag++) {
    let c = 0
    for (let i = 0; i + lag < d.length; i++) c += d[i] * d[i + lag]
    best = Math.max(best, c / energy)
  }
  return energy ? best : 0
}

// Cost from a run's time: µs per block, and how many times faster than real time
const cost = (run, sr) => ({ us: 1000 * run.ms / run.g.blocks, speed: run.out.length / sr * 1000 / run.ms })

// Every method, `passes` turns each: the first turn gives the sound and fidelity (and warms the compiler), later
// turns keep the fastest time. A method whose turn took over 2 s has shown its cost and sits the later turns out.
// Calls back with each result as it improves.
export function bench(x, sr, caret, opts = {}, report = () => {}, passes = 4) {
  const results = {}
  for (let pass = 0; pass < passes; pass++) for (const name of Object.keys(methods)) {
    const last = results[name]
    if (last && last.ms > 2000) continue
    const run = play(name, x, sr, caret, opts)
    if (!last) results[name] = { name, ms: run.ms, ...cost(run, sr), ...fidelity(x, run.out, sr, caret, run.g.hold), audio: run.out }
    else if (run.ms < last.ms) Object.assign(last, { ms: run.ms, ...cost(run, sr) })
    report(results[name], !last)
  }
  return results
}

// As a worker: { x, sr, caret, opts } in; each result out as it improves (the sound only the first time), then { done }
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) onmessage = ({ data: { x, sr, caret, opts } }) => {
  bench(x, sr, caret, opts, (result, first) => {
    const { audio, ...rest } = result
    if (first) postMessage({ ...rest, audio }, [audio.buffer])
    else postMessage(rest)
  })
  postMessage({ done: true })
}
