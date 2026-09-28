// Hearing a moment: the caret plays through an AudioWorklet (worklet.js); the bench (bench.js) plays one gesture with
// every method in a worker, times it and measures it. All of them run methods.js.
import { RATE, sounds, sound, panel, demo, css, fft, MONO } from '../kit.js'
import { methods } from './methods.js'
import { gesture, BLOCK } from './bench.js'

const $ = s => document.querySelector(s)
const figure = $('#scrub'), wave = figure.querySelector('.wave'), spec = figure.querySelector('.spectrum'), status = $('#status')
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v
const seconds = t => `${(t / RATE).toFixed(2)} s`, minus = s => s.replace('-', '−')

const state = { x: sound('voice'), name: sounds.voice.name, version: 0, caret: 0, method: 'hybrid', frame: 2048, overlap: 4, spread: 0, bands: 256, analysis: 'reassigned', line: 'rice', hold: false, pressed: false, keyed: false, heard: null }
const opts = () => ({ frame: state.frame, overlap: state.overlap, spread: state.spread, bands: state.bands, analysis: state.analysis, line: state.line })
const sounding = () => state.pressed || state.hold
const LINE = { band: 'noise bands', fm: 'FM lines', ou: 'drifting lines', rice: 'sines and noise' }

// ── Audio ───────────────────────────────────────────────────────

// Made on the first press (browsers start audio only on a gesture): the context, the analyser every sound passes
// through, and, once its module loads, the worklet voice
let ctx = null, analyser = null, node = null, ready = null, sample = null
function engine() {
  if (ready) return ready
  ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' })
  analyser = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: .8 })
  analyser.connect(ctx.destination)
  ready = ctx.audioWorklet.addModule(new URL('worklet.js', import.meta.url)).then(() => {
    node = new AudioWorkletNode(ctx, 'scrub', { numberOfInputs: 0, outputChannelCount: [1] })
    node.connect(analyser)
    node.port.onmessage = ({ data }) => { state.heard = data }
    node.port.postMessage({ x: state.x, method: state.method, opts: opts(), caret: state.caret, on: sounding() })
  }).catch(() => { status.textContent = 'This browser cannot run an AudioWorklet, so the caret stays silent. The bench still runs.' })
  return ready
}
const send = message => node?.port.postMessage(message)
const wake = () => { engine(); ctx.resume() }

// ── Sound ───────────────────────────────────────────────────────

const picker = $('#sound')
picker.append(...Object.keys(sounds).map(k => new Option(sounds[k].name, k)))
picker.value = 'voice'
picker.onchange = () => { if (sounds[picker.value]) use(sound(picker.value), sounds[picker.value].name) }
function use(x, name) {
  Object.assign(state, { x, name, heard: null, version: state.version + 1 })
  stop()
  send({ x })
  place(Math.round(.4 * x.length))
  measure()
}
// A file, dropped or opened: decoded at the kit's rate, channels averaged, the first five minutes
async function open(file) {
  engine()
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer()), n = Math.min(buffer.length, 300 * RATE), x = new Float32Array(n)
    for (let c = 0; c < buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < n; i++) x[i] += data[i] / buffer.numberOfChannels }
    const option = picker.querySelector('option[value="file"]') || picker.appendChild(new Option('', 'file'))
    option.textContent = file.name
    picker.value = 'file'
    use(x, file.name)
  } catch { status.textContent = `${file.name} could not be decoded here.` }
}
$('#file').onchange = e => { const file = e.target.files[0]; if (file) open(file) }
addEventListener('dragover', e => e.preventDefault())
addEventListener('drop', e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) open(file) })

// ── The caret ───────────────────────────────────────────────────

