// The home's waveform: each pixel column the samples under it, drawn as a cloud of points, densest at the zero line
// and thinning out to the column's peaks. Speech and music spread about zero roughly as a Laplace distribution does,
// so the density at level v is e^(−|v|/b), b = RMS/√2. A point is lit where that density beats fixed noise: the
// picture is the samples' own spread, and it holds still between edits.

// Per sample, the lowest and highest over the channels and their mean square: what a column needs at any scale
export function prepare(channels) {
  const n = channels[0].length, lo = new Float32Array(n), hi = new Float32Array(n), sq = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let l = Infinity, h = -Infinity, s = 0
    for (const ch of channels) { const v = ch[i]; if (v < l) l = v; if (v > h) h = v; s += v * v }
    lo[i] = l, hi[i] = h, sq[i] = s / channels.length
  }
  return { lo, hi, sq, n }
}

// `cols` columns over the first `span` samples; past the sound's end a column is empty (all zero)
export function columns(p, span, cols, out = { lo: new Float32Array(cols), hi: new Float32Array(cols), rms: new Float32Array(cols) }) {
  const per = span / cols
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * per), b = Math.min(p.n, Math.max(a + 1, Math.floor((c + 1) * per)))
    let l = 0, h = 0, s = 0
    if (a < p.n) {
      l = Infinity, h = -Infinity
      for (let i = a; i < b; i++) { if (p.lo[i] < l) l = p.lo[i]; if (p.hi[i] > h) h = p.hi[i]; s += p.sq[i] }
      s = Math.sqrt(s / (b - a))
    }
    out.lo[c] = l, out.hi[c] = h, out.rms[c] = s
  }
  return out
}

// Columns a and b mixed: (1 − t)·a + t·b
export function mix(a, b, t, out) {
  for (const k of ['lo', 'hi', 'rms']) for (let i = 0; i < out[k].length; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * t
  return out
}

// Into an ImageData as wide as the columns: points in `rgb` over a transparent ground, full scale at `scale` of the
// half height; the zero line, and a faint line at each x of `grid`. `grain` is noise, a byte per pixel; `shift` moves
// it, so a picture in motion glitters and one at rest holds still. `solid` fills each column from its lowest to its
// highest instead: the envelope, no spread.
export function render(img, col, grain, { rgb = [236, 235, 230], scale = .92, grid = [], shift = 0, solid = false } = {}) {
  const { width: W, height: H, data } = img, mid = H / 2, half = mid * scale, [R, G, B] = rgb, len = grain.length
  data.fill(0)
  const dot = (x, y, a) => { const o = (y * W + x) * 4; if (a > data[o + 3]) data[o] = R, data[o + 1] = G, data[o + 2] = B, data[o + 3] = a }
  for (const x of grid) for (let y = 0; y < H; y++) dot(x, y, 26)
  const zero = Math.floor(mid)
  for (let x = 0; x < W; x++) dot(x, zero, 70)
  for (let x = 0; x < W; x++) {
    const h = col.hi[x], l = col.lo[x]
    if (!(h > l)) continue
    const top = Math.max(0, Math.floor(mid - h * half)), bottom = Math.min(H - 1, Math.ceil(mid - l * half))
    if (solid) { for (let y = top; y <= bottom; y++) dot(x, y, 255); continue }
    // 1/b in pixels, b at least a pixel so a quiet column still shows its core
    const k = Math.SQRT2 / Math.max(col.rms[x] * half, 1)
    for (let y = top; y <= bottom; y++) {
      const d = Math.exp(-Math.abs(y + .5 - mid) * k)
      dot(x, y, d * 255 > grain[(y * W + x + shift) % len] ? 150 + 105 * d : 48 * d)
    }
  }
}
