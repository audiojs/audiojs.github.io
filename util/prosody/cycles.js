// Glottal cycle marks and the cycle-accurate pitch they define. Harvest gives a
// frame-rate contour averaged over several periods; at a fast inflection it is
// off by about a semitone. Marks locate every cycle, so pitch is known per
// cycle and edits can keep the voice's natural jitter.
import { pitchAt } from './model.js'

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

// All marks (sample positions, fractional), refining the frame contour in
// place: each frame takes the mean pitch of the cycles it covers, with a
// single stray cycle (typically at a run edge, where the cycle is partly
// consonant) replaced by the median of its neighbors.
export function cycles(x, sampleRate, track, runs) {
  const marks = []
  for (const [first, last] of runs) {
    const m = runMarks(x, sampleRate, track, first, last)
    marks.push(...m)
    if (m.length < 3) continue
    const periods = Array.from({ length: m.length - 1 }, (_, k) => m[k + 1] - m[k])
    const period = periods.map((v, k, all) => all.length < 3 ? v : [all[Math.min(Math.max(k, 1), all.length - 2) - 1], all[Math.min(Math.max(k, 1), all.length - 2)], all[Math.min(Math.max(k, 1), all.length - 2) + 1]].sort((p, q) => p - q)[1])
    for (let i = first; i <= last; i++) {
      const from = (track.times[i] - track.hop / 2) * sampleRate, to = (track.times[i] + track.hop / 2) * sampleRate
      let sum = 0, n = 0
      for (let k = 0; k < period.length; k++) if (m[k + 1] > from && m[k] < to) { sum += sampleRate / period[k]; n++ }
      if (n) track.f0[i] = sum / n
    }
  }
  return Float64Array.from(marks)
}
