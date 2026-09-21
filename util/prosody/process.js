import { stretch, wav } from './dsp.js'
import { speechRun, speechTrack } from './world.js'
import { cycles } from './cycles.js'
import { waveformRun } from './waveform.js'
import { validatePitch, mapTime, clamp } from './model.js'

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
  // Harvest voices noise in runs of its own. Judge each run as a whole by its
  // median waveform periodicity at the tracked pitch, so a real breathy or
  // creaky phrase is not broken into fragments by frame decisions. The
  // periodicity is kept per frame: rendering routes unreliable runs.
  track.periodicity = new Float32Array(track.f0.length)
  for (const [first, last] of runs(track.f0)) {
    const scores = []
    for (let i = first; i <= last; i++) scores.push(track.periodicity[i] = periodicity(samples, sampleRate, track.times[i], track.f0[i]))
    if (scores.sort((a, b) => a - b)[scores.length >> 1] < .2) track.f0.fill(0, first, last + 1)
  }
  track.onsets = bursts(samples, sampleRate, track)
  // Cycle marks refine the frame contour, exact through fast inflections.
  track.marks = cycles(samples, sampleRate, track, runs(track.f0))
  return track
}

// Times of abrupt broadband energy rises in unvoiced audio: consonant bursts,
// whose length a timing edit keeps. Voiced onsets are shaped by resynthesis.
function bursts(samples, sampleRate, track) {
  const half = Math.round(.005 * sampleRate), energy = new Float64Array(track.f0.length)
  for (let i = 0; i < energy.length; i++) {
    const center = Math.round(track.times[i] * sampleRate), a = Math.max(1, center - half), b = Math.min(samples.length, center + half)
    let sum = 0
    for (let j = a; j < b; j++) sum += (samples[j] - samples[j - 1]) ** 2
    energy[i] = sum / Math.max(1, b - a)
  }
  const out = []
  for (let i = 3; i < energy.length; i++) {
    if (track.f0[i] || energy[i] < 1.6e-5) continue
    const before = Math.max(1e-6, Math.min(energy[i - 1], energy[i - 2], energy[i - 3]))
    if (energy[i] >= 16 * before && (!out.length || track.times[i] - out.at(-1) > .05)) out.push(track.times[i])
  }
  return Float32Array.from(out)
}

// Normalized correlation of the waveform with itself one period later, over
// two periods around `time`.
function periodicity(x, sampleRate, time, hz) {
  const lag = sampleRate / hz, center = Math.round(time * sampleRate), half = Math.round(lag)
  const start = center - half, end = center + half
  if (start < 0 || end + Math.ceil(lag) + 1 >= x.length) return 0
  let xy = 0, xx = 0, yy = 0
  for (let i = start; i < end; i++) {
    const pos = i + lag, k = Math.floor(pos), f = pos - k, y = x[k] * (1 - f) + x[k + 1] * f
    xy += x[i] * y; xx += x[i] * x[i]; yy += y * y
  }
  return xy / Math.sqrt(xx * yy || 1)
}

// Maximal voiced frame ranges [first, last].
export function runs(f0) {
  const out = []
  for (let i = 0; i < f0.length; i++) if (f0[i]) { if (!out.length || out.at(-1)[1] !== i - 1) out.push([i, i]); else out.at(-1)[1] = i }
  return out
}

// Dry output timeline: untouched audio is copied exactly; retimed audio is
// stretched with WSOLA. Voiced runs inside retimed spans are replaced by
// resynthesis afterwards, so the stretcher only has to serve unvoiced audio.
export function timeline(samples, sampleRate, anchors) {
  const output = new Float32Array(Math.round(anchors.at(-1)[1] * sampleRate))
  const frameSize = Math.round(.03 * sampleRate), hopSize = frameSize >> 2, delta = Math.round(.01 * sampleRate)
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = [anchors[i - 1], anchors[i]]
    const start = Math.round(a[0] * sampleRate), end = Math.round(b[0] * sampleRate)
    const dest = Math.round(a[1] * sampleRate), length = Math.round(b[1] * sampleRate) - dest
    if (!length || end <= start) continue
    if (length === end - start) { output.set(samples.subarray(start, end), dest); continue }
    // Stretch the segment alone: context from a neighbor would let its
    // content, such as a protected consonant burst, leak into this segment.
    const factor = length / (end - start)
    const stretched = stretch(samples.subarray(start, end), { factor, frameSize, hopSize, delta })
    const fade = Math.min(Math.round(.01 * sampleRate), Math.floor(length / 2), Math.floor((end - start) / 2))
    for (let j = 0; j < length; j++) {
      let value = stretched[j] || 0
      // Short dry joins preserve the samples at both anchors without moving them.
      if (j < fade) value = samples[start + j] * (1 - j / fade) + value * j / fade
      if (j >= length - fade) { const w = (length - 1 - j) / fade; value = samples[end - (length - j)] * (1 - w) + value * w }
      output[dest + j] = value
    }
  }
  return output
}

