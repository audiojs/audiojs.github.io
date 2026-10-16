// The thumbnail in the lab's list: a take coming in, drawn on a panel as the other thumbnails are. The voice up to
// the head, where the accent line records; under it the chunks already stored, one a second.
import { sound, panel, css } from '../kit.js'

const canvas = document.querySelector('canvas[data-recording-preview]'), x = sound('voice')
function draw() {
  if (!canvas?.clientWidth) return
  const { ctx, W, H, dpr, T } = panel(canvas, 150), u = dpr, foot = H - 22 * u, mid = (10 * u + foot) / 2, half = (foot - 22 * u) / 2
  const head = Math.round(W * .72), seconds = x.length / 44100, perSecond = head / seconds
  // the take so far: lowest to highest per column
  ctx.fillStyle = css(T.ink)
  for (let c = 0; c < head; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / head), end = Math.floor((c + 1) * x.length / head); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    ctx.fillRect(c, mid - hi * half, 1, Math.max(1, (hi - lo) * half))
  }
  // the head
  ctx.fillStyle = css(T.accent)
  ctx.fillRect(head, 10 * u, Math.max(1, Math.round(u)), foot - 10 * u)
  // the chunks stored, one a second, and the one being made
  ctx.fillStyle = css(T.ink3)
  for (let s = 0; (s + 1) * perSecond <= head; s++) ctx.fillRect(s * perSecond + u, foot + 8 * u, perSecond - 2 * u, 6 * u)
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(Math.floor(head / perSecond) * perSecond + u, foot + 8 * u, head % perSecond, 6 * u)
}
draw()
addEventListener('resize', draw)
