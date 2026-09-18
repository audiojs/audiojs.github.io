import createWorld from './world.wasm.js'
import { resample } from './dsp.js'
import { mapTime, pitchAt } from './model.js'
const FINE = .001
const engine = await createWorld()

const alloc = (pointers, length) => {
  const p = engine._malloc(length * 8)
  if (!p) throw Error('Not enough memory for this recording. Try a shorter selection.')
  pointers.push(p); return p
}

// Harvest tracks pitch candidates across time, so a phrase keeps continuous
// voicing instead of breaking into single rejected frames.
export function speechTrack(samples, sampleRate) {
  const hop = .005
  if (samples.length < Math.round(.05 * sampleRate))
    return { times: new Float32Array(), f0: new Float32Array(), hop }
  const count = Math.floor(1000 * samples.length / sampleRate / (hop * 1000)) + 1, pointers = []
  try {
    const x = alloc(pointers, samples.length), f = alloc(pointers, count)
    engine.HEAPF64.set(samples, x / 8)
    engine._world_analyze(x, samples.length, sampleRate, hop, f)
    return { times: Float32Array.from({ length: count }, (_, i) => i * hop),
      f0: Float32Array.from(engine.HEAPF64.subarray(f / 8, f / 8 + count)), hop }
  } finally { for (const p of pointers) engine._free(p) }
}

// Resynthesize one voiced run (analysis frames first..last) with the original
// spectral envelope and aperiodicity, at the target pitch, along the output
// timeline given by the timing anchors. Voicing is extended through a lead and
// tail of whole periods beyond the run: WORLD drives unvoiced regions with a
// 500 Hz noise-pulse clock whose last pulse before an onset borrows the vowel's
// envelope, so no unvoiced frames are synthesized near a join. Returns the
// samples and the output index of their first sample; the caller keeps only
// the run itself.
export function speechRun(samples, sampleRate, track, target, anchors, first, last) {
  const step = track.hop, periods = hz => Math.ceil(.01 * hz) / hz
  const lead = first ? periods(track.f0[first]) : 0, tail = last < track.f0.length - 1 ? periods(track.f0[last]) : 0
  const begin = mapTime(anchors, track.times[first]) - lead, finish = mapTime(anchors, track.times[last]) + tail
  const start = Math.round(begin * sampleRate), length = Math.round(finish * sampleRate) - start
  if (length <= 0) return { samples: new Float32Array(), start, vocoded: true }
  // D4C's noise bands require at least 16 kHz. Upsampling adds no information,
  // but gives the reference analysis a valid frequency grid for narrowband audio.
  if (sampleRate < 16000) {
    const up = speechRun(resample(samples, { from: sampleRate, to: 16000 }), 16000, track, target, anchors, first, last)
    const out = new Float32Array(length)
    out.set(resample(up.samples, { from: 16000, to: sampleRate }).subarray(0, length))
    return { samples: out, start, vocoded: true }
  }
  const count = Math.ceil(length / sampleRate / step) + 1, fineCount = Math.ceil(length / sampleRate / FINE) + 1, inverse = anchors.map(([a, b]) => [b, a])
  // WORLD needs local analysis context around the run, not the whole recording.
  const from = Math.max(0, Math.floor((track.times[first] - lead - .1) * sampleRate)), to = Math.min(samples.length, Math.ceil((track.times[last] + tail + .1) * sampleRate))
  const input = samples.subarray(from, to), pointers = []
  // Beyond the run's edge frames, continue the edge frame's pitch. The frame
  // contour is the mean of the cycles each frame covers; feeding WORLD the
  // cycle-level jitter itself measured no more natural.
  const edgeOf = at => track.times[at < track.times[first] ? first : last]
  const sourceAt = at => pitchAt(track, track.f0, at) || track.f0[at < track.times[first] ? first : last]
  const targetAt = at => pitchAt(track, target, at) || pitchAt(track, target, edgeOf(at)) || target[at < track.times[first] ? first : last]
  try {
    const x = alloc(pointers, input.length), y = alloc(pointers, length)
    const times = alloc(pointers, count), source = alloc(pointers, count), edited = alloc(pointers, fineCount)
    engine.HEAPF64.set(input, x / 8)
    for (let i = 0; i < count; i++) {
      const at = mapTime(inverse, begin + i * step)
      engine.HEAPF64[times / 8 + i] = at - from / sampleRate
      engine.HEAPF64[source / 8 + i] = sourceAt(at)
    }
    // Synthesis pitch on a 1 ms grid follows the contour between frames smoothly.
    for (let i = 0; i < fineCount; i++) engine.HEAPF64[edited / 8 + i] = targetAt(mapTime(inverse, begin + i * FINE))
    engine._world_render(x, input.length, sampleRate, times, source, count, step, edited, fineCount, FINE, y, length)
    return { samples: Float32Array.from(engine.HEAPF64.subarray(y / 8, y / 8 + length)), start, vocoded: true }
  } finally { for (const p of pointers) engine._free(p) }
}

// Spectral envelope of a run and its 100 ms context, at 5 ms steps from
// `from` (source seconds), as power per bin on WORLD's FFT grid.
export function speechEnvelope(samples, sampleRate, track, first, last) {
  const step = track.hop, rate = Math.max(16000, sampleRate)
  const from = Math.max(0, track.times[first] - .1), to = Math.min(samples.length / sampleRate, track.times[last] + .1)
  const count = Math.floor((to - from) / step) + 1
  const input = sampleRate < 16000 ? resample(samples.subarray(Math.floor(from * sampleRate), Math.ceil(to * sampleRate)), { from: sampleRate, to: rate }) : samples.subarray(Math.floor(from * sampleRate), Math.ceil(to * sampleRate))
  const offset = Math.floor(from * sampleRate) / sampleRate, pointers = []
  try {
    const fft = 2 ** (1 + Math.floor(Math.log2(3 * rate / 50 + 1))), bins = fft / 2 + 1
    const x = alloc(pointers, input.length), times = alloc(pointers, count), f0 = alloc(pointers, count), out = alloc(pointers, count * bins)
    engine.HEAPF64.set(input, x / 8)
    for (let i = 0; i < count; i++) {
      const at = from + i * step
      engine.HEAPF64[times / 8 + i] = at - offset
      engine.HEAPF64[f0 / 8 + i] = pitchAt(track, track.f0, at) || track.f0[at < track.times[first] ? first : last]
    }
    const size = engine._world_envelope(x, input.length, rate, times, f0, count, out)
    if (size !== fft) throw Error('Envelope grid mismatch.')
    return { frames: Float32Array.from(engine.HEAPF64.subarray(out / 8, out / 8 + count * bins)), bins, count, step, from, rate, fft }
  } finally { for (const p of pointers) engine._free(p) }
}
