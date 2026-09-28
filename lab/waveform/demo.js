// Drawing a waveform: every figure drawn here, pixel by pixel, from the sound's own samples, in the panels' colours.
import { RATE, sounds, sound, stereo, panel, demo, css, oklab, srgb, oklch, encode, fft, window } from '../kit.js'

const $ = s => document.querySelector(s)

// The page's sound, for every figure but the first (a sweep), up close and the two channels (their own)
const picker = $('#sound'), redraws = []
picker.append(...['chime', 'voice', 'drums', 'sweep'].map(k => new Option(sounds[k].name, k)))
picker.value = 'drums'
picker.onchange = () => redraws.forEach(r => r())
const current = () => sound(picker.value)

// ── Drawing ─────────────────────────────────────────────────────

// Per column of samples [from, to): lowest, highest, RMS
function columns(x, W, from = 0, to = x.length) {
  const lo = new Float64Array(W), hi = new Float64Array(W), rms = new Float64Array(W), spp = (to - from) / W
  for (let c = 0; c < W; c++) {
    const a = Math.floor(from + c * spp), b = Math.max(a + 1, Math.floor(from + (c + 1) * spp))
    let l = Infinity, h = -Infinity, s = 0
    for (let i = Math.max(0, a); i < b && i < x.length; i++) { const v = x[i]; if (v < l) l = v; if (v > h) h = v; s += v * v }
    lo[c] = l; hi[c] = h; rms[c] = Math.sqrt(s / (b - a))
  }
  return { lo, hi, rms, W }
}
// Pixels: paint colour c at coverage a over what is there, or add it (light on a screen)
function pixels(ctx, W, H) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data
  return {
    H,
    put(x, y, a, [r, g, b]) { if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 4; a = Math.min(1, a); d[p] += (r * 255 - d[p]) * a; d[p + 1] += (g * 255 - d[p + 1]) * a; d[p + 2] += (b * 255 - d[p + 2]) * a },
    add(x, y, [r, g, b]) { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 4; d[p] = Math.min(255, d[p] + r * 255); d[p + 1] = Math.min(255, d[p + 1] + g * 255); d[p + 2] = Math.min(255, d[p + 2] + b * 255) },
    done() { ctx.putImageData(img, 0, 0) }
  }
}
// A lane [y0, y0 + h): level v (1 at the top edge, −1 at the bottom) to pixel row, linear or in decibels, and back (y.v)
const linear = (y0, h) => { const m = y0 + h / 2, y = v => m - v * h / 2; y.v = py => (m - py) / (h / 2); return y }
const decibels = (y0, h, range) => {
  const m = y0 + h / 2, y = v => m - Math.sign(v) * Math.max(0, 1 + 20 * Math.log10(Math.abs(v) + 1e-12) / range) * h / 2
  y.v = py => { const u = (m - py) / (h / 2); return u ? Math.sign(u) * 10 ** ((Math.abs(u) - 1) * range / 20) : 0 }
  return y
}
// Fill each column between its lowest and highest: coverage exact at the edges, or whole pixels; shade(col, level) 0..1
function envelope(px, c, y, { color, crisp = false, shade = null } = {}) {
  for (let x = 0; x < c.W; x++) {
    // a column past the end holds no samples
    if (!(c.lo[x] <= c.hi[x])) continue
    let top = Math.max(-1, Math.min(y(c.hi[x]), y(c.lo[x]))), bottom = Math.min(px.H + 1, Math.max(y(c.hi[x]), y(c.lo[x])))
    if (bottom - top < 1) { const m = (top + bottom) / 2; top = m - .5; bottom = m + .5 }
    if (crisp) { top = Math.round(top); bottom = Math.max(top + 1, Math.round(bottom)) }
    for (let r = Math.floor(top); r < Math.ceil(bottom); r++) {
      const cover = Math.max(0, Math.min(r + 1, bottom) - Math.max(r, top))
      px.put(x, r, cover * (shade ? shade(x, y.v(r + .5)) : 1), typeof color === 'function' ? color(x) : color)
    }
  }
}

