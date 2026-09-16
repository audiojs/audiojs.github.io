import { stretch, wav } from './dsp.js'
import { speechPitch, speechTrack } from './world.js'
import { validatePitch } from './model.js'

export function analyze(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || !samples.length || !Number.isInteger(sampleRate) || sampleRate < 8000)
    throw Error('The recording must contain audio at an integer sample rate of 8 kHz or above.')
  if (samples.some(x => !Number.isFinite(x))) throw Error('The recording contains invalid samples.')
  const track = speechTrack(samples, sampleRate), radius = Math.round(.025 * sampleRate)
  // Keep the existing silence floor: a temporal tracker can otherwise assign
  // pitch to the nearly silent tail of a vowel.
  for (let i = 0; i < track.f0.length; i++) {
    if (!track.f0[i]) continue
    const center = Math.round(track.times[i] * sampleRate)
    const start = Math.max(0, center - radius), end = Math.min(samples.length, center + radius)
    let power = 0
    for (let j = start; j < end; j++) power += samples[j] ** 2
    if (power / (end - start) < 1e-7) track.f0[i] = 0
  }
  return track
}

export function render(samples, sampleRate, track, target, anchors) {
  validatePitch(track, target, sampleRate)
  const duration = samples.length / sampleRate
  if (anchors.length < 2 || anchors[0][0] !== 0 || anchors[0][1] !== 0 || Math.abs(anchors.at(-1)[0] - duration) > 1e-6)
    throw Error('Invalid timing anchors.')
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = [anchors[i - 1], anchors[i]], factor = (b[1] - a[1]) / (b[0] - a[0])
    if (!b.every(Number.isFinite) || b[0] <= a[0] || factor < 0.5 - 1e-8 || factor > 2 + 1e-8) throw Error('Invalid timing anchors.')
  }
  let pitched = samples
  if (target.some((x, i) => x !== track.f0[i])) {
    const delta = Float32Array.from(target, (x, i) => x ? Math.log2(x / track.f0[i]) : 0)
    // An edit stays wet through unity: mixing by correction magnitude produces
    // cancellations between the source and the shifted signal's accumulated phase.
    const edited = Float32Array.from(delta, (d, i) => d !== 0 ||
      (track.f0[i] > 0 && delta[i - 1] && delta[i + 1]) ? 1 : 0)
    const at = (t, curve = delta) => {
      const pos = (t - (track.times[0] || 0)) / track.hop
      if (pos < -1 || pos > delta.length) return 0
      const i = Math.floor(pos), f = pos - i
      return (curve[i] || 0) * (1 - f) + (curve[i + 1] || 0) * f
    }
    pitched = speechPitch(samples, sampleRate, track, target)
    // Crossfade only at edit boundaries, keeping untouched/unvoiced frames dry.
    for (let i = 0; i < samples.length; i++) {
      const wet = .5 - .5 * Math.cos(Math.PI * at(i / sampleRate, edited))
      pitched[i] = samples[i] * (1 - wet) + pitched[i] * wet
    }
  }
  if (pitched.some(x => !Number.isFinite(x))) throw Error('Rendering produced invalid audio.')
  if (anchors.every(([a, b]) => Math.abs(a - b) < 1e-8)) return pitched.slice()
  const output = new Float32Array(Math.round(anchors.at(-1)[1] * sampleRate))
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = [anchors[i - 1], anchors[i]]
    const start = Math.round(a[0] * sampleRate), end = Math.round(b[0] * sampleRate)
    const dest = Math.round(a[1] * sampleRate), length = Math.round(b[1] * sampleRate) - dest
    if (!length || end <= start) continue
    if (length === end - start) { output.set(pitched.subarray(start, end), dest); continue }
    const factor = length / (end - start), pad = Math.round(0.04 * sampleRate)
    const left = Math.max(0, start - pad), right = Math.min(samples.length, end + pad)
    const stretched = stretch(pitched.subarray(left, right), { factor, frameSize: 1024, hopSize: 256, delta: 256 })
    const offset = Math.round((start - left) * factor)
    const fade = Math.min(Math.round(0.01 * sampleRate), Math.floor(length / 2), Math.floor((end - start) / 2))
    for (let j = 0; j < length; j++) {
      let value = stretched[offset + j] || 0
      // Short dry joins preserve the samples at both anchors without moving them.
      if (j < fade) value = pitched[start + j] * (1 - j / fade) + value * j / fade
      if (j >= length - fade) { const w = (length - 1 - j) / fade; value = pitched[end - (length - j)] * (1 - w) + value * w }
      output[dest + j] = value
    }
  }
  if (output.some(x => !Number.isFinite(x))) throw Error('Rendering produced invalid audio.')
  return output
}

export async function encode(samples, sampleRate) {
  const encoder = await wav({ sampleRate, bitDepth: 32 })
  try { encoder.encode([samples]); return encoder.flush() } finally { encoder.free() }
}
