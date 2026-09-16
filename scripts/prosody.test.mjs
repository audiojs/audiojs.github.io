import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyze, render, encode } from '../util/prosody/process.js'
import { retime, mapTime, transform, movePoint, pitchAt } from '../util/prosody/model.js'
import { decodeWav } from '../util/prosody/dsp.js'
import { speechPitch } from '../util/prosody/world.js'
const fs = 16000
const tone = (frequency = 180, seconds = 2) => Float32Array.from({ length: fs * seconds }, (_, i) => 0.3 * Math.sin(2 * Math.PI * frequency * i / fs))
const median = data => [...data].filter(Boolean).sort((a, b) => a - b).at(Math.floor([...data].filter(Boolean).length / 2))

test('pitch interpolation has continuous slopes, no overshoot, and no pitch inside unvoiced gaps', () => {
  const track = { times: Float32Array.of(0, .1, .2, .3, .4), f0: Float32Array.of(100, 200, 100, 0, 150), hop: .1 }
  for (let i = 0; i <= 200; i++) {
    const value = pitchAt(track, track.f0, i / 1000)
    assert.ok(value >= 100 - 1e-10 && value <= 200 + 1e-10)
  }
  const eps = 1e-5, peak = pitchAt(track, track.f0, .1)
  assert.ok(Math.abs(peak - 200) < 1e-10)
  assert.ok(Math.abs((peak - pitchAt(track, track.f0, .1 - eps)) / eps) < 1)
  assert.ok(Math.abs((pitchAt(track, track.f0, .1 + eps) - peak) / eps) < 1)
  assert.equal(pitchAt(track, track.f0, .3), 0)
  assert.equal(pitchAt(track, track.f0, -1), 100)
  assert.equal(pitchAt(track, track.f0, 1), 150)
  assert.equal(pitchAt({ times: [], f0: [], hop: .02 }, [], 0), 0)
})

test('small edits stay fully wet through unity; unvoiced and untouched frames stay dry', () => {
  const a = tone(), hop = .02
  const times = Float32Array.from({ length: 101 }, (_, i) => i * hop)
  const f0 = new Float32Array(times.length).fill(180), target = f0.slice()
  // A gentle crossing, with an exact unchanged point in its middle.
  for (let i = 20; i <= 80; i++) target[i] *= 2 ** ((i - 50) / 6000)
  const wet = speechPitch(a, fs, { times, f0, hop }, target)
  const out = render(a, fs, { times, f0, hop }, target, [[0, 0], [2, 2]])
  assert.deepEqual(out.subarray(.45 * fs, 1.55 * fs), wet.subarray(.45 * fs, 1.55 * fs))
  assert.deepEqual(out.subarray(0, .35 * fs), a.subarray(0, .35 * fs))
  assert.deepEqual(out.subarray(1.65 * fs), a.subarray(1.65 * fs))
  // Touching unity at an extremum must also keep synthesis phase continuous.
  const touch = Float32Array.from(target, (v, i) => f0[i] * 2 ** Math.abs(Math.log2(v / f0[i])))
  const touchWet = speechPitch(a, fs, { times, f0, hop }, touch)
  const touchOut = render(a, fs, { times, f0, hop }, touch, [[0, 0], [2, 2]])
  assert.deepEqual(touchOut.subarray(.95 * fs, 1.05 * fs), touchWet.subarray(.95 * fs, 1.05 * fs))
  f0.fill(0, 45, 56); target.fill(0, 45, 56)
  const gap = render(a, fs, { times, f0, hop }, target, [[0, 0], [2, 2]])
  assert.deepEqual(gap.subarray(.92 * fs, 1.08 * fs), a.subarray(.92 * fs, 1.08 * fs))
})

test('first and last edited analysis frames have the same boundary fade as interior edits', () => {
  const a = tone(), track = { times: Float32Array.of(.5, .75, 1), f0: Float32Array.of(180, 180, 180), hop: .25 }
  const target = Float32Array.of(360, 360, 360)
  const wet = speechPitch(a, fs, track, target)
  const out = render(a, fs, track, target, [[0, 0], [2, 2]])
  for (const t of [.375, 1.125]) {
    const i = t * fs
    assert.ok(Math.abs(out[i] - (a[i] + wet[i]) / 2) < 1e-7, 'halfway through a boundary is a half wet mix')
  }
  assert.deepEqual(out.subarray(0, .25 * fs), a.subarray(0, .25 * fs))
  assert.deepEqual(out.subarray(1.25 * fs), a.subarray(1.25 * fs))
})

test('automated pitch follows source time rather than the left edge of its analysis window', () => {
  const a = tone(250, 1), track = analyze(a, fs)
  const target = Float32Array.from(track.times, t => 250 * (1 + t))
  const out = speechPitch(a, fs, track, target)
  const detected = median(analyze(out.subarray(.4 * fs, .5 * fs), fs).f0)
  assert.ok(Math.abs(detected - 362.5) < 6, `${detected} Hz near 250 × 1.45`)
})

