// Tests for words.js: the exact solver and the line breaker against brute force, the pause rule on a
// signal built to known levels, and the wavefont bars. Run: node --test 'lab/**/*.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bar, decode, clusters, speech, fitScale, solve, justify, breakLines } from './words.js'

// seeded, so a failure reproduces (mulberry32)
const random = (seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 2 ** 32 })(20260927)
const between = (a, b) => a + random() * (b - a)
const d = decode(JSON.parse(readFileSync(new URL('speech.json', import.meta.url))))
const measure = t => 7 * t.length                                  // a stand-in font: 7 px a character

// wavefont 3.8.2 README: "U+0100-017F for 0..127 values"; accents shift a bar, acute U+0301 one step up,
// circumflex U+0302 ten up, grave U+0300 one down, caron U+030C ten down. A bar centered (YELA 0) on m
// from lo to hi is height hi − lo shifted by m − 64.
test('bar: height from the character, middle from the marks, levels in either order', () => {
  let steps = { '\u0301': 1, '\u0302': 10, '\u0300': -1, '\u030C': -10 }
  for (let [lo, hi] of [[0, 127], [64, 64], [10, 20], [100, 127], [0, 1], [30, 98]]) {
    let [c, ...marks] = bar(lo, hi)
    assert.equal(c.charCodeAt(0) - 0x100, hi - lo)
    assert.equal(marks.reduce((s, m) => s + steps[m], 0), Math.round((lo + hi) / 2) - 64)
    assert.equal(bar(hi, lo), bar(lo, hi))
  }
  assert.equal(bar(64, 64), '\u0100')                                // a flat bar at the middle: no marks
})

// the reference for a tiny chain: every active set (each gap free, at its least, at its most; each end
// free or at its bound), solved in closed form, the best feasible one kept
function brute(t, L, U, right) {
  let n = t.length, best = Infinity, states = L.map((_, i) => U[i] < Infinity ? 3 : 2), total = states.reduce((a, s) => a * s, 4)
  for (let code = 0; code < total; code++) {
    let c = code, act = states.map(s => { let v = c % s; c = Math.floor(c / s); return v }), lo = c & 1, hi = c >> 1 & 1
    let groups = [], g = { idx: [0], off: [0] }
    for (let i = 0; i < n - 1; i++) {
      if (act[i]) g.idx.push(i + 1), g.off.push(g.off.at(-1) + (act[i] === 1 ? L[i] : U[i]))
      else groups.push(g), g = { idx: [i + 1], off: [0] }
    }
    groups.push(g)
    let x = new Float64Array(n)
    groups.forEach((gr, k) => {
      let pos = gr.idx.reduce((s, i, j) => s + t[i] - gr.off[j], 0) / gr.idx.length
      if (k === 0 && lo) pos = 0
      if (k === groups.length - 1 && hi) pos = right - gr.off.at(-1)
      gr.idx.forEach((i, j) => x[i] = pos + gr.off[j])
    })
    let ok = x[0] >= -1e-9 && x[n - 1] <= right + 1e-9 && L.every((l, i) => x[i + 1] - x[i] >= l - 1e-9 && x[i + 1] - x[i] <= U[i] + 1e-9)
    if (ok) best = Math.min(best, x.reduce((s, xi, i) => s + (xi - t[i]) ** 2, 0))
  }
  return best
}

test('solve: least squares on a chain, as brute force finds it', () => {
  for (let trial = 0; trial < 3000; trial++) {
    let n = 1 + Math.floor(random() * 6), t = Array.from({ length: n }, () => between(-50, 400)).sort((a, b) => a - b), L = [], U = []
    if (random() < .3) t.reverse()
    for (let i = 0; i < n - 1; i++) { let l = between(5, 60); L.push(l); U.push(random() < .3 ? Infinity : l + between(0, 40)) }
    let right = L.reduce((s, l) => s + l, 0) + between(0, 300), x = solve(t, L, U, right)
    assert.ok(x[0] >= -1e-6 && x[n - 1] <= right + 1e-6 && L.every((l, i) => x[i + 1] - x[i] >= l - 1e-6 && x[i + 1] - x[i] <= U[i] + 1e-6), `infeasible: ${JSON.stringify({ t, L, U, right })}`)
    let v = x.reduce((s, xi, i) => s + (xi - t[i]) ** 2, 0), ref = brute(t, L, U, right)
    assert.ok(Math.abs(v - ref) <= 1e-6 * Math.max(1, ref), `cost ${v}, brute force ${ref}: ${JSON.stringify({ t, L, U, right })}`)
  }
})

test('clusters: silence under 10th percentile + ¼ of the way to the 90th, pauses of at least minPause', () => {
  // 10 ms blocks at ±100 (loud) or ±1 (quiet): quiet 0–0.5 s, a word, 0.1 s quiet, a word, 0.4 s quiet, a word
  let loud = [[.5, 1], [1.1, 1.6], [2, 2.5]], n = 300, min = new Int8Array(n), max = new Int8Array(n)
  for (let b = 0; b < n; b++) { let on = loud.some(([a, e]) => b / 100 >= a && b / 100 < e); min[b] = on ? -100 : -1; max[b] = on ? 100 : 1 }
  let c = clusters({ base: 128, sampleRate: 12800, min, max, words: loud.map(([start, end], i) => ({ i, start, end, para: 0 })) }, .18)
  let quiet = 20 * Math.log10(1 / 127), speech = 20 * Math.log10(100 / 127)
  assert.ok(Math.abs(c.threshold - (quiet + (speech - quiet) / 4)) < 1e-4)
  assert.deepEqual([...c.starts], [0, 2])                               // 0.1 s is no pause, 0.4 s is
  assert.deepEqual(c.runs.map(r => r.map(t => +t.toFixed(3))), [[0, .5], [1.6, 2], [2.5, 3]])
  assert.equal(c.onset.get(2), 2); assert.equal(c.offset.get(1), 1.6)
})

