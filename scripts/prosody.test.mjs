import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyze, render, encode } from '../util/prosody/process.js'
import { retime, mapTime, transform, movePoint } from '../util/prosody/model.js'
import { shift, decodeWav } from '../util/prosody/dsp.js'
const fs = 16000
const tone = (frequency = 180, seconds = 2) => Float32Array.from({ length: fs * seconds }, (_, i) => 0.3 * Math.sin(2 * Math.PI * frequency * i / fs))
const median = data => [...data].filter(Boolean).sort((a, b) => a - b).at(Math.floor([...data].filter(Boolean).length / 2))

test('vendored shifter reconstructs speech with unity automation, without bypass', () => {
  const { channelData: [a], sampleRate } = decodeWav(readFileSync(new URL('../util/prosody/sample.wav', import.meta.url)))
  const out = shift(a, { sampleRate, ratio: () => 1 })
  assert.equal(out.length, a.length)
  let error = 0, energy = 0
  for (let i = 0; i < a.length; i++) { error += (out[i] - a[i]) ** 2; energy += a[i] ** 2 }
  assert.ok(error / energy < 1e-12, `Relative reconstruction error: ${10 * Math.log10(error / energy)} dB`)
})

test('small edits stay fully wet through unity; unvoiced and untouched frames stay dry', () => {
  const a = tone(), hop = .02
  const times = Float32Array.from({ length: 101 }, (_, i) => i * hop)
  const f0 = new Float32Array(times.length).fill(180), target = f0.slice()
  // A gentle crossing, with an exact unchanged point in its middle.
  for (let i = 20; i <= 80; i++) target[i] *= 2 ** ((i - 50) / 6000)
  const delta = Float32Array.from(target, (x, i) => Math.log2(x / f0[i]))
  const at = t => {
    const pos = t / hop, i = Math.floor(pos), f = pos - i
    return (delta[i] || 0) * (1 - f) + (delta[i + 1] || 0) * f
  }
  const wet = shift(a, { sampleRate: fs, ratio: t => 2 ** at(t) })
  const out = render(a, fs, { times, f0, hop }, target, [[0, 0], [2, 2]])
  assert.deepEqual(out.subarray(.45 * fs, 1.55 * fs), wet.subarray(.45 * fs, 1.55 * fs))
  assert.deepEqual(out.subarray(0, .35 * fs), a.subarray(0, .35 * fs))
  assert.deepEqual(out.subarray(1.65 * fs), a.subarray(1.65 * fs))
  f0.fill(0, 45, 56); target.fill(0, 45, 56)
  const gap = render(a, fs, { times, f0, hop }, target, [[0, 0], [2, 2]])
  assert.deepEqual(gap.subarray(.92 * fs, 1.08 * fs), a.subarray(.92 * fs, 1.08 * fs))
})

test('unity automation: sample rates, silence, moving peaks, empty writes and final splits', () => {
  for (const sampleRate of [16000, 22050, 44100, 48000]) {
    const a = Float32Array.from({ length: sampleRate }, (_, i) => {
      const t = i / sampleRate, f = t < .5 ? 150 : 230
      return t < .1 || t > .4 && t < .6 || t > .9 ? 0 :
        .3 * Math.sin(2 * Math.PI * f * t) + .1 * Math.sin(4 * Math.PI * f * t)
    })
    const opts = { sampleRate, ratio: () => 1 }, out = shift(a, opts)
    assert.equal(out.length, a.length)
    assert.ok(out.every((x, i) => Math.abs(x - a[i]) < 1e-6))
    for (const length of [1, 511, 512, 513, a.length]) {
      const offset = length === a.length ? 0 : Math.round(.2 * sampleRate) + 1
      const input = a.subarray(offset, offset + length), batch = shift(input, opts), writer = shift(opts)
      assert.ok(batch.every((x, i) => Math.abs(x - input[i]) < 1e-6))
      const chunks = [writer(new Float32Array(0)), writer(input.subarray(0, length - 1)), writer(input.subarray(length - 1)), writer()]
      const streamed = Float32Array.from(chunks.flatMap(c => [...c]))
      assert.deepEqual(streamed, batch)
    }
    assert.deepEqual(shift(a, opts), out)
  }
})

test('automated pitch follows source time rather than the left edge of its analysis window', () => {
  const out = shift(tone(250, 1), { sampleRate: fs, ratio: t => 1 + t })
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
