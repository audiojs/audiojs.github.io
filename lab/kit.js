// Kit for the lab's figures: test sounds made here (nothing to download), an FFT, windows, frequency scales, colour
// in OKLab, colour maps, and figures that draw when first near the screen and again when their controls move, on dark
// panels in the colours lab.css gives them.
export const RATE = 44100

// ── Sounds ──────────────────────────────────────────────────────

const seconds = s => new Float32Array(Math.round(s * RATE))
const random = (seed = 1) => { let s = seed; return () => (s = s * 16807 % 2147483647) / 2147483647 * 2 - 1 }
// a two-pole resonator, unity gain at its centre f Hz, bandwidth bw Hz; f and bw may glide sample to sample
function resonator() {
  let y1 = 0, y2 = 0
  return (x, f, bw) => {
    const r = Math.exp(-Math.PI * bw / RATE), w = 2 * Math.PI * f / RATE, g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r)
    const y = g * x + 2 * r * Math.cos(w) * y1 - r * r * y2
    y2 = y1; y1 = y
    return y
  }
}
const strike = (out, at, f, parts, gain = 1) => {
  for (const [ratio, amp, decay] of parts) for (let i = Math.round(at * RATE), t = 0; i < out.length; i++, t += 1 / RATE) {
    const e = Math.exp(-t / decay)
    if (e < 1e-4) break
    out[i] += gain * amp * e * Math.sin(2 * Math.PI * f * ratio * t)
  }
}
const BELL = [[1, 1, 1.6], [2.76, .5, .8], [5.4, .25, .45], [8.93, .12, .25]]

export const sounds = {
  chime: { name: 'Chime', make() {
    const out = seconds(2.6)
    ;[[.1, 523.25], [.8, 659.25], [1.5, 783.99]].forEach(([at, f]) => strike(out, at, f, BELL, .3))
    return out
  } },
  voice: { name: 'Voice', make() {
    // a sawtooth voice (harmonics fading out by 5 kHz) through three formants, 'a' turning to 'i', three syllables; pitch glides and trembles
    const out = seconds(2.2), A = [[700, 110], [1220, 120], [2600, 160]], I = [[280, 60], [2250, 100], [2890, 120]]
    let phase = 0
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE, f0 = 115 + 35 * Math.sin(Math.PI * t / 2.2) + 3 * Math.sin(2 * Math.PI * 5.5 * t)
      phase += f0 / RATE
      let s = 0
      for (let k = 1; k * f0 < 5000; k++) s += Math.sin(2 * Math.PI * k * phase) / k * Math.min(1, (5000 - k * f0) / 1000)
      out[i] = s
    }
    const mix = t => Math.min(1, Math.max(0, (t - .9) / .3)), bank = [resonator(), resonator(), resonator()]
    let peak = 0
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE, m = mix(t), syllable = Math.sin(Math.PI * (t % .73) / .73) ** .7
      out[i] = syllable * bank.reduce((y, r, j) => y + [1, .6, .35][j] * r(out[i], A[j][0] + (I[j][0] - A[j][0]) * m, A[j][1] + (I[j][1] - A[j][1]) * m), 0)
      peak = Math.max(peak, Math.abs(out[i]))
    }
    return out.map(v => .67 * v / peak)
  } },
  drums: { name: 'Drums', make() {
    const out = seconds(2), noise = random(7)
    for (let n = 0; n < 16; n++) {
      const at = n * .125, i0 = Math.round(at * RATE)
      let last = 0, phase = 0
      for (let i = i0, t = 0; i < out.length && t < .5; i++, t += 1 / RATE) {
        const x = noise(), hp = x - last
        last = x
        if (n % 4 === 0) { phase += (40 + 80 * Math.exp(-t / .04)) / RATE; out[i] += .7 * Math.exp(-t / .22) * Math.sin(2 * Math.PI * phase) }
        if (n % 4 === 2) out[i] += Math.exp(-t / .07) * (.35 * x + .25 * Math.sin(2 * Math.PI * 185 * t))
        out[i] += .12 * Math.exp(-t / .018) * hp
      }
    }
    return out
  } },
  sweep: { name: 'Sweep', make() {
    // a sine from 30 Hz to 18 kHz, exponential, as a room measurement plays (Farina 2000)
    const out = seconds(2), f0 = 30, f1 = 18000, T = 1.9, k = Math.log(f1 / f0)
    for (let i = 0; i < out.length; i++) {
      const t = Math.min(i / RATE, T), fade = Math.min(1, t / .02, (T - t) / .02, (2 - i / RATE) / .02)
      out[i] = .6 * Math.max(0, fade) * Math.sin(2 * Math.PI * f0 * T / k * (Math.exp(t / T * k) - 1))
    }
    return out
  } },
  tones: { name: 'Two tones, three clicks', make() {
    // tones 110 Hz apart, clicks between: the one needs a long window, the other a short one
    const out = seconds(2)
    for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = .3 * Math.sin(2 * Math.PI * 440 * t) + .3 * Math.sin(2 * Math.PI * 550 * t) }
    for (const at of [.5, 1, 1.5]) out[Math.round(at * RATE)] += .9
    return out
  } },
  pair: { name: 'Tone and chirp', make() {
    // a tone at 2 kHz and a chirp from 500 Hz to 3.5 kHz, a second, faded in and out: a hard edge's analytic signal
    // trails off as 1/t, a slow ghost that Wigner–Ville would pair with each line
    const out = seconds(1)
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE, fade = Math.sin(Math.PI / 2 * Math.min(1, t / .05, (1 - t) / .05)) ** 2
      out[i] = fade * (.5 * Math.sin(2 * Math.PI * 2000 * t) + .5 * Math.sin(2 * Math.PI * (500 * t + 1500 * t * t)))
    }
    return out
  } },
  hiss: { name: 'Hiss and a tone', make() {
    const out = seconds(2), noise = random(3)
    for (let i = 0; i < out.length; i++) out[i] = .25 * noise() + .05 * Math.sin(2 * Math.PI * 3000 * i / RATE)
    return out
  } }
}
const made = new Map()
export const sound = key => made.get(key) || made.set(key, sounds[key].make()).get(key)
// Stereo: the chime's strikes alternating between the channels, each a different pitch, a shared hum under both
export function stereo() {
  if (made.has('stereo')) return made.get('stereo')
  const left = seconds(2.2), right = seconds(2.2)
  ;[[.1, 523.25, left], [.6, 659.25, right], [1.1, 783.99, left], [1.6, 1046.5, right]].forEach(([at, f, out]) => strike(out, at, f, BELL, .35))
  for (let i = 0; i < left.length; i++) { const hum = .05 * Math.sin(2 * Math.PI * 110 * i / RATE); left[i] += hum; right[i] += hum }
  made.set('stereo', [left, right])
  return [left, right]
}