// ── 1. Every Nth sample ─────────────────────────────────────────
const spp = (u, n, W) => Math.max(1, Math.round((n / W) ** u))
demo($('#nth'), ({ zoom, truth }) => {
  const figure = $('#nth'), { ctx, W, H, T } = panel(figure.querySelector('canvas'), 220), x = sound('sweep'), k = spp(zoom, x.length, W)
  figure.querySelector('output').value = k
  const px = pixels(ctx, W, H), y = linear(10, H - 20)
  if (truth) envelope(px, columns(x, W, 0, W * k), y, { color: T.ink3 })
  px.done()
  ctx.strokeStyle = css(T.ink)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c < W; c++) { const v = x[c * k] ?? 0; c ? ctx.lineTo(c + .5, y(v)) : ctx.moveTo(c + .5, y(v)) }
  ctx.stroke()
})

// ── 2. Lowest and highest, and the pyramid that reads them ──────
// Reads to find a column's lowest and highest: every sample, or pyramid nodes of 256 · 2^L samples plus the
// samples at the column's ragged ends (Mazzoni & Dannenberg 2002; gl-waveform)
function pyramidReads(a, b) {
  let reads = 0, i = a
  while (i < b) {
    let size = 256
    if (i % 256 || i + 256 > b) { reads++; i++; continue }
    while (i % (size * 2) === 0 && i + size * 2 <= b) size *= 2
    reads++; i += size
  }
  return reads
}
const minmax = $('#minmax')
redraws.push(demo(minmax, ({ zoom, edge }) => {
  const { ctx, W, H, T } = panel(minmax.querySelector('canvas'), 220), x = current(), k = spp(zoom, x.length, W)
  minmax.querySelector('output').value = k
  const px = pixels(ctx, W, H)
  envelope(px, columns(x, W, 0, W * k), linear(10, H - 20), { color: T.ink, crisp: edge === 'columns' })
  px.done()
  // an hour of sound across this width: what a redraw reads
  const hour = 3600 * RATE, per = hour / W
  let pyramid = 0
  for (let c = 0; c < W; c++) pyramid += pyramidReads(Math.floor(c * per), Math.floor((c + 1) * per))
  $('#reads').textContent = `an hour across this width, a redraw reads ${hour.toLocaleString()} samples, or ${pyramid.toLocaleString()} from the pyramid`
}))

// ── 3. Loudness inside ──────────────────────────────────────────
const rmsFigure = $('#rms')
redraws.push(demo(rmsFigure, ({ with: w }) => {
  const { ctx, W, H, T } = panel(rmsFigure.querySelector('canvas'), 200), x = current(), c = columns(x, W), y = linear(10, H - 20)
  const px = pixels(ctx, W, H)
  envelope(px, c, y, { color: w === 'rms' ? T.ink3 : T.ink })
  if (w === 'rms') envelope(px, { ...c, lo: c.rms.map(v => -v), hi: c.rms }, y, { color: T.ink })
  px.done()
}))

// ── 4. Brightness by level ──────────────────────────────────────
// erfc, Abramowitz & Stegun 7.1.26 (error under 1.5e-7)
const erfc = x => { const t = 1 / (1 + .3275911 * x); return t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x) }
// How often a column reaches level v, 0..1: guessed from its peak and RMS (power law; Gaussian noise of that RMS), or
// counted over its samples in `bins` levels (share: at or past v; time: at v, an oscilloscope's afterglow)
function shading(style, x, c, from, spp, bins) {
  if (style === 'power') return (col, v) => { const P = v >= 0 ? c.hi[col] : -c.lo[col]; if (!(P > 0)) return 1; const q = Math.min(.98, c.rms[col] ** 2 / P ** 2); return 1 - Math.min(1, Math.abs(v) / P) ** (2 * q / (1 - q)) }
  if (style === 'gauss') return (col, v) => c.rms[col] > 0 ? erfc(Math.abs(v) / (c.rms[col] * Math.SQRT2)) : 1
  const counts = new Float32Array(c.W * bins), most = new Float32Array(c.W), above = new Float32Array(c.W), below = new Float32Array(c.W)
  const bin = v => Math.min(bins - 1, Math.max(0, Math.floor((1 - v) / 2 * bins)))
  for (let col = 0; col < c.W; col++) for (let i = Math.max(0, Math.floor(from + col * spp)), end = Math.min(x.length, Math.floor(from + (col + 1) * spp)); i < end; i++) {
    const k = col * bins + bin(x[i])
    counts[k]++; most[col] = Math.max(most[col], counts[k]); x[i] >= 0 ? above[col]++ : below[col]++
  }
  if (style === 'share') {
    // running sums from each edge inward
    for (let col = 0; col < c.W; col++) {
      for (let r = 1; r < bins / 2; r++) counts[col * bins + r] += counts[col * bins + r - 1]
      for (let r = bins - 2; r >= bins / 2; r--) counts[col * bins + r] += counts[col * bins + r + 1]
    }
    return (col, v) => { const n = v >= 0 ? above[col] : below[col]; return n ? counts[col * bins + bin(v)] / n : 1 }
  }
  return (col, v) => { const r = bin(v), k = col * bins + r; return most[col] ? Math.min(1, (counts[k] * 2 + (r ? counts[k - 1] : 0) + (r < bins - 1 ? counts[k + 1] : 0)) / 2 / most[col]) : 1 }
}
const shadeFigure = $('#shade')
redraws.push(demo(shadeFigure, ({ floor, gamma }) => {
  const x = current()
  for (const canvas of shadeFigure.querySelectorAll('canvas')) {
    const { ctx, W, H, T } = panel(canvas, 150), c = columns(x, W), y0 = 6, h = H - 12, s = shading(canvas.dataset.style, x, c, 0, x.length / W, h)
    const px = pixels(ctx, W, H)
    envelope(px, c, linear(y0, h), { color: T.ink, shade: (col, v) => floor + (1 - floor) * s(col, v) ** gamma })
    px.done()
  }
}))

