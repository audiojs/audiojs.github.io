// Hearing a moment: what the sound under a caret plays, eight ways. A method renders blocks of samples from a mono
// source `x` while a caret (a sample position, one per block) moves over it; the worklet plays the blocks and the
// bench times them. Nothing allocates while rendering, and every method is written with the same plain care, so their
// costs compare.
import { fft, window } from '../kit.js'

const TAU = 2 * Math.PI
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v
// a random 32-bit integer after s (xorshift32, Marsaglia 2003); s is any nonzero integer
const xorshift = s => { s ^= s << 13; s ^= s >>> 17; return s ^ s << 5 }

// x at a fractional position p: the cubic Hermite through the four samples around it (Catmull–Rom)
function read(x, p) {
  const i = Math.floor(p), t = p - i
  if (i < 1 || i > x.length - 3) return 0
  const a = x[i - 1], b = x[i], c = x[i + 1], d = x[i + 2]
  return b + t * (.5 * (c - a) + t * (a - 2.5 * b + 2 * c - .5 * d + t * (1.5 * (b - c) + .5 * (d - a))))
}

// ── Replaying the source ────────────────────────────────────────

// Tape: the read head chases the caret through two 20 ms lags, speeding up and slowing down as a reel does. Pitch
// follows speed, and a still caret is silence: a held head reads a constant, which the DC blocker takes out.
class Tape {
  constructor(x, sr, caret) {
    this.x = x
    this.k = 1 - Math.exp(-1 / (.02 * sr))
    this.p = this.q = caret
    this.x1 = read(x, caret)
    this.y1 = 0
  }
  get at() { return this.p }
  render(out, caret) {
    const { x, k } = this
    let { p, q, x1, y1 } = this
    for (let i = 0; i < out.length; i++) {
      q += (caret - q) * k
      p += (q - p) * k
      const v = read(x, p)
      y1 = v - x1 + .995 * y1
      x1 = v
      out[i] = y1
    }
    this.p = p; this.q = q; this.x1 = x1; this.y1 = y1
  }
}

// Loop: the 80 ms around the caret, again and again, each pass from where the caret is when it begins, the passes
// joined by 8 ms equal-power crossfades (Reaper's looped-segment scrub)
class Loop {
  constructor(x, sr, caret) {
    this.x = x
    this.len = Math.min(x.length, Math.round(.08 * sr))
    this.cross = Math.max(1, Math.min(this.len >> 1, Math.round(.008 * sr)))
    this.rise = Float64Array.from({ length: this.cross }, (_, i) => Math.sin(Math.PI / 2 * (i + .5) / this.cross))
    this.a = this.b = this.start(caret)
    this.j = 0
  }
  start(caret) { return clamp(Math.round(caret - this.len / 2), 0, this.x.length - this.len) }
  get at() { return this.a + this.j }
  render(out, caret) {
    const { x, len, cross, rise } = this, tail = len - cross
    let { a, b, j } = this
    for (let i = 0; i < out.length; i++) {
      if (j === tail) b = this.start(caret)
      let v = x[a + j]
      // the pass ends as the next begins: the old falls by the rise read backwards
      if (j >= tail) { const u = j - tail; v = v * rise[cross - 1 - u] + x[b + u] * rise[u] }
      out[i] = v
      if (++j === len) { a = b; j = cross }
    }
    this.a = a; this.b = b; this.j = j
  }
}

