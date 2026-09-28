// Figures for "How do you set words under a waveform?": each finds its plate by data-fig and draws
// into it from the same two minutes of speech and the same layout code (words.js).
import { load, bars, speech, clusters, fitScale, justify, breakLines, breakGrid } from './words.js'
import Waveform from '../vendor/gl-waveform.js'

const d = await load(new URL('speech.json', import.meta.url))
await Promise.all(['14px Newsreader', '40px Wavefont', '11px "Departure Mono"'].map(f => document.fonts.load(f)))

const TEXT = '14px Newsreader', WAVE = 40, BAR = 2, GAP = 1, PITCH = BAR + GAP, SVG = 'http://www.w3.org/2000/svg'
const ctx = document.createElement('canvas').getContext('2d')
const measure = t => (ctx.font = TEXT, ctx.measureText(t).width)
const el = (tag, cls, text) => { let e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
const svg = (tag, attrs = {}, text) => { let e = document.createElementNS(SVG, tag); for (let k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e }
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const median = a => { let s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] ?? 0 }
const within = (list, t0, t1) => list.filter(w => w.start >= t0 && w.end <= t1)
// [t0, t1] cut into equal lines no longer than maxT, each word on the line where it starts
const cut = (t0, t1, maxT, ws) => {
  let n = Math.ceil((t1 - t0) / maxT - 1e-9), len = (t1 - t0) / n
  let lines = Array.from({ length: n }, (_, i) => ({ t0: t0 + i * len, t1: t0 + (i + 1) * len, words: [] }))
  for (let w of ws) lines[Math.min(n - 1, Math.floor((w.start - t0) / len))].words.push(w)
  return lines
}
const plates = name => document.querySelectorAll(`[data-fig="${name}"]`)
const widthOf = plate => { let s = getComputedStyle(plate); return Math.max(260, plate.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)) }
const base = speech(d), FIT = fitScale(base.words, measure)
// a stretch of the recording for a figure: its paragraphs cut to [t0, t1]; word indices stay global
const part = (t0, t1) => ({ words: base.words, paras: base.paras
  .map(p => ({ ...p, t0: Math.max(p.t0, t0), t1: Math.min(p.t1, t1), first: base.words.findIndex(w => w.i >= p.first && w.start >= t0), last: base.words.findLastIndex(w => w.i <= p.last && w.end <= t1) }))
  .filter(p => p.first >= 0 && p.last >= p.first) })

// controls under the plate: segmented buttons and a range, their changes redraw the figure
function controls(plate, spec, draw) {
  let bar = el('div', 'controls'), state = {}
  for (let [key, label, options, initial] of spec) {
    state[key] = initial
    if (options === 'range') {
      let [min, max, step] = initial.range, input = Object.assign(el('input'), { type: 'range', min, max, step, value: initial.value })
      let row = el('label', '', `${label} `), out = el('output', '', String(initial.value))
      state[key] = initial.value
      input.oninput = () => { state[key] = +input.value; out.textContent = input.value; draw(state) }
      row.append(input, out)
      bar.append(row)
      continue
    }
    let g = el('span', 'group', `${label} `), pills = el('span')
    pills.dataset.name = key
    for (let [value, text] of options) {
      let b = el('button', '', text)
      b.type = 'button'
      b.dataset.value = value
      b.setAttribute('aria-pressed', value === initial)
      b.onclick = () => { state[key] = value; pills.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(state) }
      pills.append(b)
    }
    g.append(pills)
    bar.append(g)
  }
  plate.after(bar)
  return state
}

// draw now, and again when the plate's width changes; a height change alone never redraws,
// since rebuilding the lines would drop the reader's selection
function live(plate, draw, spec = []) {
  let state = spec.length ? controls(plate, spec, draw) : {}, w = plate.clientWidth
  draw(state)
  new ResizeObserver(() => { if (plate.clientWidth !== w) { w = plate.clientWidth; draw(state) } }).observe(plate)
}

