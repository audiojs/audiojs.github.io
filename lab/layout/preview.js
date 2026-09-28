// The thumbnail in the lab's list: the layout the article keeps, drawn on a panel as the other thumbnails are. The
// script and the rack at the left, the voice where the sound goes, the status bar along the foot.
import { sound, panel, css } from '../kit.js'

const canvas = document.querySelector('canvas[data-layout-preview]'), x = sound('voice')
function draw() {
  if (!canvas?.clientWidth) return
  const { ctx, W, H, dpr, T } = panel(canvas, 150), u = dpr, foot = H - 22 * u, a = Math.round(W * .27), b = Math.round(W * .45)
  // the dividers
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(a, 10 * u, u, foot - 16 * u)
  ctx.fillRect(b, 10 * u, u, foot - 16 * u)
  ctx.fillRect(10 * u, foot, W - 20 * u, u)
  // the script: its lines, indented under the first
  ctx.fillStyle = css(T.ink3)
  ;[.7, .45, .62, .55].forEach((w, i) => ctx.fillRect((i ? 22 : 14) * u, (16 + 11 * i) * u, (a - 34 * u) * w, 3 * u))
  // the rack: three units, the one open with its slider, marked
  ;[0, 1, 2].forEach(i => ctx.fillRect(a + 12 * u, (16 + 11 * i + (i > 1 ? 16 : 0)) * u, (b - a - 24 * u) * [.35, .6, .45][i], 3 * u))
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(a + 16 * u, 39 * u, b - a - 32 * u, u)
  ctx.fillStyle = css(T.ink)
  ctx.beginPath(); ctx.arc(a + 16 * u + (b - a - 32 * u) * .8, 39.5 * u, 3 * u, 0, 2 * Math.PI); ctx.fill()
  ctx.fillStyle = css(T.accent)
  ctx.fillRect(a + 6 * u, 25 * u, 2 * u, 20 * u)
  // the sound: the voice, lowest to highest per column
  const left = b + 12 * u, w = W - left - 12 * u, mid = (10 * u + foot) / 2, half = (foot - 22 * u) / 2
  ctx.fillStyle = css(T.ink)
  for (let c = 0; c < w; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / w), end = Math.floor((c + 1) * x.length / w); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    ctx.fillRect(left + c, mid - hi * half, 1, Math.max(1, (hi - lo) * half))
  }
  // the status bar: play, the time
  ctx.beginPath(); ctx.moveTo(14 * u, foot + 7 * u); ctx.lineTo(14 * u, foot + 16 * u); ctx.lineTo(21 * u, foot + 11.5 * u); ctx.fill()
  ctx.fillStyle = css(T.ink3)
  ctx.fillRect(30 * u, foot + 8 * u, 46 * u, 7 * u)
}
draw()
addEventListener('resize', draw)
