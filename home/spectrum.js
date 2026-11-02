// The home's second figure: the long-term spectrum of the source and of the result, as the library measures them
// (chain.js), over a log axis from 20 Hz to 20 kHz, 0 dB the source's loudest band. It moves to each new result as
// the waveform does.
const fig = document.getElementById('spectrum'), plot = fig.querySelector('.plot'), svg = plot.querySelector('svg')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const W = 1000, H = 400, F0 = 20, F1 = 20000, TOP = 12, FLOOR = -60
const x = f => Math.log(f / F0) / Math.log(F1 / F0) * W
const y = db => (TOP - Math.max(FLOOR, Math.min(TOP, db))) / (TOP - FLOOR) * H

const draw = (tag, attrs) => {
  const e = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', tag))
  for (const k in attrs) e.setAttribute(k, attrs[k])
  return e
}
const label = (text, css, cls) => plot.insertAdjacentHTML('beforeend', `<span class="${cls}" style="${css}">${text}</span>`)

// The grid: a line at each 1–9 of a decade, the decades brighter; one every 6 dB, labelled every 12
const decades = [10, 100, 1000, 10000], at = decades.flatMap(d => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(m => m * d)).filter(f => f >= F0 && f <= F1)
const lines = (fs, dbs) => [...fs.map(f => `M${x(f)} 0V${H}`), ...dbs.map(d => `M0 ${y(d)}H${W}`)].join('')
const dbs = Array.from({ length: (TOP - FLOOR) / 6 + 1 }, (_, i) => TOP - 6 * i)
draw('path', { class: 'minor', d: lines(at.filter(f => !decades.includes(f)), dbs.filter(d => d % 12)) })
draw('path', { class: 'major', d: lines([100, 1000, 10000], dbs.filter(d => !(d % 12))) })
for (const [f, t] of [[20, '20'], [100, '100'], [1000, '1k'], [10000, '10k'], [20000, '20k']]) label(t, `left:${x(f) / W * 100}%`, 'hz')
for (const d of dbs.filter(d => !(d % 12))) label((d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d), `top:${y(d) / H * 100}%`, 'db')
const curves = { source: draw('path', { class: 'source' }), result: draw('path', { class: 'result' }) }

// Points through Catmull–Rom splines, as cubic Béziers
const smooth = p => p.map(([px, py], i) => {
  if (!i) return `M${px} ${py}`
  const [ax, ay] = p[i - 2] || p[i - 1], [bx, by] = p[i - 1], [dx, dy] = p[i + 1] || p[i]
  return `C${bx + (px - ax) / 6} ${by + (py - ay) / 6} ${px - (dx - bx) / 6} ${py - (dy - by) / 6} ${px} ${py}`
}).join('')

let shown, moving
function show(to) {
  const from = shown?.hz.length === to.hz.length ? shown : to, t0 = performance.now()
  shown = to
  cancelAnimationFrame(moving)
  const frame = now => {
    const t = reduce || from === to ? 1 : Math.min(1, (now - t0) / 520), e = 1 - (1 - t) ** 3
    const mix = k => to[k].map((v, i) => from[k][i] + (v - from[k][i]) * e), source = mix('source'), ref = Math.max(...source)
    for (const [k, v] of [['source', source], ['result', mix('result')]]) curves[k].setAttribute('d', smooth(v.map((db, i) => [x(to.hz[i]), y(db - ref)])))
    if (t < 1) moving = requestAnimationFrame(frame)
  }
  moving = requestAnimationFrame(frame)
}

document.getElementById('scope').addEventListener('show', e => e.detail.spectra && show(e.detail.spectra))
