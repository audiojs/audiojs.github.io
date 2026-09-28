// Edits use source seconds. Timing anchors map source time to output time.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
export const hzToNote = hz => 69 + 12 * Math.log2(hz / 440)
export const noteToHz = n => 440 * 2 ** ((n - 69) / 12)
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
// Scientific pitch notation of the nearest semitone: MIDI 60 is C4.
export const noteName = n => { const k = Math.round(n); return NAMES[(k % 12 + 12) % 12] + (Math.floor(k / 12) - 1) }

export function validatePitch(track, target, sampleRate) {
  // Match CheapTrick's 50 Hz analysis floor in prosody-world.cpp and WORLD's
  // synthesis floor (integer fs / fft_size + 1). Narrowband audio uses 16 kHz.
  const fs = Math.max(16000, sampleRate)
  const fft = 2 ** (1 + Math.floor(Math.log2(3 * fs / 50 + 1)))
  const low = Math.floor(fs / fft) + 1, high = sampleRate / 2
  if (target.length !== track.f0.length || target.some((x, i) => !Number.isFinite(x) || (track.f0[i] ? x < low || x >= high : x !== 0)))
    throw Error(`Invalid pitch curve. Voiced pitch must be at least ${low} Hz and below ${high} Hz.`)
}

// Shape-preserving cubic interpolation in pitch (octaves), with continuous
// slopes through voiced points. Never bend through zero into a consonant.
export function pitchAt(track, values, time) {
  if (!values.length) return 0
  const pos = clamp((time - track.times[0]) / track.hop, 0, values.length - 1)
  const a = Math.floor(pos), b = Math.min(a + 1, values.length - 1), f = pos - a
  // Voiced only between two voiced frames, so a run's pitch starts and ends
  // exactly on its edge frames.
  if (f === 0 || a === b) return track.f0[a] ? values[a] : 0
  if (!track.f0[a] || !track.f0[b]) return 0
  const y0 = Math.log2(values[a]), y1 = Math.log2(values[b]), d = y1 - y0
  const slope = (x, y) => x * y <= 0 ? 0 : 2 * x * y / (x + y)
  const m0 = track.f0[a - 1] ? slope(y0 - Math.log2(values[a - 1]), d) : d
  const m1 = track.f0[b + 1] ? slope(d, Math.log2(values[b + 1]) - y1) : d
  return 2 ** ((2 * f ** 3 - 3 * f ** 2 + 1) * y0 + (f ** 3 - 2 * f ** 2 + f) * m0 +
    (-2 * f ** 3 + 3 * f ** 2) * y1 + (f ** 3 - f ** 2) * m1)
}

export function mapTime(anchors, t) {
  let i = 1
  while (i < anchors.length - 1 && anchors[i][0] < t) i++
  const [a, b] = [anchors[i - 1], anchors[i]]
  return a[1] + (t - a[0]) / (b[0] - a[0]) * (b[1] - a[1])
}

