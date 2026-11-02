// The home's instrument: a sound, a chain of audio calls run over it, and what comes out, seen, heard and measured.
// The calls are the interface: each turns on or off, the waveform moves to the new result, and the code reads as
// what to run. The chain runs in a worker (chain.js); the raw sound shows while the library loads there.
import { samples, RATE } from './samples.js'
import { prepare, columns, mix, render } from './wave.js'

const worker = new Worker(new URL('./chain.js', import.meta.url), { type: 'module' }), asked = new Map()
let asks = 0
const ask = (message, transfer) => new Promise((resolve, reject) => { asked.set(++asks, { resolve, reject }), worker.postMessage({ id: asks, ...message }, transfer) })
worker.onmessage = ({ data }) => { const { resolve, reject } = asked.get(data.id); asked.delete(data.id); data.error ? reject(Error(data.error)) : resolve(data) }
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

// The calls on offer, in the order they run: name, arguments; the ones whose buttons start pressed are on
const CALLS = $$('#chain [data-call]').map(b => [b.dataset.call, JSON.parse(`[${b.dataset.args || ''}]`), b])
const on = new Set(CALLS.filter(([, , b]) => b.ariaPressed === 'true').map(([n]) => n))

const canvas = $('#wave'), g = canvas.getContext('2d'), scope = $('#scope'), head = $('#head'), level = $('#level')
// the page's choices: the waveform filled solid, a spectrum figure to feed
const solid = 'solid' in canvas.dataset, spectrum = !!$('#spectrum')
let img, grain, cols, W = 0
let source, result, shown, morphing

// a sound as the page keeps it: its channels, rate, length, and what the waveform needs
const sound = (channels, rate, name) => ({ channels, rate, name, seconds: channels[0].length / rate, prep: prepare(channels) })
// the time the picture spans: the source's length, or the result's when longer, so a trim shows as what it took
const span = s => Math.max(source.seconds, s.seconds)

// Seconds per tick, from 1-2-5 steps, at most ten ticks over the span
const step = T => [.5, 1, 2, 5, 10, 20, 30, 60, 120].find(s => T / s <= 10) || 300
function ruler(T) {
  const s = step(T), ticks = []
  for (let t = 0; t <= T; t += s) ticks.push(t)
  $('#ruler').innerHTML = ticks.map((t, i) => `<span style="left:${t / T * 100}%">${+t.toFixed(1)}${i === ticks.length - 1 ? ' s' : ''}</span>`).join('')
}

function size() {
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr)
  if (!w || !h || (w === canvas.width && h === canvas.height)) return
  canvas.width = W = w, canvas.height = h
  img = g.createImageData(w, h)
  grain = new Uint8Array(w * h)
  for (let i = 0; i < grain.length; i += 65536) crypto.getRandomValues(grain.subarray(i, i + 65536))
  cols = [0, 1, 2].map(() => ({ lo: new Float32Array(w), hi: new Float32Array(w), rms: new Float32Array(w) }))
  if (shown) draw([shown], span(shown))
}

// One sound, or two mixed at e, over T seconds
function draw([a, b], T, e = 1, shift = 0) {
  if (!W) return
  const s = step(T), grid = []
  for (let t = s; t < T; t += s) grid.push(Math.round(t / T * W))
  let c = columns(a.prep, T * a.rate, W, cols[0])
  if (b) c = mix(c, columns(b.prep, T * b.rate, W, cols[1]), e, cols[2])
  render(img, c, grain, { grid, shift, solid })
  g.putImageData(img, 0, 0)
}

// The waveform moves from what it shows to `to`: shapes and time span eased together, the points glittering in
// motion and still at rest
function show(to) {
  const from = shown, Ta = from ? span(from) : span(to), Tb = span(to), t0 = performance.now()
  shown = to
  ruler(Tb)
  cancelAnimationFrame(morphing)
  const frame = now => {
    const t = reduce || !from ? 1 : Math.min(1, (now - t0) / 520), e = 1 - (1 - t) ** 3
    draw(t < 1 ? [from, to] : [to], Ta + (Tb - Ta) * e, e, t < 1 ? (Math.random() * W | 0) : 0)
    if (t < 1) morphing = requestAnimationFrame(frame)
  }
  morphing = requestAnimationFrame(frame)
  caption(to)
  scope.dispatchEvent(new CustomEvent('show', { detail: to }))
}