// Grains: 80 ms Hann grains, a new one every 20 ms, each read forward from the caret ± 15 ms (Roads 2001). Grains
// from different places are uncorrelated and add in power; Hann² over four overlaps sums to 1.5, hence the 1/√1.5.
class Grains {
  constructor(x, sr, caret) {
    this.x = x
    this.len = Math.min(x.length, 4 * Math.round(.02 * sr))
    this.every = this.len >> 2
    this.spread = Math.round(.015 * sr)
    this.w = window('hann', this.len)
    this.from = new Int32Array(5)
    this.age = new Int32Array(5).fill(-1)
    this.next = 0
    this.s = 0x51ed27
    this.last = caret
  }
  get at() { return this.last }
  render(out, caret) {
    const { x, len, w, from, age } = this, gain = 1 / Math.sqrt(1.5)
    for (let i = 0; i < out.length; i++) {
      if (this.next-- === 0) {
        this.next = this.every - 1
        const g = age.indexOf(-1)
        this.s = xorshift(this.s)
        this.last = caret
        if (g >= 0) { from[g] = clamp(Math.round(caret - len / 2 + (this.s / 2 ** 31) * this.spread), 0, x.length - len); age[g] = 0 }
      }
      let v = 0
      for (let g = 0; g < 5; g++) if (age[g] >= 0) { v += x[from[g] + age[g]] * w[age[g]]; if (++age[g] === len) age[g] = -1 }
      out[i] = v * gain
    }
  }
}

// ── Spectra ─────────────────────────────────────────────────────

// The Hann-tapered spectrum of the n samples centred on p, into re/im. With a lag, the frame centred on p − lag goes
// into the imaginary part, so one complex FFT transforms both; unpack() separates them.
function analyse(x, p, w, re, im, lag = 0) {
  const n = w.length, first = p - n / 2
  for (let j = 0; j < n; j++) {
    const a = first + j, b = a - lag
    re[j] = a >= 0 && a < x.length ? x[a] * w[j] : 0
    im[j] = lag && b >= 0 && b < x.length ? x[b] * w[j] : 0
  }
  fft(re, im)
}
// Z = A + iB for real frames a, b: A[k] = (Z[k] + conj Z[n − k]) / 2, B[k] = (Z[k] − conj Z[n − k]) / 2i
function unpack(re, im, ar, ai, br, bi) {
  const n = re.length
  for (let k = 0; k <= n / 2; k++) {
    const m = k ? n - k : 0, zr = re[k], zi = im[k], wr = re[m], wi = im[m]
    ar[k] = (zr + wr) / 2; ai[k] = (zi - wi) / 2
    br[k] = (zi + wi) / 2; bi[k] = (wr - zr) / 2
  }
}
// Spectral peaks: bins louder than the two bins either side. Each owns the bins down to the quietest point toward its
// neighbours, its region of influence (Laroche & Dolson 1999): owner[k] indexes bin k's peak in `peaks`. lows[i] is
// the higher of peak i's two valleys, so mag[peak] / lows[i] is how far it stands out. Returns the count of peaks.
function regions(mag, peaks, owner, lows) {
  const h = mag.length
  let count = 0
  for (let k = 2; k < h - 2; k++) {
    const m = mag[k]
    if (m > 0 && m > mag[k - 1] && m > mag[k - 2] && m >= mag[k + 1] && m >= mag[k + 2]) peaks[count++] = k
  }
  if (!count) { owner.fill(-1); return 0 }
  let from = 0, left = Infinity
  for (let k = 0; k < peaks[0]; k++) if (mag[k] < left) left = mag[k]
  for (let i = 0; i < count; i++) {
    const k = peaks[i], last = i + 1 === count, end = last ? h : peaks[i + 1]
    let valley = k, low = Infinity
    for (let j = k + 1; j < end; j++) if (mag[j] < low) { low = mag[j]; valley = j }
    if (last) valley = h - 1
    owner.fill(i, from, valley + 1)
    lows[i] = Math.max(left === Infinity ? 0 : left, low === Infinity ? 0 : low)
    left = low
    from = valley + 1
  }
  return count
}
// A peak from the parabola through the log magnitudes of it and its neighbours (Smith & Serra 1987): its frequency
// and magnitude, and its width at half power, where the parabola has dropped by ln √2 (in bins; a steady sine under
// Hann measures 1.31–1.41 as it sits on or between bins), into out[0…2]
function vertex(mag, k, out) {
  const a = Math.log(mag[k - 1] || 1e-30), b = Math.log(mag[k]), c = Math.log(mag[k + 1] || 1e-30), d = Math.min(a - 2 * b + c, -1e-9)
  const δ = clamp(.5 * (a - c) / d, -.5, .5)
  out[0] = k + δ
  out[1] = Math.exp(b - .25 * (a - c) * δ)
  out[2] = 2 * Math.sqrt(Math.LN2 / -d)
}
// Unit phasors at 4,096 even steps round the circle, for random phases without trigonometry
const TURNS = Float64Array.from({ length: 8192 }, (_, i) => i & 1 ? Math.sin(TAU * (i >> 1) / 4096) : Math.cos(TAU * (i >> 1) / 4096))
// Peaks standing 12 dB over their higher valley are tones; the rest of the spectrum is noise
const TONAL = 10 ** (12 / 20)
// A steady sine's Hann spectrum d bins from its centre, relative to the centre: sinc(d) / (1 − d²)
function leak(d) {
  d = Math.abs(d)
  if (d < 1e-6) return 1
  if (Math.abs(d - 1) < 1e-6) return .5
  return Math.abs(Math.sin(Math.PI * d) / (Math.PI * d * (1 - d * d)))
}
// Marks the bins of peak i's region that its own leakage explains: its main lobe, 1.5 bins either side of its centre
// f, and any bin no louder than twice what a steady sine of magnitude m there leaks. The rest of the region is noise.
function explained(mag, owner, i, k, f, m, mark) {
  for (let j = k; j >= 0 && owner[j] === i; j--) if (Math.abs(j - f) <= 1.5 || mag[j] <= 2 * m * leak(j - f)) mark[j] = 1
  for (let j = k + 1; j < mag.length && owner[j] === i; j++) if (Math.abs(j - f) <= 1.5 || mag[j] <= 2 * m * leak(j - f)) mark[j] = 1
}

