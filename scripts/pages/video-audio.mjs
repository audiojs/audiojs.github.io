// Remove or replace the audio track of a video without re-encoding. @audio/encode-mp4 (remux),
// @audio/decode (replacement audio in), @audio/encode (AAC/Opus/ALAC/FLAC, m4a container, out).
import { drop, src } from '../page-helpers.mjs'

const REMUX = src('@audio/encode-mp4', '1.0.0', 'remux')
const DECODE = src('@audio/decode', '3.15.0')

export default {
  order: 15,
  slug: 'video-audio', name: 'Remove or replace video audio', short: 'Strip the audio track, or swap in AAC, Opus, ALAC or FLAC — the video is never re-encoded',
  title: 'Remove or replace video audio: free, in your browser',
  description: 'Remove the audio track from an MP4, MOV, M4V or 3GP video, or replace it with AAC, Opus, ALAC or FLAC. No re-encode, no upload, runs in your browser.',
  lead: 'Drop a video. Remove its audio track, or replace it with a file of your own — the video stream is never re-encoded.',
  powered: ['@audio/encode-mp4', '@audio/decode', '@audio/encode'], repo: 'https://github.com/audiojs/encode',
  body: drop('Drop a video here', 'video/mp4,video/quicktime,.mp4,.m4v,.mov,.3gp') + `
    <form class="opts" id="opts">
      <label><input type="radio" name="mode" value="remove" checked> Remove the audio track</label>
      <label><input type="radio" name="mode" value="replace"> Replace with an audio file</label>
      <label class="replace-only" hidden>Audio codec <select name="codec">
        <option value="aac">AAC</option>
        <option value="opus">Opus</option>
        <option value="alac">ALAC</option>
        <option value="flac">FLAC</option>
      </select></label>
      <label class="replace-only" hidden><input type="checkbox" name="loop"> Loop the audio to fill the video</label>
    </form>
    <div class="replace-only" id="dropBWrap" hidden>${drop('Drop the replacement audio here', 'audio/*,.m4a,.flac,.opus,.wma,.amr,.caf,.aiff', '2')}</div>
    <p class="replace-only hint" hidden>AAC needs a Chromium or Safari browser (WebCodecs) and plays in every MP4 player. Opus is smaller and plays in modern browsers and VLC. ALAC and FLAC are lossless; ALAC is the safer pick on Apple players, FLAC has the narrowest support of the four. Unchecked, the audio is trimmed to the video length, or padded with silence if it runs short; checked, it loops instead.</p>
    <section class="panel" id="panel" hidden>
      <div class="row">
        <div class="file"><div class="n" id="name"></div><div class="m" id="meta"></div></div>
        <button class="btn ghost" id="reset" type="button">Another file</button>
      </div>
      <div class="row" id="progress" hidden>
        <div class="status" id="status"></div>
        <div class="bar" id="bar"><i></i></div>
      </div>
      <div class="row report" id="report" hidden></div>
      <div class="row out" id="out" hidden>
        <video id="player" controls preload="metadata"></video>
        <span class="spacer"></span>
        <a class="btn" id="save" download><span id="saveLabel">Save</span></a>
      </div>
    </section>
    <style>
      #player { width: 100%; display: block; border-radius: 6px; background: #000; }
      .hint { margin-top: 12px; font-size: var(--fs-xs); font-weight: 500; color: var(--c-mute); text-align: center; }
    </style>`,
  script: `
    const remuxLib = import('${REMUX}').then(m => m.remux)
    const decodeLib = import('${DECODE}').then(m => m.default)

    const dropA = $('drop'), fileA = $('file'), dropB = $('drop2'), fileB = $('file2'), dropBWrap = $('dropBWrap')
    const form = $('opts'), panel = $('panel'), name = $('name'), meta = $('meta'), reset = $('reset')
    const progress = $('progress'), status = $('status'), bar = $('bar')
    const report = $('report'), out = $('out'), player = $('player'), save = $('save'), saveLabel = $('saveLabel')
    const hasAAC = typeof AudioEncoder !== 'undefined'
    const CODEC_LABEL = { aac: 'AAC <small>· 192 kbps</small>', opus: 'Opus <small>· 192 kbps</small>', alac: 'ALAC <small>· lossless</small>', flac: 'FLAC <small>· lossless</small>' }
    const dropAText = { t: dropA.querySelector('.t').innerHTML, s: dropA.querySelector('.s').innerHTML }
    const dropBText = { t: dropB.querySelector('.t').innerHTML, s: dropB.querySelector('.s').innerHTML }
    const applyCodecDefault = () => { form.codec.value = hasAAC ? 'aac' : 'flac' }
    applyCodecDefault()

    // ── tiny ISOBMFF box walker: just enough to read mvhd duration/timescale and the first video
    // track's codec fourCC. remux() itself validates and rewrites the file; this only reads.
    const readU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
    const readU64 = (b, o) => readU32(b, o) * 4294967296 + readU32(b, o + 4)
    function boxes(b, start, end) {
      const out = []; let o = start
      while (o + 8 <= end) {
        let size = readU32(b, o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]), body = o + 8
        if (size === 1) { size = readU64(b, o + 8); body = o + 16 } else if (size === 0) size = end - o
        if (size < 8) break
        out.push({ type, body, end: o + size }); o += size
      }
      return out
    }
    const findBox = (list, type) => list.find(x => x.type === type)
    const CODEC_NAMES = { avc1: 'H.264', avc3: 'H.264', hvc1: 'H.265', hev1: 'H.265', mp4v: 'MPEG-4', vp09: 'VP9', av01: 'AV1' }
    function mp4Info(bytes) {
      const top = boxes(bytes, 0, bytes.length)
      if (findBox(top, 'moof')) throw Error('This is a fragmented MP4 (a streamed or DASH export) — remuxing needs a single moov and mdat file.')
      const moov = findBox(top, 'moov')
      if (!moov) throw Error('Could not find a moov box — this is not a valid MP4/MOV file.')
      const moovC = boxes(bytes, moov.body, moov.end)
      const mvhd = findBox(moovC, 'mvhd')
      if (!mvhd) throw Error('Could not find the mvhd box — this is not a valid MP4/MOV file.')
      if (bytes[mvhd.body] === 1) throw Error('This file uses a 64-bit movie header, which this tool does not support.')
      const timescale = readU32(bytes, mvhd.body + 12), duration = readU32(bytes, mvhd.body + 16)
      let videoCodec = null
      for (const trak of moovC.filter(x => x.type === 'trak')) {
        const trakC = boxes(bytes, trak.body, trak.end)
        const mdia = findBox(trakC, 'mdia'); if (!mdia) continue
        const mdiaC = boxes(bytes, mdia.body, mdia.end)
        const hdlr = findBox(mdiaC, 'hdlr'); if (!hdlr) continue
        if (String.fromCharCode(bytes[hdlr.body + 8], bytes[hdlr.body + 9], bytes[hdlr.body + 10], bytes[hdlr.body + 11]) !== 'vide') continue
        const minf = findBox(mdiaC, 'minf'); if (!minf) continue
        const stbl = findBox(boxes(bytes, minf.body, minf.end), 'stbl'); if (!stbl) continue
        const stsd = findBox(boxes(bytes, stbl.body, stbl.end), 'stsd'); if (!stsd) continue
        const fourcc = String.fromCharCode(bytes[stsd.body + 12], bytes[stsd.body + 13], bytes[stsd.body + 14], bytes[stsd.body + 15])
        videoCodec = CODEC_NAMES[fourcc] || fourcc
        break
      }
      return { duration: duration / timescale, videoCodec }
    }
    function friendlyMp4Error(e) {
      return /moov|mvhd|fragmented|64-bit/.test(e.message) ? e.message : 'Could not read this MP4/MOV file — it may be corrupted or use a box layout this tool does not handle.'
    }

    // trim (default) or loop the replacement audio to exactly the video length; short + unlooped is silence-padded
    function fit(channelData, sampleRate, seconds, loop) {
      const len = Math.max(0, Math.round(seconds * sampleRate)), srcLen = channelData[0]?.length || 0
      return channelData.map(ch => {
        const o = new Float32Array(len)
        if (loop && srcLen) for (let i = 0; i < len; i++) o[i] = ch[i % srcLen]
        else o.set(ch.subarray(0, Math.min(srcLen, len)))
        return o
      })
    }

    function renderReport(rows) {
      report.replaceChildren(...rows.map(r => el('div', {}, el('div', { class: 'k' }, r.k), el('div', { class: 'v list', html: r.v }), ...(r.note ? [el('div', { class: 'note' }, r.note)] : []))))
      report.hidden = false
    }
    function setMsg(msg, { busy = false, err = false } = {}) {
      progress.hidden = false; status.textContent = msg; status.classList.toggle('err', err); bar.hidden = !busy; bar.classList.toggle('busy', busy)
    }
    const yieldUI = () => new Promise(r => setTimeout(r, 30))
    const showChosen = (zone, file) => { zone.querySelector('.t').textContent = file.name; zone.querySelector('.s').textContent = fmtSize(file.size) + ' · click to choose a different file' }
    const UNSUPPORTED_EXT = /\\.(mkv|webm|avi)$/i
    const release = () => { if (save.href?.startsWith('blob:')) URL.revokeObjectURL(save.href); save.removeAttribute('href'); player.removeAttribute('src') }

    function wireDrop(zone, input, onFile) {
      zone.addEventListener('click', () => input.click())
      zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() } })
      zone.addEventListener('paste', e => { const f = e.clipboardData?.files[0]; if (f) onFile(f) })
      input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = '' })
      zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('over') })
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over') })
      zone.addEventListener('dragleave', () => zone.classList.remove('over'))
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f) })
    }

    let videoFile = null, videoBytes = null, info = null, vgen = 0
    let audioFile = null, audioDecoded = null, agen = 0

    async function onVideo(file) {
      const vg = ++vgen
      release()
      videoFile = file; videoBytes = null; info = null
      showChosen(dropA, file)
      panel.hidden = false; report.hidden = out.hidden = true
      name.textContent = file.name; meta.textContent = fmtSize(file.size)
      if (UNSUPPORTED_EXT.test(file.name) || /matroska|webm|x-msvideo|\\/avi/.test(file.type)) {
        setMsg('MKV, WebM and AVI are not remuxable here — a different container from the MP4/MOV this tool rewrites. Re-encode to MP4 first (ffmpeg, HandBrake) and try again.', { err: true })
        return
      }
      setMsg('Reading video…', { busy: true })
      await yieldUI()
      try {
        videoBytes = new Uint8Array(await file.arrayBuffer())
        info = mp4Info(videoBytes)
      } catch (e) {
        if (vg !== vgen) return
        videoBytes = null
        setMsg(friendlyMp4Error(e), { err: true })
        return
      }
      if (vg !== vgen) return
      meta.textContent = fmtSize(file.size) + ' · ' + fmtTime(info.duration) + (info.videoCodec ? ' · ' + info.videoCodec : '')
      maybeRun()
    }

    async function onAudio(file) {
      const ag = ++agen
      audioFile = file; audioDecoded = null
      showChosen(dropB, file)
      setMsg('Decoding replacement audio…', { busy: true })
      await yieldUI()
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const decode = await decodeLib
        const d = await decode(bytes)
        if (!d.channelData?.length) throw Error('empty')
        if (ag !== agen) return
        audioDecoded = { channelData: d.channelData, sampleRate: d.sampleRate }
      } catch (e) {
        if (ag !== agen) return
        setMsg('Could not decode this audio file. Try WAV, MP3, FLAC, OGG, Opus, AAC, M4A, AIFF, CAF, WMA or AMR.', { err: true })
        return
      }
      maybeRun()
    }

    async function maybeRun() {
      if (!videoBytes || !info) return
      const mode = form.mode.value
      if (mode === 'replace' && !audioDecoded) { setMsg('Drop the replacement audio above to continue.'); return }
      const vg = vgen, ag = agen
      report.hidden = out.hidden = true
      try {
        let audioBytes = null, audioLabel = '', fitNote = ''
        if (mode === 'replace') {
          const codec = form.codec.value, loop = form.loop.checked
          if (codec === 'aac' && !hasAAC) throw Error('AAC needs a Chromium or Safari browser (WebCodecs). Pick Opus, ALAC or FLAC here, or switch browsers.')
          setMsg('Preparing replacement audio…', { busy: true })
          await yieldUI()
          const srcDur = audioDecoded.channelData[0].length / audioDecoded.sampleRate
          const fitted = fit(audioDecoded.channelData, audioDecoded.sampleRate, info.duration, loop)
          setMsg('Encoding ' + codec.toUpperCase() + '…', { busy: true })
          await yieldUI()
          const encOpts = { codec, bitrate: (codec === 'aac' || codec === 'opus') ? 192 : undefined }
          const blob = await encodeAudio('m4a', { channelData: fitted, sampleRate: audioDecoded.sampleRate, meta: null }, encOpts)
          if (vg !== vgen || ag !== agen) return
          audioBytes = new Uint8Array(await blob.arrayBuffer())
          audioLabel = CODEC_LABEL[codec]
          fitNote = loop ? 'Looped to fill the video: ' + fmtTime(srcDur) + ' of source repeated to fill ' + fmtTime(info.duration) + '.'
            : srcDur >= info.duration ? 'Trimmed from ' + fmtTime(srcDur) + ' to the video length, ' + fmtTime(info.duration) + '.'
              : 'Padded with silence from ' + fmtTime(srcDur) + ' to the video length, ' + fmtTime(info.duration) + '.'
        }
        setMsg('Remuxing…', { busy: true })
        await yieldUI()
        const remux = await remuxLib
        const outBytes = remux(videoBytes, audioBytes)
        if (vg !== vgen || ag !== agen) return
        const blob = new Blob([outBytes], { type: 'video/mp4' })
        const base = videoFile.name.replace(/\\.[^.]+$/, '')
        const filename = mode === 'replace' ? base + '-' + audioFile.name.replace(/\\.[^.]+$/, '') + '.mp4' : base + '-noaudio.mp4'
        saveBlob(save, blob, filename)
        player.src = save.href
        saveLabel.textContent = 'Save MP4 · ' + fmtSize(blob.size)
        renderReport([
          { k: 'Video', v: fmtTime(info.duration) + (info.videoCodec ? ' <small>· ' + info.videoCodec + '</small>' : ''), note: 'Video stream copied byte-for-byte — no re-encode.' },
          mode === 'replace' ? { k: 'Audio', v: audioLabel, note: 'Replaced. ' + fitNote } : { k: 'Audio', v: 'Removed' },
          { k: 'File size', v: fmtSize(videoFile.size) + ' → ' + fmtSize(blob.size) },
        ])
        progress.hidden = true
        out.hidden = false
      } catch (e) {
        if (vg !== vgen || ag !== agen) return
        console.error(e)
        setMsg(e.message || 'Remuxing failed.', { err: true })
      }
    }

    wireDrop(dropA, fileA, onVideo)
    wireDrop(dropB, fileB, onAudio)
    form.addEventListener('change', e => {
      if (e.target.name === 'mode') {
        const replace = form.mode.value === 'replace'
        document.querySelectorAll('.replace-only').forEach(x => x.hidden = !replace)
      }
      maybeRun()
    })
    reset.addEventListener('click', () => {
      vgen++; agen++
      videoFile = videoBytes = info = null
      audioFile = audioDecoded = null
      release()
      panel.hidden = true
      form.reset(); applyCodecDefault()
      document.querySelectorAll('.replace-only').forEach(x => x.hidden = true)
      dropA.querySelector('.t').innerHTML = dropAText.t; dropA.querySelector('.s').innerHTML = dropAText.s
      dropB.querySelector('.t').innerHTML = dropBText.t; dropB.querySelector('.s').innerHTML = dropBText.s
      dropA.focus()
    })`,
  faq: [
    ['Is the video re-encoded?', 'No. Only the audio track and the container boxes (moov, mdat) are rewritten; the video stream is copied byte-for-byte from the source. That makes this instant even on a long file, and lossless for the picture.'],
    ['Which video files work?', 'MP4, M4V, MOV and 3GP that store a single moov and mdat, the normal export from a phone, camera or editor. Fragmented MP4 (streamed or DASH exports) is not supported. MKV, WebM and AVI are a different container entirely and cannot be remuxed here; re-encode them to MP4 first.'],
    ['Which audio formats can I use to replace the track?', 'Anything the decoder reads: MP3, WAV, FLAC, OGG, Opus, AAC, M4A, AIFF, CAF, WMA and AMR. It is decoded, then re-encoded into AAC, Opus, ALAC or FLAC and packed into the MP4 container.'],
    ['What happens if the replacement audio runs a different length than the video?', 'By default it is trimmed to the video length, or padded with silence if it runs short. Check "loop the audio" to repeat it instead until the video ends.'],
    ['Which audio codec should I pick?', 'AAC plays in every MP4 player and needs a Chromium or Safari browser to encode (WebCodecs). Opus is smaller and plays in modern browsers and VLC. ALAC and FLAC are lossless: ALAC is the safer choice on Apple players, FLAC has the narrowest player support of the four.'],
  ],
  seo: `
    <h2>Swap or strip an audio track without touching the video</h2>
    <p>Re-encoding a video just to change its soundtrack costs minutes and a generation of quality on the picture for no reason. This page rewrites only the container with <code>@audio/encode-mp4</code>, a pure-JavaScript ISO/IEC 14496-12 (ISOBMFF) muxer and remuxer: it copies the video track byte-for-byte, drops or replaces the audio track, and rebuilds the moov and mdat boxes around what survives. No video codec runs at all, so a two-hour 4K file remuxes about as fast as a ten-second clip.</p>
    <h3>Removing the audio track</h3>
    <p>The audio track is left out of the rebuilt file entirely, not muted or replaced with a silent placeholder — the same result as <code>ffmpeg -an -c:v copy</code>, done in the browser.</p>
    <h3>Replacing the audio track</h3>
    <p>The replacement file is decoded with <code>@audio/decode</code>, trimmed, padded with silence or looped to the video length, and encoded into the container with <code>@audio/encode</code>: AAC through the browser's own WebCodecs encoder, or Opus, ALAC and FLAC through pure-JavaScript encoders. <code>@audio/encode-mp4</code> then interleaves the new audio chunks with the untouched video chunks by presentation time, so the file still plays progressively.</p>
    <h3>What does not work here</h3>
    <p>Fragmented MP4, the moof-based layout used by DASH and HLS streaming exports, needs a segment-aware muxer and is rejected with a clear error. MKV, WebM and AVI are different container formats altogether; re-encode them to MP4 with ffmpeg or HandBrake before using this page.</p>`,
}