// Change the selection's duration. Spans in `protect` (source seconds, e.g.
// consonant bursts) keep their original length; the rest of the selection
// shares the change, keeping its relative timing. When the spans leave no
// room for the change, the whole selection stretches uniformly.
export function retime(anchors, start, end, seconds, protect = []) {
  if (![start, end, seconds].every(Number.isFinite) || start < 0 || end > anchors.at(-1)[0] || end <= start || seconds <= 0)
    throw Error('Choose a valid start, end and duration.')
  const kept = []
  for (const [p, q] of protect.map(([p, q]) => [Math.max(start, p), Math.min(end, q)]).filter(([p, q]) => q > p).sort((x, y) => x[0] - y[0]))
    if (kept.length && p <= kept.at(-1)[1]) kept.at(-1)[1] = Math.max(kept.at(-1)[1], q); else kept.push([p, q])
  const build = kept => {
    const a = mapTime(anchors, start), b = mapTime(anchors, end)
    const fixed = kept.reduce((sum, [p, q]) => sum + (q - p), 0), free = kept.reduce((sum, [p, q]) => sum - (mapTime(anchors, q) - mapTime(anchors, p)), b - a)
    const factor = free > 1e-9 ? (seconds - fixed) / free : 1
    if (!Number.isFinite(factor) || factor <= 0 || (free <= 1e-9 && Math.abs(seconds - fixed) > 1e-9)) throw Error('Keep each fragment between half and twice its original duration.')
    const points = [...new Set([...anchors.map(p => p[0]), start, end, ...kept.flat()])].sort((x, y) => x - y)
    const result = [], inside = t => kept.some(([p, q]) => t > p && t < q)
    let at = a
    for (const [i, t] of points.entries()) {
      if (t <= start) result.push([t, mapTime(anchors, t)])
      else if (t >= end) result.push([t, mapTime(anchors, t) + seconds - (b - a)])
      else {
        const previous = points[i - 1], middle = (previous + t) / 2
        at += inside(middle) ? t - previous : factor * (mapTime(anchors, t) - mapTime(anchors, previous))
        result.push([t, at])
      }
    }
    for (let i = 1; i < result.length; i++) {
      const rate = (result[i][1] - result[i - 1][1]) / (result[i][0] - result[i - 1][0])
      if (rate < 0.5 - 1e-8 || rate > 2 + 1e-8) throw Error('Keep each fragment between half and twice its original duration.')
    }
    // Remove collinear anchors, so repeated edits do not split untouched audio.
    return result.filter((p, i, all) => !i || i === all.length - 1 || Math.abs((p[1] - all[i - 1][1]) / (p[0] - all[i - 1][0]) - (all[i + 1][1] - p[1]) / (all[i + 1][0] - p[0])) > 1e-8)
  }
  try { return build(kept) } catch (error) { if (!kept.length) throw error; return build([]) }
}

// Maximal voiced frame ranges [first, last].
export function runs(f0) {
  const out = []
  for (let i = 0; i < f0.length; i++) if (f0[i]) { if (!out.length || out.at(-1)[1] !== i - 1) out.push([i, i]); else out.at(-1)[1] = i }
  return out
}

// Frames the analysis trusts for pitch (all voiced frames of a synthetic track).
const reliable = (track, i) => !track.reliable || !!track.reliable[i]

// Replace the frames of [first, last] that `known` rejects by the line between
// the nearest accepted frames, held flat beyond the outermost ones. Unchanged
// when no frame is accepted.
function bridge(track, x, first, last, known) {
  let previous = -1
  for (let i = first; i <= last + 1; i++) {
    if (i <= last && !known(i)) continue
    if (previous < 0 && i > last) return
    for (let j = previous < 0 ? first : previous + 1; j < i && j <= last; j++)
      x[j] = previous < 0 ? x[i] : i > last ? x[previous] : x[previous] + (x[i] - x[previous]) * (track.times[j] - track.times[previous]) / (track.times[i] - track.times[previous])
    previous = i
  }
}

// Pitch in semitones that edits are computed from, NaN where unvoiced. Frames
// the analysis does not trust (noise tracked as voice, a stray octave) take the
// line between their trusted neighbours in the run, so an edit moves them with
// the voice around them instead of pulling a tracking error to its own target.
export function reference(track, values) {
  const out = Float64Array.from(values, (v, i) => track.f0[i] ? hzToNote(v) : NaN)
  for (const [first, last] of runs(track.f0)) bridge(track, out, first, last, i => reliable(track, i))
  return out
}

// Notes (the analysis syllables, or whole voiced runs) clipped to [start, end].
export function notesIn(track, start, end) {
  const out = []
  for (const [first, last] of track.notes ?? runs(track.f0)) {
    let a = first, b = last
    while (a <= b && track.times[a] < start) a++
    while (b >= a && track.times[b] > end) b--
    if (a <= b) out.push([a, b])
  }
  return out
}

