// Stem splitter: a song into vocals, drums, bass and other by SCNet (Tong et al., ICASSP 2024; MIT weights), through
// @audio/neural-separate on ONNX Runtime Web in a worker: on the GPU (WebGPU) where the browser has one, on the CPU
// (wasm) where not. Each stem plays, mutes, solos and moves; the mix is the input plus each stem's change, as audio's
// rebalance() makes it, so every stem at 0 dB gives the song back. Stems and mix save as WAV, FLAC or MP3.
// `separation` is the worker code the vocal remover (scripts/util-pages.mjs) runs too.
import { drop, src, hash } from '../page-helpers.mjs'

// @audio/neural-separate bundled whole (scripts/vendor.mjs, `inline`): esm.sh's build takes its Node path in a browser
const SEPARATE = src('@audio/neural-separate', '0.6.0')
const UTIL = `/util/util.js?v=${hash('util.js')}`   // the URL the page imports the shell by: the same module instance

// Each hosted model: what it downloads (bytes, the file's Content-Length on huggingface.co at the pinned revision) and the
// seconds it took per second of audio on the GPU (WebGPU) and on one CPU thread (wasm), measured for these pages in
// Chromium 151 on a busy Apple M4 Max (October 2026; segments every half of one; SCNet over 4 minutes of audio, the
// others over 10 to 60 s): the fast end of the estimate shown before a split
export const MODELS = {
  scnet: { name: 'SCNet', bytes: 12900277, gpu: 0.3, cpu: 1.7 },
  'scnet-large': { name: 'SCNet-large', bytes: 45082486, gpu: 2.1, cpu: 9.6 },
  'mel-roformer': { name: 'Mel-Band RoFormer', bytes: 466082640, gpu: 0.3 },
}
const STEMS = ['vocals', 'drums', 'bass', 'other']

// Worker code the separation pages share: the weights' download counted as it arrives (separate() fetches them and says
// nothing), SCNet on WebGPU where there is a GPU adapter (about six times its one-thread wasm pace in Chromium and Firefox),
// on wasm where not, or where WebGPU fails. split() resolves { stems, device, seconds }; alive() false stops it at the
// next downloaded chunk or segment.
export const separation = `
const separateLib = import('${SEPARATE}')
const NAMES = ${JSON.stringify(Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, m.name])))}

// (a model may fetch two files at once: Mel-RoFormer's engine its .json beside its .bin, so the bytes are summed)
let onBytes = null
const downloads = new Map()
const fetch0 = self.fetch.bind(self)
self.fetch = async (url, init) => {
  const res = await fetch0(url, init)
  if (!onBytes || !res.body || !String(url).startsWith('https://huggingface.co/')) return res
  const d = { loaded: 0, total: +res.headers.get('content-length') || 0 }
  downloads.set(String(url), d)
  const report = () => { let loaded = 0, total = 0; for (const x of downloads.values()) { loaded += x.loaded; total += x.total } onBytes?.(loaded, total) }
  return new Response(res.body.pipeThrough(new TransformStream({ transform(chunk, out) { d.loaded += chunk.length; report(); out.enqueue(chunk) } })), { status: res.status, statusText: res.statusText, headers: res.headers })
}

// a GPU adapter, not a fallback one (WebGPU on the CPU is slower than wasm): @audio/neural-runtime's backends() test
const hasGPU = async () => { const a = await navigator.gpu?.requestAdapter().catch(() => null); return !!a && !a.info?.isFallbackAdapter && a.info?.architecture !== 'swiftshader' }

async function split(a, { model, targets }, ui, alive = () => true) {
  const { default: separate, models } = await separateLib
  const name = NAMES[model]
  // Mel-RoFormer's preset picks its own GPU path; SCNet runs on onnxruntime's WebGPU where there is a GPU
  let device = models[model].gpu ? undefined : await hasGPU() ? 'webgpu' : 'wasm', first = 0, t0 = performance.now()
  const stop = () => { if (!alive()) throw Error('Stopped') }
  let shown = 0
  downloads.clear()
  onBytes = (loaded, total) => {
    stop()
    // the separation's time starts where the download ends: that is paid once
    t0 = performance.now()
    if (t0 - shown < 100 && loaded < total) return
    shown = t0
    ui.status(total && loaded >= total ? 'Starting ' + name + '…' : 'Downloading ' + name + ': ' + (loaded / 1e6).toFixed(1) + (total ? ' of ' + (total / 1e6).toFixed(1) : '') + ' MB')
    if (total) ui.progress(loaded / total)
  }
  const progress = ({ chunk, totalChunks }) => {
    stop()
    const now = performance.now()
    if (chunk === 1) first = now
    const left = chunk > 1 ? (now - first) / (chunk - 1) * (totalChunks - chunk + 1) / 1000 : 0
    ui.status('Separating on the ' + (device === 'wasm' ? 'CPU' : 'GPU') + ': part ' + chunk + ' of ' + totalChunks + (left ? ', about ' + fmtTime(Math.max(1, left)) + ' left' : ''))
    ui.progress((chunk - 1) / totalChunks)
  }
  const run = () => separate({ channelData: a.channelData.slice(0, 2), sampleRate: a.sampleRate }, { model, targets, step: 0.5, device, progress })
  ui.status('Loading ' + name + '…')
  let r
  try { r = await run() }
  catch (e) {
    if (device !== 'webgpu' || !alive()) throw e
    // WebGPU refused the model or failed in it: the CPU, slower
    console.warn('WebGPU failed, running on the CPU:', e)
    device = 'wasm'
    r = await run()
  } finally { onBytes = null }
  const stems = r.stems
  // a mono file, heard as stereo: the mean of the two
  if (a.channelData.length === 1) for (const k in stems) { const [l, rr] = stems[k]; stems[k] = [l.map((v, i) => (v + rr[i]) / 2)] }
  return { stems, device: device || 'webgpu', seconds: (performance.now() - t0) / 1000 }
}
`

