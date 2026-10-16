// Audio Lab: each article's thumbnail, drawn from the voice
import { sound, panel, css, fft, window as taper, RATE } from './kit.js'
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
  // the voice's spectrum, and over it the curve of the article's equalizer: bass up, mid down, treble up
  javascript(canvas) {
    const { ctx, W, H, dpr, T } = panel(canvas, 150), n = 2048, w = taper('hann', n), power = new Float64Array(n / 2)
    for (let at = 0; at + n <= x.length; at += n / 2) {
      const re = Float64Array.from(w, (v, i) => v * x[at + i]), im = new Float64Array(n)
      fft(re, im)
      for (let k = 0; k < n / 2; k++) power[k] += re[k] ** 2 + im[k] ** 2
    }
    const top = Math.max(...power), hz = c => 20 * 1000 ** (c / W), offline = new OfflineAudioContext(1, 1, RATE)
    const freqs = Float32Array.from({ length: W }, (_, c) => hz(c)), total = new Float32Array(W).fill(1), mag = new Float32Array(W), phase = new Float32Array(W)
    for (const [type, frequency, gain] of [['lowshelf', 200, 6], ['peaking', 1000, -3], ['highshelf', 4000, 3]]) {
      new BiquadFilterNode(offline, { type, frequency, gain }).getFrequencyResponse(freqs, mag, phase)
      for (let c = 0; c < W; c++) total[c] *= mag[c]
    }
    // the spectrum, its dB read between bins, 70 dB deep
    const db = c => { const k = Math.min(n / 2 - 2, hz(c) / RATE * n), i = Math.floor(k); return 10 * Math.log10((power[i] + (k - i) * (power[i + 1] - power[i])) / top + 1e-12) }
    ctx.fillStyle = css(T.ink3)
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let c = 0; c < W; c++) ctx.lineTo(c, H - Math.max(0, 1 + db(c) / 70) * H * .9)
    ctx.lineTo(W, H)
    ctx.fill()
    ctx.strokeStyle = css(T.accent)
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    for (let c = 0; c < W; c++) { const y = H * .4 - 20 * Math.log10(total[c]) / 9 * H * .3; c ? ctx.lineTo(c, y) : ctx.moveTo(c, y) }
    ctx.stroke()
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
