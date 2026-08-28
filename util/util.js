// audiojs utilities — shared shell: file in → decode → process → report / encode → save.
// Pages call tool({ process }) for file tools; live tools use mic() and the helpers.

const DECODE = 'https://esm.sh/@audio/decode@3.14.0?deps=@audio/decode-mp4@1.1.0,@audio/decode-avi@1.1.0,@audio/decode-webm@1.6.0,@audio/decode-aac@1.5.0,@audio/decode-ac3@1.0.0,@audio/decode-dts@1.0.0'
const ENCODE = 'https://esm.sh/@audio/encode@1.6.3'
const MIC = 'https://esm.sh/@audio/mic@1.1.2'

export const FORMATS = {
  mp3: { label: 'MP3 · 256 kbps', ext: 'mp3', mime: 'audio/mpeg', opts: { bitrate: 256 } },
  wav: { label: 'WAV · 16-bit', ext: 'wav', mime: 'audio/wav', opts: { bitDepth: 16 } },
  flac: { label: 'FLAC · lossless', ext: 'flac', mime: 'audio/flac', opts: {} },
  ogg: { label: 'OGG Vorbis', ext: 'ogg', mime: 'audio/ogg', opts: { quality: 6 } },
  opus: { label: 'Opus', ext: 'opus', mime: 'audio/ogg', opts: { bitrate: 128 } },
  aac: { label: 'AAC', ext: 'aac', mime: 'audio/aac', opts: { bitrate: 192 } },
}

let decodeP, encodeP, micP
export const decodeLib = () => decodeP ??= import(DECODE).then(m => m.default)
export const encodeLib = () => encodeP ??= import(ENCODE).then(m => m.default)
export const micLib = () => micP ??= import(MIC).then(m => m.default)

export const $ = id => document.getElementById(id)
export const fmtSize = n => n < 1e6 ? (n / 1e3).toFixed(0) + ' KB' : n < 1e9 ? (n / 1e6).toFixed(1) + ' MB' : (n / 1e9).toFixed(2) + ' GB'
export const fmtTime = s => { s = Math.round(s); const m = Math.floor(s / 60); return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0') }
export const chLabel = n => n === 1 ? 'mono' : n === 2 ? 'stereo' : n === 6 ? '5.1' : n + ' ch'
export const el = (tag, attrs = {}, ...children) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : k === 'html' ? e.innerHTML = v : e.setAttribute(k, v); e.append(...children); return e }

// ── decode: @audio/decode (JS/WASM demux + codecs) → browser decoder → real-time capture ──
export async function decodeFile(file, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    const { channelData, sampleRate } = await (await decodeLib())(bytes)
    if (!channelData.length) throw Error('empty')
    return { channelData, sampleRate }
  } catch (e) { console.warn('@audio/decode:', e.message) }
  try {
    const b = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer.slice(0))
    return { channelData: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), sampleRate: b.sampleRate }
  } catch (e) { console.warn('decodeAudioData:', e.message) }
  return capture(file, onProgress)
}

// last resort: play the file silently through the audio graph and record PCM in real time
async function capture(f, onProgress) {
  const RATE = 48000
  const ctx = new AudioContext({ sampleRate: RATE })
  await ctx.resume()
  const src = URL.createObjectURL(f)
  const video = Object.assign(document.createElement('video'), { src, preload: 'auto', crossOrigin: 'anonymous' })
  video.style.display = 'none'; document.body.append(video)
  try {
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(Error('cannot play')) })
    const worklet = URL.createObjectURL(new Blob([`registerProcessor('rec', class extends AudioWorkletProcessor {
      process(inputs) { const i = inputs[0]; if (i.length) this.port.postMessage(i.map(c => c.slice())); return true }
    })`], { type: 'text/javascript' }))
    await ctx.audioWorklet.addModule(worklet)
    const rec = new AudioWorkletNode(ctx, 'rec'), mute = new GainNode(ctx, { gain: 0 })
    const chunks = []; let nch = 0
    rec.port.onmessage = e => { chunks.push(e.data); nch = Math.max(nch, e.data.length) }
    ctx.createMediaElementSource(video).connect(rec).connect(mute).connect(ctx.destination)
    const tick = setInterval(() => onProgress?.(video.currentTime / video.duration || 0), 200)
    await video.play()
    await new Promise((res, rej) => { video.onended = res; video.onerror = () => rej(Error('playback failed')) })
    clearInterval(tick)
    rec.port.onmessage = null
    const len = chunks.reduce((n, c) => n + c[0].length, 0)
    const channelData = Array.from({ length: nch || 1 }, (_, ch) => { const d = new Float32Array(len); let off = 0; for (const c of chunks) { d.set(c[ch] || c[0], off); off += c[0].length } return d })
    return { channelData, sampleRate: RATE }
  } finally { video.remove(); URL.revokeObjectURL(src); ctx.close() }
}

