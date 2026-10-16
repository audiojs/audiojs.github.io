// Run: node --test 'lab/**/*.test.mjs'  (what the article says about each sound, checked against its samples)
import test from 'node:test'
import assert from 'node:assert/strict'
import { RATE, fft, window } from '../kit.js'
import { PEAK, shepard, risset, scale, binaural, sides, additive, HZ, NOTES, EARS } from './sounds.js'

const peak = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
// a loop is seamless when the step from its last sample back to its first is no bigger than the steps inside it
const seamless = x => { let inside = 0; for (let i = 1; i < x.length; i++) inside = Math.max(inside, Math.abs(x[i] - x[i - 1])); return Math.abs(x[0] - x.at(-1)) <= inside * 1.01 }
// magnitude spectrum of n samples from `at`, Hann, and the frequency of bin k
function spectrum(x, at, n) {
  const w = window('hann', n), re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = (x[at + i] || 0) * w[i]
  fft(re, im)
  return Float64Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]))
}
const bin = (f, n) => Math.round(f / RATE * n)
// frequency of a stretch of a sine from its zero crossings, the stretch's edges left out
function crossings(x, from, to) {
  let first = -1, last = -1, count = 0
  for (let i = from + 1; i < to; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) { if (first < 0) first = i; else count++; last = i }
  return count / 2 / ((last - first) / RATE)
}

test('every sound stays at or under −6 dBFS', () => {
  const all = [shepard().x, shepard({ envelope: 'flat', octaves: 10 }).x, shepard({ glide: false }).x, risset().x, risset({ ratio: 3, layers: 5 }).x,
    ...scale().channels, ...binaural({ ears: 'both' }).channels, ...sides().channels, additive(Array(16).fill(1), 200), additive([1], 50)]
  for (const x of all) assert.ok(peak(x) <= PEAK + 1e-6, `peak ${peak(x)}`)
})

test('Shepard: the glide and the steps loop without a seam, at any number of octaves', () => {
  for (const octaves of [1, 3, 8, 10]) for (const envelope of ['bell', 'flat']) {
    assert.ok(seamless(shepard({ octaves, envelope }).x), `glide, ${octaves} octaves, ${envelope}`)
    assert.ok(seamless(shepard({ octaves, envelope, glide: false }).x), `steps, ${octaves} octaves, ${envelope}`)
  }
})

test("Shepard: a step is sines an octave apart from 27.5 Hz, loudest at 440 Hz, silent at the bell's ends", () => {
  const { x } = shepard({ glide: false }), n = 8192, s = spectrum(x, Math.round(.02 * RATE), n), at = f => Math.max(...[-1, 0, 1].map(d => s[bin(f, n) + d]))
  const sines = [55, 110, 220, 440, 880, 1760, 3520].map(at)
  assert.equal(Math.max(...sines), at(440))
  assert.ok(at(27.5) < at(440) * 1e-3, 'the bottom of the bell is silent')
  // between the octaves: nothing (a semitone above 440 Hz)
  assert.ok(at(466.16) < at(440) * 1e-2)
})

test('Risset rhythm: loops without a seam, and every beat of a layer is a beat of the layer above', () => {
  for (const [layers, ratio] of [[4, 2], [6, 2], [3, 3], [5, 3]]) {
    const { x, beats, T, slowest, r, L } = risset({ layers, ratio })
    assert.ok(seamless(x), `${layers} layers, ratio ${ratio}`)
    for (const b of beats.filter(b => b.k < L - 1)) assert.ok(beats.some(c => c.k === b.k + 1 && Math.abs(c.t - b.t) < 1e-9), `beat at ${b.t}`)
    // a cycle later, layer k beats where layer k + 1 beats now: its beat count N·r^k·(r^((t + T)/T) − 1) is whole there
    const N = slowest * T / Math.log(r)
    for (const c of beats.filter(c => c.k > 0)) { const count = N * r ** (c.k - 1) * (r ** (1 + c.t / T) - 1); assert.ok(Math.abs(count - Math.round(count)) < 1e-6, `layer ${c.k - 1} next cycle at ${c.t}`) }
    assert.ok(T > 5 && T < 16, `cycle ${T}`)
  }
})

test("Scale illusion: each ear gets the paper's notes, 250 ms each, at equal level", () => {
  const { channels: [L, R] } = scale(), len = RATE / 4
  for (const [x, notes] of [[L, EARS.left], [R, EARS.right]]) for (let j = 0; j < 16; j++) {
    const f = crossings(x, j * len + 200, (j + 1) * len - 200)
    assert.ok(Math.abs(f - HZ[notes[j % 8]]) < 2, `note ${j}: ${f} Hz, not ${HZ[notes[j % 8]]}`)
  }
  assert.deepEqual(EARS.left.map(i => NOTES[i]).join(' '), 'C′ D A F F A D C′')
  assert.deepEqual(EARS.right.map(i => NOTES[i]).join(' '), 'C B E G G E B C')
  assert.equal(L.length, 20 * RATE)
  const rms = x => Math.sqrt(x.reduce((e, v) => e + v * v, 0) / x.length)
  assert.ok(Math.abs(rms(L) / rms(R) - 1) < 1e-3)
  const one = scale({ ears: 'left', swap: true }).channels
  assert.equal(peak(one[1]), 0)
  assert.ok(Math.abs(crossings(one[0], 200, len - 200) - HZ[EARS.right[0]]) < 2, 'swapped: the left ear gets the right one\'s notes')
})

test('Binaural beats: one steady tone per ear, the beat only where both tones mix', () => {
  const n = 2 * RATE, envelope = x => Array.from({ length: 200 }, (_, j) => peak(x.subarray(j * n / 200, (j + 1) * n / 200)))
  const { channels: [L, R] } = binaural({ carrier: 250, beat: 4 })
  for (const [x, f] of [[L, 250], [R, 254]]) {
    const s = spectrum(x, 0, 65536)
    assert.equal(s.indexOf(Math.max(...s)), bin(f, 65536))
    const e = envelope(x)
    assert.ok(Math.min(...e) > .99 * Math.max(...e), 'no beat in either ear')
  }
  assert.ok(seamless(L) && seamless(R))
  const [M] = binaural({ carrier: 250, beat: 4, ears: 'both' }).channels, e = envelope(M)
  assert.ok(Math.min(...e) < .1 * Math.max(...e), 'mixed, the tones beat')
})

test('Left, then right: each side alone', () => {
  const { channels: [L, R], at } = sides(), part = (x, [a, b]) => peak(x.subarray(Math.round(a * RATE), Math.round(b * RATE)))
  assert.ok(part(L, at.left) > .1 && part(R, at.left) === 0)
  assert.ok(part(R, at.right) > .1 && part(L, at.right) === 0)
})

test('Missing fundamental: harmonics 2 to 10 of 200 Hz have nothing at 200 Hz, and repeat every 5 ms', () => {
  const x = additive([0, 1, 1, 1, 1, 1, 1, 1, 1, 1], 200), n = 32768, s = spectrum(x, 0, n)
  assert.ok(s[bin(200, n)] < s[bin(400, n)] * 1e-3)
  // 441 samples are two periods of 200 Hz at 44.1 kHz
  for (let i = 0; i < 2000; i++) assert.ok(Math.abs(x[i + 441] - x[i]) < 1e-4)
  assert.ok(seamless(x))
})