// ── Spectra ─────────────────────────────────────────────────────

// Radix-2 FFT in place, complex (Cooley & Tukey 1965)
const plans = new Map()
function plan(n) {
  if (plans.has(n)) return plans.get(n)
  const rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), bits = Math.log2(n)
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= (i >> b & 1) << bits - 1 - b; rev[i] = r }
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n) }
  plans.set(n, { rev, cos, sin })
  return plans.get(n)
}
export function fft(re, im) {
  const n = re.length, { rev, cos, sin } = plan(n)
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2, step = n / size
    for (let i = 0; i < n; i += size) for (let j = 0; j < half; j++) {
      const k = j * step, a = i + j, b = a + half, tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k]
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
    }
  }
}

// Windows (Harris 1978) as cosine sums, w(n) = Σ (−1)^k a_k cos(2πkn/N): rectangular; Hann; Blackman–Harris, four terms,
// sidelobes at −92 dB. slope() is the derivative per sample, exact, for reassignment
const COSINES = { rect: [1], hann: [.5, .5], bh: [.35875, .48829, .14128, .01168] }
const windows = new Map()
const sum = (kind, n, term) => {
  const key = kind + term.name + n
  if (windows.has(key)) return windows.get(key)
  const a = COSINES[kind] ?? COSINES.bh, w = new Float64Array(n)
  for (let i = 0; i < n; i++) for (let k = 0; k < a.length; k++) w[i] += (-1) ** k * a[k] * term(k, i, n)
  windows.set(key, w)
  return w
}
export const window = (kind, n) => sum(kind, n, function value(k, i, n) { return Math.cos(2 * Math.PI * k * i / n) })
export const slope = (kind, n) => sum(kind, n, function slope(k, i, n) { return -2 * Math.PI * k / n * Math.sin(2 * Math.PI * k * i / n) })

// ── Frequency scales ────────────────────────────────────────────

