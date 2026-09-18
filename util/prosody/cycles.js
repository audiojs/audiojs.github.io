// Glottal cycle marks and the cycle-accurate pitch they define. Harvest gives a
// frame-rate contour averaged over several periods; at a fast inflection it is
// off by about a semitone. Marks locate every cycle, so pitch is known per
// cycle and edits can keep the voice's natural jitter.
import { pitchAt } from './model.js'
export const FINE = .001

// Normalized correlation between windows of n samples starting at a and b.
function ncc(x, a, b, n) {
  let xy = 0, xx = 0, yy = 0
  for (let i = 0; i < n; i++) { const p = x[a + i] || 0, q = x[b + i] || 0; xy += p * q; xx += p * p; yy += q * q }
  return xy / Math.sqrt(xx * yy || 1)
}

// Marks of one voiced run, at a consistent phase within each cycle: step from
// the loudest cycle in both directions, matching one period of waveform.
function runMarks(x, sampleRate, track, first, last) {
  const period = at => { const hz = pitchAt(track, track.f0, at / sampleRate); return hz ? sampleRate / hz : 0 }
  const start = track.times[first] * sampleRate - period(track.times[first] * sampleRate) / 2
  const end = track.times[last] * sampleRate + period(track.times[last] * sampleRate) / 2
  let anchor = -1, loudest = -1
  for (let i = first; i <= last; i++) {
    const center = Math.round(track.times[i] * sampleRate), half = Math.round(period(center) / 2)
    let energy = 0
    for (let j = Math.max(0, center - half); j < Math.min(x.length, center + half); j++) energy += x[j] * x[j]
    if (energy > loudest) { loudest = energy; anchor = center }
  }
  const half = Math.round(period(anchor) / 2)
  let peak = anchor
  for (let j = Math.max(0, anchor - half); j < Math.min(x.length, anchor + half); j++) if (Math.abs(x[j]) > Math.abs(x[peak])) peak = j
  const step = (from, direction) => {
    const out = []
    let mark = from
    for (;;) {
      const p = period(mark)
      if (!p) break
      const next = mark + direction * p
      if (next < start || next > end) break
      // The reference window sits on the rounded mark; the lag it measures is
      // added to the fractional mark so no quantization accumulates per cycle.
      const base = Math.round(mark), h = Math.round(p / 2), lo = Math.round(next - .3 * p), hi = Math.round(next + .3 * p)
      let best = Math.round(next), score = -Infinity, scores = new Map()
      for (let c = lo; c <= hi; c++) { const s = ncc(x, base - h, c - h, 2 * h); scores.set(c, s); if (s > score) { score = s; best = c } }
      // Aperiodic cycle: keep the predicted spacing rather than a random peak.
      let refined = next
      if (score >= .3) {
        let lag = best - base
        if (best > lo && best < hi) {
          const y0 = scores.get(best - 1), y1 = score, y2 = scores.get(best + 1), d = y0 - 2 * y1 + y2
          if (d < 0) lag += (y0 - y2) / (2 * d)
        }
        refined = mark + lag
      }
      out.push(refined); mark = refined
    }
    return out
  }
  return [...step(peak, -1).reverse(), peak, ...step(peak, 1)]
}

// All marks (sample positions, fractional) and the 1 ms pitch grid they define.
export function cycles(x, sampleRate, track, runs) {
  const marks = [], fine = new Float32Array(Math.floor(x.length / sampleRate / FINE) + 1)
  for (const [first, last] of runs) {
    const m = runMarks(x, sampleRate, track, first, last)
    // Cycle periods, with a single stray cycle (typically at a run edge, where
    // the cycle is partly consonant) replaced by the median of its neighbors.
    const periods = Array.from({ length: m.length - 1 }, (_, k) => m[k + 1] - m[k])
    const period = periods.map((v, k, all) => all.length < 3 ? v : [all[Math.min(Math.max(k, 1), all.length - 2) - 1], all[Math.min(Math.max(k, 1), all.length - 2)], all[Math.min(Math.max(k, 1), all.length - 2) + 1]].sort((a, b) => a - b)[1])
    const from = Math.max(0, Math.round((track.times[first] - track.hop / 2) / FINE)), to = Math.min(fine.length - 1, Math.round((track.times[last] + track.hop / 2) / FINE))
    for (let g = from, k = 0; g <= to; g++) {
      const at = g * FINE * sampleRate
      while (k < m.length - 2 && m[k + 1] <= at) k++
      // Cycle spacing where marks exist; Harvest's value where the run is too short.
      fine[g] = period.length ? sampleRate / period[k] : pitchAt(track, track.f0, g * FINE) || track.f0[first]
    }
    marks.push(...m)
  }
  return { marks: Float64Array.from(marks), fine }
}

// Cycle-accurate pitch at a time, or 0 outside voice. A track without a cycle
// grid (synthetic contours) falls back to its frame contour.
export function fineAt(track, time) {
  if (!track.fine) return pitchAt(track, track.f0, time)
  const pos = time / FINE, i = Math.floor(pos), f = pos - i
  const a = track.fine[i] || 0, b = track.fine[i + 1] || 0
  return a && b ? a * (1 - f) + b * f : a || b
}

// The edit as a smooth ratio to the frame contour, applied to the cycle pitch:
// the macro contour follows the edit, the micro contour stays the voice's own.
export function fineTargetAt(track, target, time) {
  const source = pitchAt(track, track.f0, time), edited = pitchAt(track, target, time)
  return source && edited ? fineAt(track, time) * edited / source : 0
}