// The page: drop a file, read what the split costs here, start it, hear and save the stems. A real function, so the
// build parses it; its source becomes the page's module script, run with the worker's URL and the build's constants.
async function stemSplitter(worker, { UTIL, SEPARATE, MODELS, STEMS }) {
  const { decodeFile, chLabel } = await import(UTIL)
  const form = $('opts'), select = form.elements.model, hint = $('hint')
  const panel = $('panel'), name = $('name'), meta = $('meta'), reset = $('reset')
  const plan = $('plan'), planText = $('planText'), start = $('start')
  const progress = $('progress'), status = $('status'), bar = $('bar'), cancel = $('cancel')
  const report = $('report'), mixer = $('mixer'), play = $('play'), time = $('time'), seek = $('seek'), rows = $('stems')
  const fmt = $('fmt'), saveMix = $('saveMix'), mixNote = $('mixNote')
  const LABEL = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other' }

  // ONNX Runtime Web ships SIMD builds only: no WebAssembly SIMD, no model
  const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
  let gpu = false
  const ready = (async () => {
    const a = await navigator.gpu?.requestAdapter().catch(() => null)
    gpu = !!a && !a.info?.isFallbackAdapter && a.info?.architecture !== 'swiftshader'
    hint.textContent = !simd ? 'This browser cannot run the model: it lacks WebAssembly SIMD, which Chrome 91, Firefox 89 and Safari 16.4 and later have.'
      : gpu ? 'This browser has WebGPU: the model runs on the graphics card.'
      : 'This browser has no WebGPU: the model runs on the CPU, several times slower.'
  })()
  for (const k of ['wav', 'flac', 'mp3']) fmt.append(el('option', { value: k }, FORMATS[k].label))

  let file = null, audio = null, job = null, runs = 0, done = null, bufs = null, peak = 1
  const zone = dropzone($('drop'), $('file'), load)
  const model = () => select.value
  const mb = n => (n / 1e6).toFixed(n < 1e8 ? 1 : 0) + ' MB'
  const about = s => s < 90 ? Math.round(s) + ' s' : Math.round(s / 60) + ' min'

  // the hosted file's URL as @audio/neural-separate builds it, and whether the browser's cache holds it
  async function cached(m) {
    try {
      const { models, REVISIONS } = await import(SEPARATE), p = models[m]
      const store = await caches.open('audio-neural')
      return !!await store.match(`https://huggingface.co/${p.repo}/resolve/${REVISIONS[m]}/${p.file}`)
    } catch { return false }
  }

  async function showPlan(prefix = '') {
    await ready
    const m = MODELS[model()], dur = audio.duration, pace = gpu ? m.gpu : m.cpu
    const lo = 5 + pace * dur, have = await cached(model())
    planText.textContent = (prefix ? prefix + ' ' : '') + m.name + ': ' + (have ? 'downloaded already. About ' : mb(m.bytes) + ' to download, once, then about ') +
      about(lo) + ' to ' + about(3 * lo) + ' on the ' + (gpu ? 'GPU' : 'CPU') + ' for ' + fmtTime(dur) + ' of audio.' +
      (dur > 600 ? ' A file this long takes several GB of memory: if the tab runs out, split it into parts.' : '')
    start.textContent = done ? 'Split again with ' + m.name : 'Split into stems'
    start.disabled = !simd
    plan.hidden = false
  }

  async function load(f) {
    stopJob(); pause(); release(); file = f; audio = null; runs++
    zone.hide(); panel.hidden = false; plan.hidden = report.hidden = mixer.hidden = true
    name.textContent = f.name; meta.textContent = fmtSize(f.size)
    say('Decoding…')
    const id = runs
    try {
      const d = await decodeFile(f)
      if (id !== runs) return
      audio = { ...d, duration: d.channelData[0].length / d.sampleRate }
      meta.textContent = fmtSize(f.size) + ' · ' + fmtTime(audio.duration) + ' · ' + chLabel(d.channelData.length) + ' · ' + d.sampleRate / 1000 + ' kHz' + (d.channelData.length > 2 ? ' · its first two channels are split' : '')
      progress.hidden = true
      showPlan()
    } catch (e) {
      if (id !== runs) return
      console.error(e)
      fail("Can't read this file: no decoder for this format. Try a different container.")
    }
  }

  function say(msg, p) {
    progress.hidden = false; status.textContent = msg; status.classList.remove('err')
    bar.hidden = p == null
    if (p != null) { bar.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100)) }
  }
  function fail(msg) { progress.hidden = false; status.textContent = msg; status.classList.add('err'); bar.hidden = true; cancel.hidden = true }

  function split() {
    stopJob(); pause()
    const id = ++runs, m = model()
    plan.hidden = true; cancel.hidden = false; select.disabled = true
    say('Starting…', 0)
    job = new Worker(worker, { type: 'module' })
    job.onmessage = e => {
      const d = e.data
      if (id !== runs) return
      if (d.type === 'status') status.textContent = d.msg
      else if (d.type === 'progress') say(status.textContent, d.p)
      else if (d.type === 'error') { stopJob(); fail(d.message); showPlan() }
      else if (d.type === 'done') { stopJob(); finish(d, m) }
    }
    job.onerror = e => { e.preventDefault(); if (id !== runs) return; stopJob(); fail('The separation code did not load (' + (e.message || 'network error') + '). Check the connection and try again.'); showPlan() }
    // the worker gets a copy: the song stays here for the mix
    job.postMessage({ audio: { channelData: audio.channelData, sampleRate: audio.sampleRate }, model: m })
  }
  function stopJob() { job?.terminate(); job = null; select.disabled = false; cancel.hidden = true }

  function finish({ stems, device, seconds }, m) {
    progress.hidden = true
    pause(); release(true)
    // the stems live in AudioBuffers from here: played from there, saved from getChannelData()
    bufs = Object.fromEntries(STEMS.map(s => {
      const chs = stems[s], b = new AudioBuffer({ length: chs[0].length, numberOfChannels: chs.length, sampleRate: audio.sampleRate })
      chs.forEach((c, i) => b.copyToChannel(c, i))
      return [s, b]
    }))
    peak = 1e-9
    for (const c of audio.channelData) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v }
    done = { model: m, device, seconds }
    report.replaceChildren(
      el('div', {}, el('div', { class: 'k' }, 'Model'), el('div', { class: 'v', html: MODELS[m].name })),
      el('div', {}, el('div', { class: 'k' }, 'Separated in'), el('div', { class: 'v', html: fmtTime(seconds) + '<small>on the ' + (device === 'wasm' ? 'CPU' : 'GPU') + '</small>' })))
    report.hidden = false
    state = Object.fromEntries(STEMS.map(s => [s, { db: 0, mute: false, solo: false }]))
    rows.replaceChildren(...STEMS.map(row))
    mixer.hidden = false
    at = 0; tick(); draw(); gains()
  }

  // ── the mixer: one row per stem, its waveform at the song's scale ──
  let state = {}, ctx = null, nodes = null, srcs = null, t0 = 0, at = 0, raf = 0, dragging = false
  const dur = () => bufs.vocals.duration
  const gain = s => state[s].mute || (STEMS.some(k => state[k].solo) && !state[s].solo) ? 0 : 10 ** (state[s].db / 20)
  const dbText = db => (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db).toFixed(1) + ' dB'

  function row(s) {
    const tog = (act, text, label) => {
      const b = el('button', { type: 'button', class: 'tog', 'aria-pressed': 'false', 'aria-label': label + ' ' + LABEL[s].toLowerCase(), title: label }, text)
      b.addEventListener('click', () => { state[s][act] = !state[s][act]; b.setAttribute('aria-pressed', state[s][act]); gains() })
      return b
    }
    const level = el('input', { type: 'range', min: '-30', max: '6', step: '0.5', value: '0', 'aria-label': LABEL[s] + ' level' })
    const out = el('output', {}, dbText(0))
    level.addEventListener('input', () => { state[s].db = +level.value; out.value = dbText(state[s].db); gains() })
    level.addEventListener('dblclick', () => { level.value = 0; level.dispatchEvent(new Event('input')) })
    const canvas = el('canvas', { 'aria-hidden': 'true' }), wave = el('div', { class: 'wave' }, canvas, el('i', { class: 'head' }))
    wave.addEventListener('click', e => { const r = wave.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width * dur()) })
    const save = el('a', { class: 'btn ghost save', href: '#', 'data-stem': s }, 'Save')
    save.addEventListener('click', e => saveAs(e, save, s))
    return el('div', { class: 'stem', 'data-stem': s }, el('span', { class: 'name' }, LABEL[s]), wave, tog('mute', 'M', 'Mute'), tog('solo', 'S', 'Solo'), level, out, save)
  }

  function draw() {
    if (!bufs || mixer.hidden) return
    const ink = getComputedStyle(document.body).getPropertyValue('--c-ink').trim() || '#0d1014'
    for (const r of rows.children) {
      const c = r.querySelector('canvas'), b = bufs[r.dataset.stem], W = Math.max(1, Math.round(c.clientWidth * devicePixelRatio)), H = Math.max(1, Math.round(c.clientHeight * devicePixelRatio))
      c.width = W; c.height = H
      const g = c.getContext('2d'), chs = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)), n = b.length, step = n / W
      g.fillStyle = ink
      for (let x = 0; x < W; x++) {
        let m = 0
        for (let i = Math.floor(x * step), e = Math.min(n, Math.floor((x + 1) * step)); i < e; i++) for (const ch of chs) { const v = Math.abs(ch[i]); if (v > m) m = v }
        const h = Math.max(1, Math.min(1, m / peak) * H)
        g.fillRect(x, (H - h) / 2, 1, h)
      }
    }
  }
  new ResizeObserver(() => draw()).observe(rows)

  function gains() {
    for (const r of rows.children) r.classList.toggle('silent', gain(r.dataset.stem) === 0)
    if (nodes) for (const s of STEMS) nodes[s].gain.setTargetAtTime(gain(s), ctx.currentTime, 0.015)
    mixNote.textContent = ''
  }

  // playback: one source per stem into its gain, all started at the same instant
  const pos = () => srcs ? Math.min(dur(), ctx.currentTime - t0) : at
  function resume() {
    ctx ??= new AudioContext()
    nodes ??= Object.fromEntries(STEMS.map(s => { const g = ctx.createGain(); g.connect(ctx.destination); return [s, g] }))
    for (const s of STEMS) { nodes[s].gain.cancelScheduledValues(0); nodes[s].gain.value = gain(s) }
    ctx.resume()
    if (at >= dur() - 0.05) at = 0
    const when = ctx.currentTime + 0.03, mine = srcs = STEMS.map(s => { const n = ctx.createBufferSource(); n.buffer = bufs[s]; n.connect(nodes[s]); n.start(when, at); return n })
    t0 = when - at
    mine[0].onended = () => { if (srcs === mine) { at = dur(); pause(); at = 0; tick() } }
    play.textContent = 'Pause'; play.setAttribute('aria-label', 'Pause')
    raf = requestAnimationFrame(loop)
  }
  function pause() {
    if (!srcs) return
    at = pos()
    const old = srcs; srcs = null
    for (const n of old) n.stop()
    cancelAnimationFrame(raf)
    play.textContent = 'Play'; play.setAttribute('aria-label', 'Play')
    tick()
  }
  function seekTo(t) { const was = !!srcs; pause(); at = Math.max(0, Math.min(dur(), t)); tick(); if (was) resume() }
  function loop() { tick(); if (srcs) raf = requestAnimationFrame(loop) }
  function tick() {
    if (!bufs) return
    const t = pos(), p = (t / dur() * 100).toFixed(3) + '%'
    time.textContent = fmtTime(t) + ' / ' + fmtTime(dur())
    if (!dragging) { seek.max = dur(); seek.value = t }
    for (const h of rows.querySelectorAll('.head')) h.style.left = p
  }
  play.addEventListener('click', () => srcs ? pause() : resume())
  seek.addEventListener('pointerdown', () => { dragging = true })
  seek.addEventListener('change', () => { dragging = false; seekTo(+seek.value) })
  seek.addEventListener('input', () => { time.textContent = fmtTime(+seek.value) + ' / ' + fmtTime(dur()) })

  // ── saving: a stem as it is, or the mix, the song plus each stem's change, Σ (g − 1)·stem ──
  const base = () => file.name.replace(/\.[^.]+$/, '')
  function mixed() {
    const K = bufs.vocals.numberOfChannels, d = STEMS.map(s => [s, gain(s) - 1]).filter(([, g]) => g)
    return audio.channelData.map((x, c) => {
      if (c >= K || !d.length) return x
      const out = Float32Array.from(x)
      for (const [s, g] of d) { const v = bufs[s].getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += g * v[i] }
      return out
    })
  }
  const mixName = () => STEMS.filter(s => gain(s) !== 1).map(s => gain(s) === 0 ? s + '-off' : s + (state[s].db > 0 ? '+' : '') + state[s].db + 'dB').join('-') || 'mix'
  async function saveAs(e, a, s) {
    const f = fmt.value, key = f + ':' + (s ? '' : STEMS.map(gain).join())
    if (a.dataset.key === key) return   // encoded already: the browser saves the href
    e.preventDefault()
    if (a.classList.contains('busy')) return
    const label = a.textContent
    a.classList.add('busy'); a.textContent = 'Encoding…'
    try {
      const channelData = s ? Array.from({ length: bufs[s].numberOfChannels }, (_, i) => bufs[s].getChannelData(i)) : mixed()
      if (!s) {
        let p = 0
        for (const c of channelData) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v }
        mixNote.textContent = p > 1 ? 'The mix peaks ' + (20 * Math.log10(p)).toFixed(1) + ' dB over full scale and clips: lower a stem.' : ''
      }
      const blob = await encodeAudio(f, { channelData, sampleRate: audio.sampleRate, meta: s ? null : audio.meta })
      if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href)
      a.href = URL.createObjectURL(blob)
      a.download = base() + '-' + (s || mixName()) + '.' + FORMATS[f].ext
      a.dataset.key = key
      a.textContent = label
      a.title = a.download + ' · ' + fmtSize(blob.size)
      a.classList.remove('busy')
      a.click()
    } catch (err) {
      console.error(err)
      a.textContent = label; a.classList.remove('busy')
      mixNote.textContent = FORMATS[f].ext.toUpperCase() + ' encoding failed in this browser: pick another format.'
    }
  }
  saveMix.addEventListener('click', e => saveAs(e, saveMix, null))

  // ── controls ──
  start.addEventListener('click', split)
  cancel.addEventListener('click', () => { runs++; stopJob(); progress.hidden = true; showPlan('Stopped.') })
  select.addEventListener('change', () => { if (audio && !job) showPlan() })
  reset.addEventListener('click', () => { runs++; stopJob(); pause(); release(); panel.hidden = true; zone.show() })
  function unlink() { for (const a of [...rows.querySelectorAll('a'), saveMix]) { if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href); a.href = '#'; delete a.dataset.key } }
  function release(keep) { unlink(); bufs = null; if (!keep) { done = null; mixer.hidden = report.hidden = true } }
}

