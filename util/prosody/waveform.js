// Waveform engine: the recording's own glottal cycles, re-spaced. Each cycle
// is resampled by the edit ratio, so its period becomes the target period and
// the copies that overlap at the new spacing are phase-aligned: no comb, no
// flanging. Resampling scales the formants too, so the run then passes a
// smooth filter restoring the source spectral envelope, from CheapTrick, at
// its original frequencies. Timing changes repeat or skip cycles. Pulse
// shapes, breath and jitter stay the voice's own; unchanged cycles reproduce
// the source exactly. Beyond about half an octave, repeated or thinned cycles
// start to sound, and the vocoder takes over.
import { mapTime, pitchAt, clamp } from './model.js'
import { speechEnvelope } from './world.js'
import { fft } from './fft.js'

// Fractional reads: 32-tap Blackman-windowed sinc at 64 phases, unity at
// integer positions, with a lowpass at `cutoff` × Nyquist when reading faster.
const TAPS = 32, tables = new Map()
function table(cutoff) {
  const key = Math.round(cutoff * 20) / 20
  if (tables.has(key)) return tables.get(key)
  const taps = new Float32Array(64 * TAPS), center = TAPS / 2 - 1
  for (let phase = 0; phase < 64; phase++) {
    let sum = 0
    for (let i = 0; i < TAPS; i++) {
      const d = i - center - phase / 64, x = d * key, sinc = x ? Math.sin(Math.PI * x) / (Math.PI * x) : 1
      taps[phase * TAPS + i] = sinc * key * (.42 + .5 * Math.cos(2 * Math.PI * d / TAPS) + .08 * Math.cos(4 * Math.PI * d / TAPS))
      sum += taps[phase * TAPS + i]
    }
    for (let i = 0; i < TAPS; i++) taps[phase * TAPS + i] /= sum
  }
  tables.set(key, taps)
  return taps
}
function read(x, position, taps) {
  const i = Math.floor(position), offset = Math.floor((position - i) * 64) * TAPS, base = i - (TAPS / 2 - 1)
  let value = 0
  for (let k = 0; k < TAPS; k++) value += (x[base + k] || 0) * taps[offset + k]
  return value
}

export function waveformRun(samples, sampleRate, track, target, anchors, first, last) {
  const period = hz => sampleRate / hz
  const from = track.times[first] * sampleRate - period(track.f0[first]) / 2, to = track.times[last] * sampleRate + period(track.f0[last]) / 2
  const marks = Array.from(track.marks).filter(m => m >= from && m <= to)
  if (marks.length < 3) return null
  const inverse = anchors.map(([a, b]) => [b, a]), longest = Math.ceil(Math.max(...marks.map((m, k) => k ? m - marks[k - 1] : 0)))
  const start = Math.round(mapTime(anchors, track.times[first]) * sampleRate) - 2 * longest
  const end = Math.round(mapTime(anchors, track.times[last]) * sampleRate) + 2 * longest
  const out = new Float32Array(end - start), norm = new Float32Array(end - start)
  // The edit as a ratio to the frame contour; beyond the edge frames, the edge's own.
  const edgeOf = at => track.times[at < track.times[first] ? first : last]
  const ratioAt = at => { const source = pitchAt(track, track.f0, at), edited = pitchAt(track, target, at); return source && edited ? edited / source : 0 }
  const ratio = at => ratioAt(at) || ratioAt(edgeOf(at)) || 1
  let synthesis = mapTime(anchors, marks[0] / sampleRate) * sampleRate, k = 0, changed = false, tail = 0, delta = 0
  while (synthesis < end) {
    const at = mapTime(inverse, synthesis / sampleRate) * sampleRate
    while (k < marks.length - 1 && Math.abs(marks[k + 1] - at) <= Math.abs(marks[k] - at)) k++
    while (k > 0 && Math.abs(marks[k - 1] - at) < Math.abs(marks[k] - at)) k--
    // Past the last cycle the voice is handed back to the source: remember
    // where, and by how much the re-spaced cycles have drifted from it.
    if (k === marks.length - 1) { tail = Math.round(synthesis) - start; delta = Math.round(synthesis - mapTime(anchors, marks[k] / sampleRate) * sampleRate); break }
    const mark = marks[k], cycleLeft = k ? mark - marks[k - 1] : marks[k + 1] - mark, cycleRight = k < marks.length - 1 ? marks[k + 1] - mark : cycleLeft
    const r = ratio(at / sampleRate), taps = table(Math.min(1, 1 / r))
    if (Math.abs(r - 1) > 1e-9) changed = true
    // One resampled cycle each side of the mark, with half-Hann lobes that sum
    // to one at the new spacing.
    const left = cycleLeft / r, right = cycleRight / r
    for (let j = Math.ceil(synthesis - left); j < synthesis + right; j++) {
      const u = j - synthesis, position = mark + u * r
      if (j - start < 0 || j - start >= out.length || position < TAPS / 2 || position >= samples.length - TAPS / 2 - 1) continue
      const w = u < 0 ? .5 - .5 * Math.cos(Math.PI * (u + left) / left) : .5 + .5 * Math.cos(Math.PI * u / right)
      out[j - start] += read(samples, position, taps) * w; norm[j - start] += w
    }
    synthesis += Math.min(period(30), Math.max(1, right))
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm[i], .5)
  if (changed) restoreFormants(out, start, samples, sampleRate, track, anchors, first, last, ratio)
  return { samples: out, start, tail, delta }
}