// Frames: the spectral methods' shared body. Every n/overlap samples `shape(p)` writes a spectrum (re/im, bins 0…n/2)
// from the source around the caret p; here it becomes sound: inverse FFT, Hann again, overlap-add, a block at a time.
// Hann² at a hop of n/4 or less sums to 3/8 of the overlap. Frames whose phases carry on from the last add in amplitude:
// their sum is scaled by 1 / (3/8 · overlap). A frame of random phases adds in power, and spreads its energy evenly over
// the frame instead of under the analysis window (mean Hann² = 3/8): 3/8 · overlap · 3/8 of the power, so shape() writes
// random bins √overlap as loud (`lift`). With a spread, each frame is analysed at the caret ± up to `spread` ms, so a
// held caret overlap-adds different windowed parts of its neighbourhood rather than one part again and again.
class Frames {
  constructor(x, sr, caret, { frame = 2048, overlap = 4, spread = 0 } = {}) {
    const n = this.n = frame
    this.x = x
    this.hop = n / overlap
    this.overlap = overlap
    this.lift = Math.sqrt(overlap)
    this.spread = Math.round(spread / 1000 * sr)
    this.w = window('hann', n)
    this.re = new Float64Array(n)
    this.im = new Float64Array(n)
    this.sum = new Float64Array(n)
    this.k = this.hop
    this.p = Math.round(caret)
    this.s = 0x2f6b1d
  }
  get at() { return this.p }
  render(out, caret) {
    const { sum, hop, n, spread } = this
    for (let i = 0; i < out.length; i++) {
      if (this.k === hop) {
        sum.copyWithin(0, hop)
        sum.fill(0, n - hop)
        const jitter = spread ? ((this.s = xorshift(this.s)) / 2 ** 31) * spread : 0
        this.p = clamp(Math.round(caret + jitter), 0, this.x.length - 1)
        this.shape(this.p)
        this.inverse()
        this.k = 0
      }
      out[i] = sum[this.k++]
    }
  }
  // bins 0…n/2 of re/im to a real frame: mirror, conjugate, forward FFT, real part / n
  inverse() {
    const { re, im, n, w, sum } = this, g = 1 / (.375 * this.overlap * n)
    for (let k = 1; k < n / 2; k++) { re[n - k] = re[k]; im[n - k] = im[k]; im[k] = -im[k] }
    im[0] = im[n / 2] = 0
    fft(re, im)
    for (let j = 0; j < n; j++) sum[j] += w[j] * re[j] * g
  }
  // a random unit phasor's index into TURNS
  turn() { return ((this.s = xorshift(this.s)) >>> 20) << 1 }
}

