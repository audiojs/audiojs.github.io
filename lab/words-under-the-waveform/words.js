// The layout behind "How do you set words under a waveform?": speech clusters from pauses, the
// fit scale, exact justification of words to their sound, and line breaks in pauses.
// Pure functions: measurement comes in as `measure(text) → px`, nothing touches the page.

import { char, shift as marks } from '../vendor/wavefont.js'

// A wavefont bar from level lo to level hi (0–127, 64 the middle): the character for its height and
// marks shifting it by the steps from 64 to its middle (bars are centered: YELA 0).
export const bar = (lo, hi) => char(Math.abs(hi - lo)) + marks(Math.round((lo + hi) / 2) - 64)

// data: min/max of every `base` samples (int8, base64) and aligned words [start, end, text, speaker, paragraph]
export function decode(d) {
  let int8 = s => Int8Array.from(atob(s), c => c.charCodeAt(0) << 24 >> 24)
  return { ...d, min: int8(d.min), max: int8(d.max), words: d.words.map(([start, end, text, speaker, para], i) => ({ i, start, end, text, speaker, para })) }
}
export const load = async url => decode(await (await fetch(url)).json())

// bars for [t0, t1): `count` of them, each the extremes of the samples it covers
export function bars(d, t0, t1, count) {
  let out = '', step = (t1 - t0) / count * d.sampleRate / d.base, j0 = t0 * d.sampleRate / d.base
  for (let k = 0; k < count; k++) {
    let a = 0, b = 0, from = Math.floor(j0 + k * step), to = Math.max(from + 1, Math.floor(j0 + (k + 1) * step))
    for (let j = from; j < to && j < d.min.length; j++) { if (d.min[j] < a) a = d.min[j]; if (d.max[j] > b) b = d.max[j] }
    out += bar(Math.max(0, Math.round(64 * (a / 127 + 1))), Math.min(127, Math.round(64 * (b / 127 + 1))))
  }
  return out
}

// Silence: blocks whose peak sits under a threshold a quarter of the way from the noise floor to the
// speech level (10th and 90th percentile peaks). A silence of at least minPause ends a cluster at the
// gap between two words it overlaps most (a gap reaching 60 ms into its words); so does a new
// paragraph. A cluster's sound starts where the silence before it ends and stops where the silence
// after it begins.
export function clusters(d, minPause) {
  let n = d.min.length, bt = d.base / d.sampleRate, db = new Float32Array(n)
  for (let b = 0; b < n; b++) db[b] = 20 * Math.log10(Math.max(1, -d.min[b], d.max[b]) / 127)
  let sorted = Float32Array.from(db).sort(), q = p => sorted[Math.floor(p * (n - 1))]
  let threshold = q(.1) + (q(.9) - q(.1)) / 4, runs = []
  for (let b = 0; b < n;) {
    if (db[b] >= threshold) { b++; continue }
    let e = b; while (e < n && db[e] < threshold) e++
    if ((e - b) * bt >= minPause) runs.push([b * bt, e * bt])
    b = e
  }
  let starts = new Set([0]), onset = new Map(), offset = new Map(), ws = d.words, k = 1
  for (let j = 1; j < ws.length; j++) if (ws[j].para !== ws[j - 1].para) starts.add(j)
  for (let [s, e] of runs) {
    while (k < ws.length && ws[k].start + .06 <= s) k++
    let most = 0, at = 0
    for (let j = k; j < ws.length && ws[j - 1].end - .06 < e; j++) {
      let o = Math.min(e, ws[j].start + .06) - Math.max(s, ws[j - 1].end - .06)
      if (o > most) most = o, at = j
    }
    if (!at) continue
    starts.add(at)
    if (e <= ws[at].start && e > ws[at].start - .2) onset.set(at, e)
    if (!offset.has(at - 1) && s >= ws[at - 1].start && s < ws[at - 1].end + .3) offset.set(at - 1, s)
  }
  return { starts, onset, offset, runs, threshold, db, blockTime: bt }
}

// Words with their cluster: `phrase` when a word starts one, `anchor` and `stop` where its
// cluster's sound starts and stops. `each` makes every word a cluster of its own.
export function speech(d, { minPause = .18, each = false } = {}) {
  let c = clusters(d, minPause)
  let words = d.words.map(w => ({ ...w, phrase: each || c.starts.has(w.i), anchor: c.onset.get(w.i) ?? w.start, stop: c.offset.get(w.i) ?? w.end }))
  // paragraphs start in the middle of the pause before their first word
  let paras = []
  for (let w of words) {
    let p = paras.at(-1)
    if (p?.para === w.para) { p.last = w.i; continue }
    let t0 = w.i ? (words[w.i - 1].end + w.start) / 2 : 0
    if (p) p.t1 = t0
    paras.push({ para: w.para, speaker: d.speakers[w.speaker] ?? '', t0, t1: d.duration, first: w.i, last: w.i })
  }
  return { words, paras, clusters: c }
}

