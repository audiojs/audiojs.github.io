// Run: node --test 'lab/**/*.test.mjs'  (the methods' claims, checked on sounds whose answers are known)
import test from 'node:test'
import assert from 'node:assert/strict'
import { fft, window, sound } from '../kit.js'
import { methods } from './methods.js'
import { play, bench, fidelity } from './bench.js'

const sr = 44100, len = 3 * sr, BLOCK = 128
const sine = (f, a = .5) => Float32Array.from({ length: len }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr))
const noise = (a = .25, seed = 7) => { let s = seed; return Float32Array.from({ length: len }, () => a * ((s = s * 16807 % 2147483647) / 2147483647 * 2 - 1)) }
const names = Object.keys(methods), freezes = names.filter(n => n !== 'tape')
const rms = (x, from = 0, to = x.length) => { let e = 0; for (let i = from; i < to; i++) e += x[i] * x[i]; return Math.sqrt(e / (to - from)) }
const db = r => 20 * Math.log10(r)

// Renders `seconds` of a method while the caret follows at(block index)
function render(name, x, at, seconds = 1.5, opts = {}) {
  const out = new Float32Array(Math.ceil(seconds * sr / BLOCK) * BLOCK), block = new Float32Array(BLOCK), voice = methods[name].make(x, sr, at(0), opts)
  for (let i = 0; i < out.length / BLOCK; i++) { voice.render(block, at(i)); out.set(block, i * BLOCK) }
  return { out, voice }
}
// The frequency of the loudest bin of y's mean power spectrum from `from` on (Hann frames of 8,192, half overlapping:
// a method that blurs a line, as grains do, scatters one frame's peak across the blur), refined by the parabola
// through its log neighbours
function pitch(y, from) {
  const n = 8192, w = window('hann', n), re = new Float64Array(n), im = new Float64Array(n), power = new Float64Array(n / 2)
  for (let at = from; at + n <= y.length; at += n / 2) {
    for (let i = 0; i < n; i++) { re[i] = y[at + i] * w[i]; im[i] = 0 }
    fft(re, im)
    for (let k = 0; k < n / 2; k++) power[k] += re[k] ** 2 + im[k] ** 2
  }
  let k = 1
  for (let j = 1; j < n / 2 - 1; j++) if (power[j] > power[k]) k = j
  const a = Math.log(power[k - 1]), b = Math.log(power[k]), c = Math.log(power[k + 1])
  return (k + .5 * (a - c) / (a - 2 * b + c)) * sr / n
}

test('every method stays finite: silence, and carets at both ends', () => {
  for (const name of names) for (const x of [new Float32Array(len), noise()]) for (const caret of [0, len - 1]) {
    const { out } = render(name, x, () => caret, .3)
    assert.ok(out.every(Number.isFinite), `${name} at ${caret}`)
  }
})

test('held, every method but tape keeps the level of a sine and of noise (±1 and ±2 dB)', () => {
  for (const [x, tolerance] of [[sine(440), 1], [noise(), 2]]) {
    const caret = len / 2, source = rms(x, caret - 4096, caret + 4096)
    for (const name of freezes) {
      const { out } = render(name, x, () => caret)
      const change = db(rms(out, .3 * sr) / source)
      assert.ok(Math.abs(change) < tolerance, `${name}: ${change.toFixed(2)} dB`)
    }
  }
})

test('held, tape falls silent: a still head reads a constant', () => {
  const { out } = render('tape', sine(440), () => len / 2)
  assert.ok(rms(out, sr) < 1e-3)
})

// How far a held sine may move, and why. The vocoders, the lines and the reassigned bank play the peak's own frequency.
// Grains blur a line to their length (80 ms: ±6 Hz). Random phase plays only the frame's bin frequencies: within half
// a bin, 10.8 Hz at 2,048 (a 220 Hz sine comes out 45 cents sharp). A bank read from the bins spreads a line over its
// bands anywhere in the analysis lobe, ±2 bins.
const drift = { grains: 6.25, random: sr / 2048 / 2, bank: 1, lines: 1, vocoder: 1, hybrid: 1 }
test('held, a sine keeps its pitch within each method\'s resolution', () => {
  for (const f0 of [220, 440, 1234.5]) for (const name of Object.keys(drift)) {
    const f = pitch(render(name, sine(f0), () => len / 2, 3).out, Math.round(.3 * sr))
    assert.ok(Math.abs(f - f0) < drift[name], `${name}: ${f.toFixed(2)} Hz for ${f0}`)
    if (name !== 'bank') continue
    const bins = pitch(render(name, sine(f0), () => len / 2, 3, { analysis: 'bins' }).out, Math.round(.3 * sr))
    assert.ok(Math.abs(bins - f0) < 2 * sr / 2048, `bank from bins: ${bins.toFixed(2)} Hz for ${f0}`)
  }
})