// ── 5. Up close ─────────────────────────────────────────────────
// A quarter-rate tone: samples, and the one band-limited curve through them, which is the tone itself
const close = $('#close')
demo(close, ({ as, curve, phase }) => {
  const { ctx, W, H, dpr, T } = panel(close.querySelector('canvas'), 220), n = 24, dx = W / n, y = v => H / 2 - v * (H / 2 - 16 * dpr)
  // sample i at t = i, drawn at the middle of its slot
  const f = t => Math.sin(Math.PI / 2 * t + phase * Math.PI / 180), samples = Array.from({ length: n }, (_, i) => f(i))
  const line = (color, width = 1) => { ctx.strokeStyle = ctx.fillStyle = css(color); ctx.lineWidth = width * dpr }
  line(T.rule)
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
  if (curve) { line(T.accent, 1.5); ctx.beginPath(); for (let p = 0; p <= W; p += 2) { const v = f(p / dx - .5); p ? ctx.lineTo(p, y(v)) : ctx.moveTo(p, y(v)) } ctx.stroke() }
  line(T.ink, 1.5)
  ctx.beginPath()
  samples.forEach((v, i) => {
    const px = (i + .5) * dx
    if (as === 'steps') { ctx.moveTo(i * dx, y(v)); ctx.lineTo((i + 1) * dx, y(v)) }
    else if (as === 'lines') i ? ctx.lineTo(px, y(v)) : ctx.moveTo(px, y(v))
    else { ctx.moveTo(px, H / 2); ctx.lineTo(px, y(v)) }
  })
  ctx.stroke()
  if (as === 'stems') samples.forEach((v, i) => { ctx.beginPath(); ctx.arc((i + .5) * dx, y(v), 3 * dpr, 0, 2 * Math.PI); ctx.fill() })
  const peak = Math.max(...samples.map(Math.abs)), db = v => (20 * Math.log10(v)).toFixed(1)
  $('#peaks').textContent = `sample peak ${db(peak)} dB · true peak 0.0 dB`
})

// ── 6. Amplitude or decibels ────────────────────────────────────
const dbFigure = $('#db')
redraws.push(demo(dbFigure, ({ scale, range }) => {
  const { ctx, W, H, T } = panel(dbFigure.querySelector('canvas'), 200), x = current(), px = pixels(ctx, W, H)
  envelope(px, columns(x, W), scale === 'db' ? decibels(10, H - 20, range) : linear(10, H - 20), { color: T.ink })
  px.done()
}))