// The time scale at which text keeps pace with speech: the words' width with their spaces over the
// time their clusters sound (the pauses between clusters give text room, they don't need it).
export function fitScale(words, measure) {
  let space = measure(' '), text = 0, sound = 0, first = 0
  words.forEach((w, i) => {
    text += measure(w.text) + space
    if (words[i + 1]?.phrase !== false) { sound += w.stop - words[first].anchor; first = i + 1 }
  })
  return text / sound
}

// Least squares on a chain, exactly: word starts x as close to targets t as possible (Σ (x − t)²),
// each gap x[i+1] − x[i] within [L[i], U[i]], x[0] ≥ 0, the last start at most `right`.
// f_i(x), the least cost of words 0..i with word i at x, is convex and piecewise quadratic;
// f_{i+1}(y) = min of f_i over [y − U, y − L], plus the next square. A window min is f_i shifted by
// L left of its minimum, flat across it, shifted by U right of it. Backward, each word takes its
// f's minimizer, clamped into the window the next word leaves it.
const shift = (p, s) => ({ lo: p.lo + s, hi: p.hi + s, a: p.a, b: p.b - 2 * p.a * s, c: p.a * s * s - p.b * s + p.c })
function minimum(f, cap = Infinity) {
  let best = { x: f[0].lo, v: Infinity }
  for (let p of f) {
    let hi = Math.min(p.hi, cap)
    if (hi < p.lo) continue
    let x = Math.min(Math.max(p.a ? -p.b / (2 * p.a) : p.lo, p.lo), hi), v = (p.a * x + p.b) * x + p.c
    if (v < best.v) best = { x, v }
  }
  return best
}
export function solve(targets, L, U, right = Infinity) {
  let n = targets.length, x = new Float64Array(n), fs = [], mins = [], f = [{ lo: 0, hi: Infinity, a: 0, b: 0, c: 0 }]
  for (let i = 0; i < n; i++) {
    if (i) {
      let m = mins[i - 1], g = []
      for (let p of f) if (p.lo < m.x) g.push(shift({ ...p, hi: Math.min(p.hi, m.x) }, L[i - 1]))
      g.push({ lo: m.x + L[i - 1], hi: m.x + U[i - 1], a: 0, b: 0, c: m.v })
      if (U[i - 1] < Infinity) for (let p of f) if (p.hi > m.x) g.push(shift({ ...p, lo: Math.max(p.lo, m.x) }, U[i - 1]))
      f = g.filter(p => p.hi > p.lo)
    }
    let t = targets[i]
    f = f.map(p => ({ ...p, a: p.a + 1, b: p.b - 2 * t, c: p.c + t * t }))
    fs.push(f); mins.push(minimum(f))
  }
  if (!n) return x
  x[n - 1] = minimum(fs[n - 1], right).x
  for (let i = n - 2; i >= 0; i--) x[i] = Math.min(Math.max(mins[i].x, x[i + 1] - U[i]), x[i + 1] - L[i])
  return x
}

// Words of one line, starting at time t0: each as close to its own sound as it can, center to
// center, with spaces inside a cluster from `shrink` to `stretch` × the font's space, and between
// clusters at least `apart` × and open-ended. mode 'center' instead moves each cluster as a block,
// its spaces as close to natural as its sound allows, centered on its sound.
export function justify(words, t0, pxs, width, measure, { stretch = 2.5, shrink = .75, apart = 2.5, mode = 'squares' } = {}) {
  let space = measure(' '), n = words.length, wide = words.map(w => measure(w.text)), L = [], U = []
  let targets = words.map((w, i) => ((w.start + w.end) / 2 - t0) * pxs - wide[i] / 2)
  for (let i = 0; i + 1 < n; i++) {
    let within = !words[i + 1].phrase
    L.push(wide[i] + (within ? shrink : apart) * space)
    U.push(within ? wide[i] + stretch * space : Infinity)
  }
  if (mode === 'center') {
    // one target per cluster: its sound's center; the cluster's spaces fixed to fit its sound within limits
    for (let i = 0; i < n;) {
      let j = i; while (j + 1 < n && !words[j + 1].phrase) j++
      let sum = wide.slice(i, j + 1).reduce((s, x) => s + x, 0), sound = (words[j].stop - words[i].anchor) * pxs
      let gap = j > i ? Math.min(stretch * space, Math.max(shrink * space, (sound - sum) / (j - i))) : 0
      let start = ((words[i].anchor + words[j].stop) / 2 - t0) * pxs - (sum + gap * (j - i)) / 2
      for (let k = i, x = start; k <= j; x += wide[k] + gap, k++) { targets[k] = x; if (k < j) L[k] = U[k] = wide[k] + gap }
      i = j + 1
    }
  }
  let x = solve(targets, L, U, width - (wide[n - 1] ?? 0)), limited = 0, gaps = 0
  for (let i = 0; i + 1 < n; i++) if (U[i] < Infinity) { gaps++; if (x[i + 1] - x[i] >= U[i] - .5 && U[i] > L[i]) limited++ }
  return { out: words.map((w, i) => ({ w, x: x[i], wide: wide[i], sound: ((w.start + w.end) / 2 - t0) * pxs })), limited, gaps }
}