// Short-time RMS envelope over ±half samples, sampled every 2.5 ms.
function envelope(x, sampleRate, start, length, half) {
  const hop = Math.round(.0025 * sampleRate), out = new Float32Array(Math.ceil(length / hop) + 1)
  for (let i = 0; i < out.length; i++) {
    const center = start + i * hop, a = Math.max(0, center - half), b = Math.min(x.length, center + half)
    let power = 0
    for (let j = a; j < b; j++) power += x[j] * x[j]
    out[i] = Math.sqrt(power / Math.max(1, b - a))
  }
  return out
}

// Give a resynthesized run the source's amplitude contour along the output
// timeline. WORLD's analysis window smears voice onsets and offsets over a
// few periods, and its unvoiced frames beside a vowel carry the vowel's level.
// The envelope window spans two periods of the run's median pitch (10–20 ms):
// shorter windows ripple within a period, longer ones blur the onset.
function restoreEnvelope(wet, samples, sampleRate, anchors, start, hz) {
  const inverse = anchors.map(([a, b]) => [b, a]), hop = Math.round(.0025 * sampleRate)
  const half = Math.round(clamp(1 / hz, .005, .01) * sampleRate)
  const own = envelope(wet, sampleRate, 0, wet.length, half), gain = new Float32Array(own.length)
  for (let i = 0; i < own.length; i++) {
    const at = Math.round(mapTime(inverse, (start + i * hop) / sampleRate) * sampleRate)
    const a = Math.max(0, at - half), b = Math.min(samples.length, at + half)
    let power = 0
    for (let j = a; j < b; j++) power += samples[j] * samples[j]
    gain[i] = clamp(Math.sqrt(power / Math.max(1, b - a)) / (own[i] || 1e-9), .01, 2)
  }
  for (let j = 0; j < wet.length; j++) {
    const pos = j / hop, i = Math.floor(pos), f = pos - i
    wet[j] *= gain[i] * (1 - f) + (gain[i + 1] ?? gain[i]) * f
  }
  return wet
}

// Fourth-order Butterworth high-pass (two cascaded biquads), zero state.
function highpass(x, sampleRate, hz) {
  const y = Float32Array.from(x), w = 2 * Math.PI * hz / sampleRate, cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = (1 + cos) / 2 / a0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0
  for (let pass = 0; pass < 2; pass++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < y.length; i++) { const v = y[i], out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = out; y[i] = out }
  }
  return y
}

// Lag (±half a period) that best aligns `wet`, whose index `at` falls on the
// output index `onset`, with the output over the first two periods of voice.
function align(wet, at, output, onset, period) {
  let best = 0, score = -Infinity
  for (let lag = -(period >> 1); lag <= period >> 1; lag++) {
    let sum = 0
    for (let i = 0; i < 2 * period; i++) {
      const k = at + i - lag
      if (k >= 0 && k < wet.length && onset + i < output.length) sum += wet[k] * output[onset + i]
    }
    if (sum > score) { score = sum; best = lag }
  }
  return best
}

// Engines: 'waveform' keeps the recording's own cycles (within an octave),
// 'vocoder' rebuilds the voice with WORLD (any change), 'auto' picks per run
// by the largest pitch change in it and the reliability of its cycles.
export const engines = ['auto', 'waveform', 'vocoder']
// Output index of the quietest 10 ms in the unvoiced frames that follow a
// run, within 80 ms, or the run's end when none follows.
function quietest(output, from, last, track, anchors, sampleRate) {
  let end = last + 1
  while (end < track.f0.length && !track.f0[end] && track.times[end] - track.times[last] <= .08) end++
  if (end === last + 1) return from
  const stop = Math.min(output.length, Math.round(mapTime(anchors, track.times[end - 1]) * sampleRate)) - Math.round(.01 * sampleRate)
  let best = from, level = Infinity
  for (let i = from; i <= stop; i += Math.round(.0025 * sampleRate)) {
    let power = 0
    for (let j = i; j < i + Math.round(.01 * sampleRate); j++) power += output[j] * output[j]
    if (power < level) { level = power; best = i }
  }
  return best
}