// Multiply the run's short-time spectrum by E(f) / E(f / r): resampling by r
// moved the source envelope E to E(f / r). Square-root Hann windows at 75%
// overlap sum to two and reconstruct exactly; the gain changes smoothly
// across frames, and frames with a unit ratio pass through untouched.
function restoreFormants(out, start, samples, sampleRate, track, anchors, first, last, ratio) {
  const envelope = speechEnvelope(samples, sampleRate, track, first, last), inverse = anchors.map(([a, b]) => [b, a])
  const size = 2 ** Math.ceil(Math.log2(.02 * sampleRate)), hop = size >> 2, half = size >> 1
  const window = Float32Array.from({ length: size }, (_, i) => Math.sqrt(.5 - .5 * Math.cos(2 * Math.PI * i / size)) / Math.SQRT2)
  const re = new Float32Array(size), im = new Float32Array(size), result = new Float32Array(out.length)
  // Log envelope per frame; the gain keeps its full detail, since formant
  // peaks are narrower than the pitch and smoothing only blurs the correction.
  const logs = new Map()
  const logRow = frame => {
    if (logs.has(frame)) return logs.get(frame)
    const row = Float32Array.from(envelope.frames.subarray(frame * envelope.bins, (frame + 1) * envelope.bins), v => Math.log(v + 1e-20))
    logs.set(frame, row); return row
  }
  const level = (row, hz) => {
    const position = clamp(hz / envelope.rate * envelope.fft, 0, envelope.bins - 1), a = Math.floor(position), f = position - a
    return row[a] * (1 - f) + row[Math.min(envelope.bins - 1, a + 1)] * f
  }
  // The correction ramps in over the run's first and last 20 ms: there the
  // envelope window straddles silence and vowel, and a gain from that ratio
  // lifted soft onsets by up to 5 dB.
  const onsetAt = mapTime(anchors, track.times[first]) * sampleRate - start, offsetAt = mapTime(anchors, track.times[last]) * sampleRate - start, edge = .02 * sampleRate
  for (let position = hop - size; position < out.length; position += hop) {
    const at = mapTime(inverse, (start + position + half) / sampleRate), r = ratio(at)
    const ramp = clamp(Math.min((position + half - onsetAt) / edge, (offsetAt - position - half) / edge), 0, 1)
    const frame = clamp(Math.round((at - envelope.from) / envelope.step), 0, envelope.count - 1), row = logRow(frame)
    for (let i = 0; i < size; i++) { re[i] = (out[position + i] || 0) * window[i]; im[i] = 0 }
    if (Math.abs(r - 1) < 1e-9) { for (let i = 0; i < size; i++) if (position + i >= 0 && position + i < out.length) result[position + i] += re[i] * window[i]; continue }
    fft(re, im)
    for (let b = 0; b <= half; b++) {
      // Attenuation is safe at any depth; only amplification of an envelope valley is bounded.
      const hz = b * sampleRate / size, gain = clamp(Math.exp(ramp * (level(row, hz) - level(row, hz / r)) / 2), 1e-4, 32)
      re[b] *= gain; im[b] *= gain
      if (b && b < half) { re[size - b] *= gain; im[size - b] *= gain }
    }
    fft(re, im, true)
    for (let i = 0; i < size; i++) if (position + i >= 0 && position + i < out.length) result[position + i] += re[i] * window[i]
  }
  out.set(result)
}
