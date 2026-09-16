import createWorld from './world.wasm.js'
import { resample } from './dsp.js'
import { pitchAt } from './model.js'
const engine = await createWorld()

// Resynthesize with the original spectral envelope and aperiodicity, changing
// only F0. No spectral-bin reassignment. The caller handles dry edit boundaries.
export function speechPitch(samples, sampleRate, track, target) {
  if (!samples.length || !track.f0.length) return samples.slice()
  let first = -1, last = -1
  for (let i = 0; i < target.length; i++) if (target[i] !== track.f0[i]) { if (first < 0) first = i; last = i }
  if (first < 0) return samples.slice()
  // D4C's noise bands require at least 16 kHz. Upsampling adds no information,
  // but gives the reference analysis a valid frequency grid for narrowband audio.
  if (sampleRate < 16000) {
    const up = resample(samples, { from: sampleRate, to: 16000 })
    return resample(speechPitch(up, 16000, track, target), { from: 16000, to: sampleRate }).subarray(0, samples.length)
  }
  // WORLD needs local analysis context, not the entire untouched recording.
  const start = Math.max(0, Math.floor((track.times[first] - .1) * sampleRate))
  const end = Math.min(samples.length, Math.ceil((track.times[last] + .1) * sampleRate))
  const input = samples.subarray(start, end), step = .005, count = Math.ceil(input.length / sampleRate / step) + 1
  const pointers = []
  const alloc = length => {
    const p = engine._malloc(length * 8)
    if (!p) throw Error('Not enough memory to render this recording. Try a shorter selection.')
    pointers.push(p); return p
  }
  try {
    const x = alloc(input.length), y = alloc(input.length), source = alloc(count), edited = alloc(count)
    engine.HEAPF64.set(input, x / 8)
    for (let i = 0; i < count; i++) {
      const time = start / sampleRate + i * step
      engine.HEAPF64[source / 8 + i] = pitchAt(track, track.f0, time)
      engine.HEAPF64[edited / 8 + i] = pitchAt(track, target, time)
    }
    engine._world_render(x, input.length, sampleRate, source, edited, count, step, y)
    const out = samples.slice()
    out.set(engine.HEAPF64.subarray(y / 8, y / 8 + input.length), start)
    return out
  } finally { for (const p of pointers) engine._free(p) }
}