// ── live lines: wavefont bars over a row of words ───────────────────────────────────────
// place(line) → [{ w, x }] positions words under the line; the bars are a string, a character and its
// shift marks a bar, and line.at holds where each bar starts in it (and where it ends).
function drawLines(host, lines, pxs, place, { gutter = true } = {}) {
  let frag = document.createDocumentFragment(), out = []
  for (let line of lines) {
    let row = el('div', 'w-line'), body = el('div', 'w-body'), wave = el('div', 'w-bars'), row2 = el('div', 'w-words')
    if (gutter) {
      let g = el('div', 'w-gut')
      if (line.label) g.append(el('b', '', line.label.split(' ')[0]))
      g.append(el('span', '', clock(line.t0)))
      g.contentEditable = 'false'
      row.append(g)
    }
    let count = Math.max(0, Math.round((line.t1 - line.t0) * pxs / PITCH))
    line.node = wave.appendChild(document.createTextNode(bars(d, line.t0, line.t1, count)))
    line.count = count
    line.at = []
    for (let i = 0, text = line.node.data; i <= text.length; i++) if (i === text.length || text.charCodeAt(i) < 0x300) line.at.push(i)
    // words stay in the text flow, with real spaces between them, each moved into place by its
    // margin: carets, arrow keys, hit tests and copied text behave as they do in any text
    let right = 0, space = measure(' ')
    for (let { w, x } of place(line)) {
      let s = el('span', '', w.text), gap = row2.childNodes.length ? space : 0
      if (gap) row2.append(' ')
      s.style.marginLeft = (x - right - gap).toFixed(2) + 'px'
      row2.append(s)
      right = x + measure(w.text)
      out.push({ w, node: s.firstChild, line })
    }
    body.append(wave, row2)
    row.append(body)
    frag.append(row)
  }
  host.replaceChildren(frag)
  return out
}
const justified = (pxs, width, opts) => line => justify(line.words, line.t0, pxs, width, measure, opts).out

// FIG 1.1 · two clocks: every word at the moment it starts, nothing else
for (let plate of plates('clocks')) {
  let host = el('div', 'w-host'), readout = el('div', 'readout'), t0 = 11.4, t1 = 18.6
  plate.append(host, readout)
  let draw = s => {
    let W = widthOf(plate) - 48, ws = within(base.words, t0, t1), lines = cut(t0, t1, W / s.pxs, ws)
    drawLines(host, lines, s.pxs, line => line.words.map(w => ({ w, x: (w.start - line.t0) * s.pxs })))
    let text = ws.reduce((a, w) => a + measure(w.text + ' '), 0), sound = (ws.at(-1).end - ws[0].start) * s.pxs
    readout.innerHTML = `<span>scale <b>${s.pxs} px/s</b></span><span>text is <b>${(text / sound).toFixed(2)}×</b> as wide as its sound</span>`
  }
  live(plate, draw, [['pxs', 'Scale', 'range', { range: [40, 240, 5], value: 60 }]])
}

// FIG 2.1 · three ways that don't work, on the same ten seconds
for (let plate of plates('failures')) {
  let host = el('div', 'w-host'), t0 = .4, t1 = 11.2, pxs = 54, ws = within(base.words, t0, t1)
  plate.append(host)
  let draw = s => {
    let W = widthOf(plate) - 48
    if (s.way === 'squeeze') {
      // each word under its own sound, letters condensed until it fits
      let lines = cut(t0, t1, W / pxs, ws)
      drawLines(host, lines, pxs, line => line.words.map(w => ({ w, x: (w.start - line.t0) * pxs })))
      host.querySelectorAll('.w-words span').forEach((s, i) => { let w = ws[i]; s.style.transform = `scaleX(${Math.min(1, (w.end - w.start) * pxs / measure(w.text)).toFixed(3)})`; s.style.transformOrigin = '0 50%' })
    }
    else if (s.way === 'room') {
      // ruby: each word's bars as the base, the word as its annotation; the base opens where the word is wider
      let p = el('p', 'w-ruby'), cursor = t0
      for (let w of ws) {
        let gap = Math.round((w.start - cursor) * pxs / PITCH), own = Math.max(1, Math.round((w.end - w.start) * pxs / PITCH))
        p.append(el('span', 'w-gap', bars(d, cursor, w.start, Math.max(0, gap))), document.createElement('wbr'))
        let r = el('ruby'); r.append(document.createTextNode(bars(d, w.start, w.end, own)), el('rt', '', w.text))
        p.append(r, document.createElement('wbr'))
        cursor = w.end
      }
      host.replaceChildren(p)
    }
    else {
      // text first: each word's bars drawn as wide as the word
      let p = el('p', 'w-script')
      for (let w of ws) {
        let u = el('span', 'w-unit'), count = Math.max(1, Math.round(measure(w.text) / PITCH))
        u.append(el('span', '', w.text), el('span', 'w-strip', bars(d, w.start, w.end, count)))
        p.append(u, ' ')
      }
      host.replaceChildren(p)
    }
  }
  live(plate, draw, [['way', 'Way', [['squeeze', 'Squeeze the words'], ['room', 'Make room (ruby)'], ['first', 'Text first']], 'squeeze']])
}