// Lines that end in pauses, for the given paragraphs (their first and last index into `words`). A paragraph's
// breaks are chosen together (Knuth and Plass): a line costs its unfilled share squared, a break its penalty
// (none between clusters, `comma` after punctuation, `inside` within a cluster). A line holds its words'
// sound with `lead` before the first (the very first line holds all from the start), and their narrowest
// text. The time between two lines is shared: the boundary falls in the pause and the later line starts
// `lead` before its first word if both keep within their width. A pause longer than both lines' room
// fills lines of silence. No line is longer than its room or starts after its first word's sound: a
// sound longer than a line (a held note, or a word the aligner stretched) runs on into lines without
// words, as a melisma's extender line does in sung lyrics. greedy: fill each line as far as it goes
// instead. Each line reports its `fill` and, unless it ends its paragraph, the `penalty` of its break.
export function breakLines({ words, paras }, duration, pxs, width, measure, { lead = .15, shrink = .75, apart = 2.5, comma = 8, inside = 40, greedy = false } = {}) {
  let maxT = width / pxs, space = measure(' '), wide = words.map(w => measure(w.text)), spans = []
  let joint = b => (words[b].phrase ? apart : shrink) * space                   // the narrowest space before word b
  let fill = (a, b) => (words[b].stop - (a === paras[0]?.first ? paras[0].t0 : words[a].anchor - lead)) / maxT
  let penalty = b => words[b + 1].phrase ? 0 : /[,.;:?!]$/.test(words[b].text) ? comma : inside
  for (let p of paras) {
    let own = []
    if (greedy) {
      // take as many words as fit, line after line
      for (let a = p.first; a <= p.last;) {
        let b = a, text = wide[a]
        while (b < p.last && fill(a, b + 1) <= 1 && text + joint(b + 1) + wide[b + 1] <= width) text += joint(b + 1) + wide[++b]
        own.push({ a, b }); a = b + 1
      }
    }
    else {
      let a0 = p.first, n = p.last - p.first + 1, cost = new Float64Array(n + 1).fill(Infinity), prev = new Int32Array(n + 1)
      cost[0] = 0
      for (let j = 1; j <= n; j++) {
        let b = a0 + j - 1, text = 0
        for (let i = j; i >= 1; i--) {
          let a = a0 + i - 1, f = fill(a, b)
          text += wide[a] + (i < j ? joint(a + 1) : 0)
          let fits = f <= 1 && text <= width
          if (!fits && i < j) break
          let c = cost[i - 1] + (fits ? 0 : 1e4) + (j === n ? 0 : 100 * (1 - f) ** 2 + penalty(b))
          if (c < cost[j]) { cost[j] = c; prev[j] = i }
        }
      }
      for (let j = n; j > 0; j = prev[j] - 1) own.unshift({ a: a0 + prev[j] - 1, b: a0 + j - 1 })
    }
    own[0].label = p.speaker
    for (let o of own) { o.fill = fill(o.a, o.b); if (o.b < p.last) o.penalty = penalty(o.b) }
    spans.push(...own)
  }
  let lines = [], start = paras[0]?.t0 ?? 0
  let silence = (t0, t1) => {
    let count = Math.ceil((t1 - t0) / maxT - 1e-9)
    for (let i = 0; i < count; i++) lines.push({ t0: t0 + (t1 - t0) * i / count, t1: t0 + (t1 - t0) * (i + 1) / count, words: [] })
  }
  spans.forEach(({ a, b, label, fill, penalty }, k) => {
    let reach = Math.min(words[b].stop - maxT, words[a].anchor - lead)
    if (reach > start) silence(start, reach), start = reach
    let next = spans[k + 1], hi = start + maxT, end
    if (!next) end = duration - start > maxT ? hi : duration
    else {
      let lo = Math.max(words[b].stop, words[next.b].stop - maxT), top = Math.min(words[next.a].anchor, hi)
      end = lo <= top ? Math.min(Math.max(words[next.a].anchor - lead, lo), top) : top
    }
    lines.push({ t0: start, t1: end, words: words.slice(a, b + 1), label, fill, penalty })
    start = end
  })
  if (start < duration) silence(start, duration)
  return lines
}

// the usual editor grid: every line the same length of time; a word goes to the line holding most of its sound
export function breakGrid({ words, paras }, pxs, width) {
  let maxT = width / pxs, lines = []
  for (let p of paras) {
    let own = []
    for (let t = p.t0; t < p.t1 - 1e-6; t += maxT) own.push({ t0: t, t1: Math.min(p.t1, t + maxT), words: [], label: t === p.t0 ? p.speaker : '' })
    let li = 0
    for (let w of words.slice(p.first, p.last + 1)) { while (li < own.length - 1 && (w.start + w.end) / 2 >= own[li].t1) li++; own[li].words.push(w) }
    lines.push(...own)
  }
  return lines
}