// Random phase: the caret's spectrum, every bin at a new random phase each hop (Paulstretch, Nasca Octavian Paul,
// 2006). This is also a dense noiscillator bank, a line about a bin wide on every bin, computed by inverse FFT
// instead of by oscillators.
class Random extends Frames {
  shape(p) {
    const { x, w, re, im, n } = this
    analyse(x, p, w, re, im)
    for (let k = 1; k < n / 2; k++) {
      const m = this.lift * Math.sqrt(re[k] * re[k] + im[k] * im[k]), t = this.turn()
      re[k] = m * TURNS[t]
      im[k] = m * TURNS[t + 1]
    }
    re[0] = im[0] = re[n / 2] = im[n / 2] = 0
  }
}

// Phase vocoder: two frames a hop apart at the caret. Each peak's phase advances as much as it did from the earlier
// frame to the later, and the bins in its region keep their phase offsets to it (identity phase locking, Laroche &
// Dolson 1999). The synthesis hop is the frames' lag, so the advance needs no unwrapping: a region turns by its peak's
// last synthesis phasor times the conjugate of its earlier analysis phasor, Y = A · Ŷ · conj B̂, with no trigonometry.
// A still caret sustains the frame; a moving one plays the sound at the caret's speed and at its own pitch; at the
// speed of the hop it plays the source back unchanged. With `noise`, only the bins a tonal peak's leakage explains
// lock; every other bin takes a random phase each hop.
class Vocoder extends Frames {
  constructor(x, sr, caret, o, noise = false) {
    super(x, sr, caret, o)
    const h = this.n / 2 + 1
    for (const k of ['ar', 'ai', 'br', 'bi', 'yr', 'yi', 'rr', 'ri', 'mag', 'lows']) this[k] = new Float64Array(h)
    this.peaks = new Int32Array(h)
    this.owner = new Int32Array(h)
    this.tonal = new Uint8Array(h)
    this.v = new Float64Array(3)
    this.noise = noise
    this.fresh = true
  }
  shape(p) {
    const { x, w, re, im, n, hop, ar, ai, br, bi, yr, yi, rr, ri, mag, peaks, owner, lows, tonal, v, noise } = this, h = n / 2 + 1
    analyse(x, p, w, re, im, hop)
    unpack(re, im, ar, ai, br, bi)
    for (let k = 0; k < h; k++) mag[k] = Math.sqrt(ar[k] * ar[k] + ai[k] * ai[k])
    const count = regions(mag, peaks, owner, lows)
    for (let i = 0; i < count; i++) {
      const k = peaks[i], d = Math.sqrt((yr[k] * yr[k] + yi[k] * yi[k]) * (br[k] * br[k] + bi[k] * bi[k]))
      if (this.fresh || !d) { rr[i] = 1; ri[i] = 0; continue }
      rr[i] = (yr[k] * br[k] + yi[k] * bi[k]) / d
      ri[i] = (yi[k] * br[k] - yr[k] * bi[k]) / d
    }
    if (noise) {
      tonal.fill(0)
      for (let i = 0; i < count; i++) if (mag[peaks[i]] >= TONAL * lows[i]) { vertex(mag, peaks[i], v); explained(mag, owner, i, peaks[i], v[0], v[1], tonal) }
    }
    for (let k = 0; k < h; k++) {
      const o = owner[k]
      if (o >= 0 && (!noise || tonal[k])) {
        yr[k] = rr[o] * ar[k] - ri[o] * ai[k]
        yi[k] = rr[o] * ai[k] + ri[o] * ar[k]
      } else if (noise) {
        const t = this.turn()
        yr[k] = this.lift * mag[k] * TURNS[t]
        yi[k] = this.lift * mag[k] * TURNS[t + 1]
      } else { yr[k] = ar[k]; yi[k] = ai[k] }
    }
    this.fresh = false
    re.set(yr)
    im.set(yi)
    // DC and Nyquist are real: they stay as analysed
    re[0] = ar[0]
    re[n / 2] = ar[n / 2]
  }
}