export default {
  slug: 'stem-splitter', order: 62, isolated: true,
  name: 'Stem splitter', short: 'Vocals, drums, bass and other from any song, by the SCNet model; play, mute, solo, rebalance, save',
  title: 'Stem splitter: separate vocals, drums, bass and other from a song, free, in your browser',
  description: 'Split a song into vocals, drums, bass and other stems with a trained model (SCNet) running in your browser. Make a karaoke track, isolate an instrument, rebalance the mix, save WAV, FLAC or MP3. No upload; the 13 MB model downloads once.',
  lead: 'Drop a song. A trained model splits it into vocals, drums, bass and other: listen to each, mute, solo, rebalance, save.',
  powered: ['@audio/neural-separate', '@audio/decode', '@audio/encode'], repo: 'https://github.com/audiojs/neural',
  body: drop('Drop a song here') + `
    <form class="opts" id="opts">
      <label>Model <select name="model">
        <option value="scnet" selected>SCNet · 13 MB · fast</option>
        <option value="scnet-large">SCNet-large · 45 MB · cleaner, slower</option>
      </select></label>
    </form>
    <p class="hint" id="hint" aria-live="polite"></p>
    <section class="panel" id="panel" hidden>
      <div class="row">
        <div class="file"><div class="n" id="name"></div><div class="m" id="meta"></div></div>
        <button class="btn ghost" id="reset" type="button">Another file</button>
      </div>
      <div class="row" id="plan" hidden aria-live="polite">
        <div class="status" id="planText"></div>
        <button class="btn" id="start" type="button">Split into stems</button>
      </div>
      <div class="row" id="progress" hidden>
        <div class="status" id="status" role="status"></div>
        <button class="btn ghost" id="cancel" type="button" hidden>Cancel</button>
        <div class="bar" id="bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      </div>
      <div class="row report" id="report" hidden></div>
      <div id="mixer" hidden>
        <div class="row transport">
          <button class="btn" id="play" type="button" aria-label="Play">Play</button>
          <span class="time" id="time">0:00 / 0:00</span>
          <input type="range" id="seek" min="0" max="1" step="0.01" value="0" aria-label="Position">
        </div>
        <div id="stems"></div>
        <div class="row out">
          <label class="fmt">Format <select id="fmt"></select></label>
          <span class="spacer"></span>
          <a class="btn" id="saveMix" href="#">Save the mix</a>
          <div class="note" id="mixNote" aria-live="polite"></div>
        </div>
      </div>
    </section>
    <style>
      #opts label { min-width: 0; max-width: 100%; } #opts select { min-width: 0; max-width: 100%; text-overflow: ellipsis; }
      .hint { margin-top: 12px; min-height: 1.4em; font-size: var(--fs-xs); font-weight: 500; color: var(--c-mute); text-align: center; }
      #plan .status { min-width: min(100%, 16em); }
      .transport { gap: 12px; }
      .transport .time { font-variant-numeric: tabular-nums; font-size: var(--fs-sm); font-weight: 600; min-width: 7.5em; }
      .transport input { flex: 1 1 160px; min-width: 0; accent-color: var(--c-accent); }
      .stem { display: grid; grid-template-columns: 4.2em minmax(0, 1fr) auto auto 7.5em 4.6em auto; grid-template-areas: "name wave mute solo level db save"; align-items: center; gap: 8px 10px; padding: 10px 20px; border-top: 1px solid var(--c-rule); }
      .stem .name { grid-area: name; font-weight: 700; font-size: var(--fs-sm); }
      .stem .wave { grid-area: wave; position: relative; height: 36px; cursor: pointer; }
      .stem canvas { display: block; width: 100%; height: 100%; }
      .stem .head { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; margin-left: -1px; background: var(--c-accent); pointer-events: none; }
      .stem.silent .wave, .stem.silent .name { opacity: .35; }
      .stem .tog { width: 32px; height: 32px; padding: 0; border: 1px solid var(--c-rule); border-radius: 6px; background: #fff; font-weight: 700; cursor: pointer; }
      .stem .tog:nth-of-type(1) { grid-area: mute; } .stem .tog:nth-of-type(2) { grid-area: solo; }
      .stem .tog[aria-pressed="true"] { background: var(--c-ink); color: var(--c-paper); border-color: var(--c-ink); }
      .stem input { grid-area: level; width: 100%; min-width: 0; accent-color: var(--c-accent); }
      .stem output { grid-area: db; font-size: var(--fs-xs); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
      .stem .save { grid-area: save; padding: 6px 12px; }
      .stem button:focus-visible, .transport button:focus-visible, #mixer a:focus-visible, #plan button:focus-visible, #cancel:focus-visible, .stem input:focus-visible, .transport input:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
      #mixer .out { border-top: 1px solid var(--c-rule); }
      #mixer .note { flex-basis: 100%; font-size: var(--fs-xs); font-weight: 500; color: var(--c-err); }
      #mixer .note:empty { display: none; }
      .btn.busy { opacity: .6; cursor: progress; }
      @media (max-width: 560px) {
        .stem { grid-template-columns: minmax(0, 1fr) auto auto auto; grid-template-areas: "name mute solo save" "wave wave wave wave" "level level level db"; padding: 12px 16px; }
      }
    </style>`,
  worker: separation + `
onmessage = async e => {
  const ui = { status: msg => postMessage({ type: 'status', msg }), progress: p => postMessage({ type: 'progress', p }) }
  try {
    const { stems, device, seconds } = await split(e.data.audio, { model: e.data.model }, ui)
    postMessage({ type: 'done', stems, device, seconds }, [...new Set(Object.values(stems).flat().map(c => c.buffer))])
  } catch (err) { postMessage({ type: 'error', message: err.message || String(err) }) }
}
`,
  // the function's source, called with the worker's URL (PROCESS, filled in by the build) and the constants it reads
  script: `(${stemSplitter})(PROCESS, ${JSON.stringify({ UTIL, SEPARATE, MODELS, STEMS })})`,
  faq: [
    ['Is my song uploaded?', 'No. The song is decoded, separated and encoded in this tab. What travels over the network is the model: SCNet\'s weights (13 MB, or 45 MB for SCNet-large) from huggingface.co, fetched once and kept in the browser\'s cache, and ONNX Runtime from jsDelivr.'],
    ['Is this Demucs?', 'No. It runs SCNet, a different network (Tong et al., ICASSP 2024). On the 50 MUSDB18 test previews, SCNet-large\'s median SDR is 11.00 dB for vocals, 10.27 drums, 8.21 bass and 6.87 other, against Hybrid Transformer Demucs\'s 8.86, 9.55, 9.30 and 5.69: cleaner on three stems, behind on bass. Demucs\'s weights are licensed for research only, so this page does not ship them.'],
    ['How long does it take?', 'It depends on the graphics card more than anything. In Chromium on an Apple M4 Max, SCNet split a 4-minute song in 73 seconds on the GPU (WebGPU) and in 6 minutes 45 seconds on one CPU thread. SCNet-large took 2.1 seconds per second of audio on the GPU. The page shows an estimate before you start and the time left while it runs.'],
    ['What if my browser has no WebGPU?', 'The model runs on the CPU through WebAssembly: the same result, several times slower. Firefox 148 and Chromium ran SCNet at the same pace on both paths. A browser without WebAssembly SIMD (before Chrome 91, Firefox 89, Safari 16.4) cannot run it, and the page says so.'],
    ['Do the stems add back to the song?', 'Very nearly. SCNet takes the song\'s mean out before it listens and gives it to no stem, and nothing forces its four stems to add up: on the test files here they summed to the song less its DC offset, give or take 38 to 43 dB under it. The mix you save loses nothing: it is the song plus each stem\'s change, so with every stem at 0 dB it is the song itself.'],
    ['How much memory does it need?', 'In Chromium, a 4-minute song took about 2 GB on top of the idle browser with SCNet on the GPU and 2.5 GB on the CPU; SCNet-large on the CPU took 3 GB for 10 seconds. Very long files can exhaust a tab: split them into parts.'],
    ['Can I use the stems commercially?', 'The model weights are MIT-licensed: SCNet\'s author confirmed it for the released checkpoints. They were trained on MUSDB18-HQ, whose licence covers educational use, and whether that reaches a model trained on it is unsettled. The song\'s own copyright is unchanged by splitting it.'],
  ],
  seo: `
      <h2>Stems from a song, in the browser</h2>
      <p>This page runs <a href="https://github.com/starrytong/SCNet" target="_blank" rel="noopener">SCNet</a>, a music source separation network, through <code>@audio/neural-separate</code> and <a href="https://onnxruntime.ai/docs/tutorials/web/" target="_blank" rel="noopener">ONNX Runtime Web</a>. Drop a song and it comes back as four tracks: vocals, drums, bass and everything else. Play them together, mute or solo any of them, move their levels, and save each stem or the new mix as WAV, FLAC or MP3. Nothing is uploaded.</p>
      <h3>What it is good for</h3>
      <ul>
        <li><strong>Karaoke from an MP3</strong>: mute the vocals and save the mix. For vocals only, the <a href="/util/vocal-remover/">vocal remover</a> does it in one step and offers a larger vocals model.</li>
        <li><strong>Practice</strong>: solo the bass or the drums to learn a part, or mute your own instrument and play along.</li>
        <li><strong>Remixing and sampling</strong>: an a cappella, a drum break, a bass line, each as its own file.</li>
        <li><strong>Rebalancing</strong>: the vocals 3 dB up in a mix that buries them, the drums down for a quieter room.</li>
        <li><strong>A voice from under the music</strong>: the vocals stem keeps singing or speech and drops the music behind it. For speech under traffic, wind or hum, the <a href="/util/denoise/">noise remover</a> fits better.</li>
      </ul>
      <h3>Two models</h3>
      <p>SCNet splits the spectrum into bands and models the low ones in more detail than the high ones, with LSTMs running along time and frequency. Both sizes were trained on MUSDB18-HQ by SCNet's authors; @audio/neural-separate runs their checkpoints with 8-bit weights, within 0.05 dB of the originals' median scores. Median SDR on the 50 MUSDB18 test previews (higher is cleaner):</p>
      <ul>
        <li><strong>SCNet</strong> (13 MB): vocals 9.88 dB, drums 9.43, bass 8.35, other 6.15.</li>
        <li><strong>SCNet-large</strong> (45 MB): vocals 11.00 dB, drums 10.27, bass 8.21, other 6.87. On the same songs iZotope RX 12 Music Rebalance at its Best setting scores 10.89, 9.85, 9.66 and 6.45.</li>
      </ul>
      <p>The model hears the song in 11-second parts, each overlapping the next by half, and blends them. It is not perfect: reverb tails and backing vocals can leak between stems, and an electronic bass may land in other.</p>
      <h3>References</h3>
      <ul>
        <li>W. Tong et al., <a href="https://arxiv.org/abs/2401.13276" target="_blank" rel="noopener">SCNet: Sparse Compression Network for Music Source Separation</a>, ICASSP 2024. Code and weights: <a href="https://github.com/starrytong/SCNet" target="_blank" rel="noopener">starrytong/SCNet</a> (MIT; the weights' licence confirmed in <a href="https://github.com/starrytong/SCNet/issues/35" target="_blank" rel="noopener">issue #35</a>), configs hosted by <a href="https://github.com/ZFTurbo/Music-Source-Separation-Training" target="_blank" rel="noopener">ZFTurbo/Music-Source-Separation-Training</a>.</li>
        <li>S. Rouard, F. Massa, A. Défossez, <a href="https://arxiv.org/abs/2211.08553" target="_blank" rel="noopener">Hybrid Transformers for Music Source Separation</a>, ICASSP 2023 (HT Demucs); its weights' terms in <a href="https://github.com/facebookresearch/demucs/issues/327" target="_blank" rel="noopener">demucs#327</a>.</li>
        <li>Z. Rafii, A. Liutkus, F.-R. Stöter, S. I. Mimilakis, R. Bittner, <a href="https://sigsep.github.io/datasets/musdb.html" target="_blank" rel="noopener">The MUSDB18 corpus for music separation</a>, 2017.</li>
        <li>F.-R. Stöter, A. Liutkus, N. Ito, <a href="https://arxiv.org/abs/1804.06267" target="_blank" rel="noopener">The 2018 Signal Separation Evaluation Campaign</a>, LVA/ICA 2018: SDR by BSSEval v4, the median over 1-second windows, then over songs.</li>
        <li>Every score above, and the 8-bit weights: <a href="https://github.com/audiojs/neural/tree/main/packages/neural-separate" target="_blank" rel="noopener">@audio/neural-separate's README</a>.</li>
      </ul>`,
}