// ── 7. Colour for frequency ─────────────────────────────────────
// lows under 200 Hz, mids to 2 kHz, highs above: two one-pole lowpasses, their differences
const split = new Map()
function bands(key, x) {
  if (split.has(key)) return split.get(key)
  const lp = f => { const a = 1 - Math.exp(-2 * Math.PI * f / RATE), y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) y[i] = s += a * (x[i] - s); return y }
  const l = lp(200), m = lp(2000), out = [l, m.map((v, i) => v - l[i]), x.map((v, i) => v - m[i])]
  split.set(key, out)
  return out
}
// the spectral centroid of a 1,024-sample frame at each column's middle
function centroids(x, W, from, spp) {
  const size = 1024, w = window('hann', size), re = new Float64Array(size), im = new Float64Array(size), out = new Float64Array(W)
  for (let c = 0; c < W; c++) {
    const start = Math.floor(from + (c + .5) * spp) - size / 2
    for (let i = 0; i < size; i++) { re[i] = (x[start + i] || 0) * w[i]; im[i] = 0 }
    fft(re, im)
    let sum = 0, weighted = 0
    for (let k = 1; k < size / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; sum += p; weighted += p * k * RATE / size }
    out[c] = sum ? weighted / sum : 0
  }
  return out
}
// A column's colour: the ink, or its lows, mids and highs as red, green and blue, or its centroid as a hue from red
// (100 Hz) to violet (10 kHz); the colours at one OKLab lightness, so hue alone differs
function colouring(by, T, key, x, W, from, spp) {
  if (by === 'bands') {
    const e = bands(key, x).map(b => columns(b, W, from, from + spp * W).rms)
    return col => { const v = [e[0][col], e[1][col], e[2][col]], m = Math.max(...v) || 1, [, A, B] = oklab(v.map(u => encode((u / m) ** 1.6))); return srgb([.78, A, B]) }
  }
  if (by === 'centroid') {
    const cen = centroids(x, W, from, spp), hue = f => 25 + 275 * Math.max(0, Math.min(1, (Math.log2(Math.max(f, 1)) - Math.log2(100)) / (Math.log2(10000) - Math.log2(100))))
    return col => oklch(.78, .15, hue(cen[col]))
  }
  return T.ink
}
const colourFigure = $('#colour')
redraws.push(demo(colourFigure, ({ by }) => {
  const { ctx, W, H, T } = panel(colourFigure.querySelector('canvas'), 200), x = current(), c = columns(x, W), px = pixels(ctx, W, H)
  envelope(px, c, linear(10, H - 20), { color: colouring(by, T, picker.value, x, W, 0, x.length / W) })
  px.done()
}))

// ── 8. Two channels ─────────────────────────────────────────────
// The pair: DKL's isoluminant plane (Derrington, Krauskopf & Lennie 1984), its red–green axis the L and M cones moving
// equally and oppositely (Brainard 1996), its violet–yellow axis the S cones; opposite across grey in encoded sRGB, where
// screens add colours, so the two sum to the mono grey exactly, lifted along grey until equally light (OKLab L)
const M = [0.15514, 0.54312, -0.03286, -0.15514, 0.45684, 0.03286, 0, 0, 0.01608] // XYZ → Smith–Pokorny LMS, L + M = Y
const TO_RGB = [3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252]
const mul = (m, [a, b, c]) => [m[0] * a + m[1] * b + m[2] * c, m[3] * a + m[4] * b + m[5] * c, m[6] * a + m[7] * b + m[8] * c]
const inverse = ([a, b, c, d, e, f, g, h, i]) => { const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C; return [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map(v => v / det) }
const axis = lms => { const v = mul(TO_RGB, mul(inverse(M), lms)), k = Math.max(...v.map(Math.abs)); return v.map(x => x / k) }
const RG = axis([1, -1, 0]), VY = axis([0, 0, 1])
const lightness = rgb => oklab(rgb)[0]
function pair(angle, contrast, total) {
  const a = angle * Math.PI / 180, d = RG.map((x, i) => x * Math.cos(a) + VY[i] * Math.sin(a)), half = total / 2
  const two = (step, lift) => [d.map(x => half + x * step + lift), d.map(x => half - x * step - lift)]
  const level = step => { let lo = -half, hi = half; for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2, [p, q] = two(step, m); lightness(p) < lightness(q) ? lo = m : hi = m } return (lo + hi) / 2 }
  let lo = 0, hi = 1
  for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; two(m, level(m)).flat().every(v => v >= 0 && v <= 1) ? lo = m : hi = m }
  const left = two(lo * contrast, level(lo * contrast))[0].map(v => Math.max(0, Math.min(total, v)))
  return [left, left.map(v => total - v)]
}
const stereoFigure = $('#stereo')
demo(stereoFigure, ({ lanes, angle, contrast }) => {
  const { ctx, W, H, T } = panel(stereoFigure.querySelector('canvas'), 240), [l, r] = stereo(), px = pixels(ctx, W, H)
  if (lanes === 'two') {
    const h = (H - 30) / 2
    envelope(px, columns(l, W), linear(10, h), { color: T.ink })
    envelope(px, columns(r, W), linear(20 + h, h), { color: T.ink })
  } else {
    const colors = pair(angle, contrast, T.ink[0]), y = linear(10, H - 20)
    ;[l, r].forEach((ch, i) => {
      // each channel's coverage, then its colour added to what the other left: screens add encoded values
      const c = columns(ch, W)
      for (let x = 0; x < W; x++) {
        if (!(c.lo[x] <= c.hi[x])) continue
        const top = Math.max(-1, Math.min(y(c.hi[x]), y(c.lo[x]))), bottom = Math.min(H + 1, Math.max(y(c.hi[x]), y(c.lo[x])) + 1)
        for (let row = Math.floor(top); row < Math.ceil(bottom); row++) {
          const cover = Math.max(0, Math.min(row + 1, bottom) - Math.max(row, top))
          px.add(x, row, colors[i].map(v => v * cover))
        }
      }
    })
  }
  px.done()
})