// FIG 3.1 · the fit scale: the layout of this article at any scale, with what it costs
for (let plate of plates('fit')) {
  let host = el('div', 'w-host w-scroll'), readout = el('div', 'readout'), stretch = part(0, 58.5)
  plate.append(host, readout)
  let draw = s => {
    let W = widthOf(plate) - 48, lines = breakLines(stretch, 58.5, s.pxs, W, measure), offs = [], limited = 0, gaps = 0
    drawLines(host, lines, s.pxs, line => {
      let j = justify(line.words, line.t0, s.pxs, W, measure)
      limited += j.limited; gaps += j.gaps
      for (let { x, wide, sound } of j.out) offs.push(Math.abs(x + wide / 2 - sound))
      return j.out
    })
    let perMin = host.scrollHeight / (58.5 / 60)
    readout.innerHTML = `<span>fit <b>${Math.round(FIT)} px/s</b></span><span>spaces at the stretch limit <b>${Math.round(100 * limited / (gaps || 1))} %</b></span><span>word centers from their sound <b>${Math.round(median(offs))} px</b> median</span><span>3 hours <b>≈ ${Math.round(perMin * 180 / 900)}</b> screens</span>`
  }
  live(plate, draw, [['pxs', 'Scale', 'range', { range: [60, 220, 1], value: Math.round(FIT) }]])
}

// ── line art: SVG bars with blue annotations ────────────────────────────────────────────
function svgBars(g, t0, t1, pxs, y, h, attrs = {}) {
  let count = Math.round((t1 - t0) * pxs / PITCH), step = (t1 - t0) / count * d.sampleRate / d.base, j0 = t0 * d.sampleRate / d.base
  for (let k = 0; k < count; k++) {
    let a = 0, b = 0, from = Math.floor(j0 + k * step), to = Math.max(from + 1, Math.floor(j0 + (k + 1) * step))
    for (let j = from; j < to && j < d.min.length; j++) { if (d.min[j] < a) a = d.min[j]; if (d.max[j] > b) b = d.max[j] }
    let top = y - b / 127 * h / 2, bottom = y - a / 127 * h / 2
    g.append(svg('rect', { x: k * PITCH, y: Math.min(top, y - .5), width: BAR, height: Math.max(1, bottom - top), rx: 1, class: 'ink', ...attrs }))
  }
}
const bracket = (g, x0, x1, y, dy = 5) => g.append(svg('path', { d: `M${x0} ${y - dy}V${y}H${x1}V${y - dy}`, class: 'line' }))
// a label in the line art (.tick: 10 px mono, .04 em tracking), wrapped to `width`; returns its last baseline
function label(g, text, x, y, width, lead = 14) {
  let fit = t => (ctx.font = '10px "Departure Mono"', ctx.measureText(t).width + .4 * t.length) <= width, lines = []
  for (let word of text.split(' ')) lines.length && fit(lines.at(-1) + ' ' + word) ? lines[lines.length - 1] += ' ' + word : lines.push(word)
  let t = svg('text', { x, y, class: 'tick' })
  lines.forEach((line, i) => t.append(svg('tspan', { x, dy: i ? lead : 0 }, line)))
  g.append(t)
  return y + (lines.length - 1) * lead
}

