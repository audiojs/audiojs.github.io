// Hearing what isn't there: the sounds come from sounds.js, play from AudioBuffers of those very samples, and each figure
// is drawn from the samples its Play button plays. One voice sounds at a time; a control moved while it plays hands
// over to the new sound at the same place in its loop.
import { RATE, panel, demo, css, fft, window, at, of, MONO } from '../kit.js'
import { reassigned, picture } from '../spectrogram/spectra.js'
import { PEAK, shepard, risset, scale, binaural, sides, additive, NOTES, HZ } from './sounds.js'

const $ = (s, el = document) => el.querySelector(s)
const still = matchMedia('(prefers-reduced-motion: reduce)')
const minus = s => String(s).replace('-', '−')
// a figure's controls as kit.js's demo() reads them, for a Play pressed before the figure first drew
function values(figure) {
  const v = {}
  for (const el of figure.querySelectorAll('input[name]')) v[el.name] = el.type === 'checkbox' ? el.checked : +el.value
  for (const g of figure.querySelectorAll('[data-name]')) v[g.dataset.name] = g.querySelector('[aria-pressed="true"]')?.dataset.value
  return v
}

// ── Sound out ───────────────────────────────────────────────────

const volume = $('#volume'), stopButton = $('#stop'), status = $('#now')
const gainOf = () => 10 ** (volume.value / 20), FADE = .012
let ctx = null, master = null, voice = null
volume.addEventListener('input', () => {
  $('#level').value = `${minus(volume.value)} dB`
  master?.gain.setTargetAtTime(gainOf(), ctx.currentTime, FADE)
})
// Made on the first press (browsers start audio only on a gesture): the context and the volume every voice goes through
function out() {
  if (!ctx) {
    // iOS plays Web Audio as ambient sound, silenced by the ring switch, unless the page says it is playback
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch {}
    ctx = new AudioContext()
    master = new GainNode(ctx, { gain: gainOf() })
    master.connect(ctx.destination)
    const n = ctx.destination.maxChannelCount
    $('#channels').value = !n ? 'nothing (this browser does not say)' : n > 1 ? `${n} output channels: the browser can send stereo` : '1 output channel: mono'
  }
  if (ctx.state !== 'running') ctx.resume()
  return ctx
}
// Plays channels as voice `id`. The voice playing as `id` already hands over: the new sound starts where the old one
// is (in its loop, scaled to the new length), each fading over a few ms
function play(id, channels, { loop = true, label = id } = {}) {
  const c = out(), when = c.currentTime + .03
  const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: RATE })
  channels.forEach((x, i) => buffer.copyToChannel(x, i))
  let offset = 0
  if (voice?.id === id) { const u = (when - voice.start) / voice.dur; offset = (voice.loop ? u % 1 : Math.min(u, 1)) * buffer.duration }
  release(when)
  const src = new AudioBufferSourceNode(c, { buffer, loop }), gain = new GainNode(c, { gain: 0 })
  src.connect(gain).connect(master)
  gain.gain.setTargetAtTime(1, when, FADE)
  src.start(when, offset)
  const v = voice = { id, src, start: when - offset, dur: buffer.duration, loop, label, gain }
  src.onended = () => { if (voice === v) { voice = null; changed() } }
  changed()
}
function release(when) {
  if (!voice) return
  const { src, gain } = voice
  gain.gain.cancelScheduledValues(when)
  gain.gain.setTargetAtTime(0, when, FADE)
  src.stop(when + 10 * FADE)
  voice = null
}
function stop() { if (ctx) release(ctx.currentTime); changed() }
stopButton.addEventListener('click', stop)
addEventListener('keydown', e => { if (e.key === 'Escape' && voice) stop() })