// Pitch centre of each note in `contour` (semitones): the loudness-weighted
// median of its trusted frames, so a quiet gliding tail or a tracking error
// does not move it. null for a note of untrusted frames only.
export function centers(track, notes, contour) {
  return notes.map(([first, last]) => {
    const frames = []
    for (let i = first; i <= last; i++) if (reliable(track, i)) frames.push([contour[i], (track.level?.[i] ?? 1) + 1e-9])
    if (!frames.length) return null
    frames.sort((p, q) => p[0] - q[0])
    let half = frames.reduce((sum, f) => sum + f[1], 0) / 2
    for (const [value, weight] of frames) if ((half -= weight) <= 0) return value
    return frames.at(-1)[0]
  })
}

// Selection edges ease into continuing voice, and adjacent notes crossfade,
// over at most this long (s).
export const GLIDE = .08
const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x, 0, 1))

// A value per note, held across it and crossfaded over up to GLIDE centred on
// each boundary that voice continues across. NaN outside notes with a value.
function steps(track, notes, values) {
  const out = new Float64Array(track.f0.length).fill(NaN)
  notes.forEach(([a, b], k) => { if (values[k] != null) out.fill(values[k], a, b + 1) })
  for (let k = 1; k < notes.length; k++) {
    const [a0, b0] = notes[k - 1], [a1, b1] = notes[k], v0 = values[k - 1], v1 = values[k]
    if (a1 !== b0 + 1 || v0 == null || v1 == null) continue
    const at = (track.times[b0] + track.times[a1]) / 2, h = Math.min(GLIDE / 2, (at - track.times[a0]) / 2, (track.times[b1] - at) / 2)
    for (let i = a0; i <= b1; i++) if (Math.abs(track.times[i] - at) < h) out[i] = v0 + (v1 - v0) * ease((track.times[i] - at + h) / (2 * h))
  }
  return out
}

