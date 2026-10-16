// Audio in JavaScript: the player (an Audio element and what it reports), the equalizer (three BiquadFilterNodes and an
// AnalyserNode), what this browser decodes and records, and the equalized loop rendered offline into a WAV file (wav.js).
// Sound starts only from the Play buttons; nothing makes an AudioContext before one is pressed.
import { RATE, sound, panel, css, MONO } from '../kit.js'
import { wav } from './wav.js'

const $ = s => document.querySelector(s)
const still = matchMedia('(prefers-reduced-motion: reduce)')
const clock = t => isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '–:––'
const minus = s => String(s).replace('-', '−')
// draw when first near the screen, and again on resize
function near(el, draw) {
  let seen = false
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen) { seen = true; draw() } }, { rootMargin: '200px' }).observe(el)
  addEventListener('resize', () => seen && draw())
}
// a pressed-button group ([data-name]): the pressed one's value to f
function group(el, f) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button')
    if (!b) return
    for (const x of el.querySelectorAll('button')) x.setAttribute('aria-pressed', x === b)
    f(b.dataset.value)
  })
}

// ── 1. new Audio() ──────────────────────────────────────────────

const audio = new Audio('/lab/words-under-the-waveform/speech.mp3')
const play = $('#play'), seek = $('#seek'), volume = $('#volume'), time = $('#time'), strip = $('#player canvas')
audio.volume = +volume.value

play.onclick = () => audio.paused ? audio.play() : audio.pause()
seek.oninput = () => audio.currentTime = +seek.value
volume.oninput = () => audio.volume = +volume.value
group($('#player [data-name="rate"]'), v => audio.playbackRate = +v)

audio.addEventListener('loadedmetadata', () => seek.max = audio.duration)
audio.addEventListener('timeupdate', () => seek.value = audio.currentTime)
for (const type of ['play', 'pause']) audio.addEventListener(type, () => play.textContent = audio.paused ? 'Play' : 'Pause')

// each event counted as it fires, the latest marked
const EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'timeupdate', 'pause', 'seeking', 'seeked', 'ratechange', 'volumechange', 'ended', 'error']
const counts = Object.fromEntries(EVENTS.map(e => [e, 0])), log = $('#events')
log.innerHTML = EVENTS.map(e => `<span data-event="${e}">${e} <b>0</b></span>`).join('')
for (const type of EVENTS) audio.addEventListener(type, () => {
  counts[type]++
  log.querySelector('.fresh')?.classList.remove('fresh')
  const el = log.querySelector(`[data-event="${type}"]`)
  el.lastChild.textContent = counts[type]
  el.classList.add('fresh')
})

// what the element reports, drawn: the whole file as a line, what has downloaded (buffered), what has played, where it is
function drawPlayer() {
  const { ctx, W, H, dpr, T } = panel(strip, 76), d = audio.duration, x0 = 12 * dpr, x1 = W - 12 * dpr, y = 46 * dpr
  const at = t => x0 + (isFinite(d) && d ? t / d : 0) * (x1 - x0)
  const bar = (ranges, color, h) => { ctx.fillStyle = css(color); for (let i = 0; i < ranges.length; i++) ctx.fillRect(at(ranges.start(i)), y - h / 2, Math.max(dpr, at(ranges.end(i)) - at(ranges.start(i))), h) }
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(x0, y - dpr / 2, x1 - x0, dpr)
  bar(audio.buffered, T.ink3, 6 * dpr)
  bar(audio.played, T.ink, 6 * dpr)
  ctx.fillStyle = css(T.accent)
  ctx.fillRect(Math.round(at(audio.currentTime) - dpr), y - 12 * dpr, 2 * dpr, 24 * dpr)
  ctx.font = `${11 * dpr}px ${MONO}`
  ctx.fillStyle = css(T.ink2)
  ctx.fillText(`${audio.paused ? 'paused' : 'playing'} · ${audio.currentTime.toFixed(1)} / ${isFinite(d) ? d.toFixed(1) : '?'} s · ${audio.playbackRate}× · volume ${audio.volume.toFixed(2)}`, x0, 20 * dpr)
  time.textContent = `${clock(audio.currentTime)} / ${clock(d)}`
  seek.setAttribute('aria-valuetext', time.textContent)
}
for (const type of ['progress', 'durationchange', 'timeupdate', 'play', 'pause', 'seeked', 'ratechange', 'volumechange', 'ended']) audio.addEventListener(type, drawPlayer)
near(strip, drawPlayer)

