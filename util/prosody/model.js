// Edits use source seconds. Timing anchors map source time to output time.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
export const hzToNote = hz => 69 + 12 * Math.log2(hz / 440)
export const noteToHz = n => 440 * 2 ** ((n - 69) / 12)

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

export function transform(track, target, start, end, kind, amount, smoothing = 0) {
  if (!Number.isFinite(smoothing) || smoothing < 0 || smoothing > .2) throw Error('Use smoothing between 0 and 200 ms.')
  if (kind === 'variation' && (!Number.isFinite(amount) || amount < 0 || amount > 2)) throw Error('Use intonation between 0% and 200%.')
  if (!Number.isFinite(amount)) throw Error('Use a finite pitch change.')
  const ids = []
  for (let i = 0; i < target.length; i++) if (track.f0[i] && track.times[i] >= start && track.times[i] <= end) ids.push(i)
  if (!ids.length) throw Error('No voiced pitch in this selection. Select a vowel or a longer phrase.')
  const notes = ids.map(i => hzToNote(target[i])).sort((a, b) => a - b)
  const center = notes[notes.length >> 1], out = target.slice()
  const first = ids[0], last = ids.at(-1), fade = Math.min(.08, (end - start) / 2)
  const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x, 0, 1))
  for (const i of ids) {
    let note = hzToNote(target[i])
    if (kind === 'shift') note += amount
    else if (kind === 'variation') {
      // Smooth the requested contour in semitones, never across a consonant or
      // outside the selection. A cosine window removes frame-scale jitter.
      let sum = note, weight = 1
      if (smoothing) for (const direction of [-1, 1]) {
        for (let j = i + direction; j >= first && j <= last && track.f0[j]; j += direction) {
          const distance = Math.abs(track.times[j] - track.times[i])
          if (distance >= smoothing / 2) break
          const w = .5 + .5 * Math.cos(2 * Math.PI * distance / smoothing)
          sum += hzToNote(target[j]) * w; weight += w
        }
      }
      note = center + (sum / weight - center) * amount
    }
    else if (kind === 'ramp') note += amount * (track.times[i] - start) / (end - start)
    else if (kind === 'reset') { out[i] = track.f0[i]; continue }
    else throw Error('Unknown pitch edit')
    // Ease edits into existing voicing at selection edges. Natural voiced
    // onsets/ends need no artificial return to the original pitch.
    let weight = 1
    if (fade > 0 && track.f0[first - 1]) weight *= ease((track.times[i] - start) / fade)
    if (fade > 0 && track.f0[last + 1]) weight *= ease((end - track.times[i]) / fade)
    const original = hzToNote(target[i])
    const hz = noteToHz(original + (note - original) * weight)
    out[i] = hz
    if (!Number.isFinite(out[i]) || out[i] <= 0) throw Error('Pitch change is too large.')
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
      out[i] = noteToHz(hzToNote(target[i]) + delta * (.5 + .5 * Math.cos(Math.PI * distance / .1)))
    }
  }
  return out
}