const signed = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1)
function caption(s) {
  $('[data-cap=name]').textContent = s.name
  $('[data-cap=format]').textContent = `${+(s.rate / 1000).toFixed(1)} kHz · ${s.channels.length === 1 ? 'mono' : s.channels.length === 2 ? 'stereo' : s.channels.length + ' ch'}`
  $('[data-cap=time]').textContent = s.seconds.toFixed(2) + ' s'
  $('[data-cap=peak]').textContent = Number.isFinite(s.peak) ? signed(s.peak) + ' dBFS' : '−∞ dBFS'
  $('[data-cap=lufs]').textContent = Number.isFinite(s.lufs) ? signed(s.lufs) + ' LUFS' : s.lufs === undefined ? '… LUFS' : '−∞ LUFS'
  if (!playing) meter(s.peak)
  canvas.setAttribute('aria-label', `Waveform of ${s.name}${on.size ? ' after ' + CALLS.filter(([n]) => on.has(n)).map(([n]) => n).join(', ') : ''}: ${s.seconds.toFixed(2)} seconds`)
}

// what went wrong, where the loudness would read
const fail = e => { $('[data-cap=lufs]').textContent = e.message; console.error(e) }

// The level, 0 to −60 dBFS down the scale, −∞ at its foot
const meter = db => level.style.setProperty('--y', Number.isFinite(db) ? Math.min(1, Math.max(0, -db / 60)) : 1.1)

// The code: the chain as it would be written
const chain = () => CALLS.filter(([n]) => on.has(n)).map(([n, a]) => [n, a])
const call = ([n, a]) => `.${n}(${a.join(', ')})`
const file = () => source.file || source.name + '.wav'
const code = () => [`await audio('${file()}')`, ...CALLS.filter(([n]) => on.has(n)).map(c => '  ' + call(c)), `  .save('out.wav')`].join('\n')

// The chain over the source, one run at a time: calls turned on or off meanwhile make one run after it, and a run
// overtaken so is not shown
let running = false, wanted = false
async function run() {
  wanted = true
  if (running) return
  running = true, scope.ariaBusy = 'true'
  while (wanted) {
    wanted = false
    const from = source
    try {
      const { channels, sampleRate, peak, lufs, spectra } = await ask({ type: 'run', calls: chain(), spectrum })
      if (wanted || from !== source) continue
      const was = playing ? position() / result.seconds : null
      result = Object.assign(sound(channels, sampleRate, source.name), { peak, lufs, spectra })
      show(result)
      if (was != null) play(Math.min(was * result.seconds, result.seconds - .05))
    } catch (e) { if (!wanted) fail(e) }
  }
  running = false, scope.ariaBusy = 'false'
}

function load(channels, rate, name, file) {
  stop()
  source = Object.assign(sound(channels, rate, name), { file })
  let peak = 0
  for (let i = 0; i < source.prep.n; i++) peak = Math.max(peak, -source.prep.lo[i], source.prep.hi[i])
  source.peak = 20 * Math.log10(peak)
  result = source
  $('#src').textContent = `'${file || name + '.wav'}'`
  $$('[data-sound]').forEach(b => b.ariaPressed = b.dataset.sound === name)
  show(source)
  // the library's own count of its plugins, once it has loaded
  ask({ type: 'load', channels, sampleRate: rate }).then(({ plugins }) => $$('[data-stat=plugins]').forEach(el => el.textContent = plugins), fail)
  run()
}

