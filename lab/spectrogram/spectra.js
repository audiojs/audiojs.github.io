// Spectra: a sound's spectrogram as a grid of power, columns × rows, row 0 the lowest frequency, rows on a frequency
// scale up to `hi`, by any of five methods; and the grid as a picture, decibels to colour through a colour map.
import { RATE, fft, window, slope, at, of, colormap, theme, css, MONO } from '../kit.js'

export const NYQUIST = RATE / 2

// One frame's spectrum, centred at sample c, tapered by w (length n), padded to size: [re, im], reused
const bufs = new Map()
export function spectrum(x, c, w, size = w.length) {
  const b = bufs.get(size) || bufs.set(size, [new Float64Array(size), new Float64Array(size)]).get(size), [re, im] = b, n = w.length
  re.fill(0); im.fill(0)
  for (let i = 0; i < n; i++) re[i] = (x[c - n / 2 + i] || 0) * w[i]
  fft(re, im)
  return b
}
// each row's place between bins of a frame of `size`
const binsOf = (H, scale, hi, size) => Float64Array.from({ length: H }, (_, r) => of(scale, (r + .5) / H, hi) / RATE * size)
const read = (power, b) => { b = Math.min(power.length - 2, b); const i = b | 0; return power[i] + (power[i + 1] - power[i]) * (b - i) }

// Frames (Allen 1977): each column a frame's power, each row read at its frequency, between bins. `power(c, out)` may
// replace the one windowed FFT, as tapers do
export function frames(x, W, H, { size = 2048, kind = 'hann', scale = 'log', hi = NYQUIST, power = null } = {}) {
  const grid = new Float32Array(W * H), w = window(kind, size), bin = binsOf(H, scale, hi, size), p = new Float64Array(size / 2 + 1)
  for (let col = 0; col < W; col++) {
    const c = Math.round((col + .5) * x.length / W)
    if (power) power(c, p)
    else { const [re, im] = spectrum(x, c, w); for (let k = 0; k <= size / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k] }
    for (let r = 0; r < H; r++) grid[col * H + r] = read(p, bin[r])
  }
  return grid
}
// Reassigned (Kodera, Gendrin & de Villedary 1978; Auger & Flandrin 1995): three FFTs a frame, with the window h, its
// derivative, and t·h; each cell's power moves to frequency k − N/2π·Im(X_dh X̄)/|X|², time t + Re(X_th X̄)/|X|²
export function reassigned(x, W, H, { size = 2048, kind = 'hann', scale = 'log', hi = NYQUIST } = {}) {
  const grid = new Float32Array(W * H), h = window(kind, size), dh = slope(kind, size), th = h.map((v, i) => (i - size / 2) * v), step = x.length / W
  const X = [h, dh, th].map(() => [new Float64Array(size), new Float64Array(size)])
  for (let col = 0; col < W; col++) {
    const c = Math.round((col + .5) * step)
    ;[h, dh, th].forEach((w, j) => { const [re, im] = X[j]; re.fill(0); im.fill(0); for (let i = 0; i < size; i++) re[i] = (x[c - size / 2 + i] || 0) * w[i]; fft(re, im) })
    const [[re, im], [dre, dim], [tre, tim]] = X
    for (let k = 1; k < size / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k]
      if (p < 1e-12) continue
      const f = (k - size / (2 * Math.PI) * (dim[k] * re[k] - dre[k] * im[k]) / p) * RATE / size, t = c + (tre[k] * re[k] + tim[k] * im[k]) / p
      const cc = Math.floor(t / step), r = Math.floor(at(scale, f, hi) * H)
      if (cc >= 0 && cc < W && r >= 0 && r < H) grid[cc * H + r] += p
    }
  }
  return grid
}
// By band: a frame length per band, as a constant-Q transform sizes them (Brown 1991), from 4× the frame under 200 Hz
// to a quarter of it above 3 kHz; each length's power per window sum squared, so a tone reads the same in any band
const BANDS = [[200, 4], [500, 2], [1250, 1], [3000, .5], [Infinity, .25]]
export function byBand(x, W, H, { size = 2048, kind = 'hann', scale = 'log', hi = NYQUIST } = {}) {
  const out = new Float32Array(W * H), sizes = BANDS.map(([, m]) => Math.max(64, Math.min(32768, size * m)))
  const grids = sizes.map(n => frames(x, W, H, { size: n, kind, scale, hi }))
  const gain = sizes.map(n => { let s = 0; for (const v of window(kind, n)) s += v; return 1 / (s * s) })
  for (let r = 0; r < H; r++) {
    const f = of(scale, (r + .5) / H, hi), b = BANDS.findIndex(([edge]) => f < edge)
    for (let col = 0; col < W; col++) out[col * H + r] = grids[b][col * H + r] * gain[b]
  }
  return out
}
// Tapers: k sine tapers (Riedel & Sidorenko 1995), √(2 / (N + 1)) sin(πj(n + 1) / (N + 1)), their spectra averaged
// (Thomson 1982)
export function tapered(x, W, H, { size = 2048, k = 4, scale = 'log', hi = NYQUIST } = {}) {
  const tapers = Array.from({ length: k }, (_, j) => Float64Array.from({ length: size }, (_, i) => Math.sqrt(2 / (size + 1)) * Math.sin(Math.PI * (j + 1) * (i + 1) / (size + 1))))
  return frames(x, W, H, { size, scale, hi, power: (c, p) => {
    p.fill(0)
    for (const w of tapers) { const [re, im] = spectrum(x, c, w); for (let b = 0; b <= size / 2; b++) p[b] += (re[b] * re[b] + im[b] * im[b]) / k }
  } })
}
// The analytic signal: negative frequencies and DC removed, else Wigner–Ville draws each against the rest
const analytics = new WeakMap()
function analytic(x) {
  if (analytics.has(x)) return analytics.get(x)
  let size = 1
  while (size < x.length) size *= 2
  const re = new Float64Array(size), im = new Float64Array(size)
  re.set(x); fft(re, im)
  re[0] = im[0] = 0
  for (let k = 1; k < size / 2; k++) { re[k] *= 2; im[k] *= 2 }
  for (let k = size / 2 + 1; k < size; k++) { re[k] = 0; im[k] = 0 }
  // inverse by conjugating around a forward FFT
  for (let k = 0; k < size; k++) im[k] = -im[k]
  fft(re, im)
  const z = [re.map(v => v / size).subarray(0, x.length), im.map(v => -v / size).subarray(0, x.length)]
  analytics.set(x, z)
  return z
}
// Pseudo Wigner–Ville (Ville 1948): no frames; the FFT over lag m of z(t + m) z*(t − m), under a lag window of the
// frame's length and kind; bin k is frequency k·fs/2N
export function wigner(x, W, H, { size = 2048, kind = 'hann', scale = 'log', hi = NYQUIST } = {}) {
  const [zr, zi] = analytic(x), N = size, lag = window(kind, N), grid = new Float32Array(W * H), re = new Float64Array(N), im = new Float64Array(N)
  const bin = binsOf(H, scale, hi, 2 * N)
  for (let col = 0; col < W; col++) {
    const t = Math.round((col + .5) * x.length / W)
    re.fill(0); im.fill(0)
    for (let m = -N / 2 + 1; m < N / 2; m++) {
      const a = t + m, b = t - m
      if (a < 0 || b < 0 || a >= x.length || b >= x.length) continue
      const w = lag[m + N / 2], i = (m + N) % N
      re[i] = w * (zr[a] * zr[b] + zi[a] * zi[b]); im[i] = w * (zi[a] * zr[b] - zr[a] * zi[b])
    }
    fft(re, im)
    for (let r = 0; r < H; r++) grid[col * H + r] = Math.abs(re[Math.min(N / 2, Math.round(bin[r]))])
  }
  return grid
}
export const methods = { frames, reassigned, byBand, tapered, wigner }