// where f sits on a scale, and back: log octaves; mel (O'Shaughnessy 1987); ERB rate (Glasberg & Moore 1990)
const mel = f => 2595 * Math.log10(1 + f / 700), erb = f => 21.4 * Math.log10(1 + .00437 * f)
export const scales = {
  lin: { name: 'Linear', to: f => f, from: v => v, low: 0 },
  log: { name: 'Octaves', to: Math.log2, from: v => 2 ** v, low: 20 },
  mel: { name: 'Mel', to: mel, from: m => 700 * (10 ** (m / 2595) - 1), low: 0 },
  erb: { name: 'ERB', to: erb, from: e => (10 ** (e / 21.4) - 1) / .00437, low: 0 }
}
export const at = (scale, f, hi) => { const s = scales[scale]; return (s.to(f) - s.to(s.low)) / (s.to(hi) - s.to(s.low)) }
export const of = (scale, u, hi) => { const s = scales[scale]; return s.from(s.to(s.low) + u * (s.to(hi) - s.to(s.low))) }

// ── Colour ──────────────────────────────────────────────────────

export const encode = v => { v = Math.max(0, Math.min(1, v)); return v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055 }
export const decode = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
// encoded sRGB to OKLab and back (Ottosson 2020)
export function oklab(rgb) {
  const [r, g, b] = rgb.map(decode)
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]
}
export function srgb([L, a, b]) {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(encode)
}
export const oklch = (L, C, h) => srgb([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)])
// a colour t of the way from p to q, in OKLab
export const mix = (p, q, t) => { const a = oklab(p), b = oklab(q); return srgb(a.map((v, i) => v + (b[i] - v) * t)) }
// a grey of OKLab lightness L (a grey's L is the cube root of its light)
export const grey = L => { const v = encode(L * L * L); return [v, v, v] }
export const css = ([r, g, b], a = 1) => `rgb(${r * 255} ${g * 255} ${b * 255} / ${a})`

// The panels' colours from lab.css (--panel, --panel-ink…), as encoded sRGB 0..1: the panel itself (paper), what is
// drawn on it (ink and its two dimmer steps), its rules, its accent. A panel is a screen: light on dark, colours add.
let probe
function read(name) {
  probe ||= document.createElement('canvas').getContext('2d')
  probe.fillStyle = '#000'
  probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'
  const s = probe.fillStyle
  return s[0] === '#' ? [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255) : s.match(/[\d.]+/g).slice(0, 3).map(v => v / 255)
}
export function theme() {
  const t = Object.fromEntries(['', 'ink', 'ink-2', 'ink-3', 'rule', 'accent'].map(k => [k ? k.replace('-', '') : 'paper', read(k ? `--panel-${k}` : '--panel')]))
  t.dark = oklab(t.paper)[0] < .5
  return t
}