// every line of the recording at a few widths: time tiled, words in order, lines within their room
const layouts = () => {
  let s = speech(d), pxs = fitScale(s.words, measure), out = []
  for (let width of [272, 600, 1000]) for (let greedy of [false, true]) out.push({ s, pxs, width, greedy, lines: breakLines(s, d.duration, pxs, width, measure, { greedy }) })
  return out
}

test('breakLines: lines tile the time, keep the words in order, fit their room', () => {
  for (let { s, pxs, width, greedy, lines } of layouts()) {
    let at = `${width} px${greedy ? ', greedy' : ''}`
    assert.equal(lines[0].t0, s.paras[0].t0, at)
    assert.equal(lines.at(-1).t1, d.duration, at)
    lines.forEach((l, k) => { if (k) assert.equal(l.t0, lines[k - 1].t1, `${at}: line ${k} starts where ${k - 1} ends`) })
    assert.deepEqual(lines.flatMap(l => l.words.map(w => w.i)), s.words.map(w => w.i), at)
    lines.forEach((l, k) => {
      assert.ok((l.t1 - l.t0) * pxs <= width + 1e-6, `${at}: line ${k} wider than its room`)
      if (!l.words.length) return
      // words sit on the line where their sound starts; a sound that outlasts its line runs on into
      // lines without words, unless the next word's sound has already begun
      let first = l.words[0], last = l.words.at(-1), next = lines[k + 1]
      assert.ok(l.t0 <= first.anchor + 1e-9 && last.start < l.t1, `${at}: line ${k} misses the start of its words`)
      if (last.stop > l.t1 + 1e-9) assert.ok(!next.words.length || next.words[0].anchor < last.stop, `${at}: line ${k} cuts "${last.text}" off`)
    })
    // the first words start the first line, rather than a line of silence before them
    assert.ok(lines[0].words.length, `${at}: the first line is silence`)
  }
})

test('breakLines: breaks chosen together cost no more than any other set of breaks', () => {
  let s = speech(d), pxs = fitScale(s.words, measure), width = 240, maxT = width / pxs, space = measure(' '), lead = .15
  // twelve words as a paragraph of their own, from a few places in the recording
  for (let first of [0, 40, 97, 150, 230]) {
    let last = first + 11, p = { para: 0, speaker: '', t0: Math.max(0, s.words[first].anchor - .3), t1: d.duration, first, last }
    let lines = breakLines({ words: s.words, paras: [p] }, d.duration, pxs, width, measure).filter(l => l.words.length)
    let cost = lines.slice(0, -1).reduce((c, l) => c + 100 * (1 - l.fill) ** 2 + l.penalty, 0)
    // the same cost, for every one of the 2¹¹ ways to break twelve words
    let fill = (a, b) => (s.words[b].stop - (a === first ? p.t0 : s.words[a].anchor - lead)) / maxT
    let text = (a, b) => { let x = measure(s.words[a].text); for (let i = a + 1; i <= b; i++) x += (s.words[i].phrase ? 2.5 : .75) * space + measure(s.words[i].text); return x }
    let penalty = b => s.words[b + 1].phrase ? 0 : /[,.;:?!]$/.test(s.words[b].text) ? 8 : 40
    let best = Infinity
    for (let mask = 0; mask < 1 << 11; mask++) {
      let total = 0, a = first
      for (let b = first; b <= last && total < Infinity; b++) if (b === last || mask >> b - first & 1) {
        let f = fill(a, b)
        total += f <= 1 && text(a, b) <= width ? (b === last ? 0 : 100 * (1 - f) ** 2 + penalty(b)) : Infinity
        a = b + 1
      }
      best = Math.min(best, total)
    }
    assert.ok(best < Infinity, `words ${first}–${last}: nothing fits`)
    assert.ok(Math.abs(cost - best) < 1e-9, `words ${first}–${last}: cost ${cost}, brute force ${best}`)
  }
})

test('justify: words keep their order, spaces within their limits, the line within its width', () => {
  let s = speech(d), pxs = fitScale(s.words, measure), width = 600, space = measure(' ')
  for (let l of breakLines(s, d.duration, pxs, width, measure)) {
    let { out } = justify(l.words, l.t0, pxs, width, measure)
    out.forEach(({ w, x, wide }, i) => {
      assert.ok(x >= -1e-6 && x + wide <= width + 1e-6 || l.words.length === 1)
      let next = out[i + 1]
      if (!next) return
      let gap = next.x - x - wide
      if (next.w.phrase) assert.ok(gap >= 2.5 * space - 1e-6)
      else assert.ok(gap >= .75 * space - 1e-6 && gap <= 2.5 * space + 1e-6)
    })
  }
})
