// Waveform engine: the recording's own glottal cycles, re-spaced. Below 4 kHz
// each cycle is resampled by the edit ratio, so its period becomes the target
// period and the copies that overlap at the new spacing are phase-aligned: no
// comb, no flanging; a causal filter then restores the source's formants.
// Above 4 kHz the same cycles are laid down without resampling, so breath,
// clicks and codec texture keep their frequencies. Timing changes repeat or
// skip cycles. Pulse shapes, breath and jitter stay the voice's own, and
// unchanged cycles reproduce the source exactly.
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

// Band split. Below the crossover, cycles are resampled and their formants
// restored; that keeps resolved harmonics comb-free. Above it, the recording's
// own cycles are laid at the new spacing without resampling: breath, clicks
// and codec texture keep their frequencies. Resampling the high band moved
// every MP3 patch and click up with the pitch, into bands the source never
// had, where the correction turned them into bright narrow spikes.
const CROSSOVER = 4000, WIDTH = 300
const lowPart = hz => hz <= CROSSOVER - WIDTH ? 1 : hz >= CROSSOVER + WIDTH ? 0 : .5 + .5 * Math.cos(Math.PI * (hz - CROSSOVER + WIDTH) / (2 * WIDTH))

// The high band of x[a, b): zero-phase FFT filter, complementary to lowPart.
function highBand(x, a, b, sampleRate) {
  const n = b - a, N = 2 ** Math.ceil(Math.log2(n + 1)), re = new Float32Array(N), im = new Float32Array(N)
  re.set(x.subarray(a, b)); fft(re, im)
  for (let k = 0; k <= N / 2; k++) {
    const g = 1 - lowPart(k * sampleRate / N)
    re[k] *= g; im[k] *= g
    if (k && k < N / 2) { re[N - k] *= g; im[N - k] *= g }
  }
  fft(re, im, true)
  return re.subarray(0, n)
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
  const grains = [], plain = table(1)
  let high = null, power = null, hx = null, hFrom = 0
  const pitched = sampleRate / 2 > CROSSOVER + 2 * WIDTH && target.subarray(first, last + 1).some((v, i) => v !== track.f0[first + i])
  if (pitched) {
    hFrom = Math.max(0, Math.floor(from - 4 * longest))
    hx = highBand(samples, hFrom, Math.min(samples.length, Math.ceil(to + 4 * longest)), sampleRate)
    high = new Float32Array(end - start); power = new Float32Array(end - start)
  }
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
    grains.push([synthesis - start, r])
    // One resampled cycle each side of the mark, with half-Hann lobes that sum
    // to one at the new spacing.
    const left = cycleLeft / r, right = cycleRight / r
    for (let j = Math.ceil(synthesis - left); j < synthesis + right; j++) {
      const u = j - synthesis, position = mark + u * r
      if (j - start < 0 || j - start >= out.length || position < TAPS / 2 || position >= samples.length - TAPS / 2 - 1) continue
      const w = u < 0 ? .5 - .5 * Math.cos(Math.PI * (u + left) / left) : .5 + .5 * Math.cos(Math.PI * u / right)
      out[j - start] += read(samples, position, taps) * w; norm[j - start] += w
    }
    if (high) {
      // The same cycle, not resampled, from the high band: lobes of a source
      // cycle, or of the new spacing where that is longer, so a lowered pitch
      // leaves no gaps between copies (one-cycle lobes buzzed there, the
      // noise dipping 7 dB between pulses at −4 st). A raised pitch overlaps
      // about r copies at any instant, each weighted 1 / r.
      const lobeLeft = Math.max(cycleLeft, left), lobeRight = Math.max(cycleRight, right), weight = 1 / Math.max(1, r)
      for (let j = Math.ceil(synthesis - lobeLeft); j < synthesis + lobeRight; j++) {
        const u = j - synthesis, position = mark + u - hFrom
        if (j - start < 0 || j - start >= high.length || position < TAPS / 2 || position >= hx.length - TAPS / 2 - 1) continue
        const w = (u < 0 ? .5 - .5 * Math.cos(Math.PI * (u + lobeLeft) / lobeLeft) : .5 + .5 * Math.cos(Math.PI * u / lobeRight)) * weight
        const value = read(hx, position, plain)
        high[j - start] += value * w; power[j - start] += value * value * w
      }
    }
    synthesis += Math.min(period(30), Math.max(1, right))
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm[i], .5)
  if (changed) restoreFormants(out, start, samples, sampleRate, track, anchors, first, last, grains, !!high)
  if (high) {
    const gain = levelGain(high, power, Math.round(.01 * sampleRate))
    for (let i = 0; i < out.length; i++) out[i] += high[i] * gain[i]
  }
  return { samples: out, start, tail, delta }
}