// ── 9. All at once ──────────────────────────────────────────────
const bench = $('#bench'), canvas = bench.querySelector('canvas')
// the view: samples per pixel from the zoom (0 the whole sound, 1 a sample a pixel), centred on `centre`
let view = { key: '', centre: 0, spp: 1, start: 0, W: 1, dpr: 1 }
const full = (n, W) => Math.max(1, n / W), sppOf = (zoom, n, W) => Math.max(1, full(n, W) ** (1 - zoom))
const zoomOf = (spp, n, W) => { const f = Math.log(full(n, W)); return f > 0 ? Math.max(0, Math.min(1, 1 - Math.log(spp) / f)) : 1 }
const draw = demo(bench, ({ zoom, reduce, edges, fill, floor, gamma, scale, range, colour }) => {
  const { ctx, W, H, dpr, T } = panel(canvas, 320), key = picker.value, x = current(), spp = sppOf(zoom, x.length, W)
  if (view.key !== key) view = { ...view, key, centre: x.length / 2 }
  const start = Math.max(0, Math.min(x.length - spp * W, view.centre - spp * W / 2)), to = start + spp * W
  view = { ...view, spp, start, W, dpr, centre: start + spp * W / 2 }
  bench.querySelector('output[for="zoom"]').value = spp < 10 ? spp.toFixed(1) : Math.round(spp)
  const pad = 12 * dpr, y = scale === 'db' ? decibels(pad, H - 2 * pad, range) : linear(pad, H - 2 * pad)
  const c = columns(x, W, start, to), px = pixels(ctx, W, H), color = colouring(colour, T, key, x, W, start, spp)
  const shaded = fill !== 'flat' && fill !== 'rms' && shading(fill, x, c, start, spp, Math.round(H - 2 * pad))
  const level = shaded ? (col, v) => floor + (1 - floor) * shaded(col, v) ** gamma : null
  // every Nth sample: its trace over the pale truth; RMS: a lighter core inside dimmer peaks
  const nth = reduce === 'nth', crisp = edges === 'columns'
  envelope(px, c, y, { color, crisp, shade: nth ? (col, v) => .22 * (level ? level(col, v) : 1) : fill === 'rms' ? () => .5 : level })
  if (fill === 'rms') envelope(px, { ...c, lo: c.rms.map(v => -v), hi: c.rms }, y, { color, crisp })
  px.done()
  if (nth) {
    ctx.strokeStyle = css(T.ink); ctx.lineWidth = dpr
    ctx.beginPath()
    for (let col = 0; col < W; col++) { const v = x[Math.floor(start + col * spp)] ?? 0; col ? ctx.lineTo(col + .5, y(v)) : ctx.moveTo(col + .5, y(v)) }
    ctx.stroke()
  }
})
redraws.push(draw)
// pinch or ctrl-wheel zooms at the pointer; a sideways wheel or a drag pans
const zoomSlider = bench.querySelector('[name="zoom"]'), length = () => current().length
canvas.style.cursor = 'grab'
canvas.style.touchAction = 'pan-y'
canvas.addEventListener('wheel', e => {
  const px = e.offsetX * view.dpr
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const at = view.start + px * view.spp, spp = Math.max(1, Math.min(full(length(), view.W), view.spp * Math.exp(e.deltaY * .01)))
    zoomSlider.value = zoomOf(spp, length(), view.W)
    view.centre = at - px * spp + spp * view.W / 2
    draw()
  } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); view.centre += e.deltaX * view.dpr * view.spp; draw() }
}, { passive: false })
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId)
  let last = e.clientX
  const move = e => { view.centre -= (e.clientX - last) * view.dpr * view.spp; last = e.clientX; draw() }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true })
})
