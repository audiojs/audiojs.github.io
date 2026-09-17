import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyze, render, encode, runs } from '../util/prosody/process.js'
import { retime, mapTime, transform, movePoint, pitchAt, validatePitch } from '../util/prosody/model.js'
import { decodeWav, yin } from '../util/prosody/dsp.js'
import { speechRun } from '../util/prosody/world.js'
const fs = 16000
// Harvest scores harmonics, as speech has them; a pure sinusoid is not voice.
const tone = (frequency = 180, seconds = 2, rate = fs) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
  let sum = 0
  for (let h = 1; h <= 5 && h * frequency < rate / 2; h++) sum += Math.sin(2 * Math.PI * h * frequency * i / rate) / h
  return .2 * sum
})
const median = data => [...data].filter(Boolean).sort((a, b) => a - b).at(Math.floor([...data].filter(Boolean).length / 2))
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)) }
const dB = x => 20 * Math.log10(Math.max(x, 1e-12))
const st = (a, b) => 12 * Math.log2(a / b)
// Three tones separated by silence: independent voiced runs with dry gaps.
const phrase = (rate = fs, hz = 180) => {
  const x = new Float32Array(2 * rate)
  for (const [a, b] of [[0, .45], [.55, 1.45], [1.55, 2]]) x.set(tone(hz, b - a, rate), Math.round(a * rate))
  return x
}
const sample = () => decodeWav(readFileSync(new URL('../util/prosody/sample.wav', import.meta.url)))
// Framewise YIN, independent of WORLD, on 40 ms windows.
const measure = (x, rate, t, min = 60, max = 600) => { const a = Math.round((t - .02) * rate); return yin(x.subarray(a, a + Math.round(.04 * rate)), { fs: rate, minFreq: min, maxFreq: max }) }
// Precise period of a steady tone: normalized autocorrelation over 100 ms with parabolic interpolation.
function periodHz(x, rate, t, hz) {
  const a = Math.round((t - .05) * rate), n = Math.round(.1 * rate), lo = Math.floor(rate / hz * .9), hi = Math.ceil(rate / hz * 1.1), corr = []
  for (let lag = lo; lag <= hi; lag++) { let xy = 0, xx = 0, yy = 0; for (let i = a; i < a + n; i++) { xy += x[i] * x[i + lag]; xx += x[i] * x[i]; yy += x[i + lag] * x[i + lag] } corr.push(xy / Math.sqrt(xx * yy || 1)) }
  const k = corr.indexOf(Math.max(...corr)), y0 = corr[k - 1] ?? corr[k], y1 = corr[k], y2 = corr[k + 1] ?? corr[k]
  return rate / (lo + k + (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1))
}

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

test('a touched voiced run is rebuilt whole; other runs, gaps and silence stay bit-exact', () => {
  const a = phrase(), t = analyze(a, fs), voiced = runs(t.f0)
  assert.equal(voiced.length, 3)
  const [first, last] = voiced[1]
  // Touch one frame in the middle run only.
  const target = t.f0.slice(); target[(first + last) >> 1] *= 2 ** (1 / 12)
  const out = render(a, fs, t, target, [[0, 0], [2, 2]])
  assert.equal(out.length, a.length)
  assert.deepEqual(out.subarray(0, Math.round(t.times[first - 1] * fs)), a.subarray(0, Math.round(t.times[first - 1] * fs)), 'audio before the run is untouched')
  assert.deepEqual(out.subarray(Math.round(t.times[last + 1] * fs)), a.subarray(Math.round(t.times[last + 1] * fs)), 'audio after the run is untouched')
  let changed = 0
  for (let i = Math.round(.6 * fs); i < Math.round(1.4 * fs); i++) if (out[i] !== a[i]) changed++
  assert.ok(changed > .9 * .8 * fs, 'the whole run is resynthesized, including its unchanged frames')
  // Continuity: no cancellation dip anywhere across the run or its joins.
  for (let time = .57; time < 1.43; time += .005) {
    const c = Math.round(time * fs), level = dB(rms(out, c - 80, c + 80) / rms(a, c - 80, c + 80))
    assert.ok(Math.abs(level) < 3, `level within 3 dB of the source at ${time.toFixed(3)} s (${level.toFixed(1)} dB)`)
  }
})