// Overlapping copies carry partly unrelated breath and noise, whose sum has
// less power than its parts: 2 dB less at +4 semitones, 3.4 dB at +12. Give
// back the power the copies read, over a 20 ms triangle: two box passes, so the
// gain has no corners that would spread the band. Coherent harmonics and
// unchanged cycles lost none and keep a gain of one.
function levelGain(high, power, size) {
  const e = average(average(Float64Array.from(high, v => v * v), size), size), p = average(average(power, size), size)
  return Float32Array.from(e, (v, i) => v > 0 ? Math.min(2, Math.max(1, Math.sqrt(p[i] / v))) : 1)
}
function average(x, size) {
  const n = x.length, sum = new Float64Array(n + 1), out = new Float64Array(n)
  for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + x[i]
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - (size >> 1)), b = Math.min(n, a + size); out[i] = (sum[b] - sum[a]) / (b - a) }
  return out
}

// Multiply the run's short-time spectrum by E(f) / E(f / r): resampling by r
// moved the source envelope E to E(f / r). The correction is the minimum-phase
// filter with that magnitude: like the vocal tract it models, it rings only
// after each glottal pulse. A zero-phase correction also rang before every
// pulse; the causal one scores better on every pitch edit (0.1 to 0.24 higher
// predicted naturalness). Hann frames at 75% overlap sum to one; each is
// zero-padded to twice its length, with the frame first so the filter's tail
// has room, so the correction filters linearly. Frames with a unit ratio pass
// through untouched, unless the run is band-split: then every frame keeps only
// the low band, which the unresampled high band completes.
function restoreFormants(out, start, samples, sampleRate, track, anchors, first, last, grains, split) {
  const envelope = speechEnvelope(samples, sampleRate, track, first, last), inverse = anchors.map(([a, b]) => [b, a])
  const size = 2 ** Math.ceil(Math.log2(.02 * sampleRate)), hop = size >> 2, half = size >> 1, N = 2 * size, H = size
  const window = Float32Array.from({ length: size }, (_, i) => (.5 - .5 * Math.cos(2 * Math.PI * i / size)) / 2)
  const re = new Float32Array(N), im = new Float32Array(N), cr = new Float32Array(N), ci = new Float32Array(N), result = new Float32Array(out.length)
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
  const gains = new Float32Array(H + 1)
  for (let position = hop - size, g = 0; position < out.length; position += hop) {
    const at = mapTime(inverse, (start + position + half) / sampleRate)
    // The ratio the frame's content was actually resampled by: the log-mean
    // over the cycles laid in it, weighted by the window. A single ratio at
    // the frame centre misdescribes a frame where the ratio swings between
    // cycles, and the correction then blew such a frame up by 13 dB.
    while (g < grains.length && grains[g][0] < position) g++
    let sum = 0, weight = 0
    for (let k = g; k < grains.length && grains[k][0] < position + size; k++) {
      const w = Math.sin(Math.PI * (grains[k][0] - position) / size) ** 2
      sum += w * Math.log(grains[k][1]); weight += w
    }
    const r = weight > 0 ? Math.exp(sum / weight) : 1
    const ramp = clamp(Math.min((position + half - onsetAt) / edge, (offsetAt - position - half) / edge), 0, 1)
    const frame = clamp(Math.round((at - envelope.from) / envelope.step), 0, envelope.count - 1), row = logRow(frame)
    if (!split && (Math.abs(r - 1) < 1e-9 || !ramp)) { for (let i = 0; i < size; i++) if (position + i >= 0 && position + i < out.length) result[position + i] += out[position + i] * window[i]; continue }
    re.fill(0); im.fill(0)
    for (let i = 0; i < size; i++) re[i] = (out[position + i] || 0) * window[i]
    fft(re, im)
    // Attenuation is safe at any depth; only amplification of an envelope
    // valley is bounded. Resampled overlap-add already keeps the source's
    // power, so the correction reshapes the spectrum without changing the
    // frame's energy.
    let before = 0, after = 0
    for (let b = 0; b <= H; b++) {
      const hz = b * sampleRate / N, power = (re[b] * re[b] + im[b] * im[b]) * (b && b < H ? 2 : 1)
      gains[b] = clamp(Math.exp(ramp * (level(row, hz) - level(row, hz / r)) / 2), 1e-4, 32)
      before += power; after += power * gains[b] * gains[b]
    }
    // Minimum phase: the real cepstrum of the log gain, folded onto positive
    // quefrencies, is the log spectrum of the causal filter with that magnitude.
    const scale = after > 0 ? Math.sqrt(before / after) : 1
    cr.fill(0); ci.fill(0)
    for (let b = 0; b <= H; b++) { const l = Math.log(gains[b] * scale); cr[b] = l; if (b && b < H) cr[N - b] = l }
    fft(cr, ci, true)
    for (let n = 1; n < H; n++) { cr[n] *= 2; cr[N - n] = 0 }
    ci.fill(0)
    fft(cr, ci)
    for (let b = 0; b < N; b++) {
      const m = Math.exp(cr[b]) * (split ? lowPart(Math.min(b, N - b) * sampleRate / N) : 1), gr = m * Math.cos(ci[b]), gi = m * Math.sin(ci[b]), xr = re[b], xi = im[b]
      re[b] = xr * gr - xi * gi; im[b] = xr * gi + xi * gr
    }
    fft(re, im, true)
    for (let i = 0; i < N; i++) { const j = position + i; if (j >= 0 && j < out.length) result[j] += re[i] }
  }
  out.set(result)
}