// FIG 4.1 · forced alignment: each word's sound as a bracket under the bars
for (let plate of plates('align')) {
  let t0 = 2.3, host = el('div', 'w-svg')
  plate.append(host)
  let draw = () => {
    // up to five seconds, never under 150 px/s: narrower plates show less time rather than crowd the words
    let W = widthOf(plate), pxs = Math.max(150, W / 5), t1 = t0 + W / pxs, rows = []
    let s = svg('svg', { width: W, role: 'img', 'aria-label': 'Waveform with each word’s aligned span bracketed underneath' })
    svgBars(s, t0, t1, pxs, 44, 76)
    for (let w of within(base.words, t0, t1)) {
      let x0 = (w.start - t0) * pxs, x1 = (w.end - t0) * pxs, mid = (x0 + x1) / 2, half = measure(w.text) * 13 / 28
      let row = rows.findIndex(right => right + 8 <= mid - half)
      if (row < 0) row = rows.push(0) - 1
      rows[row] = mid + half
      let y = 96 + row * 26
      bracket(s, x0, x1, y)
      s.append(svg('line', { x1: mid, x2: mid, y1: y, y2: y + 4, class: 'line' }))
      s.append(svg('text', { x: mid, y: y + 17, class: 'word', 'text-anchor': 'middle' }, w.text))
    }
    let H = 96 + rows.length * 26 + 28
    for (let t = Math.ceil(t0 * 2) / 2; t <= t1; t += .5) s.append(svg('text', { x: (t - t0) * pxs, y: H - 2, class: 'tick', 'text-anchor': 'middle' }, t.toFixed(1) + 's'))
    s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('height', H)
    host.replaceChildren(s)
  }
  live(plate, draw)
}

// FIG 4.2 · pauses: each bar's peak level in decibels, the silence threshold, the clusters it leaves
for (let plate of plates('pauses')) {
  let t0 = 19, t1 = 32.6, host = el('div', 'w-svg'), readout = el('div', 'readout')
  plate.append(host, readout)
  let draw = s => {
    let W = widthOf(plate), left = 34, pxs = (W - left) / (t1 - t0), H = 168, top = 12, h = 100, floor = -60, c = clusters(d, s.pause / 1000)
    let y = db => top + h * Math.min(1, Math.max(0, db / floor))
    let g = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Peak level in decibels with the pause threshold, quiet stretches shaded and clusters bracketed' })
    let plot = svg('g', { transform: `translate(${left} 0)` })
    for (let db of [0, -20, -40, -60]) g.append(svg('text', { x: left - 6, y: y(db) + 3, class: 'tick', 'text-anchor': 'end' }, db))
    for (let [a, b] of c.runs) if (b > t0 && a < t1) plot.append(svg('rect', { x: (Math.max(a, t0) - t0) * pxs, y: top - 2, width: (Math.min(b, t1) - Math.max(a, t0)) * pxs, height: h + 4, class: 'quiet' }))
    // one bar every PITCH px: the loudest block it covers, from the floor up
    let count = Math.floor((t1 - t0) * pxs / PITCH), per = (t1 - t0) / count / c.blockTime, j0 = t0 / c.blockTime
    for (let k = 0; k < count; k++) {
      let peak = -Infinity
      for (let j = Math.floor(j0 + k * per); j < Math.floor(j0 + (k + 1) * per) && j < c.db.length; j++) peak = Math.max(peak, c.db[j])
      plot.append(svg('rect', { x: k * PITCH, y: y(peak), width: BAR, height: Math.max(1, top + h - y(peak)), class: 'ink' }))
    }
    plot.append(svg('line', { x1: 0, x2: W - left, y1: y(c.threshold), y2: y(c.threshold), class: 'line strong' }))
    let sp = speech(d, { minPause: s.pause / 1000 }), ws = within(sp.words, t0, t1), groups = [], atPunct = 0
    for (let w of ws) (w.phrase || !groups.length ? groups.push([w]) : groups.at(-1).push(w))
    for (let grp of groups) {
      let x0 = Math.max(0, (grp[0].anchor - t0) * pxs), x1 = Math.min(W - left, (grp.at(-1).stop - t0) * pxs), yb = top + h + 26
      bracket(plot, x0, x1, yb)
      // as many whole words as fit the bracket
      let label = ''
      for (let w of grp) { let next = label ? label + ' ' + w.text : w.text; if (measure(next + ' …') > x1 - x0 - 4 && label) { label += ' …'; break } label = next }
      plot.append(svg('text', { x: x0 + 2, y: yb + 17, class: 'word' }, label))
      if (/[,.;:?!]$/.test(grp.at(-1).text)) atPunct++
    }
    g.append(plot)
    host.replaceChildren(g)
    readout.innerHTML = `<span>threshold <b>${c.threshold.toFixed(0)} dB</b> (blue line)</span><span>pauses <b>${c.runs.filter(([a, b]) => b > t0 && a < t1).length}</b></span><span>clusters <b>${groups.length}</b></span><span>ending at punctuation <b>${Math.round(100 * atPunct / groups.length)} %</b></span>`
  }
  live(plate, draw, [['pause', 'Minimum pause, ms', 'range', { range: [80, 400, 10], value: 180 }]])
}