test('joins sit on the run edge frames; synthesis leads in by whole periods', () => {
  const a = phrase(), t = analyze(a, fs), [first, last] = runs(t.f0)[1]
  const target = transform(t, t.f0, .6, 1.4, 'shift', 3), anchors = [[0, 0], [2, 2]]
  const out = render(a, fs, t, target, anchors)
  const onset = Math.round(t.times[first] * fs), offset = Math.round(t.times[last] * fs)
  assert.deepEqual(out.subarray(0, onset), a.subarray(0, onset), 'dry up to the first voiced frame')
  assert.deepEqual(out.subarray(offset), a.subarray(offset), 'dry from the last voiced frame')
  assert.notEqual(out[onset + 40], a[onset + 40], 'wet 2.5 ms after the onset')
  const run = speechRun(a, fs, t, target, anchors, first, last), lead = Math.ceil(.01 * t.f0[first]) / t.f0[first]
  assert.equal(run.start, Math.round((t.times[first] - lead) * fs))
  assert.equal(run.samples.length, Math.round((t.times[last] + Math.ceil(.01 * t.f0[last]) / t.f0[last]) * fs) - run.start)
  const pitch = measure(out, fs, 1)
  assert.ok(pitch.clarity > .95 && Math.abs(st(pitch.freq, 180 * 2 ** (3 / 12))) < .1)
})

test('automated pitch follows source time rather than the left edge of its analysis window', () => {
  const a = tone(250, 1), track = analyze(a, fs)
  const target = Float32Array.from(track.times, t => 250 * (1 + t))
  const out = render(a, fs, track, target, [[0, 0], [1, 1]])
  const detected = measure(out, fs, .45, 60, 800)?.freq
  assert.ok(Math.abs(detected - 362.5) < 6, `${detected} Hz near 250 × 1.45`)
})

test('analysis: known F0, silence, short input, and A → A → B are independent', () => {
  const a = tone(), first = analyze(a, fs)
  assert.ok(Math.abs(median(first.f0) - 180) < 1)
  assert.deepEqual(analyze(a, fs), first)
  assert.ok(Math.abs(median(analyze(tone(260), fs).f0) - 260) < 1)
  assert.deepEqual(analyze(a, fs), first)
  assert.ok(analyze(new Float32Array(fs), fs).f0.every(x => x === 0))
  assert.ok(analyze(tone().map(x => x * .0001), fs).f0.every(x => x === 0), 'nearly silent periodic audio stays below the existing silence floor')
  assert.equal(analyze(new Float32Array(320), fs).f0.length, 0)
  // Under 50 ms has insufficient analysis context; at the boundary the 5 ms
  // grid includes both endpoints, with silence remaining unvoiced everywhere.
  const smallest = analyze(new Float32Array(800), fs)
  assert.equal(smallest.times.length, 11)
  assert.ok(smallest.f0.every(x => x === 0))
  assert.equal(smallest.times[0], 0)
  assert.ok(Math.abs(smallest.times.at(-1) - .05) < 1e-8)
  assert.equal(analyze(new Float32Array(799), fs).times.length, 0)
  assert.equal(analyze(new Float32Array(801), fs).times.length, 11)
  assert.throws(() => analyze(new Float32Array(0), fs), /contain audio/)
  assert.throws(() => analyze(new Float32Array([NaN]), fs), /invalid samples/)
  assert.throws(() => analyze(a, 0), /8 kHz/)
  assert.throws(() => analyze(a, 16000.5), /integer sample rate/)
})