function place(caret) {
  state.caret = caret
  send({ caret })
  spectrum = null
  wave.setAttribute('aria-valuemax', (state.x.length / RATE).toFixed(2))
  wave.setAttribute('aria-valuenow', (caret / RATE).toFixed(2))
  wave.setAttribute('aria-valuetext', seconds(caret))
  describe()
  animate()
}
// The caret, how much of the sound the method listens to, and the settings its bench row ran with
function describe() {
  const [before, after] = reach(state.method), heard = Math.round((before + after) / RATE * 1000)
  $('#at').textContent = `caret ${(state.caret / RATE).toFixed(3)} s · hears ${heard ? heard + ' ms' : 'the head'} · frame ${state.frame} / ${state.overlap}, spread ± ${state.spread} ms · bank of ${state.bands}, ${state.analysis}, ${LINE[state.line]}`
}
const under = e => { const r = wave.getBoundingClientRect(); return Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * (state.x.length - 1)) }
function press(on) { state.pressed = on; send({ on: sounding() }); animate() }
wave.addEventListener('pointerdown', e => {
  if (e.button > 0) return
  wave.setPointerCapture(e.pointerId)
  stop()
  wake()
  place(under(e))
  press(true)
})
wave.addEventListener('pointermove', e => { if (state.pressed && !state.keyed) place(under(e)) })
for (const type of ['pointerup', 'pointercancel']) wave.addEventListener(type, () => { if (state.pressed && !state.keyed) press(false) })
// Keys: arrows move the caret and play while held (Shift: ten times further), Home and End jump, Space keeps playing,
// 1–8 pick a method
const hold = figure.querySelector('[name="hold"]'), buttons = [...figure.querySelectorAll('[data-name="method"] button')]
wave.addEventListener('keydown', e => {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 }[e.key]
  if (step || e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    stop()
    wake()
    const last = state.x.length - 1
    place(e.key === 'Home' ? 0 : e.key === 'End' ? last : clamp(state.caret + step * Math.round(RATE * (e.shiftKey ? .1 : .01)), 0, last))
    if (!state.keyed) { state.keyed = true; press(true) }
  } else if (e.key === ' ') { e.preventDefault(); hold.click() }
  else if (e.key.length === 1 && e.key >= '1' && e.key <= String(buttons.length)) buttons[e.key - 1].click()
})
wave.addEventListener('keyup', e => { if (state.keyed && /^(Arrow|Home|End)/.test(e.key)) { state.keyed = false; press(false) } })
wave.addEventListener('blur', () => { if (state.keyed) { state.keyed = false; press(false) } })
hold.addEventListener('change', () => { if (hold.checked) wake() })

// Controls: the method and its settings, holding. A new method or setting crossfades in, and the bench measures again.
let remeasure = 0
demo(figure, v => {
  const next = { method: v.method, frame: +v.frame, overlap: +v.overlap, spread: +v.spread, bands: +v.bands, analysis: v.analysis, line: v.line }
  const settings = ['frame', 'overlap', 'spread', 'bands', 'analysis', 'line'].some(k => next[k] !== state[k])
  Object.assign(state, next, { hold: v.hold })
  if (settings || next.method !== state.sent) send({ method: state.method, opts: opts() })
  state.sent = state.method
  send({ on: sounding() })
  for (const [key, row] of rows) row.classList.toggle('current', key === state.method)
  if (settings) { clearTimeout(remeasure); remeasure = setTimeout(measure, 400) }
  describe()
  animate()
})

// ── Drawing ─────────────────────────────────────────────────────

