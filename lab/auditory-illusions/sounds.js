// The illusions as numbers. Each sound is made here sample by sample, at the kit's rate, as Float32Arrays, with what it
// was made of (where its sines sit, when its beats fall, which note each ear gets) for the figures to draw. Nothing
// here touches the page: illusions.test.mjs checks what the article says about these sounds against the samples.
import { RATE } from '../kit.js'

const TAU = 2 * Math.PI
// −6 dBFS: no sound here goes louder than this
export const PEAK = .5

// every channel scaled together so the loudest sample reaches `peak`; or, `under`, only brought down to it
function level(channels, { peak = PEAK, under = false } = {}) {
  let top = 0
  for (const x of channels) for (const v of x) top = Math.max(top, Math.abs(v))
  const g = top > 0 && (!under || top > peak) ? peak / top : 1
  if (g !== 1) for (const x of channels) for (let i = 0; i < x.length; i++) x[i] *= g
  return channels
}

// A component's level by where it sits, u from 0 to K (octaves, or tempo ratios): the bell, a raised cosine, silent at
// both ends; or flat, full throughout but for a fade a twenty-fourth of a step long at each end, so the seam is heard and
// not clicked
export const envelopes = {
  bell: (u, K) => u <= 0 || u >= K ? 0 : Math.sin(Math.PI * u / K) ** 2,
  flat: (u, K) => Math.max(0, Math.min(1, 24 * u, 24 * (K - u)))
}

// ── Shepard tones and Risset's glissando ────────────────────────

// K sines an octave apart, each as loud as the envelope says at its place, centred on `centre` Hz. Glide (Risset): they
// rise together, an octave every `period` seconds. Steps (Shepard): they rise a semitone at a time, a tone every `step`
// seconds, gated 10 ms at each end. Either way, after an octave every sine stands where the one above it started, the
// top one gone silent and a new one at the bottom, so the sound loops.
export function shepard({ octaves = 8, envelope = 'bell', glide = true, period = 8, step = .3, centre = 440 } = {}) {
  const K = octaves, low = centre / 2 ** (K / 2), shape = envelopes[envelope]
  const len = Math.round(step * RATE), n = glide ? Math.round(period * RATE) : 12 * len, x = new Float32Array(n)
  if (glide) {
    // sine k is u = k + t/period octaves above `low`, its phase c·2^u, the integral of its frequency low·2^u: a function
    // of u alone, so the loop's ends meet in phase. 2^u steps by a constant ratio a sample; the level is set every 64
    const c = TAU * low * (n / RATE) / Math.LN2, ratio = 2 ** (1 / n)
    for (let k = 0; k < K; k++) for (let i = 0, g = 2 ** k, a = 0; i < n; i++, g *= ratio) {
      if (!(i & 63)) a = shape(k + (i + 32) / n, K)
      if (a) x[i] += a * Math.sin(c * g)
    }
  } else {
    const ramp = Math.round(.01 * RATE), gate = Float32Array.from({ length: len }, (_, i) => Math.sin(Math.PI / 2 * Math.min(1, i / ramp, (len - i) / ramp)) ** 2)
    for (let j = 0; j < 12; j++) for (let k = 0; k < K; k++) {
      const u = k + j / 12, a = shape(u, K), w = TAU * low * 2 ** u / RATE
      if (a) for (let i = 0; i < len; i++) x[j * len + i] += a * gate[i] * Math.sin(w * i)
    }
  }
  level([x])
  return { x, low, K, shape, glide, seconds: n / RATE }
}

// ── Risset's rhythm ─────────────────────────────────────────────

// A tick: a woodblock-like knock, 120 ms (its tail 58 dB down by then), added at sample `at` of x, its tail going round
// to the loop's start
const TICK = Float32Array.from({ length: Math.round(.12 * RATE) }, (_, i) => {
  const t = i / RATE
  return Math.exp(-t / .018) * Math.sin(TAU * 820 * t) + .45 * Math.exp(-t / .005) * Math.sin(TAU * 2350 * t)
})
const knock = (x, at, gain) => { for (let i = 0; i < TICK.length; i++) x[(at + i) % x.length] += gain * TICK[i] }

// L layers of one pulse, tempos `ratio` apart, all speeding up by `ratio` each cycle, each as loud as the envelope says
// at its place. Layer k's beat count is N·r^k·(r^(t/T) − 1): N whole beats of the slowest layer per cycle make the cycle
// T = N·ln r / slowest tempo, and make every beat of a layer a beat of the layer above, so nothing flams. After a cycle
// every layer stands where the one above it started: the sound loops. The tempo in the bell's middle is `centre` beats
// a second.
export function risset({ layers = 4, ratio = 2, envelope = 'bell', centre = 2, cycle = 10 } = {}) {
  const L = layers, r = ratio, shape = envelopes[envelope], slowest = centre / r ** (L / 2)
  const N = Math.max(1, Math.round(slowest * cycle / Math.log(r))), T = N * Math.log(r) / slowest
  const n = Math.round(T * RATE), x = new Float32Array(n), beats = []
  for (let k = 0; k < L; k++) for (let m = 0, count = N * r ** k * (r - 1); m < count; m++) {
    const t = T * Math.log1p(m / (N * r ** k)) / Math.log(r), gain = shape(k + t / T, L)
    beats.push({ k, t, gain, tempo: slowest * r ** (k + t / T) })
    if (gain) knock(x, Math.round(t * RATE), gain)
  }
  level([x])
  return { x, beats, T, slowest, L, r, shape, seconds: n / RATE }
}