// FIG 5.1 · boxes and glue: one line, word boxes, springs between them, leader lines to each sound
for (let plate of plates('glue')) {
  let t0 = 19.1, host = el('div', 'w-svg'), readout = el('div', 'readout')
  plate.append(host, readout)
  let draw = s => {
    let W = widthOf(plate), pxs = FIT, t1 = t0 + (W - 8) / pxs, H = 190, words = within(base.words, t0, t1)
    let { out } = justify(words, t0, pxs, W, measure, { stretch: s.stretch, mode: s.mode })
    let g = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Word boxes joined by glue, each tied to the center of its sound' })
    svgBars(g, t0, t1, pxs, 36, 60)
    let yt = 78, yb = 134, dist = []
    out.forEach(({ w, x, wide, sound }, i) => {
      g.append(svg('line', { x1: sound, x2: sound, y1: yt - 6, y2: yt + 6, class: 'line strong' }))
      g.append(svg('line', { x1: sound, x2: x + wide / 2, y1: yt + 6, y2: yb - 12, class: 'dash' }))
      g.append(svg('rect', { x, y: yb - 12, width: wide, height: 22, rx: 2, class: 'box' }))
      g.append(svg('text', { x: x + wide / 2, y: yb + 4, class: 'word', 'text-anchor': 'middle' }, w.text))
      dist.push(Math.abs(x + wide / 2 - sound))
      let next = out[i + 1]
      if (next) {
        let a = x + wide + 1, b = next.x - 1, y = yb - 1
        if (next.w.phrase) g.append(svg('line', { x1: a, x2: b, y1: y, y2: y, class: 'dash' }))
        else {
          // a spring: zigzag across the space
          let n = Math.max(2, Math.round((b - a) / 3)), pts = [`${a},${y}`]
          for (let k = 1; k < n; k++) pts.push(`${a + (b - a) * k / n},${y + (k % 2 ? -3 : 3)}`)
          pts.push(`${b},${y}`)
          g.append(svg('polyline', { points: pts.join(' '), class: 'line' }))
        }
      }
    })
    g.append(svg('text', { x: 0, y: yt - 10, class: 'tick' }, 'sound centers'))
    H = label(g, 'dashes: space between clusters', 0, label(g, 'springs: space inside a cluster', 0, 170, W) + 14, W) + 4
    g.setAttribute('viewBox', `0 0 ${W} ${H}`); g.setAttribute('height', H)
    host.replaceChildren(g)
    readout.innerHTML = `<span>distance from sound <b>${Math.round(dist.reduce((a, b) => a + b, 0) / dist.length)} px</b> mean</span><span>worst <b>${Math.round(Math.max(...dist))} px</b></span>`
  }
  live(plate, draw, [['mode', 'Place', [['center', 'Center each cluster'], ['squares', 'Least squares']], 'squares'], ['stretch', 'Spaces up to', [[1, '1×'], [2.5, '2.5×'], [4, '4×']], 2.5]])
}

