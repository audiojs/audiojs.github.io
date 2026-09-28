// Audio Lab: each article's thumbnail, drawn from the voice
import { sound, panel, css } from './kit.js'
import { reassigned, picture } from './spectrogram/spectra.js'

const x = sound('voice')
// lowest to highest per pixel column, in a lane of height h from the top
function envelope(ctx, W, h, color) {
  ctx.fillStyle = css(color)
  for (let c = 0; c < W; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / W), end = Math.floor((c + 1) * x.length / W); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    ctx.fillRect(c, h / 2 * (1 - hi), 1, Math.max(1, h / 2 * (hi - lo)))
  }
}
const draw = {
  // bars of a fixed pitch, as wavefont sets them, and a word under each syllable
  words(canvas) {
    const { ctx, W, H, dpr, T } = panel(canvas, 150), pitch = 3 * dpr, h = H * .66, n = Math.floor(W / pitch)
    ctx.fillStyle = css(T.ink)
    for (let b = 0; b < n; b++) {
      let peak = 0
      for (let i = Math.floor(b * x.length / n), end = Math.floor((b + 1) * x.length / n); i < end; i++) peak = Math.max(peak, Math.abs(x[i]))
      const bar = Math.max(dpr, peak * h * .9)
      ctx.fillRect(b * pitch, h / 2 + 6 * dpr - bar / 2, 2 * dpr, bar)
    }
    ctx.fillStyle = css(T.ink3)
    ;[[.166, .13], [.498, .19], [.83, .1]].forEach(([at, width]) => { ctx.beginPath(); ctx.roundRect((at - width / 2) * W, h + 14 * dpr, width * W, 10 * dpr, 5 * dpr); ctx.fill() })
  },
  waveform(canvas) {
    const { ctx, W, H, T } = panel(canvas, 150)
    envelope(ctx, W, H, T.ink)
  },
  spectrogram(canvas) {
    const { ctx, W, H, T } = panel(canvas, 150, 1)
    picture(ctx, reassigned(x, W, H), W, H, { labels: false, map: 'grey', T })
  },
  // the caret at 40 %, lighter over the 2,048 samples it listens to
  scrub(canvas) {
    const { ctx, W, H, dpr, T } = panel(canvas, 150), c = .4 * W, half = 1024 / x.length * W
    envelope(ctx, W, H, T.ink)
    ctx.fillStyle = css(T.ink, .1)
    ctx.fillRect(c - half, 0, 2 * half, H)
    ctx.fillStyle = css(T.accent)
    ctx.fillRect(Math.round(c - dpr / 2), 0, Math.max(1, Math.round(dpr)), H)
  }
}
const all = () => document.querySelectorAll('canvas[data-preview]').forEach(c => draw[c.dataset.preview](c))
all()
addEventListener('resize', all)