// What each voice plays, made from its figure's controls; a Play button names its voice (data-voice, or the figure's id)
const sources = {}
const replay = id => { if (voice?.id === id) start(id) }
function start(id) {
  if (!globalThis.AudioContext) return void (status.textContent = 'This browser has no Web Audio API: nothing here can play.')
  const s = sources[id]()
  play(id, s.channels, s)
}
for (const b of document.querySelectorAll('[data-voice]')) {
  b.dataset.label = b.textContent
  b.addEventListener('click', () => { const id = b.dataset.voice || b.closest('figure').id; voice?.id === id ? stop() : start(id) })
}
// Playheads: each figure's head(t) draws it t seconds into its voice, every frame while it plays (once, where motion
// is reduced), and head(null) takes it off
const heads = {}
let frame = 0, drawn = null
function changed() {
  for (const b of document.querySelectorAll('[data-voice]')) {
    const on = voice?.id === (b.dataset.voice || b.closest('figure').id)
    b.setAttribute('aria-pressed', on)
    b.textContent = on ? 'Stop' : b.dataset.label
  }
  stopButton.disabled = !voice
  status.textContent = voice ? `Playing: ${voice.label}` : 'Nothing playing'
  if (drawn && drawn !== voice?.id) heads[drawn]?.(null)
  drawn = null
  if (voice && !frame) frame = requestAnimationFrame(tick)
  checking()
}
function tick() {
  frame = 0
  if (!voice) return
  drawn = voice.id
  heads[voice.id]?.(Math.max(0, ctx.currentTime - voice.start))
  if (!still.matches) frame = requestAnimationFrame(tick)
}

// Left, then right: the button says which side should be sounding
let checkTimers = []
function checking(button) {
  checkTimers.forEach(clearTimeout)
  checkTimers = []
  for (const b of document.querySelectorAll('[data-check]')) b.textContent = 'Left, then right'
  if (!button || voice?.id !== 'check') return
  const { at } = sources.check()
  const say = (text, ms) => checkTimers.push(setTimeout(() => { button.textContent = text; status.textContent = `Playing: ${text}` }, ms))
  say('◂ left', at.left[0] * 1000)
  say('right ▸', at.right[0] * 1000)
}
let checkSound = null
sources.check = () => checkSound ??= { ...sides(), loop: false, label: 'left, then right' }
for (const b of document.querySelectorAll('[data-check]')) b.addEventListener('click', () => { if (voice?.id === 'check') stop(); start('check'); checking(b) })

// ── Drawing ─────────────────────────────────────────────────────

const label = (g, text, x, y, color, dpr, align = 'left') => { g.font = `${11 * dpr}px ${MONO}`; g.textAlign = align; g.fillStyle = color; g.fillText(text, x, y); g.textAlign = 'left' }
function dashed(g, x, y0, y1, color, dpr) {
  g.save(); g.strokeStyle = color; g.lineWidth = dpr; g.setLineDash([4 * dpr, 4 * dpr])
  g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.restore()
}
// a figure's picture kept, so a playhead can be drawn over it and taken off again
const keep = p => ({ ...p, image: p.ctx.getImageData(0, 0, p.W, p.H) })
const restore = p => p.ctx.putImageData(p.image, 0, 0)
function playhead(p, x, top = 0, bottom = p.H) { p.ctx.fillStyle = css(p.T.ink); p.ctx.fillRect(Math.round(x - p.dpr / 2), top, Math.max(1, Math.round(p.dpr)), bottom - top) }

// ── 1. Shepard tone ─────────────────────────────────────────────