// Colour maps, t ∈ 0..1 (quiet to loud) to encoded sRGB, as 256-step tables for the panels' colours: grey, the panel to
// its ink, and ink, the panel through the accent to a paler accent, both even in OKLab lightness; viridis and magma, even
// in CAM02-UCS (Smith & van der Walt 2015, matplotlib; data as d3-scale-chromatic ships it); jet, MATLAB's rainbow,
// uneven (Borland & Taylor 2007)
const ramp = hex => t => { const i = Math.max(0, Math.min(255, Math.floor(t * 256))) * 6; return [0, 2, 4].map(k => parseInt(hex.slice(i + k, i + k + 2), 16) / 255) }
// through the stops at even steps of lightness
const through = stops => {
  const Ls = stops.map(c => oklab(c)[0])
  return t => {
    const L = Ls[0] + (Ls.at(-1) - Ls[0]) * t
    let i = 0
    while (i < stops.length - 2 && (L - Ls[i + 1]) * (Ls.at(-1) - Ls[0]) > 0) i++
    return mix(stops[i], stops[i + 1], Math.max(0, Math.min(1, (L - Ls[i]) / (Ls[i + 1] - Ls[i]))))
  }
}
export const colormaps = {
  grey: { name: 'Grey', make: T => through([T.paper, T.ink]) },
  ink: { name: 'Ink', make: T => through([T.paper, T.accent, mix(T.accent, T.ink, .55)]) },
  viridis: { name: 'Viridis', make: () => ramp('44015444025645045745055946075a46085c460a5d460b5e470d60470e6147106347116447136548146748166848176948186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f854240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f881fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad8128ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc743fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc8635ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21ad8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725') },
  magma: { name: 'Magma', make: () => ramp('00000401000501010601010802010902020b02020d03030f03031204041405041606051806051a07061c08071e0907200a08220b09240c09260d0a290e0b2b100b2d110c2f120d31130d34140e36150e38160f3b180f3d19103f1a10421c10441d11471e114920114b21114e22115024125325125527125829115a2a115c2c115f2d11612f116331116533106734106936106b38106c390f6e3b0f703d0f713f0f72400f74420f75440f764510774710784910784a10794c117a4e117b4f127b51127c52137c54137d56147d57157e59157e5a167e5c167f5d177f5f187f601880621980641a80651a80671b80681c816a1c816b1d816d1d816e1e81701f81721f817320817521817621817822817922827b23827c23827e24828025828125818326818426818627818827818928818b29818c29818e2a81902a81912b81932b80942c80962c80982d80992d809b2e7f9c2e7f9e2f7fa02f7fa1307ea3307ea5317ea6317da8327daa337dab337cad347cae347bb0357bb2357bb3367ab5367ab73779b83779ba3878bc3978bd3977bf3a77c03a76c23b75c43c75c53c74c73d73c83e73ca3e72cc3f71cd4071cf4070d0416fd2426fd3436ed5446dd6456cd8456cd9466bdb476adc4869de4968df4a68e04c67e24d66e34e65e44f64e55064e75263e85362e95462ea5661eb5760ec5860ed5a5fee5b5eef5d5ef05f5ef1605df2625df2645cf3655cf4675cf4695cf56b5cf66c5cf66e5cf7705cf7725cf8745cf8765cf9785df9795df97b5dfa7d5efa7f5efa815ffb835ffb8560fb8761fc8961fc8a62fc8c63fc8e64fc9065fd9266fd9467fd9668fd9869fd9a6afd9b6bfe9d6cfe9f6dfea16efea36ffea571fea772fea973feaa74feac76feae77feb078feb27afeb47bfeb67cfeb77efeb97ffebb81febd82febf84fec185fec287fec488fec68afec88cfeca8dfecc8ffecd90fecf92fed194fed395fed597fed799fed89afdda9cfddc9efddea0fde0a1fde2a3fde3a5fde5a7fde7a9fde9aafdebacfcecaefceeb0fcf0b2fcf2b4fcf4b6fcf6b8fcf7b9fcf9bbfcfbbdfcfdbf') },
  jet: { name: 'Jet', make: () => t => [3, 2, 1].map(k => Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - k)))) }
}
export function colormap(name, T = theme()) {
  const at = colormaps[name].make(T), lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) at(i / 255).forEach((v, k) => lut[i * 3 + k] = v * 255)
  return lut
}

// ── Figures ─────────────────────────────────────────────────────

// A canvas sized to its box, cleared to the panel: { ctx, W, H, dpr, T } in device pixels, at most `density` of them per
// CSS pixel, T the colours drawn with
export function panel(canvas, cssHeight, density = 2, T = theme()) {
  const dpr = Math.min(density, devicePixelRatio || 1), W = Math.round(canvas.clientWidth * dpr), H = Math.round(cssHeight * dpr)
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
  canvas.style.height = cssHeight + 'px'
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = css(T.paper)
  ctx.fillRect(0, 0, W, H)
  return { ctx, W, H, dpr, T }
}
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
// A figure's demo: `draw(values)` runs once the figure is near the screen, and again (a frame later) whenever one of its
// controls moves or the window resizes. Controls are inputs and selects with a name, and buttons in a [data-name] group
// with data-value.
export function demo(figure, draw) {
  const values = () => {
    const v = {}
    for (const el of figure.querySelectorAll('input[name], select[name]')) v[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value
    for (const g of figure.querySelectorAll('[data-name]')) v[g.dataset.name] = g.querySelector('[aria-pressed="true"]')?.dataset.value
    return v
  }
  let frame = 0, seen = false
  const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { for (const o of figure.querySelectorAll('output[for]')) o.value = figure.querySelector(`[name="${o.htmlFor}"]`)?.value ?? ''; draw(values()) }) }
  figure.addEventListener('input', run)
  figure.addEventListener('click', e => {
    const b = e.target.closest('[data-name] button')
    if (!b) return
    for (const x of b.parentElement.querySelectorAll('button')) x.setAttribute('aria-pressed', x === b)
    run()
  })
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen) { seen = true; run() } }, { rootMargin: '200px' }).observe(figure)
  addEventListener('resize', () => seen && run())
  return run
}
