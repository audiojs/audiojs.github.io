// The thumbnail in the lab's list: Risset's glissando as the article's first figure shows it, two loops of eight sines an
// octave apart rising across the panel, each as bright as the bell makes it loud.
import { panel, css } from '../kit.js'
import { envelopes } from './sounds.js'

const canvas = document.querySelector('canvas[data-illusions-preview]'), K = 8, bell = envelopes.bell
function draw() {
  if (!canvas?.clientWidth) return
  const { ctx, W, H, dpr, T } = panel(canvas, 150), pad = 12 * dpr, y = u => H - pad - u / K * (H - 2 * pad)
  ctx.strokeStyle = css(T.accent)
  ctx.lineWidth = 1.5 * dpr
  // two loops, each sine k at k + t octaves, t from 0 to 1 across a loop, in short strokes as bright as the bell says
  const step = 2 * dpr, half = W / 2
  for (let c = 0; c < 2; c++) for (let k = 0; k < K; k++) for (let px = 0; px < half; px += step) {
    const u = k + px / half
    ctx.globalAlpha = bell(u, K)
    ctx.beginPath(); ctx.moveTo(c * half + px, y(u)); ctx.lineTo(c * half + px + step, y(u + step / half)); ctx.stroke()
  }
  ctx.globalAlpha = 1
}
draw()
addEventListener('resize', draw)