// FIG 6.1 · where lines end: a fixed grid, greedy, and breaks chosen together
for (let plate of plates('breaks')) {
  let host = el('div', 'w-host w-breaks'), readout = el('div', 'readout'), p = base.paras[1], one = { words: base.words, paras: [p] }
  plate.append(host, readout)
  let draw = s => {
    // a narrow plate sets each break's label under its line, a wide one in a column of its own
    let stack = widthOf(plate) < 480, W = stack ? widthOf(plate) - 48 : Math.min(widthOf(plate) - 48 - 90, 520), pxs = FIT
    host.classList.toggle('w-stack', stack)
    let lines = s.how === 'grid' ? breakGrid(one, pxs, W) : breakLines(one, p.t1, pxs, W, measure, { greedy: s.how === 'greedy' })
    lines = lines.filter(l => l.words.length)
    drawLines(host, lines, pxs, justified(pxs, W))
    let cost = 0, kinds = { 0: 'pause', 8: 'comma', 40: 'inside' }
    host.querySelectorAll('.w-line').forEach((row, i) => {
      let line = lines[i], last = line.words.at(-1), next = lines[i + 1]?.words[0], kind
      if (!next) kind = 'end'
      else if (s.how === 'grid') kind = last.end > line.t1 + .02 || next.start < line.t1 - .02 ? 'cut mid-word' : 'cut'
      else kind = `${kinds[line.penalty]} · ${line.penalty}`, cost += 100 * (1 - Math.min(1, line.fill)) ** 2 + line.penalty
      row.append(el('span', 'w-brk', kind))
    })
    readout.innerHTML = s.how === 'grid' ? `<span>lines <b>${lines.length}</b></span><span>every line <b>${(W / pxs).toFixed(1)} s</b></span>` : `<span>lines <b>${lines.length}</b></span><span>cost <b>${Math.round(cost)}</b> (unfilled² + penalties)</span>`
  }
  live(plate, draw, [['how', 'Breaks', [['grid', 'Every few seconds'], ['greedy', 'Greedy, in pauses'], ['optimal', 'Chosen together']], 'optimal']])
}