let image = null, key = '', spectrum = null, frame = 0, until = 0
const WAVE_HEIGHT = 150, SPECTRUM_HEIGHT = 190, SIZE = 4096, LOW = 30, HIGH = RATE / 2
// What each method hears around the caret, in samples before and after it: the spectral methods a frame, the
// vocoders a hop more, each as far again as the spread
function reach(method) {
  const n = state.frame, half = n / 2, spread = state.spread / 1000 * RATE, hop = n / state.overlap
  return { tape: [0, 0], loop: [.04 * RATE, .04 * RATE], grains: [.055 * RATE, .055 * RATE], bank: [half, half], lines: [half, half], random: [half + spread, half + spread], vocoder: [half + hop + spread, half + spread], hybrid: [half + hop + spread, half + spread] }[method]
}
function animate() {
  until = performance.now() + 800
  if (!frame) frame = requestAnimationFrame(tick)
}
function tick() {
  frame = 0
  draw()
  if (sounding() || sample || performance.now() < until) frame = requestAnimationFrame(tick)
}
function draw() {
  const { ctx: g, W, H, dpr, T } = panel(wave, WAVE_HEIGHT), x = state.x, px = t => t / x.length * W
  if (!W) return
  // the waveform, lowest to highest per column, drawn once per sound and size
  const now = [W, H, state.version].join()
  if (now !== key) {
    image = new OffscreenCanvas(W, H)
    const c = image.getContext('2d')
    c.fillStyle = css(T.ink)
    for (let col = 0; col < W; col++) {
      let lo = 0, hi = 0
      for (let i = Math.floor(col * x.length / W), end = Math.floor((col + 1) * x.length / W); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
      c.fillRect(col, H / 2 * (1 - hi), 1, Math.max(1, H / 2 * (hi - lo)))
    }
    key = now
  }
  g.drawImage(image, 0, 0)
  const [before, after] = reach(state.method), c = px(state.caret)
  g.fillStyle = css(T.ink, .1)
  g.fillRect(px(state.caret - before), 0, px(before + after), H)
  g.fillStyle = css(T.accent)
  g.fillRect(Math.round(c - dpr / 2), 0, Math.max(1, Math.round(dpr)), H)
  // where the sound is read now: the worklet's report, or the gesture a bench row plays
  const heard = sample ? sample.path() : sounding() ? state.heard : null
  if (heard != null) {
    const h = px(heard), s = 5 * dpr
    g.beginPath(); g.moveTo(h - s, 0); g.lineTo(h + s, 0); g.lineTo(h, 1.4 * s); g.fill()
  }
  drawSpectrum(T)
}
// The source's spectrum around the caret as the analyser measures the output: Blackman, 4,096, dB of |X| / N
const BLACKMAN = Float64Array.from({ length: SIZE }, (_, i) => .42 - .5 * Math.cos(2 * Math.PI * i / SIZE) + .08 * Math.cos(4 * Math.PI * i / SIZE))
function sourceSpectrum() {
  const re = new Float64Array(SIZE), im = new Float64Array(SIZE), x = state.x, out = new Float32Array(SIZE / 2)
  for (let i = 0; i < SIZE; i++) { const j = state.caret - SIZE / 2 + i; re[i] = j >= 0 && j < x.length ? x[j] * BLACKMAN[i] : 0 }
  fft(re, im)
  for (let k = 0; k < SIZE / 2; k++) out[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / SIZE + 1e-12)
  return out
}
const output = new Float32Array(SIZE / 2)
function drawSpectrum(T) {
  const { ctx: g, W, H, dpr } = panel(spec, SPECTRUM_HEIGHT, 2, T), span = Math.log(HIGH / LOW)
  const X = f => Math.log(f / LOW) / span * W, Y = d => clamp((-10 - d) / 100, 0, 1) * (H - 16 * dpr)
  g.font = `${11 * dpr}px ${MONO}`
  g.lineWidth = dpr
  g.strokeStyle = css(T.rule)
  g.fillStyle = css(T.ink3)
  for (const f of [100, 1000, 10000]) {
    const label = f < 1000 ? `${f} Hz` : `${f / 1000} kHz`
    g.beginPath(); g.moveTo(X(f), 0); g.lineTo(X(f), H - 16 * dpr); g.stroke()
    g.fillText(label, Math.min(X(f) + 4 * dpr, W - g.measureText(label).width - 6 * dpr), H - 4 * dpr)
  }
  for (const d of [-30, -60, -90]) { g.beginPath(); g.moveTo(0, Y(d)); g.lineTo(W, Y(d)); g.stroke(); g.fillText(minus(`${d} dB`), 6 * dpr, Y(d) - 4 * dpr) }
  // per pixel column, the loudest bin between its edges; where columns are finer than bins, between the two bins around
  const column = (db, col) => {
    const k0 = LOW * Math.exp(col / W * span) / RATE * SIZE, k1 = LOW * Math.exp((col + 1) / W * span) / RATE * SIZE
    if (k1 - k0 < 1) { const k = (k0 + k1) / 2, i = Math.min(db.length - 2, Math.floor(k)); return db[i] + (k - i) * (db[i + 1] - db[i]) }
    let m = -Infinity
    for (let k = Math.ceil(k0); k <= Math.min(db.length - 1, Math.floor(k1)); k++) if (db[k] > m) m = db[k]
    return m
  }
  const source = spectrum ||= sourceSpectrum()
  g.beginPath()
  g.moveTo(0, Y(-200))
  for (let col = 0; col < W; col++) g.lineTo(col, Y(column(source, col)))
  g.lineTo(W, Y(-200))
  g.fillStyle = css(T.ink, .12)
  g.fill()
  g.strokeStyle = css(T.ink3)
  g.stroke()
  if (!analyser || !(sounding() || sample || performance.now() < until)) return
  analyser.getFloatFrequencyData(output)
  g.beginPath()
  for (let col = 0; col < W; col++) { const y = Y(column(output, col)); col ? g.lineTo(col, y) : g.moveTo(col, y) }
  g.strokeStyle = css(T.accent)
  g.lineWidth = 1.5 * dpr
  g.stroke()
}
addEventListener('resize', () => { key = ''; animate() })

// ── Bench ───────────────────────────────────────────────────────

const body = $('#costs'), rows = new Map(), gestures = new Map(), results = new Map()
for (const [key, m] of Object.entries(methods)) {
  const row = body.insertRow(), name = document.createElement('th'), listen = document.createElement('button')
  name.scope = 'row'
  name.textContent = m.name
  row.append(name)
  for (const k of ['us', 'speed', 'level', 'distance', 'flutter', 'repeats']) row.insertCell().dataset.k = k
  listen.className = 'listen'
  listen.disabled = true
  listen.textContent = '▶'
  listen.setAttribute('aria-label', `Play the gesture with ${m.name}`)
  listen.onclick = () => play(key, listen)
  row.insertCell().append(listen)
  row.classList.toggle('current', key === state.method)
  rows.set(key, row)
}
const format = {
  us: v => v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en'),
  speed: v => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en')}×`,
  level: v => v == null ? 'silent' : Math.abs(v) < .05 ? '0.0 dB' : minus(`${v > 0 ? '+' : ''}${v.toFixed(1)} dB`),
  distance: v => v == null ? '–' : `${v.toFixed(1)} dB`,
  flutter: v => v == null ? '–' : `${v.toFixed(1)} dB`,
  repeats: v => v == null ? '–' : v.toFixed(2)
}
let worker = null
function measure() {
  worker?.terminate()
  worker = new Worker(new URL('bench.js', import.meta.url), { type: 'module' })
  const { caret, name } = state, settings = opts()
  gestures.clear()
  results.clear()
  for (const row of rows.values()) { for (const cell of row.querySelectorAll('td[data-k]')) cell.textContent = ''; row.querySelector('.listen').disabled = true }
  $('#bank').hidden = true
  status.textContent = `Measuring at ${seconds(caret)}…`
  worker.onmessage = ({ data }) => {
    if (data.done) {
      status.textContent = `${name} at ${seconds(caret)}.`
      worker.terminate()
      worker = null
      return noiscs(settings)
    }
    results.set(data.name, data)
    const row = rows.get(data.name)
    for (const cell of row.querySelectorAll('td[data-k]')) cell.textContent = format[cell.dataset.k](data[cell.dataset.k])
    if (data.audio) { gestures.set(data.name, { audio: data.audio, caret }); row.querySelector('.listen').disabled = false }
  }
  worker.onerror = () => { status.textContent = 'The bench needs module workers, which this browser lacks.' }
  worker.postMessage({ x: state.x, sr: RATE, caret, opts: settings })
}
$('#measure').onclick = measure
// The bank against random phase: per noiscillator and sample, and the FFT's bank of one line per bin
function noiscs({ bands, frame }) {
  const b = results.get('bank'), r = results.get('random')
  if (!b || !r) return
  const ns = 1000 * b.us / (bands * BLOCK)
  $('#ns').textContent = ns.toFixed(1)
  $('#voices').textContent = (Math.floor(1e9 / (ns * RATE) / 10) * 10).toLocaleString('en')
  $('#lines').textContent = (frame / 2 + 1).toLocaleString('en')
  $('#random-us').textContent = format.us(r.us)
  $('#bank-us').textContent = format.us(b.us)
  $('#bank').hidden = false
}

// A bench row's gesture, played through the analyser, the caret drawn where the gesture has it
function play(key, button) {
  const was = sample?.key
  stop()
  if (was === key) return
  wake()
  if (hold.checked) hold.click()
  const { audio, caret } = gestures.get(key), buffer = ctx.createBuffer(1, audio.length, RATE), path = gesture(caret, state.x.length, RATE)
  buffer.copyToChannel(audio, 0)
  const source = new AudioBufferSourceNode(ctx, { buffer }), start = ctx.currentTime
  source.connect(analyser)
  source.onended = () => { if (sample?.source === source) stop() }
  source.start()
  button.textContent = '■'
  button.setAttribute('aria-label', `Stop ${methods[key].name}`)
  sample = { key, source, button, path: () => path.at(Math.floor((ctx.currentTime - start) * RATE / BLOCK)) }
  animate()
}
function stop() {
  if (!sample) return
  const { source, button, key } = sample
  sample = null
  source.onended = null
  try { source.stop() } catch {}
  button.textContent = '▶'
  button.setAttribute('aria-label', `Play the gesture with ${methods[key].name}`)
  animate()
}

place(Math.round(.4 * state.x.length))
measure()
