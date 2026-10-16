// Recording audio in the browser: every figure runs on the reader's microphone (mic.js, one stream for the page).
// The meter and its switches, the devices, MediaRecorder's formats and a 3-second take, every block through an
// AudioWorklet (tap.js) to a WAV file (wav.js), the latencies, a take kept chunk by chunk (store.js), letting go.
import { panel, demo, css, MONO } from '../kit.js'
import { mic, watch, open, release, set, hold, context } from './mic.js'
import { header, wav } from './wav.js'
import * as store from './store.js'

const $ = s => document.querySelector(s)
const make = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e }
const num = n => Math.round(n).toLocaleString('en')
const minus = s => String(s).replace('-', '−')
const db = v => v > 0 ? 20 * Math.log10(v) : -Infinity
const dbfs = v => isFinite(v) ? minus(Math.round(v) || 0) : '−∞'
const size = n => n < 1e3 ? `${n} B` : n < 1e6 ? `${(n / 1e3).toFixed(1)} kB` : n < 1e9 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e9).toFixed(1)} GB`
const ms = s => `${(s * 1000).toFixed(1)} ms`
const bits = d => d === 32 ? '32-bit float' : `${d}-bit`
const say = (node, text) => { node.textContent = text }
const sleep = t => new Promise(r => setTimeout(r, t))
// a link that saves a blob as `name`, the old one's URL let go
function offer(link, blob, name) {
  if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href)
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.hidden = false
  return link.href
}
const EXT = type => type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : type.includes('webm') ? 'webm' : type.includes('matroska') ? 'mka' : 'bin'
// what an <audio> element makes of a file's length: its duration once the metadata is read
const length = player => new Promise(r => {
  if (player.readyState >= 1) return r(player.duration)
  player.addEventListener('loadedmetadata', () => r(player.duration), { once: true })
  setTimeout(() => r(player.duration), 2000)
}).then(d => `<audio>.duration: ${isFinite(d) ? d.toFixed(2) + ' s' : String(d)}`)
const failure = e => `${e.name}${e.message ? ': ' + e.message : ''}`

// ── The page's microphone: the bar ──────────────────────────────

const allow = $('#allow'), picker = $('#device'), state = $('#state')
let listing = 0
allow.onclick = () => mic.live ? release() : open().catch(() => {})
picker.onchange = () => set({ device: picker.value })
watch(m => {
  allow.textContent = m.live ? 'Release' : 'Allow the microphone'
  allow.setAttribute('aria-pressed', m.live)
  picker.disabled = !!m.busy
  const s = m.live ? m.track.getSettings() : {}
  say(state, m.live ? `${m.track.label || 'microphone'} · ${s.sampleRate ? num(s.sampleRate) + ' Hz · ' : ''}${m.track.muted ? 'muted' : 'live'}` : m.error ? failure(m.error) : 'not in use')
  devices()
})

// ── 1. Asking ───────────────────────────────────────────────────

say($('#secure'), window.isSecureContext ? 'yes' : 'no: navigator.mediaDevices is undefined here')
say($('#api'), navigator.mediaDevices?.getUserMedia ? 'present' : 'undefined')
say($('#framed'), window.self === window.top ? 'no, the top page' : `yes${document.featurePolicy ? document.featurePolicy.allowsFeature('microphone') ? ', and allowed the microphone' : ', not allowed the microphone' : ''}`)
const permission = $('#permission')
navigator.permissions?.query({ name: 'microphone' }).then(p => {
  const show = () => say(permission, p.state)
  show()
  p.onchange = show
}, () => say(permission, 'not queryable in this browser'))
if (!navigator.permissions) say(permission, 'not queryable in this browser')
watch(m => say($('#answer'), m.error ? failure(m.error) : m.live ? `a MediaStream with ${m.stream.getAudioTracks().length} audio track: “${m.track.label}”` : m.track === null && m.context ? 'released' : 'not asked yet'))

// ── 2. What the browser does to the sound ──────────────────────

const PROCESSING = ['echoCancellation', 'noiseSuppression', 'autoGainControl'], SHORT = { echoCancellation: 'EC', noiseSuppression: 'NS', autoGainControl: 'AGC' }
const PROPS = [...PROCESSING, 'sampleRate', 'channelCount', 'sampleSize', 'latency']
const meter = $('#meter'), canvas = meter.querySelector('canvas'), known = navigator.mediaDevices?.getSupportedConstraints?.() ?? {}
const history = [], marks = [], SPAN = 10, LOW = -84
let analyser = null, buffer = null, frame = 0, last = null, near = false
new IntersectionObserver(([e]) => { near = e.isIntersecting }, { rootMargin: '100px' }).observe(meter)

// the switches: the browser's own defaults until one is touched, then all three asked for
for (const name of PROCESSING) meter.querySelector(`[name="${name}"]`).addEventListener('change', () => {
  const ask = { ...mic.ask }
  for (const p of PROCESSING) ask[p] = meter.querySelector(`[name="${p}"]`).checked
  set({ ask })
})
demo(meter, v => {
  const ask = { ...mic.ask }
  for (const [key, value] of [['sampleRate', v.rate], ['channelCount', v.channels]]) value === 'any' ? delete ask[key] : ask[key] = +value
  if (JSON.stringify(ask) !== JSON.stringify(mic.ask)) set({ ask })
  draw()
})
watch(m => {
  // the meter on the stream, in its context
  if (m.live && m.source) {
    if (analyser?.context !== m.context) { analyser = new AnalyserNode(m.context, { fftSize: 2048 }); buffer = new Float32Array(2048) }
    m.source.connect(analyser)
  }
  const s = m.live ? m.track.getSettings() : {}
  for (const p of PROCESSING) {
    const box = meter.querySelector(`[name="${p}"]`)
    if (p in s) box.checked = s[p]
    // they show the browser's own choice first, so they wait for the stream
    box.disabled = !m.live || !!m.busy || !known[p]
  }
  for (const b of meter.querySelectorAll('[data-name] button')) b.disabled = !!m.busy
  // a mark where the processing changed
  const now = PROCESSING.filter(p => s[p]).map(p => SHORT[p]).join(' ') || 'off'
  if (m.live && last !== null && now !== last) marks.push({ t: performance.now() / 1000, label: now === 'off' ? 'all off' : now })
  last = m.live ? now : last
  settings(s)
  if (m.live && !frame) tick()
  draw()
})
function tick() {
  frame = 0
  if (!mic.live || !analyser) return draw()
  analyser.getFloatTimeDomainData(buffer)
  let sum = 0, peak = 0
  for (const v of buffer) { sum += v * v; peak = Math.max(peak, Math.abs(v)) }
  const t = performance.now() / 1000
  history.push({ t, rms: db(Math.sqrt(sum / buffer.length)), peak: db(peak) })
  while (history.length && history[0].t < t - SPAN - 1) history.shift()
  if (near) draw()
  frame = requestAnimationFrame(tick)
}
function draw() {
  const { ctx, W, H, dpr, T } = panel(canvas, 170), left = 34 * dpr, top = 18 * dpr, h = H - top - 6 * dpr, w = W - left - 8 * dpr
  const y = d => top + h * Math.min(1, Math.max(0, d / LOW))
  ctx.font = `${10 * dpr}px ${MONO}`
  ctx.textBaseline = 'middle'
  for (let d = 0; d >= LOW; d -= 12) {
    ctx.fillStyle = css(T.rule)
    ctx.fillRect(left, Math.round(y(d)), w, dpr)
    ctx.fillStyle = css(T.ink3)
    ctx.fillText(minus(d), 4 * dpr, y(d))
  }
  ctx.textBaseline = 'top'
  const now = performance.now() / 1000, x = t => left + w * (1 - (now - t) / SPAN)
  if (!mic.live) {
    ctx.fillStyle = css(T.ink2)
    const asked = Object.entries(mic.ask).map(([k, v]) => `${k} ${v}`).join(', ') || 'the browser’s defaults'
    ctx.fillText(`dBFS, the last ${SPAN} s · allow the microphone · asking for ${asked}`, left, 3 * dpr)
    return
  }
  // the level: RMS filled, peaks as a line above
  ctx.fillStyle = css(T.ink, .85)
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1], b = history[i], x0 = x(a.t), x1 = x(b.t)
    if (x1 < left) continue
    ctx.fillRect(Math.max(left, x0), y(b.rms), x1 - Math.max(left, x0) + .5, top + h - y(b.rms))
  }
  ctx.strokeStyle = css(T.ink3)
  ctx.lineWidth = dpr
  ctx.beginPath()
  history.forEach((p, i) => x(p.t) >= left && ctx[i ? 'lineTo' : 'moveTo'](x(p.t), y(p.peak)))
  ctx.stroke()
  // where the processing changed
  ctx.fillStyle = css(T.accent)
  for (const m of marks) {
    const at = x(m.t)
    if (at < left) continue
    ctx.fillRect(Math.round(at), top, dpr, h)
    ctx.fillText(m.label, at + 4 * dpr, top + 2 * dpr)
  }
  const s = mic.track.getSettings()
  ctx.fillStyle = css(T.ink2)
  ctx.fillText(`${mic.track.label || 'microphone'} · ${PROCESSING.filter(p => s[p]).map(p => SHORT[p]).join(' ') || 'processing off'}`, left, 3 * dpr)
  // the readout: now, the floor (the quietest tenth of the last 5 s) and the peak
  const recent = history.filter(p => p.t > now - 5).map(p => p.rms).sort((a, b) => a - b)
  if (recent.length) say($('#level'), `now ${dbfs(history.at(-1).rms)} dBFS RMS · floor ${dbfs(recent[Math.floor(recent.length * .1)])} · peak ${dbfs(Math.max(...history.filter(p => p.t > now - 5).map(p => p.peak)))}`)
}
// asked and got, for each property: what the browser knows, what the page asked, what the track says
function settings(s) {
  $('#settings').replaceChildren(...PROPS.map(p => make('tr', {},
    make('th', { scope: 'row' }, make('code', {}, p)),
    make('td', {}, known[p] ? 'yes' : 'no'),
    make('td', {}, p in mic.ask ? String(mic.ask[p]) : '–'),
    make('td', {}, p in s ? p === 'latency' ? ms(s[p]) : String(s[p]) : '–'))))
}
settings({})

// ── 3. Which microphone ─────────────────────────────────────────

const cut = id => id ? (id.length > 12 ? id.slice(0, 10) + '…' : id) : '(empty)'
async function devices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  const n = ++listing, list = await navigator.mediaDevices.enumerateDevices()
  if (n !== listing) return
  const using = mic.live ? mic.track.getSettings().deviceId : null
  $('#devices').replaceChildren(...list.map(d => make('tr', { className: d.deviceId && d.deviceId === using ? 'current' : '' },
    make('th', { scope: 'row' }, d.kind),
    make('td', { className: d.label ? '' : 'empty' }, d.label || '(empty)'),
    make('td', {}, make('code', {}, cut(d.deviceId))),
    make('td', {}, make('code', {}, cut(d.groupId))))))
  const inputs = list.filter(d => d.kind === 'audioinput' && d.label)
  picker.replaceChildren(make('option', { value: '' }, 'the default'), ...inputs.filter(d => d.deviceId !== 'default').map(d => make('option', { value: d.deviceId }, d.label)))
  picker.value = mic.device
  picker.closest('label').hidden = !inputs.length
}
navigator.mediaDevices?.addEventListener?.('devicechange', devices)

// ── 4. MediaRecorder ────────────────────────────────────────────

const TYPES = ['audio/webm;codecs=opus', 'audio/webm;codecs=pcm', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs=opus', 'audio/mp4;codecs=alac', 'audio/mp4;codecs=pcm', 'audio/mp4', 'audio/x-matroska;codecs=pcm', 'audio/mpeg', 'audio/wav', 'audio/flac']
const recordable = window.MediaRecorder ? TYPES.filter(t => MediaRecorder.isTypeSupported(t)) : []
let chosen = null
function formats() {
  $('#formats').replaceChildren(...[...TYPES, ...chosen && !TYPES.includes(chosen) ? [chosen] : []].map(t => make('tr', { className: t === chosen ? 'current' : '' },
    make('th', { scope: 'row' }, make('code', {}, t)),
    make('td', {}, !window.MediaRecorder ? 'no MediaRecorder' : t === chosen ? 'yes, the default' : recordable.includes(t) ? 'yes' : 'no'))))
}
formats()

const take = $('#take'), typeSelect = take.querySelector('[name="type"]'), takeOut = take.querySelector('.out')
typeSelect.append(...recordable.map(t => make('option', { value: t }, t)))
let clip = null, recording = null
const drawTake = demo(take, v => {
  const { ctx, W, H, dpr, T } = panel(take.querySelector('canvas'), 140), top = 20 * dpr, half = (H - top) / 2 - 4 * dpr, mid = top + (H - top) / 2
  ctx.font = `${10 * dpr}px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(0, Math.round(mid), W, dpr)
  ctx.fillStyle = css(T.ink2)
  if (recording) {
    const done = Math.min(1, (performance.now() - recording) / 3000)
    ctx.fillStyle = css(T.accent, .25)
    ctx.fillRect(0, 0, W * done, H)
    ctx.fillStyle = css(T.ink2)
    ctx.fillText(`recording ${(3 * done).toFixed(1)} s`, 8 * dpr, 6 * dpr)
    if (done < 1) requestAnimationFrame(() => drawTake())
    return
  }
  if (!clip?.audio) return ctx.fillText(`3 seconds · ${v.type || 'the browser’s choice'} · ${v.bitrate === 'default' ? 'its default bitrate' : v.bitrate / 1000 + ' kbps asked'}`, 8 * dpr, 6 * dpr)
  const x = clip.audio.getChannelData(0)
  ctx.fillStyle = css(T.ink)
  for (let c = 0; c < W; c++) {
    let lo = 0, hi = 0
    for (let i = Math.floor(c * x.length / W), end = Math.floor((c + 1) * x.length / W); i < end; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i] }
    ctx.fillRect(c, mid - hi * half, 1, Math.max(dpr, (hi - lo) * half))
  }
  ctx.fillStyle = css(T.ink2)
  ctx.fillText(`${clip.type} · decoded: ${clip.audio.duration.toFixed(2)} s, ${num(clip.audio.sampleRate)} Hz, ${clip.audio.numberOfChannels} ch`, 8 * dpr, 6 * dpr)
})
take.querySelector('.record').onclick = async e => {
  const button = e.currentTarget
  if (!window.MediaRecorder) return say(take.querySelector('.readout'), 'This browser has no MediaRecorder.')
  button.disabled = true
  try {
    const stream = mic.live ? mic.stream : await open()
    const pressed = take.querySelector('[data-name="bitrate"] [aria-pressed="true"]').dataset.value
    const options = { ...typeSelect.value && { mimeType: typeSelect.value }, ...pressed !== 'default' && { audioBitsPerSecond: +pressed } }
    const result = await hold(async () => {
      const recorder = new MediaRecorder(stream, options), parts = []
      recorder.ondataavailable = e => e.data.size && parts.push(e.data)
      const stopped = new Promise(r => recorder.onstop = r)
      await new Promise((ok, fail) => { recorder.onstart = ok; recorder.onerror = e => fail(e.error); recorder.start() })
      // the type is set as it starts (an engine may clear it once stopped)
      const type = recorder.mimeType
      recording = performance.now()
      drawTake()
      await sleep(3000)
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped
      recording = null
      return { type: type || parts[0]?.type || '', asked: recorder.audioBitsPerSecond, blob: new Blob(parts, { type: type || parts[0]?.type }), chunks: parts.length }
    })
    if (!typeSelect.value) { chosen = result.type.replace(/["\s]/g, ''); formats() }
    clip = result
    try { clip.audio = await context().decodeAudioData(await result.blob.arrayBuffer()) } catch (err) { clip.error = err }
    const url = offer(takeOut.querySelector('a'), result.blob, `three-seconds.${EXT(result.type)}`)
    takeOut.querySelector('a').textContent = `Save ${EXT(result.type).toUpperCase()} · ${size(result.blob.size)}`
    const player = takeOut.querySelector('audio')
    player.src = url
    takeOut.hidden = false
    const seconds = clip.audio?.duration ?? 3
    say(take.querySelector('.readout'), `${result.type || '(no type given)'} · ${num(result.blob.size)} bytes · ${(result.blob.size * 8 / seconds / 1000).toFixed(0)} kbps measured${result.asked ? `, ${num(result.asked / 1000)} kbps reported by audioBitsPerSecond` : ''} · ${result.chunks} chunk${result.chunks > 1 ? 's' : ''}${clip.error ? ' · could not be decoded here: ' + failure(clip.error) : ''}`)
    say(take.querySelector('.element'), await length(player))
  } catch (err) {
    recording = null
    say(take.querySelector('.readout'), failure(err))
  } finally { button.disabled = false; drawTake() }
}

// ── 5. Every block: an AudioWorklet ─────────────────────────────

const pcm = $('#pcm'), pcmButton = pcm.querySelector('.record'), pcmOut = pcm.querySelector('.out')
const rate = () => mic.context?.sampleRate ?? 48000
const take2 = { parts: [], frames: 0, blocks: 0, buckets: [], x: null, running: null }
const depthOf = () => +pcm.querySelector('[data-name="depth"] [aria-pressed="true"]').dataset.value
const drawPcm = demo(pcm, v => {
  const { ctx, W, H, dpr, T } = panel(pcm.querySelector('canvas'), 140), top = 20 * dpr, half = (H - top) / 2 - 4 * dpr, mid = top + (H - top) / 2, r = rate()
  ctx.font = `${10 * dpr}px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(0, Math.round(mid), W, dpr)
  const span = Math.max(10, take2.frames / r), b = take2.buckets
  ctx.fillStyle = css(T.ink)
  for (let i = 0; i < b.length; i++) {
    const x0 = i / 100 / span * W, w = Math.max(1, W / span / 100)
    ctx.fillRect(x0, mid - b[i][1] * half, w, Math.max(dpr, (b[i][1] - b[i][0]) * half))
  }
  ctx.fillStyle = css(T.ink2)
  const depth = +v.depth, label = bits(depth)
  ctx.fillText(take2.running ? `recording · ${(take2.frames / r).toFixed(1)} s` : take2.x ? `${(take2.x.length / r).toFixed(2)} s · WAV, ${label}` : `every block, kept · ${num(r)} Hz, mono · WAV, ${label}`, 8 * dpr, 6 * dpr)
  if (take2.x && built !== `${depth}:${take2.x.length}`) build()
  perMinute()
})
// memory a minute of mono costs here, kept as float and written as each depth
function perMinute() {
  const r = rate()
  say($('#minute'), `${num(r)} Hz mono, a minute: ${size(r * 60 * 4)} as float in memory, ${size(r * 60 * 2)} as 16-bit WAV, ${size(r * 60 * 3)} as 24-bit`)
}
perMinute()
let tapping = null, built = ''
async function tap(ctx) {
  if (tapping?.ctx === ctx) return tapping.ready
  tapping = { ctx, ready: ctx.audioWorklet.addModule(new URL('tap.js', import.meta.url)) }
  return tapping.ready
}
pcmButton.onclick = async () => {
  if (take2.running) return take2.running.stop()
  pcmButton.disabled = true
  try {
    if (!mic.live) await open()
    const ctx = mic.context
    if (!ctx.audioWorklet) throw new Error('This browser has no AudioWorklet.')
    await tap(ctx)
    Object.assign(take2, { parts: [], frames: 0, blocks: 0, buckets: [], x: null })
    const node = new AudioWorkletNode(ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' })
    const each = ctx.sampleRate / 100
    let bucket = [0, 0], filled = 0, finished
    const done = new Promise(r => finished = r)
    node.port.onmessage = ({ data }) => {
      take2.parts.push(data.x)
      take2.frames += data.x.length
      take2.blocks = data.blocks
      for (const v of data.x) {
        if (v < bucket[0]) bucket[0] = v
        if (v > bucket[1]) bucket[1] = v
        if (++filled >= each) { take2.buckets.push(bucket); bucket = [0, 0]; filled = 0 }
      }
      say(pcm.querySelector('.readout'), `${num(take2.blocks)} blocks of 128 · ${num(take2.frames)} frames · ${(take2.frames / ctx.sampleRate).toFixed(1)} s · ${size(take2.frames * 4)} in memory`)
      drawPcm()
      if (data.last) finished()
    }
    hold(async () => {
      mic.source.connect(node)
      take2.running = { stop: () => node.port.postMessage('flush') }
      pcmButton.textContent = 'Stop'
      pcmButton.disabled = false
      await done
      node.disconnect()
      mic.source?.disconnect(node)
    }).then(() => {
      take2.running = null
      pcmButton.textContent = 'Record'
      const x = new Float32Array(take2.frames)
      let at = 0
      for (const p of take2.parts) { x.set(p, at); at += p.length }
      take2.x = x
      take2.rate = ctx.sampleRate
      take2.parts = []
      drawPcm()
    }, err => say(pcm.querySelector('.readout'), failure(err)))
  } catch (err) {
    pcmButton.disabled = false
    say(pcm.querySelector('.readout'), failure(err))
  }
}
// the take as a WAV of the chosen depth: the player, the link, the header's table
function build() {
  const depth = depthOf()
  built = `${depth}:${take2.x.length}`
  const bytes = wav(take2.x, take2.rate, depth), blob = new Blob([bytes], { type: 'audio/wav' })
  const url = offer(pcmOut.querySelector('a'), blob, `take-${depth === 32 ? '32f' : depth}.wav`)
  pcmOut.querySelector('a').textContent = `Save WAV · ${size(blob.size)}`
  pcmOut.querySelector('audio').src = url
  pcmOut.hidden = false
  bytesTable(take2.rate, depth, take2.x.length, bytes)
}

// ── 6. The bytes in front ───────────────────────────────────────

const hex = (bytes, at, n) => [...bytes.subarray(at, at + n)].map(b => b.toString(16).padStart(2, '0')).join(' ')
function bytesTable(r, depth, frames, file) {
  const { bytes, fields } = header({ rate: r, depth, frames })
  $('#header').replaceChildren(...fields.map(f => make('tr', {},
    make('td', {}, String(f.at)),
    make('th', { scope: 'row' }, make('code', {}, f.name), make('span', { className: 'what' }, ' ' + f.note)),
    make('td', {}, f.type === 'text' ? `“${f.value}”` : num(f.value)),
    make('td', {}, make('code', {}, hex(file ?? bytes, f.at, f.size))))))
  say($('#header-of'), file ? `Your take: ${num(frames)} frames at ${num(r)} Hz, ${bits(depth)}; the bytes read back from the file.` : `A 3-second take at ${num(r)} Hz, ${bits(depth)}. Record one above and these become yours.`)
}
bytesTable(48000, 16, 3 * 48000)
// the microphone let go mid-take ends the take; a new context, a new rate for the example
watch(m => {
  if (!m.live) take2.running?.stop()
  if (!take2.x) bytesTable(rate(), depthOf(), 3 * rate())
  drawPcm()
})

// ── 7. Latency ──────────────────────────────────────────────────

$('#measure').onclick = async e => {
  const button = e.currentTarget
  button.disabled = true
  const hints = ['interactive', 'balanced', 'playback'], contexts = hints.map(h => new AudioContext({ latencyHint: h }))
  try {
    await Promise.all(contexts.map(c => c.resume()))
    // the output's latency is known once audio flows
    await sleep(400)
    $('#latencies').replaceChildren(...contexts.map((c, i) => make('tr', {},
      make('th', { scope: 'row' }, make('code', {}, `'${hints[i]}'`), make('span', { className: 'what' }, ` ${num(c.sampleRate)} Hz`)),
      make('td', {}, c.baseLatency == null ? 'not reported' : `${ms(c.baseLatency)} · ${num(c.baseLatency * c.sampleRate)}`),
      make('td', {}, c.outputLatency == null ? 'not reported' : `${ms(c.outputLatency)} · ${num(c.outputLatency * c.sampleRate)}`))))
  } finally {
    contexts.forEach(c => c.close())
    button.disabled = false
  }
}
// the input side, as far as the track says: its configured latency, and the measured one where the browser has stats
function input() {
  if (!mic.live) return say($('#input-latency'), 'Allow the microphone to read what its track reports.')
  const s = mic.track.getSettings(), stats = mic.track.stats
  say($('#input-latency'), `The microphone’s track: ${'latency' in s ? `getSettings().latency ${ms(s.latency)}` : 'no latency setting'} · ${stats ? `stats.latency ${stats.latency.toFixed(1)} ms, average ${stats.averageLatency.toFixed(1)} ms` : 'no track.stats'}`)
}
watch(input)
setInterval(() => mic.live && !document.hidden && input(), 1000)

// ── 8. Surviving a crash ────────────────────────────────────────

const safe = $('#safe'), safeButton = safe.querySelector('.record'), log = safe.querySelector('.log'), kept = safe.querySelector('.kept')
const saved = { chunks: [], start: 0, running: null, id: null }
const stamp = () => saved.start ? `${((performance.now() - saved.start) / 1000).toFixed(1)} s` : new Date().toLocaleTimeString('en-GB')
const note = text => { log.prepend(make('li', {}, make('span', { className: 'at' }, stamp()), ' ', text)); while (log.children.length > 12) log.lastChild.remove() }
const drawSafe = demo(safe, () => {
  const { ctx, W, H, dpr, T } = panel(safe.querySelector('canvas'), 110), c = saved.chunks, top = 22 * dpr, base = H - 8 * dpr
  ctx.font = `${10 * dpr}px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = css(T.rule)
  ctx.fillRect(0, base, W, dpr)
  ctx.fillStyle = css(T.ink2)
  ctx.fillText(c.length ? `${c.length} chunks kept · ${size(c.reduce((n, k) => n + k.bytes, 0))} in IndexedDB` : 'each chunk, a bar, as it is written to IndexedDB', 8 * dpr, 6 * dpr)
  const span = Math.max(20, c.length + 1), w = W / span, most = Math.max(1, ...c.map(k => k.bytes))
  c.forEach((k, i) => {
    ctx.fillStyle = css(k.why === 'hidden' ? T.accent : T.ink, k.stored ? 1 : .35)
    const h = (base - top) * k.bytes / most
    ctx.fillRect(i * w + dpr, base - h, Math.max(dpr, w - 2 * dpr), h)
  })
})
safeButton.onclick = async () => {
  if (saved.running) return saved.running.stop()
  if (!window.MediaRecorder) return note('This browser has no MediaRecorder.')
  safeButton.disabled = true
  try {
    const stream = mic.live ? mic.stream : await open()
    const recorder = new MediaRecorder(stream), id = saved.id = `take-${Date.now()}`
    let n = 0, type = '', writing = Promise.resolve()
    saved.chunks = []
    saved.start = performance.now()
    log.replaceChildren()
    recorder.ondataavailable = e => {
      const chunk = { bytes: e.data.size, why: document.hidden ? 'hidden' : 'timeslice', stored: false }, at = n++
      saved.chunks.push(chunk)
      drawSafe()
      writing = writing.then(async () => {
        if (at === 0) await store.begin(id, type ||= e.data.type)
        await store.put(id, at, await e.data.arrayBuffer())
        chunk.stored = true
        note(`chunk ${at + 1} · ${size(chunk.bytes)} · stored${chunk.why === 'hidden' ? ' (asked for by requestData on hidden)' : ''}`)
        drawSafe()
      })
    }
    const stopped = new Promise(r => recorder.onstop = r)
    const hidden = () => {
      if (recorder.state !== 'recording') return
      if (document.hidden) { recorder.requestData(); note('page hidden · requestData()') }
      else note('page visible')
    }
    document.addEventListener('visibilitychange', hidden)
    const events = ['mute', 'unmute', 'ended'].map(type => [type, () => note(`track ${type}`)])
    events.forEach(([t, f]) => mic.track.addEventListener(t, f))
    hold(async () => {
      await new Promise((ok, fail) => { recorder.onstart = ok; recorder.onerror = e => fail(e.error); recorder.start(1000) })
      type = recorder.mimeType
      note(`recording ${type}, a chunk every second`)
      saved.running = { stop: () => recorder.stop() }
      safeButton.textContent = 'Stop'
      safeButton.disabled = false
      await stopped
      await writing
    }).then(async () => {
      document.removeEventListener('visibilitychange', hidden)
      events.forEach(([t, f]) => stream.getAudioTracks()[0]?.removeEventListener(t, f))
      saved.running = null
      safeButton.textContent = 'Record'
      // the file, read back from storage, then the storage cleared
      const blob = await store.file(id, type)
      await store.remove(id)
      const out = safe.querySelector('.out'), player = out.querySelector('audio')
      player.src = offer(out.querySelector('a'), blob, `kept.${EXT(type)}`)
      out.querySelector('a').textContent = `Save ${EXT(type).toUpperCase()} · ${size(blob.size)}`
      out.hidden = false
      note(`stopped · ${n} chunks read back from IndexedDB into one file · storage cleared`)
      say(safe.querySelector('.element'), await length(player))
      saved.start = 0
      leftovers()
    }).catch(err => note(failure(err)))
  } catch (err) {
    safeButton.disabled = false
    note(failure(err))
  }
}
// takes left from a visit that ended mid-recording
async function leftovers() {
  if (!window.indexedDB) return
  let list
  try { list = await store.takes() } catch (err) { return say(kept, `IndexedDB is not available here: ${failure(err)}`) }
  kept.replaceChildren(...list.filter(t => !saved.running || t.id !== saved.id).map(t => {
    const player = make('audio', { controls: true, preload: 'metadata' }), link = make('a', { hidden: true, className: 'action' })
    const del = make('button', { className: 'action', type: 'button' }, 'Delete')
    del.onclick = async () => { await store.remove(t.id); leftovers() }
    store.file(t.id, t.type).then(blob => { player.src = offer(link, blob, `interrupted.${EXT(t.type)}`); link.textContent = `Save · ${size(blob.size)}` }, () => {})
    return make('li', {}, make('span', {}, `Interrupted take from ${new Date(t.started).toLocaleTimeString('en-GB')}: ${t.chunks} chunks, ${size(t.bytes)}, ${t.type}`), player, link, del)
  }))
  kept.hidden = !kept.children.length
}
leftovers()
navigator.storage?.estimate?.().then(({ quota, usage }) => say($('#quota'), `navigator.storage.estimate(): this site may keep up to ${size(quota)} here (${size(usage)} used), about ${num(quota * 8 / 128000 / 3600)} hours at 128 kbps.`))

// ── 9. Letting go ───────────────────────────────────────────────

const rel = $('#release'), parts = { recorder: null, ctx: null }
function status() {
  const t = mic.track
  rel.querySelector('[data-show="track"]').textContent = t ? `${t.readyState}${t.enabled ? '' : ', enabled = false'}${t.muted ? ', muted' : ''}` : 'none'
  rel.querySelector('[data-show="recorder"]').textContent = parts.recorder?.state ?? 'none'
  rel.querySelector('[data-show="context"]').textContent = parts.ctx?.state ?? 'none'
  for (const b of rel.querySelectorAll('[data-act]')) b.disabled = !mic.live && b.dataset.act !== 'open'
  rel.querySelector('[data-act="enabled"]').setAttribute('aria-pressed', t ? !t.enabled : false)
}
const close = c => c && c.state !== 'closed' && c.close()
const acts = {
  async open() {
    const stream = mic.live ? mic.stream : await open()
    close(parts.ctx)
    if (parts.recorder?.state === 'recording') parts.recorder.stop()
    parts.ctx = new AudioContext()
    parts.ctx.createMediaStreamSource(stream)
    parts.ctx.onstatechange = status
    if (window.MediaRecorder) { parts.recorder = new MediaRecorder(stream); parts.recorder.onstop = parts.recorder.onstart = status; parts.recorder.start() }
  },
  recorder() { if (parts.recorder?.state !== 'inactive') parts.recorder?.stop() },
  context() { close(parts.ctx) },
  enabled() { mic.track.enabled = !mic.track.enabled },
  stop() { mic.stream.getTracks().forEach(t => t.stop()) }
}
rel.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]')
  if (!b) return
  try { await acts[b.dataset.act]() } catch (err) { say(rel.querySelector('[data-show="track"]'), failure(err)) }
  status()
  if (b.dataset.act === 'stop') release()
})
watch(status)
