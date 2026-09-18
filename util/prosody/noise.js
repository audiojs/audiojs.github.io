// Waveform periodicity per band at the tracked pitch. WORLD's D4C estimates
// aperiodicity in 3 kHz bands, where the strong low harmonics hide the noise
// between the higher ones, so a vocoded voice comes out harmonic above 1 kHz
// where the original was breathy: the metallic tell. The vocoder compares its
// own band periodicity with the source's and adds the missing noise.
export const BANDS = [[0, 500], [500, 1000], [1000, 1500], [1500, 2000], [2000, 3000], [3000, 4000], [4000, 6000], [6000, Infinity]]

// Two cascaded biquad bandpasses (band-edge Q), zero state; a lowpass or
// highpass at the spectrum's ends.
export function bandpass(x, sampleRate, low, high) {
  const y = Float32Array.from(x), nyquist = sampleRate / 2
  const stages = []
  if (low > 0) stages.push(biquad(sampleRate, low, 'high'))
  if (high < nyquist * .95) stages.push(biquad(sampleRate, high, 'low'))
  for (const [b0, b1, b2, a1, a2] of stages) for (let pass = 0; pass < 2; pass++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < y.length; i++) {
      const v = y[i], out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1; x1 = v; y2 = y1; y1 = out; y[i] = out
    }
  }
  return y
}
function biquad(sampleRate, hz, kind) {
  const w = 2 * Math.PI * hz / sampleRate, cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha
  const b = kind === 'low' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
  return [b[0] / a0, b[1] / a0, b[2] / a0, -2 * cos / a0, (1 - alpha) / a0]
}

// Normalized correlation of the signal with itself one period later, over
// three periods around `center` (samples).
export function periodicity(x, center, period) {
  const half = Math.round(1.5 * period), a = center - half, b = center + half
  if (a < 0 || b + period + 2 >= x.length) return NaN
  let xy = 0, xx = 0, yy = 0
  for (let i = a; i < b; i++) {
    const p = i + period, k = Math.floor(p), f = p - k, y = x[k] * (1 - f) + x[k + 1] * f
    xy += x[i] * y; xx += x[i] * x[i]; yy += y * y
  }
  return xy / Math.sqrt(xx * yy || 1)
}

// Periodicity per band (rows) for frames centered at `centers` (samples) with
// pitch `f0`: a bands × frames matrix.
export function bandPeriodicity(x, sampleRate, centers, f0) {
  const out = BANDS.map(() => new Float64Array(centers.length))
  BANDS.forEach(([low, high], b) => {
    const y = bandpass(x, sampleRate, low, Math.min(high, sampleRate / 2))
    for (let i = 0; i < centers.length; i++) { const p = periodicity(y, centers[i], sampleRate / f0[i]); out[b][i] = Number.isFinite(p) ? p : 0 }
  })
  return out
}

// Spread per-band amplitude values (bands × frames) across `bins` of an FFT of
// `size` at `sampleRate`, interpolating between band centers.
export function spread(values, sampleRate, bins, size) {
  const frames = values[0].length, out = new Float64Array(frames * bins)
  const centers = BANDS.map(([low, high]) => Math.sqrt(low * Math.min(high, sampleRate / 2)) || low + 250)
  for (let bin = 0; bin < bins; bin++) {
    const hz = bin * sampleRate / size
    let b = 0
    while (b < BANDS.length - 2 && hz > centers[b + 1]) b++
    const f = Math.max(0, Math.min(1, (hz - centers[b]) / (centers[b + 1] - centers[b])))
    for (let i = 0; i < frames; i++) out[i * bins + bin] = values[b][i] * (1 - f) + values[b + 1][i] * f
  }
  return out
}