test('tracker: continuous voicing and accurate pitch on speech with a known contour', () => {
  const { channelData: [a], sampleRate } = sample(), track = analyze(a, sampleRate)
  let jumps = 0, gaps = 0
  for (let i = 1; i < track.f0.length; i++) {
    if (track.f0[i] && track.f0[i - 1] && Math.abs(st(track.f0[i], track.f0[i - 1])) > 5) jumps++
    if (!track.f0[i] && track.f0[i - 1] && track.f0[i + 1]) gaps++
  }
  assert.equal(jumps, 0, 'no octave jumps between adjacent frames')
  assert.ok(gaps <= 2, `at most two single-frame gaps (${gaps})`)
  assert.ok(runs(track.f0).length <= 16, `phrase-level voiced runs (${runs(track.f0).length})`)
  // Resynthesize the sample through WORLD at a smoothed contour one semitone
  // down, so the true pitch is known exactly, then track the result.
  const truth = new Float32Array(track.f0.length)
  for (let i = 0; i < truth.length; i++) {
    if (!track.f0[i]) continue
    const win = []
    for (let j = i - 3; j <= i + 3; j++) if (track.f0[j]) win.push(track.f0[j])
    truth[i] = win.sort((p, q) => p - q)[win.length >> 1] * 2 ** (-1 / 12)
  }
  const duration = a.length / sampleRate, anchors = [[0, 0], [duration, duration]]
  const synthetic = render(a, sampleRate, track, truth, anchors), found = analyze(synthetic, sampleRate)
  let voiced = 0, missed = 0, gross = 0, fine = 0
  for (let i = 2; i < truth.length - 2; i++) {
    if (!truth[i] || !truth[i - 2] || !truth[i + 2]) continue
    voiced++
    if (!found.f0[i]) { missed++; continue }
    if (Math.abs(found.f0[i] / truth[i] - 1) > .2) gross++; else fine += Math.abs(st(found.f0[i], truth[i]))
  }
  assert.ok(missed / voiced < .03, `missed voiced frames ${(100 * missed / voiced).toFixed(1)}%`)
  assert.ok(gross / voiced < .02, `gross pitch errors ${(100 * gross / voiced).toFixed(1)}%`)
  assert.ok(fine / (voiced - missed - gross) < .3, `fine pitch error ${(fine / (voiced - missed - gross)).toFixed(3)} st`)
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

test('pitch edits reach requested F0, preserve length, other runs and original samples', () => {
  const a = phrase(), original = a.slice(), t = analyze(a, fs)
  const target = transform(t, t.f0, 0.7, 1.3, 'shift', 3)
  const out = render(a, fs, t, target, [[0, 0], [2, 2]])
  assert.equal(out.length, a.length)
  assert.deepEqual(out.subarray(0, fs * 0.5), a.subarray(0, fs * 0.5))
  assert.deepEqual(out.subarray(fs * 1.5), a.subarray(fs * 1.5))
  assert.ok(Math.abs(median(analyze(out.subarray(fs * 0.8, fs * 1.2), fs).f0) - 180 * 2 ** (3 / 12)) < 2)
  assert.deepEqual(a, original)
  assert.deepEqual(render(a, fs, t, t.f0, [[0, 0], [2, 2]]), a)
})

test('timing anchors compose monotonically, retimed voice keeps pitch, exterior PCM exact', () => {
  const a = phrase(), t = analyze(a, fs), anchors = retime([[0, 0], [2, 2]], 0.55, 1.45, 1.35)
  assert.deepEqual(anchors, [[0, 0], [0.55, 0.55], [1.45, 1.9], [2, 2.45]])
  assert.equal(mapTime(anchors, 1), 1.225)
  const out = render(a, fs, t, t.f0, anchors)
  assert.equal(out.length, 2.45 * fs)
  assert.deepEqual(out.subarray(0, fs / 2), a.subarray(0, fs / 2))
  assert.deepEqual(out.subarray(1.95 * fs), a.subarray(1.5 * fs))
  for (let time = .7; time < 1.8; time += .05) {
    const pitch = measure(out, fs, time)
    assert.ok(pitch?.clarity > .95 && Math.abs(st(pitch.freq, 180)) < .1, `stretched voice keeps 180 Hz at ${time.toFixed(2)} s`)
  }
  assert.deepEqual(retime(anchors, 0.55, 1.45, .9), [[0, 0], [2, 2]])
  assert.equal(render(a, fs, t, t.f0, retime([[0, 0], [2, 2]], 0, 2, 1)).length, fs)
  assert.equal(render(a, fs, t, t.f0, retime([[0, 0], [2, 2]], 0, 2, 4)).length, 4 * fs)
  const overlapping = retime(anchors, 1, 2, 1)
  assert.ok(overlapping.every((p, i) => !i || p[1] > overlapping[i - 1][1]))
  assert.throws(() => retime(anchors, 1, 1, 1), /valid/)
  assert.throws(() => retime(anchors, 0, 2, 20), /half and twice/)
  assert.throws(() => retime(anchors, 0, 2, NaN), /valid/)
})

test('unvoiced audio in a retimed span is stretched to length without tonal grain artifacts', () => {
  let seed = 1
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - .5
  for (const rate of [16000, 48000]) {
    const noise = Float32Array.from({ length: rate }, () => .2 * random()), t = analyze(noise, rate)
    assert.ok(t.f0.every(x => !x))
    for (const factor of [1.5, .7]) {
      const out = render(noise, rate, t, t.f0, retime([[0, 0], [1, 1]], .25, .75, .5 * factor))
      assert.equal(out.length, Math.round((.5 + .5 * factor) * rate))
      assert.deepEqual(out.subarray(0, .25 * rate), noise.subarray(0, .25 * rate))
      const level = dB(rms(out, .3 * rate, .6 * rate) / rms(noise, .3 * rate, .6 * rate))
      assert.ok(Math.abs(level) < 1.5, `${rate} ×${factor}: level ${level.toFixed(2)} dB`)
      // Repeated grains would correlate the output with itself at the hop period.
      const a = Math.round(.3 * rate), n = Math.round(.25 * rate)
      for (const lag of [Math.round(.0075 * rate), Math.round(.015 * rate), Math.round(.03 * rate)]) {
        let xy = 0, xx = 0
        for (let i = a; i < a + n; i++) { xy += out[i] * out[i + lag]; xx += out[i] * out[i] }
        assert.ok(Math.abs(xy / xx) < .25, `${rate} ×${factor}: autocorrelation ${(xy / xx).toFixed(3)} at ${lag} samples`)
      }
    }
  }
})

test('consonant bursts are detected and keep their length when a phrase is retimed', () => {
  let seed = 7
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - .5
  const rate = 16000, x = Float32Array.from({ length: 2 * rate }, () => .002 * random())
  for (const t of [.3, .6, .9]) for (let i = 0; i < .008 * rate; i++) x[Math.round(t * rate) + i] += .3 * random()
  const t = analyze(x, rate)
  assert.equal(t.onsets.length, 3, `three bursts (${[...t.onsets]})`)
  for (const [i, want] of [.3, .6, .9].entries()) assert.ok(Math.abs(t.onsets[i] - want) <= .0051, `burst ${i} at ${t.onsets[i]} s`)
  assert.equal(analyze(tone(), rate).onsets.length, 0, 'steady voice has no bursts')
  const protect = Array.from(t.onsets, s => [s - .005, s + .03])
  // ×1.8 overall leaves the free parts at ×1.89; ×2 would need ×2.12 and fall back to uniform.
  const anchors = retime([[0, 0], [2, 2]], .2, 1.2, 1.8, protect)
  assert.ok(Math.abs(mapTime(anchors, 1.2) - 2) < 1e-9 && Math.abs(mapTime(anchors, 2) - 2.8) < 1e-9, 'selection lasts 1.8 s, the rest follows')
  for (const [p, q] of protect) assert.ok(Math.abs((mapTime(anchors, q) - mapTime(anchors, p)) - (q - p)) < 1e-9, 'protected span keeps its length')
  const spans = y => {
    const w = Math.round(.002 * rate), found = []
    for (let a = 0; a + w <= y.length; a += w) {
      const loud = rms(y, a, a + w) > .03
      if (loud && found.length && a - found.at(-1)[1] <= w) found.at(-1)[1] = a + w; else if (loud) found.push([a, a + w])
    }
    return found.map(([a, b]) => (b - a) / rate)
  }
  assert.deepEqual(spans(x).map(v => +v.toFixed(3)), [.008, .008, .008])
  const kept = spans(render(x, rate, t, t.f0, anchors))
  assert.equal(kept.length, 3, `three bursts after slowing down (${kept})`)
  assert.ok(kept.every(v => v <= .012), `bursts keep their length (${kept})`)
  const smeared = spans(render(x, rate, t, t.f0, retime([[0, 0], [2, 2]], .2, 1.2, 1.8)))
  assert.ok(smeared.length !== 3 || smeared.some(v => v > .012), `unprotected stretching lengthens or repeats bursts (${smeared})`)
  // A selection that is almost all burst falls back to uniform stretching.
  const uniform = retime([[0, 0], [2, 2]], .29, .34, .1, protect)
  assert.deepEqual(uniform, [[0, 0], [.29, .29], [.34, .39], [2, 2.05]])
  assert.deepEqual(retime([[0, 0], [2, 2]], .2, 1.2, 1, protect), [[0, 0], [2, 2]], 'unchanged duration is a no-op')
  assert.deepEqual(retime([[0, 0], [2, 2]], .2, 1.2, 2, protect), [[0, 0], [.2, .2], [1.2, 2.2], [2, 3]], 'too little free audio for the change: uniform fallback')
})

test('rules and point edits preserve unvoiced gaps and remain non-destructive', () => {
  const t = { times: Float32Array.of(0, .02, .04, .06, .08), f0: Float32Array.of(100, 200, 0, 100, 150) }
  const result = transform(t, t.f0, 0, .08, 'variation', .5)
  assert.equal(result[2], 0)
  assert.ok(result[0] > 100 && result[1] < 200)
  const point = movePoint(t, t.f0, 1, 250)
  assert.equal(point[1], 250); assert.equal(point[2], 0); assert.equal(point[3], 100)
  assert.deepEqual(t.f0, Float32Array.of(100, 200, 0, 100, 150))
  assert.throws(() => movePoint(t, t.f0, 2, 200), /voiced/)
  assert.throws(() => transform(t, t.f0, .039, .041, 'shift', 1), /No voiced/)
})

test('intonation scales pitch intervals around the median; transposition preserves them', () => {
  const track = { times: Float32Array.of(0, .1, .2, .3, .4), f0: Float32Array.of(100, 150, 200, 0, 120) }
  const source = track.f0.slice()
  for (const factor of [0, .5, 1, 1.5, 2]) {
    const out = transform(track, source, 0, .3, 'variation', factor)
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(12 * Math.log2(out[i] / 150) - factor * 12 * Math.log2(source[i] / 150)) < 1e-5)
    assert.equal(out[1], 150); assert.equal(out[3], 0); assert.equal(out[4], 120)
    if (factor === 1) assert.deepEqual(out, source)
  }
  const shifted = transform(track, source, 0, .3, 'shift', -3)
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(12 * Math.log2(shifted[i] / source[i]) + 3) < 1e-5)
  assert.deepEqual(track.f0, source)
  for (const amount of [-.1, 2.1, NaN, Infinity]) assert.throws(() => transform(track, source, 0, .3, 'variation', amount), /0% and 200%/)
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

test('selection edits glide over time; repeated shifts and dragging can exceed an octave', () => {
  const track = { times: Float32Array.from({ length: 401 }, (_, i) => i * .005), f0: new Float32Array(401).fill(180), hop: .005 }
  for (const kind of ['shift', 'ramp']) {
    const out = transform(track, track.f0, .5, 1.5, kind, 6)
    assert.deepEqual(out.subarray(0, 101), track.f0.subarray(0, 101))
    assert.deepEqual(out.subarray(300), track.f0.subarray(300))
    let maxStep = 0
    for (let i = 1; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(12 * Math.log2(out[i] / out[i - 1])))
    assert.ok(maxStep < .6, `${kind}: ${maxStep} semitone per 5 ms (previously 6)`)
  }
  const a = transform(track, track.f0, 0, 2, 'shift', 18)
  const b = transform(track, a, 0, 2, 'shift', 6)
  assert.ok(Math.abs(a[200] / 180 - 2 ** 1.5) < 1e-6)
  assert.equal(b[200], 720)
  const dragged = movePoint(track, track.f0, 200, 720)
  assert.equal(dragged[200], 720)
  assert.ok(Math.abs(12 * Math.log2(dragged[200] / dragged[199])) < .2, 'local gesture has no sharp corner at its peak')
  assert.ok(Math.abs(12 * Math.log2(dragged[181] / dragged[180])) < .2, 'local gesture eases out at its support boundary')
  assert.deepEqual(transform(track, b, 0, 2, 'reset', 0), track.f0)
  for (const amount of [NaN, Infinity, 100000]) assert.throws(() => transform(track, track.f0, 0, 2, 'shift', amount))
  for (const [start, end] of [[.5, .5], [.501, .509], [1.99, 2]]) {
    const out = transform(track, track.f0, start, end, 'shift', 6)
    assert.ok(out.every(x => Number.isFinite(x) && x >= 180 && x <= 255))
    for (let i = 0; i < out.length; i++) if (track.times[i] < start || track.times[i] > end) assert.equal(out[i], 180)
  }
  // A selection separated by a consonant needs no pitch return at the gap.
  track.f0[99] = track.f0[301] = 0
  const phrase = transform(track, track.f0, .5, 1.5, 'shift', 6)
  assert.ok(phrase[100] > 254 && phrase[300] > 254)
})

test('smoothing removes fast modulation in pitch and rendered audio without crossing gaps', () => {
  const track = { times: Float32Array.from({ length: 401 }, (_, i) => i * .005), f0: new Float32Array(401).fill(180), hop: .005 }
  const target = Float32Array.from(track.times, t => 180 * 2 ** (.25 * Math.sin(2 * Math.PI * 25 * t)))
  const smooth = transform(track, target, 0, 2, 'variation', 1, .1)
  for (let i = 20; i < 380; i++) assert.ok(Math.abs(12 * Math.log2(smooth[i] / 180)) < .1)
  const out = render(tone(), fs, track, smooth, [[0, 0], [2, 2]])
  for (let time = .3; time < 1.7; time += .02) {
    assert.ok(measure(out, fs, time)?.clarity > .95)
    assert.ok(Math.abs(st(periodHz(out, fs, time, 180), 180)) < .02, `smooth output at ${time}: ${periodHz(out, fs, time, 180)} Hz`)
  }
  assert.deepEqual(transform(track, target, 0, 2, 'variation', 1, 0), target)
  assert.deepEqual(transform(track, target, 0, 2, 'variation', 1, .1), smooth, 'A → A after render')
  track.f0.fill(0, 199, 202)
  const separated = Float32Array.from(track.f0, (v, i) => v ? i < 200 ? 120 : 300 : 0)
  const unchanged = transform(track, separated, 0, 2, 'variation', 1, .2)
  assert.deepEqual(unchanged, separated, 'smoothing cannot bridge even a 15 ms unvoiced gap')
  const single = { times: Float32Array.of(0), f0: Float32Array.of(180), hop: .005 }
  assert.deepEqual(transform(single, single.f0, 0, .02, 'variation', 1, .2), single.f0)
  for (const value of [-1, NaN, Infinity, .201]) assert.throws(() => transform(single, single.f0, 0, .02, 'variation', .5, value), /smoothing/)
})

test('pitch range follows synthesis bounds, and output reaches shifts beyond one octave', async () => {
  const track = { times: Float32Array.from({ length: 201 }, (_, i) => i * .005), f0: new Float32Array(201).fill(180), hop: .005 }
  for (const sampleRate of [8000, 16000, 22050, 48000, 96000]) {
    const fs = Math.max(16000, sampleRate), low = Math.floor(fs / 2 ** (1 + Math.floor(Math.log2(3 * fs / 50 + 1)))) + 1
    validatePitch(track, new Float32Array(201).fill(low), sampleRate)
    for (const hz of [0, low - .01, sampleRate / 2, NaN, Infinity]) assert.throws(() => validatePitch(track, new Float32Array(201).fill(hz), sampleRate), /pitch curve/)
  }
  const { vowel } = await import('./prosody-fixture.mjs')
  const { samples, track: voiced } = vowel(fs)
  let first
  for (const amount of [-18, 18, -18]) {
    const target = transform(voiced, voiced.f0, 0, 3, 'shift', amount)
    const out = render(samples, fs, voiced, target, [[0, 0], [3, 3]])
    const pitch = measure(out, fs, 1.5, 40, 800)
    assert.ok(pitch?.clarity > .98)
    assert.ok(Math.abs(12 * Math.log2(pitch.freq / pitchAt(voiced, target, 1.5))) < .1)
    assert.equal(out.length, samples.length)
    if (!first) first = out
    else if (amount === -18) assert.deepEqual(out, first)
    assert.ok(out.every(Number.isFinite))
  }
})

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
    const a = tone(180, 1, sampleRate)
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

test('rebuilt voice keeps the source amplitude contour, including its onset', () => {
  const a = tone(120, 1, 48000)
  for (let i = 0; i < 48000; i++) a[i] *= Math.min(1, i / 4800) * Math.min(1, (48000 - i) / 9600)
  const t = analyze(a, 48000), target = transform(t, t.f0, 0, 1, 'shift', 3)
  const out = render(a, 48000, t, target, [[0, 0], [1, 1]])
  for (let time = .02; time < .98; time += .01) {
    const c = Math.round(time * 48000), level = dB(rms(out, c - 240, c + 240) / rms(a, c - 240, c + 240))
    assert.ok(Math.abs(level) < 2, `level within 2 dB of the source at ${time.toFixed(2)} s (${level.toFixed(1)} dB)`)
  }
})

test('built-in speech: edits follow continuous voicing; joins add no level and consonants stay dry', () => {
  const { channelData: [a], sampleRate } = sample()
  const track = analyze(a, sampleRate), duration = a.length / sampleRate, anchors = [[0, 0], [duration, duration]]
  const target = transform(track, track.f0, 0, duration, 'variation', .5, .06)
  const maxStep = (curve, start, end) => {
    let max = 0
    for (let i = 1; i < curve.length; i++) if (track.times[i] >= start && track.times[i] <= end && curve[i] && curve[i - 1]) max = Math.max(max, Math.abs(12 * Math.log2(curve[i] / curve[i - 1])))
    return max
  }
  assert.ok(maxStep(target, 1.3, 1.36) < .3, '60 ms smoothing removes frame jumps from the requested contour')
  const out = render(a, sampleRate, track, target, anchors)
  // Measure the output with a detector independent of Harvest.
  let previous = 0
  for (let j = 0; j <= 9; j++) {
    const time = 1.72 + j * .01
    assert.ok(pitchAt(track, track.f0, time) > 0, 'continuous source voicing')
    const pitch = measure(out, sampleRate, time)
    assert.ok(pitch && pitch.clarity > .9, `coherent voiced output at ${time}`)
    assert.ok(Math.abs(12 * Math.log2(pitch.freq / pitchAt(track, target, time))) < .2, `target pitch at ${time}`)
    if (previous) assert.ok(Math.abs(12 * Math.log2(pitch.freq / previous)) < .5, 'no sudden pitch excursion')
    previous = pitch.freq
  }
  // Every join: the unvoiced neighbor frame gains no level, and the first/last
  // 10 ms of voice stay near the source's level (digital silence excluded).
  for (const [first, last] of runs(track.f0)) {
    for (const [i, j, direction] of [[first - 1, first, 1], [last, last + 1, -1]]) {
      if (i < 0 || j >= track.f0.length) continue
      const s = Math.round(track.times[i] * sampleRate), e = Math.round(track.times[j] * sampleRate), z = Math.round(.01 * sampleRate)
      if (rms(a, s, e) > 1e-3) assert.ok(dB(rms(out, s, e) / rms(a, s, e)) < 4, `join at ${track.times[i].toFixed(3)} s adds ${dB(rms(out, s, e) / rms(a, s, e)).toFixed(1)} dB in the unvoiced frame`)
      const [os, oe] = direction > 0 ? [e, e + z] : [s - z, s]
      if (rms(a, os, oe) > 1e-3) assert.ok(Math.abs(dB(rms(out, os, oe) / rms(a, os, oe))) < 6, `voice edge at ${track.times[j].toFixed(3)} s is ${dB(rms(out, os, oe) / rms(a, os, oe)).toFixed(1)} dB from the source`)
    }
  }
  // Continuity must not be obtained by pitching actual consonants or silence.
  let dry = 0
  for (let i = 1; i < track.f0.length - 1; i++) if (!track.f0[i - 1] && !track.f0[i] && !track.f0[i + 1]) {
    const k = Math.round(track.times[i] * sampleRate)
    assert.equal(out[k], a[k], 'unvoiced interior stays bit-exact'); dry++
  }
  assert.ok(dry > 50, `the sample has unvoiced audio to protect (${dry} frames)`)
  assert.equal(out.length, a.length)
  assert.ok(out.every(Number.isFinite))
  assert.deepEqual(render(a, sampleRate, track, track.f0, anchors), a)
  // Retiming the middle phrase keeps its pitch along the new timeline.
  const retimed = retime(anchors, 2.5, 4, 2.1), stretched = render(a, sampleRate, track, track.f0, retimed), inverse = retimed.map(([p, q]) => [q, p])
  assert.equal(stretched.length, Math.round(mapTime(retimed, duration) * sampleRate))
  const errors = []
  for (let time = 2.6; time < 4.5; time += .01) {
    const want = pitchAt(track, track.f0, mapTime(inverse, time)), pitch = measure(stretched, sampleRate, time)
    if (want && pitch?.clarity > .9) errors.push(Math.abs(st(pitch.freq, want)))
  }
  errors.sort((p, q) => p - q)
  assert.ok(errors.length > 100 && errors[Math.floor(errors.length * .95)] < .5, `stretched speech pitch error p95 ${errors[Math.floor(errors.length * .95)]?.toFixed(3)} st over ${errors.length} frames`)
  assert.deepEqual(stretched.subarray(0, Math.round(2.3 * sampleRate)), a.subarray(0, Math.round(2.3 * sampleRate)), "dry before the retimed phrase's first voiced run")
})