// ── Noiscillators ───────────────────────────────────────────────

// Noiscillators (dy/noisc, "oscillation with uncertain frequency"): a line of width W Hz at f, of one of three kinds.
// A noise band (nosc's `quadrature`): complex Gaussian noise through four one-pole lowpasses (half power at 0.435 of
// their corner), turned up to f; its envelope wanders as noise does. The noise going in is uniform, of unit variance:
// four poles average it into a Gaussian (the central limit), so the line is the same without Gaussian draws. An FM line
// (nosc's `walker`): a sine of constant level whose frequency jitters, white, by √(W · sr / 2π) Hz, a Lorentzian line
// W wide (Wiener phase noise). Sine and noise (nosc's `rice`): `tone`, a share of the power, a steady sine at f, the
// rest a noise band. Frequencies glide over ~10 ms, levels over 10 ms.
const UNIFORM = Math.sqrt(3) / 2 ** 31
class Noiscs {
  constructor(count, sr, kind = 'rice') {
    this.count = count
    this.sr = sr
    this.kind = kind
    for (const k of ['f', 'to', 'c', 'norm', 'tone', 'jitter', 'g', 'level', 'pr', 'pi']) this[k] = new Float64Array(count)
    this.state = new Float64Array(count * 8)
    this.k = 1 - Math.exp(-1 / (.01 * sr))
    this.s = 0x6d2b79f5
  }
  // voice j: a line at f Hz, W Hz wide (FWHM), `level` RMS, `tone` of it a sine; `jump` starts it there, from silence
  set(j, f, W, level, tone, jump) {
    const c = 1 - Math.exp(-TAU * Math.max(W / 2 / .435, .5) / this.sr), z = (1 - c) * (1 - c)
    this.to[j] = f
    this.c[j] = c
    // the cascade's impulse energy, Σ C(n+3, 3)² c⁸ z^n, in closed form: c (1 + 9z + 9z² + z³) / (2 − c)⁷
    this.norm[j] = 1 / Math.sqrt(c * (1 + 9 * z + 9 * z * z + z * z * z) / (2 - c) ** 7)
    // an FM line's turn a sample, in radians: 2π σ / sr for a frequency jitter σ = √(W · sr / 2π)
    this.jitter[j] = TAU * Math.sqrt(Math.max(W, 0) * this.sr / TAU) / this.sr
    this.level[j] = level
    this.tone[j] = this.kind === 'rice' ? tone : this.kind === 'fm' ? 1 : 0
    if (!jump) return
    this.s = xorshift(this.s)
    const t = (this.s >>> 20) << 1
    this.f[j] = f
    this.g[j] = 0
    this.pr[j] = TURNS[t]
    this.pi[j] = TURNS[t + 1]
    this.state.fill(0, j * 8, j * 8 + 8)
  }
  // adds every voice into out
  render(out) {
    const n = out.length, { f, to, c, norm, tone, jitter, g, level, pr, pi, state, k } = this, step = TAU / this.sr, fm = this.kind === 'fm'
    let s = this.s
    for (let j = 0; j < this.count; j++) {
      const target = level[j]
      if (!target && g[j] < 1e-6) { g[j] = 0; continue }
      f[j] += (to[j] - f[j]) * .25
      const rr = Math.cos(f[j] * step), ri = Math.sin(f[j] * step), cj = c[j]
      const sine = Math.SQRT2 * Math.sqrt(tone[j]), band = norm[j] * Math.sqrt(1 - tone[j]), o = j * 8
      let r = pr[j], i = pi[j], gg = g[j]
      let i0 = state[o], i1 = state[o + 1], i2 = state[o + 2], i3 = state[o + 3]
      let q0 = state[o + 4], q1 = state[o + 5], q2 = state[o + 6], q3 = state[o + 7]
      if (fm) for (let t = 0, e0 = jitter[j] * UNIFORM; t < n; t++) {
        // the sample's turn, and a small random one e on top, to second order: (1 − e²/2) + ie
        s = xorshift(s)
        const e = s * e0, ec = 1 - e * e / 2, u = r * rr - i * ri, v = r * ri + i * rr
        r = u * ec - v * e
        i = u * e + v * ec
        gg += (target - gg) * k
        out[t] += gg * sine * i
      } else if (!band) for (let t = 0; t < n; t++) {
        const u = r * rr - i * ri
        i = r * ri + i * rr
        r = u
        gg += (target - gg) * k
        out[t] += gg * sine * i
      } else for (let t = 0; t < n; t++) {
        s = xorshift(s)
        const a = s * UNIFORM
        s = xorshift(s)
        const b = s * UNIFORM
        i0 += cj * (a - i0); i1 += cj * (i0 - i1); i2 += cj * (i1 - i2); i3 += cj * (i2 - i3)
        q0 += cj * (b - q0); q1 += cj * (q0 - q1); q2 += cj * (q1 - q2); q3 += cj * (q2 - q3)
        const u = r * rr - i * ri
        i = r * ri + i * rr
        r = u
        gg += (target - gg) * k
        out[t] += gg * (sine * i + band * (i3 * r - q3 * i))
      }
      const m = 1 / Math.sqrt(r * r + i * i)
      pr[j] = r * m; pi[j] = i * m; g[j] = gg
      state[o] = i0; state[o + 1] = i1; state[o + 2] = i2; state[o + 3] = i3
      state[o + 4] = q0; state[o + 5] = q1; state[o + 6] = q2; state[o + 7] = q3
    }
    this.s = s
  }
}