export function render(samples, sampleRate, track, target, anchors, engine = 'auto') {
  if (!engines.includes(engine)) throw Error('Unknown engine.')
  validatePitch(track, target, sampleRate)
  const duration = samples.length / sampleRate
  if (anchors.length < 2 || anchors[0][0] !== 0 || anchors[0][1] !== 0 || Math.abs(anchors.at(-1)[0] - duration) > 1e-6)
    throw Error('Invalid timing anchors.')
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = [anchors[i - 1], anchors[i]], factor = (b[1] - a[1]) / (b[0] - a[0])
    if (!b.every(Number.isFinite) || b[0] <= a[0] || factor < 0.5 - 1e-8 || factor > 2 + 1e-8) throw Error('Invalid timing anchors.')
  }
  const retimed = t => {
    let i = 1
    while (i < anchors.length - 1 && anchors[i][0] <= t) i++
    const [a, b] = [anchors[i - 1], anchors[i]]
    return Math.abs((b[1] - a[1]) / (b[0] - a[0]) - 1) > 1e-8
  }
  const output = anchors.every(([a, b]) => Math.abs(a - b) < 1e-8) ? samples.slice() : timeline(samples, sampleRate, anchors)
  // A voiced run is the unit of resynthesis: joining vocoded and original
  // voice mid-vowel cancels harmonics. The rebuilt run is aligned to the
  // source's first glottal pulse and joined with 2 ms fades at its edge frames.
  const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x, 0, 1)), fade = Math.round(.002 * sampleRate)
  for (const [first, last] of runs(track.f0)) {
    let touched = false
    for (let i = first; i <= last && !touched; i++) touched = target[i] !== track.f0[i] || retimed(track.times[i])
    if (!touched) continue
    // Auto: the recording's own cycles within an octave, where they are
    // reliable (median periodicity of the run at least 0.5); the vocoder beyond.
    let change = 0
    for (let i = first; i <= last; i++) change = Math.max(change, Math.abs(12 * Math.log2(target[i] / track.f0[i])))
    const reliable = !track.periodicity || track.periodicity.subarray(first, last + 1).slice().sort()[(last - first) >> 1] >= .5
    const waveform = engine === 'waveform' || (engine === 'auto' && change <= 12 && reliable)
    const run = (waveform && track.marks && waveformRun(samples, sampleRate, track, target, anchors, first, last)) || speechRun(samples, sampleRate, track, target, anchors, first, last)
    const onset = Math.round(mapTime(anchors, track.times[first]) * sampleRate), offset = Math.round(mapTime(anchors, track.times[last]) * sampleRate)
    let start = run.start, wet = run.samples, tail = run.tail, delta = run.delta
    if (run.vocoded) {
      // The vocoder's pulses have their own phase and level contour.
      start += first ? align(wet, onset - start, output, onset, Math.round(sampleRate / track.f0[first])) : 0
      const pitch = track.f0.subarray(first, last + 1).slice().sort()[(last - first) >> 1]
      wet = restoreEnvelope(wet, samples, sampleRate, anchors, start, pitch)
      // WORLD fills the spectral envelope below the fundamental with noise,
      // gated by the pulses; at breathy phrase edges that is a low thump the
      // source never had. A voiced run has nothing below its fundamental.
      let low = Infinity
      for (let i = first; i <= last; i++) low = Math.min(low, target[i])
      wet = highpass(wet, sampleRate, .7 * low)
      tail = offset - start; delta = -align(wet, tail - 2 * Math.round(sampleRate / track.f0[last]), output, offset - 2 * Math.round(sampleRate / track.f0[last]), Math.round(sampleRate / track.f0[last]))
    }
    // The rebuilt voice has drifted by `delta` from the source by its last
    // cycle. Fading it into the unshifted source there cancels harmonics and
    // clicks, so the source itself continues from the last cycle, shifted by
    // `delta`, and rejoins the true timeline at the quietest unvoiced moment
    // within 80 ms, where phase means nothing.
    // The rejoin crossfade is 10 ms, or half of a short gap, so that no burst
    // in the gap is heard twice, once from each copy.
    const bridge = start + tail, quiet = quietest(output, bridge, last, track, anchors, sampleRate), join = Math.max(Math.round(.002 * sampleRate), Math.min(Math.round(.01 * sampleRate), (quiet - bridge) >> 1))
    // The continuation is the untouched dry timeline, copied before anything
    // is mixed in, so no part of the rebuilt voice can repeat itself.
    const from = Math.max(0, Math.min(onset, bridge - Math.abs(delta) - fade)), to = Math.min(output.length, quiet + join + Math.abs(delta) + 1), dry = output.slice(from, to)
    for (let i = Math.max(0, onset); i < Math.min(output.length, quiet + join); i++) {
      const voice = i < bridge ? Math.min(first ? ease((i - onset) / fade) : 1, ease((bridge - i) / fade)) : 0
      const carry = i < bridge - fade ? 0 : i < bridge ? 1 - ease((bridge - i) / fade) : i < quiet ? 1 : ease((quiet + join - i) / join)
      const s = i - delta - from, shifted = s >= 0 && s < dry.length ? dry[s] : output[i]
      output[i] = output[i] * (1 - voice - carry) + (i - start < wet.length && i >= start ? wet[i - start] : 0) * voice + shifted * carry
    }
  }
  if (output.some(x => !Number.isFinite(x))) throw Error('Rendering produced invalid audio.')
  return output
}

export async function encode(samples, sampleRate) {
  const encoder = await wav({ sampleRate, bitDepth: 32 })
  try { encoder.encode([samples]); return encoder.flush() } finally { encoder.free() }
}