// Playback, of the result: from a time, on the page's one context
let ctx, node, began = 0, at = 0, playing = false, buffer, raf, shownLevel = -Infinity, last = 0
const position = () => playing ? ctx.currentTime - began : at
function play(from = at) {
  ctx ||= new AudioContext()
  ctx.resume()
  if (node) node.onended = null, node.stop()
  if (buffer?.result !== result) {
    buffer = ctx.createBuffer(result.channels.length, result.channels[0].length, result.rate)
    result.channels.forEach((c, i) => buffer.copyToChannel(c, i))
    buffer.result = result
  }
  const n = node = ctx.createBufferSource()
  n.buffer = buffer, n.connect(ctx.destination)
  n.onended = () => { if (node === n) node = null, playing = false, at = 0, ui() }
  from = Math.max(0, Math.min(from, result.seconds))
  n.start(0, from), began = ctx.currentTime - from, playing = true, shownLevel = -Infinity, last = 0
  ui(), cancelAnimationFrame(raf), raf = requestAnimationFrame(tick)
}
function stop() {
  if (node) at = position(), node.onended = null, node.stop(), node = null
  playing = false, ui()
}
function ui() {
  $('#play').ariaPressed = playing
  scope.classList.toggle('playing', playing)
  if (!playing) cancelAnimationFrame(raf), meter(result?.peak), place(at)
}
const place = t => head.style.setProperty('--x', shown ? t / span(shown) : 0)
// the playhead, and the meter on the last 50 ms played, falling 24 dB a second
function tick(now) {
  if (!playing) return
  const t = position(), p = result.prep, r = result.rate, b = Math.min(p.n, Math.floor(t * r)), dt = last ? (now - last) / 1000 : 0
  let peak = 0
  for (let i = Math.max(0, b - Math.round(.05 * r)); i < b; i++) peak = Math.max(peak, -p.lo[i], p.hi[i])
  shownLevel = Math.max(20 * Math.log10(peak), shownLevel - 24 * dt), last = now
  meter(shownLevel), place(t)
  raf = requestAnimationFrame(tick)
}

// Wiring
for (const [n, , b] of CALLS) b.onclick = () => {
  on.has(n) ? on.delete(n) : on.add(n)
  b.ariaPressed = on.has(n)
  run()
}
$('#play').onclick = () => playing ? stop() : play(at >= result.seconds - .01 ? 0 : at)
canvas.onclick = e => { const r = canvas.getBoundingClientRect(); play((e.clientX - r.left) / r.width * span(shown)) }
$$('[data-sound]').forEach(b => b.onclick = () => load(samples[b.dataset.sound].make(), RATE, b.dataset.sound))
// a copy said done on its button for a moment
const copy = (button, text) => async () => {
  await navigator.clipboard.writeText(text())
  button.dataset.label ??= button.innerHTML
  button.textContent = 'Copied'
  clearTimeout(button.timer), button.timer = setTimeout(() => button.innerHTML = button.dataset.label, 1400)
}
$('#copy').onclick = copy($('#copy'), code)
$('#install').onclick = copy($('#install'), () => 'npm i audio')
$('#save').onclick = () => ask({ type: 'encode', calls: chain() }).then(({ bytes }) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })), download: 'out.wav' })
  a.click(), setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}, fail)
// a file of yours, opened or dropped on the picture: the browser decodes it, up to two minutes of it
async function open(f) {
  if (!f) return
  ctx ||= new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(await f.arrayBuffer()), n = Math.min(buf.length, buf.sampleRate * 120)
    load(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice(0, n)), buf.sampleRate, f.name.replace(/\.\w+$/, ''), f.name)
  } catch { fail(Error(`${f.name}: this browser can't decode it`)) }
}
$('#file').onchange = e => open(e.target.files[0])
scope.ondragover = e => (e.preventDefault(), scope.classList.add('drop'))
scope.ondragleave = () => scope.classList.remove('drop')
scope.ondrop = e => (e.preventDefault(), scope.classList.remove('drop'), open(e.dataTransfer.files[0]))

new ResizeObserver(size).observe(canvas)
size()
load(samples.chime.make(), RATE, 'chime')
// a list's length, where a page counts it
$$('[data-count]').forEach(el => el.textContent = $$(`#${el.dataset.count} li`).length)