// What the noiscillator methods share: the caret's spectrum every n/4 samples (whole blocks: n/4 is a multiple of
// the 128-sample block), and with a lag the frame that many samples earlier packed into it; set() maps it onto voices,
// and the voices play
class Voiced {
  constructor(x, sr, caret, { frame = 2048 } = {}) {
    const n = this.n = frame
    this.x = x
    this.sr = sr
    this.hop = n / 4
    this.lag = 0
    this.w = window('hann', n)
    this.re = new Float64Array(n)
    this.im = new Float64Array(n)
    this.k = this.hop
    this.p = Math.round(caret)
    let sum = 0, squares = 0
    for (const v of this.w) { sum += v; squares += v * v }
    // a sine of amplitude A peaks at A Σw / 2; a bin's one-sided power, as a share of the mean power, is 2|X|² / (n Σw²)
    this.sum = sum
    this.scale = 2 / (n * squares)
  }
  get at() { return this.p }
  render(out, caret) {
    if (this.k >= this.hop) {
      this.k = 0
      this.p = clamp(Math.round(caret), 0, this.x.length - 1)
      analyse(this.x, this.p, this.w, this.re, this.im, this.lag)
      this.set()
    }
    this.k += out.length
    out.fill(0)
    for (let i = 0; i < this.voices.length; i++) this.voices[i].render(out)
  }
}

// The power below f Hz: bin k spans [k − ½, k + ½) bins, so with cum[k] the power of the bins below k, the power
// below u = f/bin + ½ is linear between cum[⌊u⌋] and cum[⌊u⌋ + 1]
function below(cum, f, bin) {
  const last = cum.length - 1, u = clamp(f / bin + .5, 0, last), i = Math.min(last - 1, Math.floor(u))
  return cum[i] + (u - i) * (cum[i + 1] - cum[i])
}