const shepardFigure = $('#shepard'), HI = 16000, STRIP = 76
let shepardSound = null, sp = null
const makeShepard = v => shepardSound = shepard({ octaves: v.octaves, envelope: v.envelope, glide: v.mode === 'glide' })
sources.shepard = () => ({ channels: [(shepardSound ?? makeShepard(values(shepardFigure))).x], label: shepardSound.glide ? 'Shepard–Risset glissando' : 'Shepard tone' })
demo(shepardFigure, v => {
  const { x, low, K, shape } = makeShepard(v), p = panel($('canvas', shepardFigure), 260, 1), { ctx: g, W, H, T } = p, w = W - STRIP
  // the spectrogram of two loops, one after the other
  const twice = new Float32Array(2 * x.length)
  twice.set(x); twice.set(x, x.length)
  picture(g, reassigned(twice, w, H, { size: 4096, scale: 'log', hi: HI }), w, H, { map: 'ink', range: 40, scale: 'log', hi: HI, T })
  dashed(g, w / 2, 18, H, css(T.ink3), 1)
  label(g, 'loop', w / 2 + 5, 13, css(T.ink3), 1)
  // the bell: each sine's level by its frequency, on the spectrogram's axis
  const yOf = f => H - at('log', f, HI) * H, xOf = a => w + 10 + a * (STRIP - 20)
  g.fillStyle = css(T.rule); g.fillRect(w, 0, 1, H)
  const bell = new Path2D()
  for (let y = 0; y <= H; y++) { const u = Math.log2(of('log', 1 - y / H, HI) / low); bell.lineTo(xOf(shape(u, K)), y) }
  const area = new Path2D(bell)
  area.lineTo(xOf(0), H); area.lineTo(xOf(0), 0); area.closePath()
  g.fillStyle = css(T.accent, .18); g.fill(area)
  g.strokeStyle = css(T.accent); g.lineWidth = 1.5; g.stroke(bell)
  label(g, 'level', w + 10, 13, css(T.ink3), 1)
  sp = keep({ ...p, w, yOf, xOf, low, K, shape })
  heads.shepard(null)
  replay('shepard')
})
// the playhead on the two loops, and on the bell, where each sine is now
heads.shepard = t => {
  if (!sp) return
  restore(sp)
  const { ctx: g, w, H, T, yOf, xOf, low, K, shape } = sp, u = t == null ? 0 : t / shepardSound.seconds % 2
  if (t != null) playhead(sp, u / 2 * w)
  const frac = shepardSound.glide ? u % 1 : Math.floor(u % 1 * 12) / 12
  g.fillStyle = css(T.accent)
  for (let k = 0; k < K; k++) {
    const a = shape(k + frac, K), y = yOf(low * 2 ** (k + frac))
    if (y > 0 && y < H) { g.globalAlpha = .35 + .65 * a; g.beginPath(); g.arc(xOf(a), y, 3.5, 0, 2 * Math.PI); g.fill() }
  }
  g.globalAlpha = 1
}

// ── 2. Risset rhythm ────────────────────────────────────────────

const rissetFigure = $('#risset')
let rissetSound = null, rp = null
const makeRisset = v => rissetSound = risset({ layers: v.layers, ratio: +v.ratio, envelope: v.envelope })
sources.risset = () => ({ channels: [(rissetSound ?? makeRisset(values(rissetFigure))).x], label: 'Risset rhythm' })
demo(rissetFigure, v => {
  const { x, beats, T: cycle, slowest, L, r } = makeRisset(v), p = panel($('canvas', rissetFigure), 280), { ctx: g, W, H, dpr, T } = p
  const left = 52 * dpr, wave = 46 * dpr, top = 8 * dpr, bottom = H - wave - 10 * dpr, pw = W - left
  const lo = Math.log2(slowest * .85), hi = Math.log2(slowest * r ** L / .85)
  const xOf = t => left + t / (2 * cycle) * pw, yOf = tempo => bottom - (Math.log2(tempo) - lo) / (hi - lo) * (bottom - top)
  // tempo marks, beats a minute
  g.fillStyle = css(T.rule)
  for (let bpm = 7.5; bpm < 4000; bpm *= 2) {
    const y = yOf(bpm / 60)
    if (y < top + 4 * dpr || y > bottom - 2 * dpr) continue
    g.fillRect(left, Math.round(y), pw, 1)
    label(g, `${bpm}`, left - 6 * dpr, y + 4 * dpr, css(T.ink3), dpr, 'right')
  }
  label(g, 'bpm', 4 * dpr, top + 10 * dpr, css(T.ink3), dpr)
  dashed(g, xOf(cycle), top, H, css(T.ink3), dpr)
  label(g, 'loop', xOf(cycle) + 5 * dpr, top + 10 * dpr, css(T.ink3), dpr)
  // the beats, two cycles: each as big and as bright as it is loud
  g.fillStyle = css(T.accent)
  for (const c of [0, 1]) for (const b of beats) {
    if (!b.gain) continue
    g.globalAlpha = .2 + .8 * b.gain
    g.beginPath(); g.arc(xOf(c * cycle + b.t), yOf(b.tempo), (1 + 2.5 * b.gain) * dpr, 0, 2 * Math.PI); g.fill()
  }
  g.globalAlpha = 1
  // the samples, lowest to highest per column, two cycles
  const mid = H - wave / 2 - 4 * dpr
  g.fillStyle = css(T.ink2)
  for (let col = 0; col < pw; col++) {
    let mn = 0, mx = 0
    for (let i = Math.floor(col / pw * 2 * x.length), end = Math.floor((col + 1) / pw * 2 * x.length); i < end; i++) { const s = x[i % x.length]; if (s < mn) mn = s; if (s > mx) mx = s }
    g.fillRect(left + col, mid - mx / PEAK * wave / 2, 1, Math.max(1, (mx - mn) / PEAK * wave / 2))
  }
  $('#cycle').textContent = `cycle ${cycle.toFixed(1)} s · ${Math.round(slowest * 60)} to ${Math.round(slowest * r ** L * 60)} beats a minute`
  rp = keep({ ...p, xOf, top })
  replay('risset')
})
heads.risset = t => { if (!rp) return; restore(rp); if (t != null) playhead(rp, rp.xOf(t % (2 * rissetSound.seconds)), rp.top) }