// FIG 7.1 · one selection: the editor, with the browser's selection as the only one
for (let plate of plates('select')) {
  let view = el('div', 'w-host w-edit'), readout = el('div', 'readout'), audio = new Audio(new URL(d.src, import.meta.url).href), playBtn = el('button', 'play', 'Play')
  playBtn.type = 'button'
  let bar = el('div', 'controls')
  bar.append(playBtn, readout)
  readout.style.marginTop = '0'
  plate.append(bar, view)
  Object.assign(view, { contentEditable: 'true', spellcheck: false, inputMode: 'none' })
  view.setAttribute('aria-label', 'Transcript and waveform; select to highlight both')
  for (let type of ['beforeinput', 'paste', 'drop', 'dragstart', 'cut']) view.addEventListener(type, e => e.preventDefault())
  let placed = [], lines = [], order = [], wordNode = [], nodes = new Map(), pxs = FIT, sel = null, caret = 0, now = -1, stopAt = Infinity
  let mark = el('span', 'w-mark'); mark.contentEditable = 'false'
  let draw = () => {
    let W = widthOf(plate) - 48
    lines = breakLines(base, d.duration, pxs, W, measure)
    placed = drawLines(view, lines, pxs, justified(pxs, W))
    nodes.clear()
    for (let l of lines) nodes.set(l.node, { bars: l })
    for (let p of placed) { nodes.set(p.node, { word: p.w }); wordNode[p.w.i] = p.node }
    let byLine = Map.groupBy(placed, p => p.line)
    order = lines.flatMap(l => [l.node, ...(byLine.get(l) ?? []).map(p => p.node)])
    view.append(mark)
    paint()
  }
  // where a DOM point is in time: bars by the bar that starts there, words by their share.
  // A point outside them (a space, the gutter, a line's edge) belongs to the bars or word after it.
  let timeOf = (node, offset) => {
    if (!nodes.has(node)) {
      let at = new Range(), lo = 0, hi = order.length
      at.setStart(node, offset)
      while (lo < hi) { let m = lo + hi >> 1; at.comparePoint(order[m], 0) < 0 ? lo = m + 1 : hi = m }
      if (lo < order.length) node = order[lo], offset = 0
      else node = order.at(-1), offset = node.length
    }
    let n = nodes.get(node)
    if (n.word) { let share = offset / Math.max(1, node.length); return { t: n.word.start + share * (n.word.end - n.word.start), w: n.word, share } }
    let l = n.bars, k = l.at.findIndex(o => o >= offset)
    return { t: l.t0 + k / Math.max(1, l.count) * (l.t1 - l.t0) }
  }
  let rangesFor = (t0, t1) => {
    let out = []
    for (let l of lines) if (l.t1 > t0 && l.t0 < t1 && l.count) {
      let at = t => l.at[Math.max(0, Math.min(l.count, Math.round((t - l.t0) / (l.t1 - l.t0) * l.count)))]
      let r = new Range(); r.setStart(l.node, at(Math.max(t0, l.t0))); r.setEnd(l.node, at(Math.min(t1, l.t1))); if (!r.collapsed) out.push(r)
    }
    for (let p of placed) { let m = (p.w.start + p.w.end) / 2; if (m >= t0 && m <= t1) { let r = new Range(); r.selectNodeContents(p.node); out.push(r) } }
    return out
  }
  let paint = () => {
    CSS.highlights.set('lab-sel', new Highlight(...(sel ? rangesFor(sel[0], sel[1]) : [])))
    let r = now >= 0 && wordNode[now] && new Range()
    if (r) r.selectNodeContents(wordNode[now])
    CSS.highlights.set('lab-now', new Highlight(...(r ? [r] : [])))
    // the caret, or the playhead, as a mark on the bars
    let t = audio.paused ? caret : audio.currentTime, l = lines.find(l => t >= l.t0 && t < l.t1 && l.count)
    mark.hidden = !l
    if (!l) return
    let box = l.node.parentNode.getBoundingClientRect(), frame = view.getBoundingClientRect()
    mark.style.transform = `translate(${(box.left - frame.left + (t - l.t0) * pxs).toFixed(1)}px, ${(box.top - frame.top + view.scrollTop + 6).toFixed(1)}px)`
    mark.style.height = box.height - 12 + 'px'
  }
  document.addEventListener('selectionchange', () => {
    let s = getSelection()
    if (!s.rangeCount || !view.contains(s.anchorNode) || !view.contains(s.focusNode)) return
    let a = timeOf(s.anchorNode, s.anchorOffset), f = timeOf(s.focusNode, s.focusOffset)
    // a click while playing moves playback there
    if (s.isCollapsed) { sel = null; caret = a.t; if (!audio.paused) audio.currentTime = caret, stopAt = Infinity }
    // a word touched by the selection is taken whole; a selection that only meets a word's edge leaves it out
    else { let [p, q] = a.t <= f.t ? [a, f] : [f, a]; sel = [p.w ? (p.share < 1 ? p.w.start : p.w.end) : p.t, q.w ? (q.share > 0 ? q.w.end : q.w.start) : q.t] }
    readout.innerHTML = sel ? `<span>selected <b>${clock(sel[0])}.${String(Math.round(sel[0] % 1 * 100)).padStart(2, '0')} – ${clock(sel[1])}.${String(Math.round(sel[1] % 1 * 100)).padStart(2, '0')}</b></span>` : `<span>caret <b>${clock(caret)}</b></span>`
    paint()
  })
  // a double click on bars selects the word spoken there, as a double click on a word does
  view.addEventListener('mousedown', e => {
    if (e.detail < 2) return
    let pos = document.caretPositionFromPoint?.(e.clientX, e.clientY), rng = !pos && document.caretRangeFromPoint?.(e.clientX, e.clientY)
    let node = pos ? pos.offsetNode : rng?.startContainer, offset = pos ? pos.offset : rng?.startOffset
    if (!node || !nodes.get(node)?.bars) return
    e.preventDefault()
    let t = timeOf(node, offset).t, w = base.words.find(w => w.end >= t) ?? base.words.at(-1), [r] = rangesFor(w.start, w.end)
    if (r) { getSelection().removeAllRanges(); getSelection().addRange(r) }
  })
  let tick = () => {
    let t = audio.currentTime, i = base.words.findIndex(w => w.end > t)
    if (i >= 0 && base.words[i].start > t) i = -1
    if (i !== now) { now = i; paint() } else paint()
    let box = mark.getBoundingClientRect(), frame = view.getBoundingClientRect()
    if (box.top < frame.top + 20 || box.bottom > frame.bottom - 20) view.scrollTop += box.top - frame.top - frame.height / 3
    if (t >= stopAt) audio.pause()
    if (!audio.paused) requestAnimationFrame(tick)
  }
  // play the selection, or from the caret on
  playBtn.onclick = () => {
    if (!audio.paused) return audio.pause()
    let [from, to] = sel ?? [caret, Infinity]
    stopAt = to; audio.currentTime = from; audio.play()
  }
  audio.onplay = () => { playBtn.textContent = 'Pause'; tick() }
  audio.onpause = () => { playBtn.textContent = 'Play'; caret = audio.currentTime; now = -1; paint() }
  view.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); playBtn.click() } })
  readout.innerHTML = `<span>caret <b>0:00</b></span>`
  live(plate, draw)
}