// ── Pictures ────────────────────────────────────────────────────

// Power to colour: decibels from the loudest down `range`, through a colour map, into an image W × H, row 0 at the
// bottom; frequencies labelled at the left, as the grid's rows lie on `scale` up to `hi`
export function picture(ctx, grid, W, H, { map = 'grey', range = 84, scale = 'log', hi = NYQUIST, labels = true, T = theme() } = {}) {
  let top = -Infinity
  for (const p of grid) if (p > 0) top = Math.max(top, 10 * Math.log10(p))
  const img = ctx.createImageData(W, H), d = img.data, lut = colormap(map, T)
  for (let col = 0; col < W; col++) for (let r = 0; r < H; r++) {
    const db = 10 * Math.log10(grid[col * H + r] + 1e-30), k = Math.round(Math.max(0, Math.min(1, (db - top + range) / range)) * 255) * 3, p = ((H - 1 - r) * W + col) * 4
    d[p] = lut[k]; d[p + 1] = lut[k + 1]; d[p + 2] = lut[k + 2]; d[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  if (labels) frequencies(ctx, H, { scale, hi, T })
}
// Frequency marks at the left edge, on chips of paper, as many as fit
export function frequencies(ctx, H, { scale = 'log', hi = NYQUIST, T = theme(), x = 0, along = false, W = 0 } = {}) {
  const step = hi > 8000 ? 5000 : hi > 3000 ? 1000 : 500
  const marks = scale === 'lin' ? Array.from({ length: Math.floor(hi / step) + 1 }, (_, i) => i * step) : [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  ctx.font = `11px ${MONO}`
  let last = along ? -Infinity : Infinity
  for (const f of marks) {
    const u = at(scale, f, hi), text = f < 1000 ? f : f / 1000 + 'k', tw = ctx.measureText(text).width
    // along: marks across the bottom of a plot W wide; else up the left of an image H high
    const pos = along ? Math.round(u * W) : Math.round(H - u * H), room = along ? tw + 12 : 18
    if (along ? pos < 4 || pos > W - tw - 4 || pos - last < room : pos > H - 8 || pos < 8 || last - pos < room) continue
    ctx.fillStyle = css(T.paper, .85)
    along ? ctx.fillRect(pos - 2, H - 16, tw + 6, 14) : ctx.fillRect(x, pos - 7, tw + 8, 14)
    ctx.fillStyle = css(T.ink2)
    along ? ctx.fillText(text, pos + 1, H - 5) : ctx.fillText(text, x + 4, pos + 4)
    last = pos
  }
}
