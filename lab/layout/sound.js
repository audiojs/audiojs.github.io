// The sound every layout shows: the kit's stereo chime (strikes alternating between the channels, a hum under both),
// peak at −1 dBFS, drawn as the REPL draws a sound: each channel's lowest and highest per column; its spectrogram as
// white over the screen, even in OKLab lightness (repl/spectrogram.js); and, at any moment, each channel's level for
// the meter and its spectrum for the outline beside the spectrogram.
import { RATE, stereo, fft, window, at, of, encode } from '../kit.js'
import { reassigned } from '../spectrogram/spectra.js'

export const HI = RATE / 2, LOW = 20
export const channels = (() => {
  const [l, r] = stereo()
  let peak = 0
  for (const x of [l, r]) for (const v of x) peak = Math.max(peak, Math.abs(v))
  const k = 10 ** (-1 / 20) / peak
  return [l, r].map(x => x.map(v => v * k))
})()
export const duration = channels[0].length / RATE

// Lowest and highest per column, W columns across the whole sound: [lo, hi, lo, hi, …]
const envelopes = new Map()
export function envelope(ch, W) {
  const key = ch + ' ' + W
  if (envelopes.has(key)) return envelopes.get(key)
  if (envelopes.size > 24) envelopes.clear()
  const x = channels[ch], out = new Float32Array(2 * W)
  for (let c = 0; c < W; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / W), end = Math.floor((c + 1) * x.length / W); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    out[2 * c] = lo; out[2 * c + 1] = hi
  }
  envelopes.set(key, out)
  return out
}

// The spectrograms, reassigned, 84 dB from both channels' loudest to silence, as images of white whose coverage lifts
// the screen (OKLab L .21) to the level's lightness: the REPL's shader, on the CPU, once
const GROUND = .21, COLS = 480, ROWS = 160, RANGE = 84
let images = null
export function spectrograms() {
  if (images) return images
  const grids = channels.map(x => reassigned(x, COLS, ROWS, { size: 2048, scale: 'log', hi: HI }))
  let top = -Infinity
  for (const g of grids) for (const p of g) if (p > 0) top = Math.max(top, 10 * Math.log10(p))
  const b = encode(GROUND ** 3)
  images = grids.map(grid => {
    const canvas = document.createElement('canvas')
    canvas.width = COLS; canvas.height = ROWS
    const g = canvas.getContext('2d'), img = g.createImageData(COLS, ROWS), d = img.data
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const t = Math.max(0, Math.min(1, (10 * Math.log10(grid[c * ROWS + r] + 1e-30) - top + RANGE) / RANGE)), L = GROUND + (1 - GROUND) * t
      const p = ((ROWS - 1 - r) * COLS + c) * 4
      d[p] = d[p + 1] = d[p + 2] = 255
      d[p + 3] = Math.round(Math.max(0, (encode(L ** 3) - b) / (1 - b)) * 255)
    }
    g.putImageData(img, 0, 0)
    return canvas
  })
  return images
}

// A channel's level around t seconds, 30 ms: RMS and peak, as amplitudes
export function level(ch, t) {
  const x = channels[ch], n = Math.round(.03 * RATE), from = Math.max(0, Math.round(t * RATE) - n / 2), to = Math.min(x.length, from + n)
  let e = 0, peak = 0
  for (let i = from; i < to; i++) { e += x[i] * x[i]; peak = Math.max(peak, Math.abs(x[i])) }
  return { rms: Math.sqrt(e / Math.max(1, to - from)), peak }
}

// A channel's spectrum at t seconds, Hann, 4,096 samples, read at `rows` points up the log axis: dB of |X| / N
const SIZE = 4096, HANN = window('hann', SIZE), spectra = new Map()
export function spectrum(ch, t, rows = 96) {
  const key = ch + ' ' + Math.round(t * 50) + ' ' + rows
  if (spectra.has(key)) return spectra.get(key)
  if (spectra.size > 256) spectra.clear()
  const x = channels[ch], c = Math.round(t * RATE), re = new Float64Array(SIZE), im = new Float64Array(SIZE), out = new Float32Array(rows)
  for (let i = 0; i < SIZE; i++) re[i] = (x[c - SIZE / 2 + i] || 0) * HANN[i]
  fft(re, im)
  for (let r = 0; r < rows; r++) {
    const k = Math.min(SIZE / 2 - 1, Math.max(1, Math.round(of('log', (r + .5) / rows, HI) / RATE * SIZE)))
    out[r] = 20 * Math.log10(Math.hypot(re[k], im[k]) / SIZE * 4 + 1e-9)
  }
  spectra.set(key, out)
  return out
}
// where frequency f sits up a lane, 0 at its foot, 1 at its head
export const up = f => at('log', f, HI)
