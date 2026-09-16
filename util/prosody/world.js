import createWorld from './world.wasm.js'
import { resample } from './dsp.js'
import { pitchAt } from './model.js'
const engine = await createWorld()

// DIO connects pitch candidates across time; StoneMask refines the resulting
// contour against the waveform. A rejected individual frame is not a consonant.
export function speechTrack(samples, sampleRate) {
  const hop = .005
  if (samples.length < Math.round(.05 * sampleRate))
    return { times: new Float32Array(), f0: new Float32Array(), hop }
  const count = Math.floor(1000 * samples.length / sampleRate / (hop * 1000)) + 1
  let x = 0, f = 0
  try {
    x = engine._malloc(samples.length * 8); f = engine._malloc(count * 8)
    if (!x || !f) throw Error('Not enough memory to analyze this recording. Try a shorter selection.')
    engine.HEAPF64.set(samples, x / 8)
    engine._world_analyze(x, samples.length, sampleRate, hop, f)
    return { times: Float32Array.from({ length: count }, (_, i) => i * hop),
      f0: Float32Array.from(engine.HEAPF64.subarray(f / 8, f / 8 + count)), hop }
  } finally { engine._free(x); engine._free(f) }
}

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