// Noisc bank: a noiscillator per band of a fixed log grid, 40 Hz to 16 kHz, each hop set to the power the caret's
// spectrum holds in its band. Nothing is fitted. Read from the bins, each band's line sits at the band's centre, as wide
// as the band: a noise vocoder (Shannon et al. 1995), where pitch survives only if bands are narrower than the spacing of
// the harmonics, and a partial's leakage lobe (±2 bins under Hann) turns into noise in every band it touches. Reassigned
// (Kodera, Gendrin & de Villedary 1978), each bin's power moves to its instantaneous frequency, the phase it turns in one
// sample, read from the same frame a sample earlier packed into the one FFT: a partial's lobe lands in one band, whose
// line sits at the power-weighted mean frequency, as wide as the frequencies spread (a Gaussian's FWHM, 2.355 σ), and
// a sine as far as they don't (σ against a band's σ were they spread evenly, its width / √12).
class Bank extends Voiced {
  constructor(x, sr, caret, o = {}) {
    super(x, sr, caret, o)
    const count = o.bands || 256, lo = 40, hi = Math.min(16000, .45 * sr), r = (hi / lo) ** (1 / (count - 1)), h = this.n / 2 + 1
    this.low = lo
    this.step = Math.log(r)
    this.reassign = o.analysis !== 'bins'
    this.lag = this.reassign ? 1 : 0
    this.edges = Float64Array.from({ length: count + 1 }, (_, j) => lo * r ** (j - .5))
    this.cum = new Float64Array(h + 1)
    for (const k of ['ar', 'ai', 'br', 'bi']) this[k] = new Float64Array(h)
    for (const k of ['power', 'first', 'second']) this[k] = new Float64Array(count)
    this.voices = [new Noiscs(count, sr, o.line)]
    for (let j = 0; j < count; j++) this.voices[0].set(j, lo * r ** j, this.edges[j + 1] - this.edges[j], 0, 0, true)
  }
  set() {
    const { re, im, n, cum, edges, scale, sr } = this, bank = this.voices[0], bin = sr / n
    if (!this.reassign) {
      for (let k = 0; k <= n / 2; k++) cum[k + 1] = cum[k] + (re[k] * re[k] + im[k] * im[k]) * scale
      for (let j = 0; j < bank.count; j++) bank.level[j] = Math.sqrt(Math.max(0, below(cum, edges[j + 1], bin) - below(cum, edges[j], bin)))
      return
    }
    const { ar, ai, br, bi, power, first, second, low, step } = this
    unpack(re, im, ar, ai, br, bi)
    power.fill(0); first.fill(0); second.fill(0)
    for (let k = 1; k < n / 2; k++) {
      const P = (ar[k] * ar[k] + ai[k] * ai[k]) * scale
      if (!P) continue
      const f = Math.atan2(ai[k] * br[k] - ar[k] * bi[k], ar[k] * br[k] + ai[k] * bi[k]) / TAU * sr, j = f > 0 ? Math.round(Math.log(f / low) / step) : -1
      if (j < 0 || j >= bank.count) continue
      power[j] += P; first[j] += P * f; second[j] += P * f * f
    }
    for (let j = 0; j < bank.count; j++) {
      const P = power[j]
      if (!P) { bank.level[j] = 0; continue }
      const mean = first[j] / P, spread = Math.sqrt(Math.max(0, second[j] / P - mean * mean)), even = (edges[j + 1] - edges[j]) / Math.sqrt(12)
      bank.set(j, mean, Math.max(1, 2.355 * spread), Math.sqrt(P), clamp(1 - spread / even, 0, 1), false)
    }
  }
}