// ── 3. Deutsch's scale illusion ─────────────────────────────────

const scaleFigure = $('#scale')
let scaleSound = null, notes = null, scp = null
const makeScale = v => scaleSound = scale({ ears: v.ears, swap: v.swap })
sources.scale = () => ({ channels: (scaleSound ?? makeScale(values(scaleFigure))).channels, loop: false, label: 'the scale illusion' })
// each ear's eight notes, their frequencies measured from the samples: zero crossings inside each 250 ms
function measure(x, tone) {
  const len = Math.round(tone * RATE)
  return Array.from({ length: 8 }, (_, j) => {
    let first = -1, last = -1, count = 0
    for (let i = j * len + 200; i < (j + 1) * len - 200; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) { if (first < 0) first = i; else count++; last = i }
    return count / 2 / ((last - first) / RATE)
  })
}
demo(scaleFigure, v => {
  makeScale(v)
  // measured from both ears playing, so an ear set silent still shows what it would play
  const both = scale({ swap: v.swap, repeats: 1 })
  notes = both.channels.map(x => measure(x, both.tone))
  const p = panel($('canvas', scaleFigure), 250), { ctx: g, W, H, dpr, T } = p
  const left = 64 * dpr, top = 26 * dpr, bottom = H - 12 * dpr, pw = W - left - 8 * dpr, step = pw / 8
  const yOf = f => bottom - (Math.log2(f) - Math.log2(250)) / (Math.log2(530) - Math.log2(250)) * (bottom - top)
  const colour = [T.ink, T.accent], dim = [v.ears === 'right', v.ears === 'left']
  // the scale's notes, ruled across
  HZ.forEach((f, i) => { g.fillStyle = css(T.rule); g.fillRect(left, Math.round(yOf(f)), pw, 1); label(g, `${NOTES[i]} ${f}`, left - 8 * dpr, yOf(f) + 4 * dpr, css(T.ink3), dpr, 'right') })
  label(g, 'L left ear', left, 14 * dpr, css(T.ink, dim[0] ? .3 : 1), dpr)
  label(g, 'R right ear', left + 90 * dpr, 14 * dpr, css(T.accent, dim[1] ? .3 : 1), dpr)
  // joined by ear (as played) or by pitch (as heard): the higher note of each pair, and the lower
  const lines = v.lines === 'pitch' ? [notes[0].map((f, j) => Math.max(f, notes[1][j])), notes[0].map((f, j) => Math.min(f, notes[1][j]))] : notes
  lines.forEach((line, c) => {
    g.strokeStyle = css(v.lines === 'pitch' ? T.ink2 : colour[c], v.lines === 'pitch' ? .9 : dim[c] ? .15 : .55)
    g.lineWidth = 2 * dpr
    g.beginPath()
    line.forEach((f, j) => j ? g.lineTo(left + (j + .5) * step, yOf(f)) : g.moveTo(left + .5 * step, yOf(f)))
    g.stroke()
  })
  notes.forEach((ear, c) => ear.forEach((f, j) => {
    const x = left + j * step + 4 * dpr, y = yOf(f), h = 14 * dpr
    g.fillStyle = css(colour[c], dim[c] ? .2 : 1)
    g.beginPath(); g.roundRect(x, y - h / 2, step - 8 * dpr, h, 4 * dpr); g.fill()
    label(g, c ? 'R' : 'L', x + 5 * dpr, y + 4 * dpr, css(T.paper), dpr)
  }))
  scp = keep({ ...p, left, pw, top })
  replay('scale')
})
heads.scale = t => { if (!scp) return; restore(scp); if (t != null) playhead(scp, scp.left + t % 2 / 2 * scp.pw, scp.top - 6 * scp.dpr) }