export async function encodeAudio(fmt, audio) {
  const f = FORMATS[fmt], enc = await encodeLib()
  const bytes = await enc[fmt](audio.channelData, { sampleRate: audio.sampleRate, ...f.opts })
  return new Blob([bytes], { type: f.mime })
}

export const audioBuffer = ({ channelData, sampleRate }) => ({ channelData, sampleRate, duration: channelData[0].length / sampleRate, channels: channelData.length })

// ── file tool ──
// cfg.process(audio, opts, ui) → { audio?, report?: [{ k, v, cls?, note? }], viz?: Node, suffix? }
export function tool(cfg) {
  const drop = $('drop'), input = $('file'), opts = $('opts')
  const panel = el('section', { class: 'panel', id: 'panel', hidden: '', 'aria-live': 'polite' })
  const name = el('div', { class: 'n' }), meta = el('div', { class: 'm' })
  const reset = el('button', { class: 'btn ghost', type: 'button' }, 'Another file')
  const status = el('div', { class: 'status' }), bar = el('div', { class: 'bar' }, el('i'))
  const progress = el('div', { class: 'row' }, status, bar)
  const report = el('div', { class: 'row report', hidden: '' })
  const viz = el('div', { class: 'row viz', hidden: '' })
  const player = el('audio', { controls: '', preload: 'metadata' })
  const fmt = el('select', {}, ...Object.entries(FORMATS).filter(([k]) => !cfg.formats || cfg.formats.includes(k)).map(([k, f]) => el('option', { value: k }, f.label)))
  const saveLabel = el('span', {}, 'Save')
  const save = el('a', { class: 'btn', download: '' }, el('span', { html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11"/></svg>' }), saveLabel)
  const out = el('div', { class: 'row out', hidden: '' }, player, el('label', { class: 'fmt' }, 'Format ', fmt), el('span', { class: 'spacer' }), save)
  panel.append(el('div', { class: 'row' }, el('div', { class: 'file' }, name, meta), reset), progress, report, viz, out)
  ;(opts || drop).after(panel)
  fmt.value = cfg.defaultFormat || 'mp3'

  let run = 0, file = null, audio = null, result = null, url = null
  const pick = f => { if (f) load(f) }
  drop.addEventListener('click', () => input.click())
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() } })
  input.addEventListener('change', () => { pick(input.files[0]); input.value = '' })
  for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over') })
  for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over') })
  document.addEventListener('drop', e => pick(e.dataTransfer.files[0]))
  document.addEventListener('paste', e => pick(e.clipboardData?.files[0]))
  reset.addEventListener('click', () => { run++; release(); panel.hidden = true; drop.focus() })
  fmt.addEventListener('change', () => result?.audio && encode())
  opts?.addEventListener('change', () => audio && process())
  opts?.addEventListener('input', e => { const o = e.target.closest('label')?.querySelector('output'); if (o && e.target.type === 'range') o.value = e.target.value })

  const ui = {
    status(msg, busy = true) { progress.hidden = false; status.textContent = msg; status.classList.remove('err'); bar.hidden = false; bar.classList.toggle('busy', busy) },
    progress(p) { bar.classList.remove('busy'); bar.firstElementChild.style.width = (p * 100).toFixed(1) + '%' },
    error(msg) { progress.hidden = false; status.textContent = msg; status.classList.add('err'); bar.hidden = true },
    opts: () => opts ? Object.fromEntries(new FormData(opts)) : {},
  }
  const release = () => { if (url) URL.revokeObjectURL(url); url = null; player.removeAttribute('src'); audio = result = null }
  const yieldUI = () => new Promise(r => setTimeout(r, 30))

  async function load(f) {
    const id = ++run
    release(); file = f
    panel.hidden = false; report.hidden = viz.hidden = out.hidden = true
    name.textContent = f.name; meta.textContent = fmtSize(f.size)
    ui.status('Decoding…')
    try {
      const a = audioBuffer(await decodeFile(f, p => id === run && (status.textContent = 'Capturing playback… ' + (p * 100 | 0) + '%', ui.progress(p))))
      if (id !== run) return
      audio = a
      meta.textContent = `${fmtSize(f.size)} · ${fmtTime(a.duration)} · ${chLabel(a.channels)} · ${a.sampleRate / 1000} kHz`
      await process(id)
    } catch (e) {
      if (id !== run) return
      console.error(e)
      ui.error(`Can't read this file: no decoder for it here or in your browser. Try a different container.`)
    }
  }

  async function process(id = run) {
    ui.status(cfg.busy || 'Processing…')
    report.hidden = viz.hidden = out.hidden = true
    await yieldUI()
    try {
      result = await cfg.process(audio, ui.opts(), ui)
      if (id !== run) return
      if (result.report) { report.replaceChildren(...result.report.map(r => el('div', {}, el('div', { class: 'k' }, r.k), el('div', { class: 'v' + (r.cls ? ' ' + r.cls : ''), html: r.v }), ...(r.note ? [el('div', { class: 'note' }, r.note)] : [])))); report.hidden = false }
      if (result.viz) { viz.replaceChildren(result.viz); viz.hidden = false }
      if (result.audio) await encode(id)
      else progress.hidden = true
    } catch (e) {
      if (id !== run) return
      console.error(e)
      ui.error(e.message || 'Processing failed')
    }
  }

  async function encode(id = run) {
    const f = fmt.value
    out.hidden = true
    ui.status(f === 'wav' ? 'Writing WAV…' : `Encoding ${f.toUpperCase()}…`)
    try {
      const blob = await encodeAudio(f, result.audio)
      if (id !== run) return
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob)
      player.src = url
      save.href = url
      save.download = file.name.replace(/\.[^.]+$/, '') + (result.suffix || '') + '.' + FORMATS[f].ext
      saveLabel.textContent = `Save ${FORMATS[f].ext.toUpperCase()} · ${fmtSize(blob.size)}`
      progress.hidden = true; out.hidden = false
    } catch (e) {
      if (id !== run) return
      console.error(e)
      ui.error(`${f.toUpperCase()} encoding isn't available in this browser. Pick another format.`)
      out.hidden = false
    }
  }
  return { load }
}

// ── live microphone: cb(Float32Array mono chunk, sampleRate) → stop() ──
export async function mic(cb, { sampleRate = 48000 } = {}) {
  // own the context: the browser may not honour the requested rate, and the true rate must reach the caller
  const context = new AudioContext({ sampleRate })
  sampleRate = context.sampleRate
  const read = await (await micLib())({ sampleRate, channels: 1, bitDepth: 32, context })
  let live = true
  // read(cb) is a one-shot pull: re-arm from inside the callback so no chunk is missed
  const loop = (err, pcm) => { if (!live) return; if (!err && pcm) cb(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 2), sampleRate); if (live) read(loop) }
  read(loop)
  return () => { live = false; read(null); context.close() }
}

export function saveBlob(anchor, blob, filename) {
  if (anchor.href?.startsWith('blob:')) URL.revokeObjectURL(anchor.href)
  anchor.href = URL.createObjectURL(blob)
  anchor.download = filename
}