test('overlapped 8 or 16 times, the spectral methods keep a held sine\'s and noise\'s level (±1 and ±2 dB)', () => {
  for (const overlap of [8, 16]) for (const [x, tolerance] of [[sine(440), 1], [noise(), 2]]) {
    const caret = len / 2, source = rms(x, caret - 4096, caret + 4096)
    for (const name of ['random', 'vocoder', 'hybrid']) {
      const change = db(rms(render(name, x, () => caret, 1.5, { overlap }).out, .3 * sr) / source)
      assert.ok(Math.abs(change) < tolerance, `${name}, overlap ${overlap}: ${change.toFixed(2)} dB`)
    }
  }
})

test('overlapped 8 or 16 times, the vocoder still plays the source back unchanged at the speed of sound', () => {
  for (const overlap of [8, 16]) {
    const x = noise(), start = sr / 2, n = 2048, { out } = render('vocoder', x, i => start + i * BLOCK, 1, { frame: n, overlap })
    let error = 0, power = 0
    for (let t = 2 * n; t < out.length; t++) { const s = x[t + start - n / 2]; error += (out[t] - s) ** 2; power += s * s }
    assert.ok(db(Math.sqrt(power / error)) > 100, `overlap ${overlap}: SNR ${db(Math.sqrt(power / error)).toFixed(1)} dB`)
  }
})

test('held on a drum hit, a frame of 8,192 repeats every hop; a spread of 150 ms stops it', () => {
  const x = sound('drums'), caret = Math.round(.3 * x.length)
  const repeats = spread => { const { out, g } = play('vocoder', x, sr, caret, { frame: 8192, spread }); return fidelity(x, out, sr, caret, g.hold).repeats }
  assert.ok(repeats(0) > .9, `still: ${repeats(0).toFixed(2)}`)
  assert.ok(repeats(150) < .5, `spread: ${repeats(150).toFixed(2)}`)
})

test('held, a loop repeats every 80 − 8 ms, so it plays a sine at the nearest multiple of its rate', () => {
  const rate = sr / (Math.round(.08 * sr) - Math.round(.008 * sr)), f = pitch(render('loop', sine(440), () => len / 2).out, Math.round(.3 * sr))
  assert.ok(Math.abs(f - Math.round(440 / rate) * rate) < .5, `${f.toFixed(2)} Hz, rate ${rate.toFixed(2)} Hz`)
})

test('dragged at twice the speed, tape plays an octave up and the vocoder at pitch', () => {
  const at = i => sr / 2 + 2 * i * BLOCK
  assert.ok(Math.abs(pitch(render('tape', sine(440), at, 1).out, 8192) / 880 - 1) < .01)
  assert.ok(Math.abs(pitch(render('vocoder', sine(440), at, 1).out, 8192) / 440 - 1) < .005)
})

test('dragged at the speed of sound, the vocoder plays the source back unchanged, half a frame late', () => {
  const x = noise(), start = sr / 2, n = 2048, { out } = render('vocoder', x, i => start + i * BLOCK, 1, { frame: n })
  let error = 0, power = 0
  for (let t = 2 * n; t < out.length; t++) { const s = x[t + start - n / 2]; error += (out[t] - s) ** 2; power += s * s }
  assert.ok(db(Math.sqrt(power / error)) > 100, `SNR ${db(Math.sqrt(power / error)).toFixed(1)} dB`)
})

test('vocoder + noise locks a sine\'s bins and leaves noise random', () => {
  const locked = x => { const { voice } = render('hybrid', x, () => len / 2, .1); return voice.tonal.reduce((s, v) => s + v, 0) / voice.tonal.length }
  const k = Math.round(440 * 2048 / sr), { voice } = render('hybrid', sine(440), () => len / 2, .1)
  for (let j = k - 1; j <= k + 1; j++) assert.equal(voice.tonal[j], 1)
  assert.ok(locked(noise()) < .15, `noise: ${(100 * locked(noise())).toFixed(1)} % locked`)
})

const bankOf = (bands, x = new Float32Array(sr), o = {}) => { const voice = methods.bank.make(x, sr, 0, { bands, ...o }); return { voice, bank: voice.voices[0] } }