// Has the page had a click, tap or key press? Browsers keep sound off until it has. Read, never tried: no sound at load.
const autoplay = $('#autoplay')
function activation() {
  const active = navigator.userActivation?.hasBeenActive, policy = navigator.getAutoplayPolicy?.('mediaelement')
  autoplay.innerHTML = (active == null ? 'This browser does not report whether the page has had a gesture.'
    : `<code>navigator.userActivation.hasBeenActive</code>: <b>${active}</b>, ${active ? 'a click, tap or key press has reached this page.' : 'nothing has been clicked, tapped or pressed here yet.'}`)
    + (policy ? ` <code>navigator.getAutoplayPolicy('mediaelement')</code>: <b>${policy}</b>.` : '')
}
activation()
for (const type of ['pointerup', 'keyup']) addEventListener(type, () => setTimeout(activation), { capture: true })

// ── 2. The equalizer ────────────────────────────────────────────

const BANDS = [['bass', 'lowshelf', 200], ['mid', 'peaking', 1000], ['treble', 'highshelf', 4000]]
const eqFigure = $('#eq'), eqCanvas = eqFigure.querySelector('canvas'), toggle = $('#eq-play'), level = $('#level'), picker = $('#loop'), eqNote = $('#eq-note')
const gains = () => Object.fromEntries(BANDS.map(([name]) => [name, +eqFigure.querySelector(`[name="${name}"]`).value]))
// three filters in a row on any context, the first to connect a source to, the last to connect on
const equalizer = (ctx, g = gains()) => {
  const f = BANDS.map(([name, type, frequency]) => new BiquadFilterNode(ctx, { type, frequency, Q: 1, gain: g[name] }))
  f.reduce((a, b) => a.connect(b))
  return f
}
// the sound looped: the drums made here, 6 dB down to leave room for boosts, or a file decoded
const DRUMS = { name: 'Drum loop, made in this page', channels: [sound('drums').map(v => v / 2)], sampleRate: RATE }
let loop = DRUMS, file = null
// the live graph, made on the first Play; until then the filters' curve comes from an offline context
let ctx = null, filters = null, analyser = null, out = null, source = null, frame = 0
const plot = equalizer(new OfflineAudioContext(1, 1, RATE))
// the channels as an AudioBuffer, the first n samples (an AudioBuffer belongs to no context)
const buffer = ({ channels, sampleRate }, n = channels[0].length) => {
  const b = new AudioBuffer({ numberOfChannels: channels.length, length: n, sampleRate })
  channels.forEach((c, i) => b.copyToChannel(c.subarray(0, n), i))
  return b
}
function start() {
  if (!ctx) {
    ctx = new AudioContext()
    filters = equalizer(ctx)
    analyser = new AnalyserNode(ctx, { fftSize: 4096 })
    out = new GainNode(ctx, { gain: +level.value })
    filters.at(-1).connect(analyser).connect(out).connect(ctx.destination)
  }
  ctx.resume()
  source = new AudioBufferSourceNode(ctx, { buffer: buffer(loop), loop: true })
  source.connect(filters[0])
  source.start()
  toggle.textContent = 'Stop'
  tick()
}
function stop() {
  source?.stop()
  source?.disconnect()
  source = null
  toggle.textContent = 'Play'
  cancelAnimationFrame(frame)
  clearTimeout(frame)
  drawEQ()
}
toggle.onclick = () => source ? stop() : start()
level.oninput = () => out && (out.gain.value = +level.value)
eqFigure.addEventListener('input', e => {
  const band = BANDS.findIndex(([name]) => name === e.target.name)
  if (band < 0) return
  e.target.nextElementSibling.value = minus(`${+e.target.value > 0 ? '+' : ''}${e.target.value} dB`)
  for (const f of [plot, filters]) if (f) f[band].gain.value = +e.target.value
  if (!source) drawEQ()
})
for (const input of eqFigure.querySelectorAll('[name]')) input.nextElementSibling.value = minus(`${+input.value > 0 ? '+' : ''}${input.value} dB`)
// while it plays, the spectrum each frame; four a second when motion is to be kept down
function tick() {
  drawEQ()
  if (source) frame = still.matches ? setTimeout(tick, 250) : requestAnimationFrame(tick)
}

