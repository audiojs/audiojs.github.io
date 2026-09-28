// Seeing sound: every figure computed here from the sound's samples, each column its own FFT; the methods in spectra.js.
import { RATE, sounds, sound, panel, demo, css, window, of, MONO } from '../kit.js'
import { NYQUIST, spectrum, frames, reassigned, byBand, tapered, wigner, methods, picture, frequencies } from './spectra.js'

const $ = s => document.querySelector(s)
const picker = $('#sound'), redraws = []
picker.append(...['voice', 'chime', 'drums', 'sweep', 'tones', 'hiss', 'pair'].map(k => new Option(sounds[k].name, k)))
picker.value = 'voice'
picker.onchange = () => redraws.forEach(r => r())
const current = () => sound(picker.value)

// A figure's canvas at one pixel per CSS pixel: these are computed images, many FFTs each
const canvasOf = (figure, h = 260) => panel(figure.querySelector('canvas'), h, 1)

// ── 1. Frames ───────────────────────────────────────────────────
const framesFigure = $('#frames')
redraws.push(demo(framesFigure, ({ size }) => {
  const n = 2 ** size, { ctx, W, H, T } = canvasOf(framesFigure), view = { scale: 'lin', hi: 5000, T }
  $('#size').value = `${n.toLocaleString()} samples, ${(n / RATE * 1000).toFixed(n < 1024 ? 1 : 0)} ms`
  picture(ctx, frames(current(), W, H, { size: n, ...view }), W, H, view)
}))

// ── 2. Windows ──────────────────────────────────────────────────
// One frame of a tone between bins (bin 20.37 of 1,024): its spectrum in dB, 0 to 3 kHz
demo($('#windows'), ({ window: kind, pad }) => {
  const figure = $('#windows'), { ctx, W, H, dpr, T } = panel(figure.querySelector('canvas'), 220), n = 1024, size = n * +pad
  const f = 20.37 * RATE / n, tone = Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * f * i / RATE))
  const w = window(kind, n), [re, im] = spectrum(tone, n / 2, w, size)
  let sum = 0
  for (const v of w) sum += v
  const db = k => 20 * Math.log10(Math.hypot(re[k], im[k]) * 2 / sum + 1e-12), last = Math.round(3000 / RATE * size)
  const x = k => k / last * W, y = v => 6 * dpr + Math.min(1, -v / 120) * (H - 12 * dpr)
  ctx.strokeStyle = css(T.rule)
  ctx.fillStyle = css(T.ink3)
  ctx.lineWidth = dpr
  ctx.font = `${11 * dpr}px ${MONO}`
  for (const v of [0, -40, -80, -120]) { ctx.beginPath(); ctx.moveTo(0, y(v)); ctx.lineTo(W, y(v)); ctx.stroke(); v > -120 && ctx.fillText(`${v} dB`, 6 * dpr, y(v) + 14 * dpr) }
  for (const f of [1000, 2000]) ctx.fillText(`${f / 1000} kHz`, x(f / RATE * size) + 4 * dpr, y(0) + 14 * dpr)
  ctx.strokeStyle = css(T.ink)
  ctx.lineWidth = 1.5 * dpr
  ctx.beginPath()
  for (let k = 0; k <= last; k++) k ? ctx.lineTo(x(k), y(db(k))) : ctx.moveTo(x(k), y(db(k)))
  ctx.stroke()
})

// ── 3. Frequency axis ───────────────────────────────────────────
const axisFigure = $('#axis')
redraws.push(demo(axisFigure, ({ scale }) => {
  const { ctx, W, H, T } = canvasOf(axisFigure)
  picture(ctx, frames(current(), W, H, { scale, hi: 8000 }), W, H, { scale, hi: 8000, T })
}))

// ── 4. Light ────────────────────────────────────────────────────
const lightFigure = $('#light')
let lightGrid = null, lightKey = ''
redraws.push(demo(lightFigure, ({ map, range }) => {
  const { ctx, W, H, T } = canvasOf(lightFigure), key = `${picker.value} ${W} ${H}`
  if (key !== lightKey) { lightGrid = frames(current(), W, H); lightKey = key }
  picture(ctx, lightGrid, W, H, { map, range, T })
}))

// ── 5. Reassignment ─────────────────────────────────────────────
const reassignFigure = $('#reassign')
redraws.push(demo(reassignFigure, ({ method }) => {
  const { ctx, W, H, T } = canvasOf(reassignFigure), x = current()
  picture(ctx, method === 'reassigned' ? reassigned(x, W, H) : frames(x, W, H), W, H, { T })
}))