test('analysis: known F0, silence, short input, and A → A → B are independent', () => {
  const a = tone(), first = analyze(a, fs)
  assert.ok(Math.abs(median(first.f0) - 180) < 1)
  assert.deepEqual(analyze(a, fs), first)
  assert.ok(Math.abs(median(analyze(tone(260), fs).f0) - 260) < 1)
  assert.ok(analyze(new Float32Array(fs), fs).f0.every(x => x === 0))
  assert.equal(analyze(new Float32Array(320), fs).f0.length, 0)
  assert.equal(analyze(new Float32Array(800), fs).times.length, 1)
  assert.equal(analyze(new Float32Array(799), fs).times.length, 0)
  assert.equal(analyze(new Float32Array(801), fs).times.length, 1)
  assert.throws(() => analyze(new Float32Array(0), fs), /contain audio/)
  assert.throws(() => analyze(new Float32Array([NaN]), fs), /invalid samples/)
  assert.throws(() => analyze(a, 0), /8 kHz/)
})

test('identity render and short unvoiced input preserve every source sample', () => {
  for (const a of [tone(), Float32Array.of(.25), new Float32Array(160), new Float32Array(320), new Float32Array(fs)]) {
    const t = analyze(a, fs), copy = a.slice()
    const out = render(a, fs, t, t.f0, [[0, 0], [a.length / fs, a.length / fs]])
    assert.deepEqual(out, copy); assert.deepEqual(a, copy); assert.notEqual(out, a)
  }
})

test('recordings beyond 60 seconds retain analysis and editable audio at the end', () => {
  const a = new Float32Array(61 * fs)
  a.set(tone(260, 1), 60 * fs)
  const t = analyze(a, fs)
  assert.ok(t.times.at(-1) > 60.9)
  assert.ok(Math.abs(median(t.f0.subarray(-30)) - 260) < 1)
  assert.deepEqual(render(a, fs, t, t.f0, [[0, 0], [61, 61]]), a)
  const target = transform(t, t.f0, 60, 61, 'shift', 3)
  const out = render(a, fs, t, target, [[0, 0], [61, 61]])
  assert.equal(out.length, a.length)
  assert.deepEqual(out.subarray(0, 59 * fs), a.subarray(0, 59 * fs))
  assert.ok(Math.abs(median(analyze(out.subarray(60.3 * fs, 60.8 * fs), fs).f0) - 260 * 2 ** (3 / 12)) < 2)
})

test('pitch edits reach requested F0, preserve length, dry regions and original samples', () => {
  const a = tone(), original = a.slice(), t = analyze(a, fs)
  const target = transform(t, t.f0, 0.5, 1.5, 'shift', 3)
  const out = render(a, fs, t, target, [[0, 0], [2, 2]])
  assert.equal(out.length, a.length)
  assert.deepEqual(out.subarray(0, fs * 0.4), a.subarray(0, fs * 0.4))
  assert.deepEqual(out.subarray(fs * 1.6), a.subarray(fs * 1.6))
  assert.ok(Math.abs(median(analyze(out.subarray(fs * 0.7, fs * 1.3), fs).f0) - 180 * 2 ** (3 / 12)) < 2)
  assert.deepEqual(a, original)
  assert.deepEqual(render(a, fs, t, t.f0, [[0, 0], [2, 2]]), a)
})

test('timing anchors compose monotonically, preserve pitch and leave exterior PCM exact', () => {
  const a = tone(), t = analyze(a, fs), anchors = retime([[0, 0], [2, 2]], 0.5, 1.5, 1.5)
  assert.deepEqual(anchors, [[0, 0], [0.5, 0.5], [1.5, 2], [2, 2.5]])
  assert.equal(mapTime(anchors, 1), 1.25)
  const out = render(a, fs, t, t.f0, anchors)
  assert.equal(out.length, 2.5 * fs)
  assert.deepEqual(out.subarray(0, fs / 2), a.subarray(0, fs / 2))
  assert.deepEqual(out.subarray(2 * fs), a.subarray(1.5 * fs))
  assert.ok(Math.abs(median(analyze(out.subarray(fs, 1.5 * fs), fs).f0) - 180) < 2)
  assert.deepEqual(retime(anchors, 0.5, 1.5, 1), [[0, 0], [2, 2]])
  assert.equal(render(a, fs, t, t.f0, retime([[0, 0], [2, 2]], 0, 2, 1)).length, fs)
  assert.equal(render(a, fs, t, t.f0, retime([[0, 0], [2, 2]], 0, 2, 4)).length, 4 * fs)
  const overlapping = retime(anchors, 1, 2, 1)
  assert.ok(overlapping.every((p, i) => !i || p[1] > overlapping[i - 1][1]))
  assert.throws(() => retime(anchors, 1, 1, 1), /valid/)
  assert.throws(() => retime(anchors, 0, 2, 20), /half and twice/)
  assert.throws(() => retime(anchors, 0, 2, NaN), /valid/)
})