// 20 Hz to 20 kHz across, in octaves; the spectrum −120 to −10 dB up; the filters' curve ±15 dB about the middle
const LO = 20, SPAN = Math.log(20000 / LO)
let freqs = null, spectrum = null
function drawEQ() {
  const { ctx: g, W, H, dpr, T } = panel(eqCanvas, 240), pad = 14 * dpr, mid = H / 2
  const fx = f => Math.log(f / LO) / SPAN * W, curveY = db => mid - db / 15 * (mid - pad)
  if (freqs?.length !== W) freqs = Float32Array.from({ length: W }, (_, x) => LO * Math.exp((x + .5) / W * SPAN))
  g.lineWidth = dpr
  g.strokeStyle = css(T.rule)
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { g.beginPath(); g.moveTo(fx(f), 0); g.lineTo(fx(f), H); g.stroke() }
  for (const db of [12, 0, -12]) { g.beginPath(); g.moveTo(0, curveY(db)); g.lineTo(W, curveY(db)); g.stroke() }
  // the spectrum now: per column, the loudest bin it spans
  if (source && analyser) {
    const bins = analyser.frequencyBinCount, hz = ctx.sampleRate / 2 / bins
    if (spectrum?.length !== bins) spectrum = new Float32Array(bins)
    analyser.getFloatFrequencyData(spectrum)
    g.fillStyle = css(T.ink3, .6)
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x < W; x++) {
      const a = Math.floor(LO * Math.exp(x / W * SPAN) / hz), b = Math.max(a + 1, Math.ceil(LO * Math.exp((x + 1) / W * SPAN) / hz))
      let db = -Infinity
      for (let k = a; k < b && k < bins; k++) db = Math.max(db, spectrum[k])
      g.lineTo(x, H - Math.max(0, Math.min(1, (db + 120) / 110)) * H)
    }
    g.lineTo(W, H)
    g.fill()
  }
  // the three filters together: their magnitudes multiplied
  const total = new Float32Array(W).fill(1), mag = new Float32Array(W), phase = new Float32Array(W)
  for (const f of filters ?? plot) { f.getFrequencyResponse(freqs, mag, phase); for (let x = 0; x < W; x++) total[x] *= mag[x] }
  g.strokeStyle = css(T.accent)
  g.lineWidth = 2 * dpr
  g.beginPath()
  for (let x = 0; x < W; x++) { const y = curveY(20 * Math.log10(total[x])); x ? g.lineTo(x, y) : g.moveTo(x, y) }
  g.stroke()
  // the scales last, over all of it
  g.font = `${11 * dpr}px ${MONO}`
  g.fillStyle = css(T.ink2)
  for (const f of [100, 1000, 10000]) {
    const label = f < 1000 ? `${f} Hz` : `${f / 1000} kHz`
    g.fillText(label, Math.min(fx(f) + 4 * dpr, W - g.measureText(label).width - 4 * dpr), H - 6 * dpr)
  }
  for (const db of [12, 0, -12]) g.fillText(minus(`${db > 0 ? '+' : ''}${db} dB`), 6 * dpr, curveY(db) - 4 * dpr)
}
near(eqCanvas, drawEQ)

// the sound to loop: the drums, or a file opened here, decoded offline at the kit's rate (no context needed for it)
picker.append(new Option(DRUMS.name, 'drums'))
function use(next) {
  loop = next
  eqNote.textContent = describe(next)
  if (source) { stop(); start() }
  drawRender()
}
const describe = ({ channels, sampleRate, name }) => `${name}: ${channels.length === 1 ? 'mono' : channels.length + ' channels'}, ${(channels[0].length / sampleRate).toFixed(1)} s, ${(channels[0].length * channels.length * 4 / 1e6).toFixed(1)} MB as 32-bit floats.`
picker.onchange = () => use(picker.value === 'file' && file ? file : DRUMS)
$('#file').onchange = async e => {
  const f = e.target.files[0]
  if (!f) return
  eqNote.textContent = `Decoding ${f.name}…`
  try {
    const b = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await f.arrayBuffer())
    file = { name: f.name, channels: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), sampleRate: b.sampleRate }
    const option = picker.querySelector('option[value="file"]') || picker.appendChild(new Option('', 'file'))
    option.textContent = f.name
    picker.value = 'file'
    use(file)
  } catch (err) { eqNote.textContent = `This browser could not decode ${f.name}: ${err.name}.` }
}
eqNote.textContent = describe(DRUMS)

// ── 3. What this browser reads and records ──────────────────────