// ── 6. Many resolutions ─────────────────────────────────────────
const multiFigure = $('#multi')
redraws.push(demo(multiFigure, ({ frames: how }) => {
  const { ctx, W, H, T } = canvasOf(multiFigure), x = current()
  picture(ctx, how === 'one' ? frames(x, W, H) : byBand(x, W, H), W, H, { T })
}))

// ── 7. Noise ────────────────────────────────────────────────────
const tapersFigure = $('#tapers')
demo(tapersFigure, ({ k }) => {
  const { ctx, W, H, T } = canvasOf(tapersFigure), view = { scale: 'lin', hi: 6000 }
  picture(ctx, tapered(sound('hiss'), W, H, { size: 2048, k, ...view }), W, H, { range: 48, T, ...view })
})

// ── 8. No frames at all ─────────────────────────────────────────
const wignerFigure = $('#wigner')
demo(wignerFigure, ({ method }) => {
  const { ctx, W, H, T } = canvasOf(wignerFigure), x = sound('pair'), view = { scale: 'lin', hi: 4000 }
  picture(ctx, method === 'wvd' ? wigner(x, W, H, { size: 512, ...view }) : frames(x, W, H, { size: 1024, ...view }), W, H, { range: 60, T, ...view })
})

// ── 9. All at once ──────────────────────────────────────────────
// The grid is kept while only the colour changes; the picture is kept while only the pointer moves
const bench = $('#bench'), [main, slice] = bench.querySelectorAll('canvas')
let grid = null, key = '', image = null, col = null, v = null
redraws.push(demo(bench, values => {
  v = values
  const { method, size, kind, k, scale, top, map, range } = v, n = 2 ** size, hi = Math.min(NYQUIST, top * 1000)
  $('#frame').value = `${n.toLocaleString()} · ${(n / RATE * 1000).toFixed(n < 1024 ? 1 : 0)} ms`
  const { ctx, W, H, T } = panel(main, 320, 1), at = [picker.value, method, n, kind, k, scale, hi, W, H].join()
  if (at !== key) { grid = methods[method](current(), W, H, { size: n, kind, k, scale, hi }); key = at }
  picture(ctx, grid, W, H, { map, range, scale, hi, T })
  image = ctx.getImageData(0, 0, W, H)
  if (col === null || col >= W) col = W >> 1
  frame()
}))
// the frame under the pointer: marked on the picture, and its spectrum through the window, padded, in dB
function frame() {
  const { size, kind, scale, top, pad } = v, n = 2 ** size, hi = Math.min(NYQUIST, top * 1000), x = current()
  const ctx = main.getContext('2d'), { width: W, height: H } = main
  ctx.putImageData(image, 0, 0)
  const p = panel(slice, 150), T = p.T, dpr = p.dpr
  ctx.fillStyle = css(T.ink3)
  ctx.fillRect(col, 0, 1, H)
  const w = window(kind, n), N = n * +pad, [re, im] = spectrum(x, Math.round((col + .5) * x.length / W), w, N)
  let sum = 0
  for (const u of w) sum += u
  const g = p.ctx, SW = p.W, SH = p.H, y = db => 6 * dpr + Math.min(1, -db / 120) * (SH - 26 * dpr)
  g.strokeStyle = css(T.rule); g.fillStyle = css(T.ink3); g.lineWidth = dpr; g.font = `${11 * dpr}px ${MONO}`
  for (const db of [0, -40, -80, -120]) { g.beginPath(); g.moveTo(0, y(db)); g.lineTo(SW, y(db)); g.stroke(); db > -120 && g.fillText(`${db} dB`, 4 * dpr, y(db) + 13 * dpr) }
  g.strokeStyle = css(T.accent); g.lineWidth = 1.5 * dpr
  g.beginPath()
  for (let px = 0; px <= SW; px++) {
    const b = Math.min(N / 2 - 1, of(scale, px / SW, hi) / RATE * N), i = b | 0
    const m = Math.hypot(re[i], im[i]) + (Math.hypot(re[i + 1], im[i + 1]) - Math.hypot(re[i], im[i])) * (b - i), db = 20 * Math.log10(m * 2 / sum + 1e-9)
    px ? g.lineTo(px, y(db)) : g.moveTo(px, y(db))
  }
  g.stroke()
  frequencies(g, SH, { scale, hi, T, along: true, W: SW })
}
main.addEventListener('pointermove', e => {
  if (!image) return
  col = Math.max(0, Math.min(main.width - 1, Math.floor(e.offsetX * main.width / main.clientWidth)))
  frame()
})