// Correct the voiced pitch of [start, end] in `base`, in this order:
// smooth: cosine window (s, ≤ 0.2) in semitones, within voice and selection;
// intonation: 0–2, below 1 toward the selection's median, above 1 raising the
//   intervals over its pitch floor (10th percentile) and leaving the valleys,
//   as expressive speech does: symmetric scaling drives a low voice into creak;
// straighten: 0–1 of the way from each note's contour to its centre;
// snap: 0–1 of the way from each note's centre to the nearest semitone of
//   twelve-tone equal temperament, A4 = 440 Hz;
// rise: semitones gained linearly from start to end; shift: semitones.
// The change is measured on trusted frames and carried to the others, and eases
// into voice that continues outside the selection.
export function correct(track, base, start, end, { smooth = 0, intonation = 1, straighten = 0, snap = 0, rise = 0, shift = 0 } = {}) {
  if (!(smooth >= 0 && smooth <= .2)) throw Error('Use smoothing between 0 and 200 ms.')
  if (!(intonation >= 0 && intonation <= 2)) throw Error('Use intonation between 0% and 200%.')
  if (!(straighten >= 0 && straighten <= 1 && snap >= 0 && snap <= 1)) throw Error('Use straightening and snapping between 0% and 100%.')
  if (!Number.isFinite(rise) || !Number.isFinite(shift)) throw Error('Use a finite pitch change.')
  const ids = []
  for (let i = 0; i < base.length; i++) if (track.f0[i] && track.times[i] >= start && track.times[i] <= end) ids.push(i)
  if (!ids.length) throw Error('No voiced pitch in this selection. Select a vowel or a longer phrase.')
  const first = ids[0], last = ids.at(-1), q = reference(track, base), n = q.slice()
  if (smooth) for (const i of ids) {
    let sum = q[i], weight = 1
    for (const direction of [-1, 1]) for (let j = i + direction; j >= first && j <= last && track.f0[j]; j += direction) {
      const distance = Math.abs(track.times[j] - track.times[i])
      if (distance >= smooth / 2) break
      const w = .5 + .5 * Math.cos(2 * Math.PI * distance / smooth)
      sum += q[j] * w; weight += w
    }
    n[i] = sum / weight
  }
  if (intonation !== 1) {
    const trusted = ids.filter(i => reliable(track, i)), sorted = (trusted.length ? trusted : ids).map(i => n[i]).sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1], floor = sorted[Math.floor(sorted.length * .1)]
    for (const i of ids) n[i] = intonation < 1 ? median + (n[i] - median) * intonation : n[i] > floor ? floor + (n[i] - floor) * intonation : n[i]
  }
  const notes = straighten || snap ? notesIn(track, start, end) : [], c = centers(track, notes, n), flat = steps(track, notes, c)
  const goal = c.map(v => v == null ? null : v + snap * (Math.round(v) - v)), offset = goal.map((v, k) => v == null ? null : v - c[k])
  const fade = Math.min(GLIDE, (end - start) / 4), change = new Float64Array(base.length)
  const build = () => {
    const moved = steps(track, notes, offset)
    for (const i of ids) change[i] = n[i] - q[i] + rise * (track.times[i] - start) / (end - start || 1) + shift
    for (const [k, [a, b]] of notes.entries()) if (c[k] != null) for (let i = a; i <= b; i++) change[i] += straighten * (flat[i] - n[i]) + moved[i]
    for (const [a, b] of runs(track.f0)) if (b >= first && a <= last) bridge(track, change, Math.max(a, first), Math.min(b, last), i => reliable(track, i))
    // Natural voiced onsets and ends need no return to the original pitch.
    const out = base.slice()
    for (const i of ids) {
      let weight = 1
      if (fade > 0 && track.f0[first - 1]) weight *= ease((track.times[i] - start) / fade)
      if (fade > 0 && track.f0[last + 1]) weight *= ease((end - track.times[i]) / fade)
      if (change[i] * weight) out[i] = noteToHz(hzToNote(base[i]) + change[i] * weight)
      if (!Number.isFinite(out[i]) || out[i] <= 0) throw Error('Pitch change is too large.')
    }
    return out
  }
  // Crossfades into neighbours and the selection edges pull a note's centre off
  // its goal; move each note by what it still misses until it lands.
  let out = build()
  for (let pass = 0; pass < 4 && notes.length; pass++) {
    let miss = 0
    centers(track, notes, reference(track, out)).forEach((v, k) => { if (goal[k] != null) { offset[k] += goal[k] - v; miss = Math.max(miss, Math.abs(goal[k] - v)) } })
    if (miss < 1e-4) break
    out = build()
  }
  return out
}

// Shift [start, end] so that its note around `time` centres on `goal`
// (semitones): the selection's eased edges would otherwise leave it short.
export function shiftTo(track, base, start, end, time, goal) {
  const notes = notesIn(track, start, end), k = notes.findIndex(([a, b]) => track.times[a] - track.hop <= time && track.times[b] + track.hop >= time)
  const center = values => k < 0 ? null : centers(track, [notes[k]], reference(track, values))[0]
  const from = center(base)
  if (from == null) throw Error('This note has no clear pitch to move.')
  let shift = goal - from, out = correct(track, base, start, end, { shift })
  for (let pass = 0; pass < 4; pass++) {
    const miss = goal - center(out)
    if (Math.abs(miss) < 1e-4) break
    out = correct(track, base, start, end, { shift: shift += miss })
  }
  return out
}

// The detected pitch of [start, end], exactly.
export function restore(track, target, start, end) {
  const out = target.slice()
  let voiced = false
  for (let i = 0; i < out.length; i++) if (track.f0[i] && track.times[i] >= start && track.times[i] <= end) { out[i] = track.f0[i]; voiced = true }
  if (!voiced) throw Error('No voiced pitch in this selection. Select a vowel or a longer phrase.')
  return out
}