const FORMATS = [
  ['WAV', 'probe.wav', ['audio/wav']],
  ['MP3', 'probe.mp3', ['audio/mpeg']],
  ['FLAC', 'probe.flac', ['audio/flac']],
  ['Ogg Vorbis', 'probe.ogg', ['audio/ogg;codecs=vorbis']],
  ['Opus', 'probe.opus', ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus']],
  ['AAC', 'probe.m4a', ['audio/mp4;codecs=mp4a.40.2']]
]
const formats = $('#formats tbody')
near(formats, async function probe() {
  if (formats.dataset.done) return
  formats.dataset.done = 1
  const records = t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
  for (const [name, path, types] of FORMATS) {
    let read, samples = '–'
    try {
      const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(new URL('probe/' + path, import.meta.url))).arrayBuffer())
      read = 'yes'
      samples = b.length.toLocaleString('en')
    } catch (err) { read = `no, ${err.name}` }
    const rec = types.filter(records)
    formats.insertAdjacentHTML('beforeend', `<tr><th scope="row">${name}</th><td class="${read === 'yes' ? '' : 'no'}">${read}</td><td>${samples}</td><td class="${rec.length ? '' : 'no'}">${rec.length ? rec.map(t => `<code>${t.replace(";", ";<wbr>")}</code>`).join("<br>") : 'no'}</td></tr>`)
  }
})

// ── 3. The loop through the equalizer, rendered offline, saved as WAV ──

const renderFigure = $('#render'), renderCanvas = renderFigure.querySelector('canvas'), link = $('#download'), renderNote = $('#render-note')
const LIMIT = 60
let rendered = null
// lowest to highest per pixel column, in a lane of height h about y
function envelope(g, x, W, y, h, color) {
  g.fillStyle = color
  for (let c = 0; c < W; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / W), end = Math.floor((c + 1) * x.length / W); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    g.fillRect(c, y - hi * h / 2, 1, Math.max(1, (hi - lo) * h / 2))
  }
}
// two lanes: the sound as it is, above; rendered through the equalizer, below
function drawRender() {
  const { ctx: g, W, H, dpr, T } = panel(renderCanvas, 200), n = Math.min(loop.channels[0].length, LIMIT * loop.sampleRate), lane = H / 2, label = 20 * dpr
  const mid = top => top + label + (lane - label) / 2, h = (lane - label) * .9
  envelope(g, loop.channels[0].subarray(0, n), W, mid(0), h, css(T.ink3))
  if (rendered?.from === loop) envelope(g, rendered.data, W, mid(lane), h, css(T.accent))
  g.fillStyle = css(T.rule)
  g.fillRect(0, Math.round(lane), W, dpr)
  g.font = `${11 * dpr}px ${MONO}`
  g.fillStyle = css(T.ink2)
  g.fillText('before', 6 * dpr, 14 * dpr)
  g.fillText('after', 6 * dpr, lane + 14 * dpr)
}
near(renderCanvas, drawRender)
$('#render-go').onclick = async () => {
  const { channels, sampleRate } = loop, n = Math.min(channels[0].length, LIMIT * sampleRate)
  const offline = new OfflineAudioContext(channels.length, n, sampleRate)
  const src = new AudioBufferSourceNode(offline, { buffer: buffer(loop, n) }), f = equalizer(offline)
  src.connect(f[0])
  f.at(-1).connect(offline.destination)
  src.start()
  const t0 = performance.now(), result = await offline.startRendering(), ms = performance.now() - t0
  const bytes = wav(result)
  rendered = { from: loop, data: result.getChannelData(0) }
  if (link.href) URL.revokeObjectURL(link.href)
  link.href = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  link.hidden = false
  link.textContent = `Save equalized.wav, ${Math.round(bytes.length / 1000).toLocaleString('en')} KB`
  // floats run past 1; 16-bit samples stop there
  let peak = 0
  for (let c = 0; c < result.numberOfChannels; c++) for (const v of result.getChannelData(c)) peak = Math.max(peak, Math.abs(v))
  const over = 20 * Math.log10(peak), { bass, mid, treble } = gains()
  renderNote.textContent = `${(n / sampleRate).toFixed(1)} s rendered in ${ms < 1 ? 'under 1 ms' : ms.toFixed(0) + ' ms'}${n < channels[0].length ? `, the first ${LIMIT} s` : ''}; bass ${minus(bass)}, mid ${minus(mid)}, treble ${minus(treble)} dB. `
    + (peak > 1 ? `Its peak is ${over.toFixed(1)} dB over full scale: the file clips there. Lower the boosts.` : `Its peak is ${minus(over.toFixed(1))} dBFS.`)
  drawRender()
}