// ── 4. Binaural beats ───────────────────────────────────────────

const binauralFigure = $('#binaural'), [lanesCanvas, phaseCanvas] = binauralFigure.querySelectorAll('canvas')
let binauralSound = null, bp = null
const makeBinaural = v => binauralSound = binaural({ carrier: v.carrier, beat: v.beat, ears: v.ears })
sources.binaural = () => ({ channels: (binauralSound ?? makeBinaural(values(binauralFigure))).channels, label: 'binaural beats' })
demo(binauralFigure, v => {
  const { channels, carrier, beat } = makeBinaural(v), p = panel(lanesCanvas, 150), { ctx: g, W, H, dpr, T } = p
  const left = 92 * dpr, pw = W - left, foot = 16 * dpr, lane = (H - foot) / 2, colour = [T.ink, T.accent], hz = [carrier, carrier + beat]
  // each ear's samples over the two seconds: its peak over two periods of the tone around each column, so a steady
  // tone draws steady
  const span = Math.max(1, Math.ceil(2 * RATE / carrier))
  channels.forEach((x, c) => {
    const mid = lane * c + lane / 2, half = lane / 2 - 8 * dpr
    g.fillStyle = css(T.rule); g.fillRect(left, Math.round(mid), pw, 1)
    g.fillStyle = css(colour[c])
    for (let col = 0; col < pw; col++) {
      const centre = Math.floor((col + .5) / pw * x.length)
      let e = 0
      for (let i = centre - (span >> 1); i < centre + (span >> 1); i++) e = Math.max(e, Math.abs(x[(i + x.length) % x.length]))
      g.fillRect(left + col, mid - e / PEAK * half, 1, Math.max(1, 2 * e / PEAK * half))
    }
    label(g, `${c ? 'R' : 'L'} ${hz[c]} Hz`, 8 * dpr, mid + 4 * dpr, css(colour[c]), dpr)
  })
  label(g, '0 s', left + 3 * dpr, H - 4 * dpr, css(T.ink3), dpr)
  label(g, '2 s', W - 3 * dpr, H - 4 * dpr, css(T.ink3), dpr, 'right')
  bp = keep({ ...p, left, pw })
  heads.binaural(null)
  replay('binaural')
})
// the playhead on the lanes, and both ears' waves at it: three periods of the left tone, overlaid
heads.binaural = t => {
  if (!bp) return
  restore(bp)
  const { channels: [L, R], carrier, beat, seconds } = binauralSound
  // at rest, the moment a quarter of a beat in: the waves a quarter turn apart
  const s = t == null ? Math.min(seconds / 2, .25 / beat) : t % seconds
  if (t != null) playhead(bp, bp.left + s / seconds * bp.pw)
  const p = panel(phaseCanvas, 110), { ctx: g, W, H, dpr, T } = p, n = Math.round(3 * RATE / carrier), i0 = Math.round(s * RATE), mid = H / 2, half = H / 2 - 18 * dpr
  g.fillStyle = css(T.rule); g.fillRect(0, Math.round(mid), W, 1)
  ;[[L, T.ink], [R, T.accent]].forEach(([x, colour]) => {
    g.strokeStyle = css(colour); g.lineWidth = 2 * dpr
    g.beginPath()
    for (let px = 0; px <= W; px += dpr) { const v = x[(i0 + Math.round(px / W * n)) % x.length] / PEAK; px ? g.lineTo(px, mid - v * half) : g.moveTo(px, mid - v * half) }
    g.stroke()
  })
  const ears = values(binauralFigure).ears, turn = Math.round(360 * (beat * s % 1))
  label(g, `${(s).toFixed(3)} s`, 8 * dpr, 14 * dpr, css(T.ink3), dpr)
  label(g, ears === 'own' ? `right ahead of left by ${turn}°` : ears === 'both' ? 'the same wave in both ears' : 'one ear only', W - 8 * dpr, 14 * dpr, css(T.ink2), dpr, 'right')
}

