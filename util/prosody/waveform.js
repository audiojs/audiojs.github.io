// Waveform engine: pitch-synchronous overlap-add on the recording's own
// glottal cycles. Each cycle is windowed around its mark and laid down again at
// the edited spacing, so the voice keeps its pulse shapes, breath and jitter;
// only the cycle spacing (pitch) and cycle choice (timing) change. Formants
// stay where the cycles put them. Best within about half an octave; beyond
// that, repeated or thinned cycles start to sound, and the vocoder takes over.
import { mapTime, pitchAt } from './model.js'

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
  let synthesis = mapTime(anchors, marks[0] / sampleRate) * sampleRate, k = 0
  while (synthesis < end) {
    const at = mapTime(inverse, synthesis / sampleRate) * sampleRate
    while (k < marks.length - 1 && Math.abs(marks[k + 1] - at) <= Math.abs(marks[k] - at)) k++
    while (k > 0 && Math.abs(marks[k - 1] - at) < Math.abs(marks[k] - at)) k--
    // One cycle each side of the mark, with half-Hann lobes that sum to one
    // when cycles are laid down at their own spacing.
    const mark = marks[k], left = k ? mark - marks[k - 1] : marks[k + 1] - mark, right = k < marks.length - 1 ? marks[k + 1] - mark : left
    const center = Math.round(synthesis) - start, m = Math.round(mark)
    for (let i = -Math.round(left); i < Math.round(right); i++) {
      const j = center + i, s = m + i
      if (j < 0 || j >= out.length || s < 0 || s >= samples.length) continue
      const w = i < 0 ? .5 - .5 * Math.cos(Math.PI * (i + left) / left) : .5 + .5 * Math.cos(Math.PI * i / right)
      out[j] += samples[s] * w; norm[j] += w
    }
    // Step by this cycle's own length over the edit ratio: at a ratio of one the
    // marks fall back on the source's, and unchanged cycles reproduce the source.
    synthesis += Math.min(period(30), Math.max(1, right / ratio(at / sampleRate)))
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm[i], .5)
  return { samples: out, start }
}