test('a noiscillator\'s normalization is its lowpass cascade\'s impulse energy, in closed form', () => {
  const { bank } = bankOf(4)
  for (const [j, width] of [[0, .5], [1, 20], [2, 700], [3, 12000]]) {
    bank.set(j, 1000, width, 1, 0, true)
    const c = bank.c[j], s = new Float64Array(4)
    let energy = 0
    for (let t = 0, x = 1; t < 5e7 && (t < 64 || s[3] * s[3] > 1e-18 * energy); t++, x = 0) {
      for (let p = 0; p < 4; p++) { s[p] += c * ((p ? s[p - 1] : x) - s[p]) }
      energy += s[3] * s[3]
    }
    assert.ok(Math.abs(energy * bank.norm[j] ** 2 - 1) < 1e-6, `width ${width} Hz`)
  }
})

test('a noiscillator plays at its level (±5 %)', () => {
  for (const width of [50, 500, 5000]) {
    const { bank } = bankOf(1)
    bank.set(0, 1000, width, .3, 0, true)
    const out = new Float32Array(BLOCK), y = new Float32Array(Math.floor(10 * sr / BLOCK) * BLOCK)
    for (let i = 0; i < y.length / BLOCK; i++) { out.fill(0); bank.render(out); y.set(out, i * BLOCK) }
    const r = rms(y, sr)
    assert.ok(Math.abs(r / .3 - 1) < .05, `width ${width} Hz: RMS ${r.toFixed(3)}`)
  }
})

test('read from the bins, the noisc bank puts a sine\'s power in the bands around it (±3 %)', () => {
  const { voice, bank } = bankOf(128, sine(1000), { analysis: 'bins' }), out = new Float32Array(BLOCK)
  voice.render(out, len / 2)
  let power = 0
  for (let j = 0; j < bank.count; j++) if (Math.abs(bank.to[j] - 1000) < 250) power += bank.level[j] ** 2
  assert.ok(Math.abs(power / .125 - 1) < .03, `${power.toFixed(4)} of .125`)
})

test('reassigned, the noisc bank puts a sine\'s power in one band, a line at its frequency (±2 %, ±0.5 Hz)', () => {
  const { voice, bank } = bankOf(128, sine(1000)), out = new Float32Array(BLOCK)
  voice.render(out, len / 2)
  let loud = 0, power = 0
  for (let j = 0; j < bank.count; j++) { power += bank.level[j] ** 2; if (bank.level[j] > bank.level[loud]) loud = j }
  assert.ok(Math.abs(bank.level[loud] ** 2 / .125 - 1) < .02 && bank.level[loud] ** 2 / power > .98, `${(bank.level[loud] ** 2).toFixed(4)} of .125, ${(100 * bank.level[loud] ** 2 / power).toFixed(1)} % of the bank`)
  assert.ok(Math.abs(bank.to[loud] - 1000) < .5, `${bank.to[loud].toFixed(2)} Hz`)
  assert.ok(bank.tone[loud] > .99, `tone ${bank.tone[loud].toFixed(3)}`)
})

test('every kind of line plays a held sine at its pitch; FM lines and sines keep its level, and an FM line\'s level stays still', () => {
  const x = sine(440), caret = len / 2, source = rms(x, caret - 4096, caret + 4096)
  for (const name of ['bank', 'lines']) for (const line of ['band', 'fm', 'rice']) {
    const { out } = render(name, x, () => caret, 3, { line }), f = pitch(out, Math.round(.3 * sr))
    assert.ok(Math.abs(f - 440) < 1, `${name}, ${line}: ${f.toFixed(2)} Hz`)
    if (line === 'band') continue
    const change = db(rms(out, .3 * sr) / source)
    assert.ok(Math.abs(change) < 1, `${name}, ${line}: ${change.toFixed(2)} dB`)
  }
  const { out, g } = play('bank', x, sr, caret, { line: 'fm' }), { flutter } = fidelity(x, out, sr, caret, g.hold)
  assert.ok(flutter < .3, `flutter ${flutter.toFixed(2)} dB`)
})

test('renders repeat exactly: every random draw is seeded', () => {
  for (const name of names) {
    const a = render(name, noise(), i => sr + i * 37, .3).out, b = render(name, noise(), i => sr + i * 37, .3).out
    assert.deepEqual(a, b, name)
  }
})

test('the bench reports every method with a cost and, but for tape, a fidelity', () => {
  const x = sine(220), results = bench(x.subarray(0, 2 * sr), sr, sr / 2, {}, () => {}, 1)
  for (const name of names) {
    const r = results[name]
    assert.ok(r.us > 0 && r.speed > 0 && r.audio.length > 0, name)
    assert.equal(r.level === null, name === 'tape', name)
  }
  assert.ok(Math.abs(play('loop', x, sr, sr / 2).out.length / sr - 3) < .01)
})