test('rules and point edits preserve unvoiced gaps and remain non-destructive', () => {
  const t = { times: Float32Array.of(0, .02, .04, .06, .08), f0: Float32Array.of(100, 200, 0, 100, 150) }
  const result = transform(t, t.f0, 0, .08, 'flatten', .5)
  assert.equal(result[2], 0)
  assert.ok(result[0] > 100 && result[1] < 200)
  const point = movePoint(t, t.f0, 1, 250)
  assert.equal(point[1], 250); assert.equal(point[2], 0); assert.equal(point[3], 100)
  assert.deepEqual(t.f0, Float32Array.of(100, 200, 0, 100, 150))
  assert.throws(() => movePoint(t, t.f0, 2, 200), /voiced/)
  assert.throws(() => transform(t, t.f0, .039, .041, 'shift', 1), /No voiced/)
})

test('invalid targets/maps rejected; WAV export contains exact float PCM and sample rate', async () => {
  const a = tone(), t = analyze(a, fs)
  assert.throws(() => render(a, fs, t, Float32Array.of(NaN), [[0, 0], [2, 2]]), /pitch curve/)
  assert.throws(() => render(a, fs, t, t.f0, [[0, 0], [1, 2], [2, 1]]), /timing/)
  const bytes = await encode(a, fs), view = new DataView(bytes.buffer, bytes.byteOffset)
  assert.equal(view.getUint32(24, true), fs); assert.equal(view.getUint16(22, true), 1)
  assert.equal(view.getUint16(20, true), 3); assert.equal(bytes.length, 44 + a.length * 4)
  for (let i = 0; i < a.length; i++) assert.equal(view.getFloat32(44 + i * 4, true), a[i])
})

// This fails for the previous spectral renderer even when supplied perfect F0.
// A corrected steady vowel must have coherent repeated cycles, not merely the
// right average frequency. The changing source F0 isolates dynamic synthesis.
test('speech normalization preserves coherent cycles while flattening moving pitch', async () => {
  const { vowel } = await import('./prosody-fixture.mjs')
  for (const sampleRate of [16000, 22050, 48000]) {
    const { samples, track } = vowel(sampleRate)
    const target = new Float32Array(track.f0.length).fill(155)
    const out = render(samples, sampleRate, track, target, [[0, 0], [3, 3]])
    let xy = 0, xx = 0, yy = 0
    for (let i = Math.ceil(.3 * sampleRate); i < out.length - .3 * sampleRate; i++) {
      const pos = i + sampleRate / 155, k = Math.floor(pos), f = pos - k
      const x = out[i], y = out[k] * (1 - f) + out[k + 1] * f
      xy += x * y; xx += x * x; yy += y * y
    }
    const coherence = xy / Math.sqrt(xx * yy)
    assert.ok(coherence > .985, `${sampleRate} Hz: cycle coherence ${coherence}`)
    assert.ok(Math.abs(median(analyze(out.subarray(sampleRate, 2 * sampleRate), sampleRate).f0) - 155) < 1)
  }
})

test('speech rendering: lowered and raised pitches, silence, sample rates, A → B → A', () => {
  for (const sampleRate of [8000, 16000, 22050, 44100, 48000, 96000]) {
    const a = Float32Array.from({ length: sampleRate }, (_, i) => .3 * Math.sin(2 * Math.PI * 180 * i / sampleRate))
    const track = analyze(a, sampleRate), anchors = [[0, 0], [1, 1]]
    let first
    for (const amount of [-3, 3, -3]) {
      const target = transform(track, track.f0, 0, 1, 'shift', amount)
      const out = render(a, sampleRate, track, target, anchors)
      assert.equal(out.length, a.length)
      assert.ok(out.every(Number.isFinite))
      const pitch = median(analyze(out.subarray(.2 * sampleRate, .8 * sampleRate), sampleRate).f0)
      assert.ok(Math.abs(pitch - 180 * 2 ** (amount / 12)) < 1, `${sampleRate} Hz, ${amount} semitones: ${pitch} Hz`)
      if (!first) first = out
      else if (amount === -3) assert.deepEqual(out, first)
    }
    const silence = new Float32Array(sampleRate), empty = analyze(silence, sampleRate)
    assert.deepEqual(render(silence, sampleRate, empty, empty.f0, anchors), silence)
  }
})

test('built-in speech: reduction preserves dry consonants, duration, finite PCM and reset', () => {
  const { channelData: [a], sampleRate } = decodeWav(readFileSync(new URL('../util/prosody/sample.wav', import.meta.url)))
  const track = analyze(a, sampleRate), duration = a.length / sampleRate, anchors = [[0, 0], [duration, duration]]
  const out = render(a, sampleRate, track, transform(track, track.f0, 0, duration, 'flatten', .5), anchors)
  assert.equal(out.length, a.length)
  assert.ok(out.every(Number.isFinite))
  assert.ok(out.some((x, i) => Math.abs(x - a[i]) > .01))
  for (let i = 1; i < track.f0.length - 1; i++) if (!track.f0[i - 1] && !track.f0[i] && !track.f0[i + 1]) {
    const k = Math.round(track.times[i] * sampleRate)
    assert.equal(out[k], a[k], 'unvoiced interior stays bit-exact')
  }
  assert.deepEqual(render(a, sampleRate, track, track.f0, anchors), a)
})