// ── Deutsch's scale illusion ────────────────────────────────────

// C major as Deutsch (1975) gives it, equal-tempered at A = 435 Hz: C D E F G A B C′
export const NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C′']
export const HZ = [259, 290, 326, 345, 388, 435, 488, 517]
// The scale up and the scale down at once, note i of the one going up to the right ear when i is even, to the left when
// odd, note i of the one going down to the other ear (the paper's Fig. 1a): left C′ D A F F A D C′, right C B E G G E B C
export const EARS = (() => {
  const left = [], right = []
  for (let i = 0; i < 8; i++) { (i % 2 ? left : right).push(i); (i % 2 ? right : left).push(7 - i) }
  return { left, right }
})()

// The stimulus: sines of one level, 250 ms a note with no gaps, the eight notes ten times without pause. Each ear is one
// sine whose frequency steps at every note, its phase unbroken, so the steps don't click; 10 ms fades at the very ends.
// `ears`: both, left or right only; `swap`: the channels exchanged, as when the headphones are turned round.
export function scale({ ears = 'both', swap = false, repeats = 10, tone = .25 } = {}) {
  const len = Math.round(tone * RATE), n = 8 * repeats * len, fade = Math.round(.01 * RATE)
  const play = notes => {
    const x = new Float32Array(n)
    for (let i = 0, phase = 0; i < n; i++) {
      phase += TAU * HZ[notes[Math.floor(i / len) % 8]] / RATE
      x[i] = PEAK * Math.min(1, i / fade, (n - i) / fade) * Math.sin(phase)
    }
    return x
  }
  let L = play(EARS.left), R = play(EARS.right)
  if (swap) [L, R] = [R, L]
  if (ears === 'left') R.fill(0)
  if (ears === 'right') L.fill(0)
  return { channels: [L, R], tone, seconds: n / RATE }
}

// ── Binaural beats ──────────────────────────────────────────────

// `carrier` Hz to the left ear, carrier + `beat` to the right: each ear's own tone; both tones in both ears, as a mono
// output mixes them; or one ear alone. Whole cycles of both tones in two seconds (carrier a whole number of Hz, the beat
// a multiple of 0.5 Hz), so the two seconds loop.
export function binaural({ carrier = 250, beat = 4, ears = 'own', seconds = 2 } = {}) {
  const n = Math.round(seconds * RATE), L = new Float32Array(n), R = new Float32Array(n), a = TAU * carrier / RATE, b = TAU * (carrier + beat) / RATE
  for (let i = 0; i < n; i++) {
    const p = Math.sin(a * i), q = Math.sin(b * i)
    if (ears === 'both') L[i] = R[i] = PEAK * (p + q) / 2
    else { if (ears !== 'right') L[i] = PEAK * p; if (ears !== 'left') R[i] = PEAK * q }
  }
  return { channels: [L, R], carrier, beat, seconds }
}

// Left, then right: three knocks of noise in the left channel alone, a pause, three in the right alone. `at`: when each
// side's knocks start and end, in seconds
export function sides() {
  const n = Math.round(2.2 * RATE), L = new Float32Array(n), R = new Float32Array(n), burst = Math.round(.12 * RATE)
  let s = 7, last = 0
  const noise = () => (s = s * 16807 % 2147483647) / 2147483647 * 2 - 1
  for (const [x, start] of [[L, .05], [R, 1.15]]) for (let j = 0; j < 3; j++) {
    const at = Math.round((start + j * .3) * RATE)
    for (let i = 0; i < burst; i++) {
      const v = noise(), env = Math.sin(Math.PI * i / burst) ** 2
      x[at + i] = PEAK * env * (.7 * v + .3 * last)
      last = v
    }
  }
  return { channels: [L, R], at: { left: [.05, .95], right: [1.15, 2.05] }, seconds: n / RATE }
}

// ── Additive synthesis ──────────────────────────────────────────

// One sine per harmonic: amps[k − 1] the level of harmonic k of f0 (a whole number of Hz, so the second loops), summed;
// a level of 1 reaches −6 dBFS alone, and a sum that would go past −6 dBFS is brought down to it. Harmonics at or past
// the Nyquist frequency are left out.
export function additive(amps, f0, seconds = 1) {
  const n = Math.round(seconds * RATE), x = new Float32Array(n)
  amps.forEach((a, j) => {
    const w = TAU * (j + 1) * f0 / RATE
    if (a && (j + 1) * f0 < RATE / 2) for (let i = 0; i < n; i++) x[i] += PEAK * a * Math.sin(w * i)
  })
  return level([x], { under: true })[0]
}