// FIG 8.1 · seams: two bars meeting inside a device pixel, magnified
for (let plate of plates('seams')) {
  let host = el('div', 'w-svg')
  plate.append(host)
  let draw = () => {
    let W = widthOf(plate), cell = W < 500 ? 16 : 24, cols = Math.floor(W / cell), y = -26
    let g = svg('svg', { width: W, role: 'img', 'aria-label': 'Device pixels under bars 2 and 2.5 pixels wide; shared pixels come out lighter' })
    let row = (width, title) => {
      y = label(g, title, 0, y + 36, W) + 10
      for (let c = 0; c < cols; c++) {
        // each bar covers its share of the pixel; overlapping partial covers blend: 1 − Π(1 − a)
        let left = c, right = c + 1, keep = 1
        for (let b = 0; b * width < cols; b++) { let a = Math.max(0, Math.min(right, (b + 1) * width) - Math.max(left, b * width)); keep *= 1 - a }
        let ink = 1 - keep
        g.append(svg('rect', { x: c * cell, y, width: cell - 1, height: cell * 3 - 1, class: 'px', style: `fill-opacity:${ink.toFixed(3)}` }))
        if (ink > .01 && ink < .99) g.append(svg('text', { x: c * cell + cell / 2, y: y + cell * 3 + 14, class: 'tick', 'text-anchor': 'middle' }, ink.toFixed(2).replace(/^0/, '')))
      }
      for (let b = 1; b * width < cols; b++) g.append(svg('line', { x1: b * width * cell, x2: b * width * cell, y1: y - 4, y2: y + cell * 3 + 3, class: 'line strong' }))
      y += cell * 3 + 14
    }
    row(2, 'bars 2 device pixels wide: every edge on a pixel edge')
    row(2.5, 'bars 2.5 device pixels wide (1.25 CSS px at 2×): every other edge splits a pixel')
    g.setAttribute('viewBox', `0 0 ${W} ${y + 4}`); g.setAttribute('height', y + 4)
    host.replaceChildren(g)
  }
  live(plate, draw)
}

// FIG 8.2 · wavefont bars or a gl-waveform outline under the same, still selectable, text
for (let plate of plates('outline')) {
  let wrap = el('div', 'w-glwrap'), host = el('div', 'w-host'), canvas = el('canvas', 'w-gl'), note = el('div', 'readout')
  wrap.append(canvas, host)
  plate.append(wrap, note)
  let stretch = part(43.6, 58.3), data = new Float32Array(2 * d.min.length), wf = null
  for (let b = 0; b < d.min.length; b++) { data[2 * b] = d.min[b] / 127; data[2 * b + 1] = d.max[b] / 127 }
  let draw = s => {
    let W = widthOf(plate) - 48, lines = breakLines(stretch, 58.3, FIT, W, measure).filter(l => l.words.length)
    drawLines(host, lines, FIT, justified(FIT, W))
    wrap.classList.toggle('outline', s.look === 'outline')
    if (s.look !== 'outline') return
    try { wf ||= new Waveform(canvas, { data, rms: false, thickness: 1 }) } catch (e) { note.textContent = 'No WebGL2 here: ' + e.message; return }
    let dpr = devicePixelRatio, box = wrap.getBoundingClientRect()
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr)
    canvas.style.width = box.width + 'px'; canvas.style.height = box.height + 'px'
    let gl = wf.gl, color = getComputedStyle(plate).color, rate = 2 * d.sampleRate / d.base
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    host.querySelectorAll('.w-bars').forEach((b, i) => {
      let r = b.getBoundingClientRect(), l = lines[i]
      wf.update({ color, range: [l.t0 * rate, l.t1 * rate], viewport: [r.left - box.left, r.top - box.top, (l.t1 - l.t0) * FIT, r.height] }).render()
    })
  }
  live(plate, draw, [['look', 'Draw', [['bars', 'Wavefont bars'], ['outline', 'gl-waveform outline']], 'bars']])
}

// the side list marks the section being read
let links = new Map([...document.querySelectorAll('.toc a')].map(a => [a.hash.slice(1), a]))
let reading = new IntersectionObserver(es => {
  for (let e of es) if (e.isIntersecting) { links.forEach(a => a.removeAttribute('aria-current')); links.get(e.target.id)?.setAttribute('aria-current', 'true') }
}, { rootMargin: '-10% 0px -80% 0px' })
document.querySelectorAll('article h2[id]').forEach(h => reading.observe(h))