// ── 5. The missing fundamental, an additive synth ───────────────

const additiveFigure = $('#additive'), bars = $('#bars'), waveCanvas = additiveFigure.querySelectorAll('canvas')[1], N = 16
const PRESETS = {
  equal: k => k <= 10 ? 1 : 0,
  saw: k => 1 / k,
  square: k => k % 2 ? 1 / k : 0,
  three: k => k >= 3 && k <= 5 ? 1 : 0
}
const amps = Float32Array.from({ length: N }, (_, j) => PRESETS.equal(j + 1))
let picked = 1, tone = null, f0 = 200, lowest = 1, ap = null
const levels = () => Array.from(amps, (a, j) => j + 1 < lowest ? 0 : a)
sources.tone = () => ({ channels: [tone ?? additive(levels(), f0)], label: `the tone on ${f0} Hz, from harmonic ${lowest}` })
sources.sine = () => ({ channels: [additive([1], f0)], label: `a sine at ${f0} Hz` })
const redraw = demo(additiveFigure, v => {
  const was = f0
  f0 = v.f0; lowest = v.lowest
  tone = additive(levels(), f0)
  drawBars()
  drawWave()
  say()
  replay('tone')
  if (f0 !== was) replay('sine')
})
// The bars on a frequency axis, harmonic k at k·f0; behind them, the spectrum measured from the samples, scaled so its
// tallest peak meets the tallest bar
function drawBars() {
  const p = panel(bars, 210), { ctx: g, W, H, dpr, T } = p, top = 24 * dpr, bottom = H - 22 * dpr, ph = bottom - top
  const xOf = f => f / ((N + 1) * f0) * W, bw = Math.min(W / (N + 1) * .55, 26 * dpr), lv = levels()
  g.fillStyle = css(T.rule); g.fillRect(0, bottom, W, 1)
  // measured: a Hann frame of 8,192 samples, padded to eight times its length so peaks are read at their tops
  const frame = 8192, n = 8 * frame, w = window('hann', frame), re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < frame; i++) re[i] = tone[i] * w[i]
  fft(re, im)
  const mag = Float64Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k])), top1 = Math.max(...mag), tall = Math.max(...lv)
  // the bars
  for (let k = 1; k <= N; k++) {
    const x = xOf(k * f0) - bw / 2, a = amps[k - 1], h = a * ph, gone = k < lowest
    if (gone) {
      g.save(); g.setLineDash([3 * dpr, 3 * dpr]); g.strokeStyle = css(T.ink3); g.lineWidth = dpr
      g.strokeRect(x + dpr / 2, bottom - h, bw - dpr, h); g.restore()
    } else { g.fillStyle = css(T.ink, .8); g.fillRect(x, bottom - h, bw, h) }
    if (k === picked && document.activeElement === bars) { g.strokeStyle = css(T.accent); g.lineWidth = 2 * dpr; g.strokeRect(x - 3 * dpr, top - 4 * dpr, bw + 6 * dpr, ph + 4 * dpr) }
    label(g, `${k}`, x + bw / 2, H - 6 * dpr, css(gone ? T.ink3 : T.ink2), dpr, 'center')
  }
  if (top1 > 0 && tall > 0) {
    g.strokeStyle = css(T.accent); g.lineWidth = 1.5 * dpr
    g.beginPath()
    // each column the highest of the bins it spans, so no peak falls between columns
    const bin = px => Math.min(n / 2 - 1, Math.round(px / W * (N + 1) * f0 / RATE * n))
    for (let px = 0; px <= W; px += dpr) {
      let m = 0
      for (let k = bin(px), end = Math.max(k + 1, bin(px + dpr)); k < end; k++) m = Math.max(m, mag[k])
      const y = bottom - m / top1 * tall * ph
      px ? g.lineTo(px, y) : g.moveTo(px, y)
    }
    g.stroke()
  }
  // where the fundamental would be
  if (!lv[0]) {
    dashed(g, xOf(f0), 4 * dpr, bottom, css(T.accent), dpr)
    label(g, `f₀ ${f0} Hz: empty, yet the pitch`, xOf(f0) + 6 * dpr, 15 * dpr, css(T.accent), dpr)
  } else label(g, `f₀ ${f0} Hz`, xOf(f0) - bw / 2, 15 * dpr, css(T.ink2), dpr)
  label(g, 'harmonic', W - 4 * dpr, 14 * dpr, css(T.ink3), dpr, 'right')
  ap = { ...p, xOf, top, bottom, ph }
}
// Three periods of the samples, a dashed line at each period
function drawWave() {
  const p = panel(waveCanvas, 120), { ctx: g, W, H, dpr, T } = p, period = RATE / f0, n = 3 * period, mid = H / 2, half = H / 2 - 16 * dpr
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(tone[i]))
  for (let k = 0; k <= 3; k++) dashed(g, k * period / n * W, 18 * dpr, H, css(T.ink3), dpr)
  g.strokeStyle = css(T.ink); g.lineWidth = 1.5 * dpr
  g.beginPath()
  for (let px = 0; px <= W; px += dpr / 2) { const v = (tone[Math.round(px / W * n)] || 0) / (peak || 1); px ? g.lineTo(px, mid - v * half) : g.moveTo(px, mid - v * half) }
  g.stroke()
  label(g, `a period: 1/f₀ = ${(1000 / f0).toFixed(1)} ms`, 6 * dpr, 13 * dpr, css(T.ink2), dpr)
}
const say = () => { $('#picked').textContent = `harmonic ${picked}, ${picked * f0} Hz, level ${amps[picked - 1].toFixed(2)}${picked < lowest ? ', below the lowest: silent' : ''}` }