// Noisc lines: the caret's tonal peaks become lines at their frequencies, as wide as each peak is wider than a steady
// sine's (Hann: 1.44 bins at half power, Harris 1978); as sine and noise, a line is a sine as far as its peak is no
// wider. Third-octave noise bands carry the rest of the spectrum, the bins no line's leakage explains. Lines follow
// their peaks from hop to hop, nearest frequency first (McAulay & Quatieri 1986): sines plus noise (Serra & Smith 1990),
// drawn with noiscillators.
const LINES = 64
class Lines extends Voiced {
  constructor(x, sr, caret, o) {
    super(x, sr, caret, o)
    const h = this.n / 2 + 1
    this.mag = new Float64Array(h)
    this.lows = new Float64Array(h)
    this.peaks = new Int32Array(h)
    this.owner = new Int32Array(h)
    this.taken = new Uint8Array(h)
    this.order = new Int32Array(h)
    this.claimed = new Uint8Array(2 * LINES)
    this.v = new Float64Array(3)
    const centres = []
    for (let f = 1000 * 2 ** (-15 / 3); f < .45 * sr; f *= 2 ** (1 / 3)) centres.push(f)
    this.centres = Float64Array.from(centres)
    this.voices = [new Noiscs(2 * LINES, sr, o?.line), new Noiscs(centres.length, sr, 'band')]
    centres.forEach((f, j) => this.voices[1].set(j, f, f * (2 ** (1 / 6) - 2 ** (-1 / 6)), 0, 0, true))
  }
  set() {
    const { re, im, n, mag, lows, peaks, owner, taken, order, claimed, v, centres, scale, sum } = this, h = n / 2 + 1
    const lines = this.voices[0], floor = this.voices[1], bin = this.sr / n
    for (let k = 0; k < h; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k])
    const count = regions(mag, peaks, owner, lows)
    // tonal peaks, loudest first (insertion sort: a few hundred at most)
    let m = 0
    for (let i = 0; i < count; i++) {
      if (mag[peaks[i]] < TONAL * lows[i]) continue
      let j = m++
      while (j > 0 && mag[peaks[order[j - 1]]] < mag[peaks[i]]) { order[j] = order[j - 1]; j-- }
      order[j] = i
    }
    m = Math.min(m, LINES)
    taken.fill(0)
    claimed.fill(0)
    for (let i = 0; i < m; i++) {
      const k = peaks[order[i]]
      vertex(mag, k, v)
      const f = v[0] * bin, rms = Math.SQRT2 * v[1] / sum, excess = Math.sqrt(Math.max(0, v[2] * v[2] - 1.44 * 1.44))
      const tone = clamp(1 - excess / 1.44, 0, 1)
      explained(mag, owner, order[i], k, v[0], v[1], taken)
      // the nearest sounding voice within half a semitone carries on; else a silent one starts here
      let best = -1, near = .03
      for (let j = 0; j < lines.count; j++) {
        if (claimed[j] || !(lines.level[j] || lines.g[j] > 1e-6)) continue
        const d = Math.abs(Math.log(lines.to[j] / f))
        if (d < near) { near = d; best = j }
      }
      const jump = best < 0
      if (jump) for (let j = 0; j < lines.count && best < 0; j++) if (!claimed[j] && !lines.level[j] && lines.g[j] <= 1e-6) best = j
      if (best < 0) continue
      claimed[best] = 1
      lines.set(best, f, Math.max(1, excess * bin), rms, tone, jump)
    }
    for (let j = 0; j < lines.count; j++) if (!claimed[j]) lines.level[j] = 0
    // the floor: each third octave's mean power per bin, over the bins no line takes, times its width in bins
    for (let j = 0; j < centres.length; j++) {
      const lo = centres[j] * 2 ** (-1 / 6) / bin, hi = centres[j] * 2 ** (1 / 6) / bin
      let power = 0, bins = 0
      for (let k = Math.ceil(lo); k <= Math.min(h - 1, Math.floor(hi)); k++) if (!taken[k]) { power += mag[k] * mag[k]; bins++ }
      if (!bins && hi - lo < 1) { const k = Math.min(h - 1, Math.round(centres[j] / bin)); if (!taken[k]) { power = mag[k] * mag[k]; bins = 1 } }
      floor.level[j] = bins ? Math.sqrt(power / bins * (hi - lo) * scale) : 0
    }
  }
}

// The eight, in the order the page lists them. `make(x, sampleRate, caret, { frame, overlap, spread, bands, analysis,
// line })` starts one at the caret.
export const methods = {
  tape: { name: 'Tape', make: (x, sr, caret) => new Tape(x, sr, caret) },
  loop: { name: 'Loop', make: (x, sr, caret) => new Loop(x, sr, caret) },
  grains: { name: 'Grains', make: (x, sr, caret) => new Grains(x, sr, caret) },
  bank: { name: 'Noisc bank', make: (x, sr, caret, o) => new Bank(x, sr, caret, o) },
  lines: { name: 'Noisc lines', make: (x, sr, caret, o) => new Lines(x, sr, caret, o) },
  random: { name: 'Random phase', make: (x, sr, caret, o) => new Random(x, sr, caret, o) },
  vocoder: { name: 'Vocoder', make: (x, sr, caret, o) => new Vocoder(x, sr, caret, o) },
  hybrid: { name: 'Vocoder + noise', make: (x, sr, caret, o) => new Vocoder(x, sr, caret, o, true) }
}
