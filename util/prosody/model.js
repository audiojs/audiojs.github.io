// Edits use source seconds. Timing anchors map source time to output time.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
export const hzToNote = hz => 69 + 12 * Math.log2(hz / 440)
export const noteToHz = n => 440 * 2 ** ((n - 69) / 12)

// Shape-preserving cubic interpolation in pitch (octaves), with continuous
// slopes through voiced points. Never bend through zero into a consonant.
export function pitchAt(track, values, time) {
  if (!values.length) return 0
  const pos = clamp((time - track.times[0]) / track.hop, 0, values.length - 1)
  const a = Math.floor(pos), b = Math.min(a + 1, values.length - 1), f = pos - a
  if (!track.f0[Math.round(pos)]) return 0
  if (f === 0) return values[a]
  if (a === b || !track.f0[a] || !track.f0[b]) return values[Math.round(pos)]
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

export function retime(anchors, start, end, seconds) {
  if (![start, end, seconds].every(Number.isFinite) || start < 0 || end > anchors.at(-1)[0] || end <= start || seconds <= 0)
    throw Error('Choose a valid start, end and duration.')
  const a = mapTime(anchors, start), b = mapTime(anchors, end), factor = seconds / (b - a)
  const points = [...new Set([...anchors.map(p => p[0]), start, end])].sort((a, b) => a - b)
  const result = points.map(t => [t, t <= start ? mapTime(anchors, t) : t >= end ? mapTime(anchors, t) + seconds - (b - a) : a + (mapTime(anchors, t) - a) * factor])
  for (let i = 1; i < result.length; i++) {
    const rate = (result[i][1] - result[i - 1][1]) / (result[i][0] - result[i - 1][0])
    if (rate < 0.5 - 1e-8 || rate > 2 + 1e-8) throw Error('Keep each fragment between half and twice its original duration.')
  }
  // Remove collinear anchors, so repeated edits do not split untouched audio.
  return result.filter((p, i, all) => !i || i === all.length - 1 || Math.abs((p[1] - all[i - 1][1]) / (p[0] - all[i - 1][0]) - (all[i + 1][1] - p[1]) / (all[i + 1][0] - p[0])) > 1e-8)
}

export function transform(track, target, start, end, kind, amount) {
  if (kind === 'variation' && (!Number.isFinite(amount) || amount < 0 || amount > 2)) throw Error('Use intonation between 0% and 200%.')
  const ids = []
  for (let i = 0; i < target.length; i++) if (track.f0[i] && track.times[i] >= start && track.times[i] <= end) ids.push(i)
  if (!ids.length) throw Error('No voiced pitch in this selection. Select a vowel or a longer phrase.')
  const notes = ids.map(i => hzToNote(target[i])).sort((a, b) => a - b)
  const center = notes[notes.length >> 1], out = target.slice()
  for (const i of ids) {
    let note = hzToNote(target[i])
    if (kind === 'shift') note += amount
    else if (kind === 'variation') note = center + (note - center) * amount
    else if (kind === 'ramp') note += amount * (track.times[i] - start) / (end - start)
    else if (kind === 'reset') { out[i] = track.f0[i]; continue }
    else throw Error('Unknown pitch edit')
    out[i] = noteToHz(clamp(note, hzToNote(track.f0[i]) - 12, hzToNote(track.f0[i]) + 12))
  }
  return out
}

export function movePoint(track, target, index, hz) {
  if (!track.f0[index] || !Number.isFinite(hz) || hz <= 0) throw Error('Choose a voiced point and a positive frequency.')
  const out = target.slice(), delta = hzToNote(hz) - hzToNote(target[index])
  // Local gesture tapers over 100 ms; stop at unvoiced boundaries.
  for (const direction of [-1, 1]) {
    for (let i = index + (direction === 1 ? 1 : 0); i >= 0 && i < out.length; i += direction) {
      const distance = Math.abs(track.times[i] - track.times[index])
      if (!track.f0[i] || distance >= 0.1) break
      out[i] = noteToHz(clamp(hzToNote(target[i]) + delta * (1 - distance / 0.1), hzToNote(track.f0[i]) - 12, hzToNote(track.f0[i]) + 12))
    }
  }
  return out
}