// Editing: drag across the bars to draw their levels; with the bars focused, ← → pick a harmonic, ↑ ↓ set its level
// (PageUp, PageDown in larger steps), 0 silences it, 1 sets it full
let dragging = null
function setAt(e) {
  if (!ap) return
  const r = bars.getBoundingClientRect(), x = (e.clientX - r.left) * ap.dpr, y = (e.clientY - r.top) * ap.dpr
  const k = Math.max(1, Math.min(N, Math.round(x / ap.W * (N + 1)))), a = Math.max(0, Math.min(1, (ap.bottom - y) / ap.ph))
  // across the bars between the last move and this one, the levels in between
  const [k0, a0] = dragging ?? [k, a]
  for (let j = Math.min(k0, k); j <= Math.max(k0, k); j++) amps[j - 1] = k === k0 ? a : a0 + (a - a0) * (j - k0) / (k - k0)
  dragging = [k, a]
  picked = k
  redraw()
}
bars.addEventListener('pointerdown', e => { if (e.button > 0) return; bars.setPointerCapture(e.pointerId); dragging = null; setAt(e) })
bars.addEventListener('pointermove', e => { if (dragging) setAt(e) })
for (const type of ['pointerup', 'pointercancel']) bars.addEventListener(type, () => { dragging = null })
bars.addEventListener('keydown', e => {
  const a = amps[picked - 1], set = v => { amps[picked - 1] = Math.max(0, Math.min(1, Math.round(v * 100) / 100)) }
  const keys = { ArrowLeft: () => picked = Math.max(1, picked - 1), ArrowRight: () => picked = Math.min(N, picked + 1), ArrowUp: () => set(a + .05), ArrowDown: () => set(a - .05), PageUp: () => set(a + .25), PageDown: () => set(a - .25), 0: () => set(0), 1: () => set(1), Home: () => picked = 1, End: () => picked = N }
  if (!keys[e.key]) return
  e.preventDefault()
  keys[e.key]()
  redraw()
})
for (const type of ['focus', 'blur']) bars.addEventListener(type, () => ap && drawBars())
for (const b of additiveFigure.querySelectorAll('[data-preset]')) b.addEventListener('click', () => { amps.forEach((_, j) => amps[j] = PRESETS[b.dataset.preset](j + 1)); redraw() })
