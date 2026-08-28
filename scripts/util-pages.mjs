// Renders util/<slug>/index.html for every utility, util/index.html, sitemap.xml and robots.txt.
// Run: node scripts/util-pages.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

const SITE = 'https://audiojs.dev'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
// content-hashed asset URLs: browsers and CDNs drop the old shell the moment it changes
const hash = f => createHash('sha256').update(readFileSync(`${ROOT}util/${f}`)).digest('hex').slice(0, 8)
const CSS = `/util/util.css?v=${hash('util.css')}`, JS = `/util/util.js?v=${hash('util.js')}`
const ICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%230d1014'/%3E%3Cpath d='M3.73 24.42c5.39 0 6.26-.12 9-6.15 3.54-7.78 6.18-8.6 10.08 6.15 3.9 14.74 7.04 12.71 9.84 3.95 4.07-12.77 5.14-3.95 9.91-3.95h1.7' stroke='%23edebe4' fill='none'/%3E%3Cline x1='3.36' y1='24.36' x2='44.64' y2='24.36' stroke='%23edebe4'/%3E%3C/svg%3E`
const WAVE = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="23.5" stroke="#0d1014"/><path d="M3.73 24.42c5.39 0 6.26-.12 9-6.15 3.54-7.78 6.18-8.6 10.08 6.15 3.9 14.74 7.04 12.71 9.84 3.95 4.07-12.77 5.14-3.95 9.91-3.95h1.7" stroke="#0d1014" fill="none"/></svg>`
const drop = (text, accept = 'audio/*,video/*,.mkv,.m4a,.flac,.opus,.ac3,.dts') => `
    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose a file">
      ${WAVE}
      <div class="t">${text}</div>
      <div class="s">or click to choose, or paste with <kbd>Ctrl</kbd>+<kbd>V</kbd></div>
      <input type="file" id="file" accept="${accept}">
    </div>`
const pkg = n => `<a href="https://npmjs.com/package/${n}" target="_blank" rel="noopener"><code>${n}</code></a>`
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const NO_UPLOAD = 'Nothing is uploaded. Everything runs in this tab with '

export const pages = [
  {
    slug: 'extract-audio', name: 'Extract audio from video', short: 'Video → MP3, WAV, FLAC, OGG, Opus, AAC',
    title: 'Extract audio from video: free, in your browser',
    description: 'Extract the audio track from a video (MP4, MOV, MKV, WebM, AVI) or convert an audio file to MP3, WAV, FLAC, OGG, Opus or AAC. Runs in your browser: no upload, no signup, no watermark, no size limit.',
    lead: 'Drop a video or audio file. Save its sound as MP3, WAV, FLAC, OGG, Opus or AAC.',
    powered: ['@audio/decode', '@audio/encode'], repo: 'https://github.com/audiojs/decode',
    body: drop('Drop a video or audio file here'),
    script: `tool({ process: a => ({ audio: a }) })`,
    faq: [
      ['Is the video uploaded anywhere?', 'No. Decoding and encoding run in your browser with open-source JavaScript and WebAssembly codecs. The file never leaves your device, so there is no size limit, no queue and nothing to delete afterwards.'],
      ['Which video formats are supported?', 'Video: MP4, M4V, MOV, 3GP, WebM, MKV and AVI with AAC, AC-3, DTS, MP3, Opus, Vorbis, FLAC, ALAC or PCM audio. Surround tracks keep their channels. Audio: MP3, WAV, FLAC, OGG, Opus, AAC, M4A, AIFF, CAF, WMA and AMR.'],
      ['Which output formats can I save?', 'MP3, WAV, FLAC, OGG Vorbis, Opus and AAC. WAV and FLAC are lossless; MP3, OGG, Opus and AAC are compressed.'],
      ['Does it lose quality?', 'The audio track is decoded to raw PCM at its original sample rate, then encoded to the format you pick. WAV and FLAC keep every decoded sample; MP3, OGG, Opus and AAC re-compress.'],
    ],
    seo: `
      <h2>A free audio extractor that never sees your file</h2>
      <p>Most online extractors upload your video to a server, queue it, and return a watermarked or size-limited file. This page has no server. It reads the audio track out of the container with <code>@audio/decode</code>, an open-source JavaScript and WebAssembly decoder from audiojs, and writes the format you choose with <code>@audio/encode</code>. A 4 GB screen recording works the same as a 10-second clip.</p>
      <h3>Video to MP3, WAV, FLAC, OGG, Opus, AAC</h3>
      <p>MP3 at 256 kbps is the default because it plays everywhere. Choose WAV or FLAC for a lossless copy to edit, transcribe or archive. Opus and AAC give the smallest files at equal quality. The sample rate follows the source, so nothing is resampled unless you pick Opus, which always runs at 48 kHz.</p>
      <h3>Supported input formats</h3>
      <ul>
        <li><strong>Video</strong>: MP4, M4V, MOV, 3GP, WebM, MKV and AVI carrying AAC, AC-3, DTS, MP3, Opus, Vorbis, FLAC, ALAC or PCM audio. 5.1 tracks keep all six channels.</li>
        <li><strong>Audio</strong>: MP3, WAV, FLAC, OGG, Opus, AAC, M4A, AIFF, CAF, WMA and AMR, so the page also converts audio (MP3 to WAV, M4A to MP3, FLAC to MP3).</li>
      </ul>
      <p>When the in-page decoder cannot read a file (E-AC-3, TrueHD) it hands the bytes to your browser's own decoder, and as a last resort plays the file silently through the audio graph and records the output in real time.</p>
      <h3>Common uses</h3>
      <ul>
        <li>Convert MP4 to MP3 for a lecture, podcast or interview recording</li>
        <li>Get a WAV from a screen recording to feed a transcription tool</li>
        <li>Pull the soundtrack out of a MOV from a phone or camera</li>
        <li>Extract audio from a WebM or MKV meeting recording</li>
        <li>Convert audio between formats without installing FFmpeg</li>
      </ul>
      <h3>Is the video uploaded anywhere?</h3>
      <p>No. There is no upload, account, watermark or size limit. Close the tab and nothing remains. The decoder and encoder are open source: <a href="https://github.com/audiojs/decode" target="_blank" rel="noopener">read the decoder</a>, <a href="https://github.com/audiojs/encode" target="_blank" rel="noopener">read the encoder</a>.</p>`,
  },
  {
    slug: 'convert-audio', name: 'Audio converter', short: 'MP3, WAV, FLAC, OGG, Opus, AAC, M4A in any direction',
    title: 'Audio converter: MP3, WAV, FLAC, OGG, Opus, AAC, free in your browser',
    description: 'Convert audio between MP3, WAV, FLAC, OGG Vorbis, Opus, AAC, M4A, AIFF, CAF, WMA and AMR in your browser. No upload, no size limit, lossless where the target allows.',
    lead: 'Drop an audio file. Save it as MP3, WAV, FLAC, OGG, Opus or AAC.',
    powered: ['@audio/decode', '@audio/encode'], repo: 'https://github.com/audiojs/encode',
    body: drop('Drop an audio file here', 'audio/*,video/*,.m4a,.flac,.opus,.wma,.amr,.caf,.aiff,.ac3,.dts'),
    script: `tool({ process: a => ({ audio: a }) })`,
    faq: [
      ['Which formats can I convert from?', 'MP3, WAV, FLAC, OGG Vorbis, Opus, AAC, M4A, ALAC, AIFF, CAF, WMA, AMR, AC-3, DTS and QOA, plus the audio track of MP4, MOV, MKV, WebM and AVI video.'],
      ['Which formats can I convert to?', 'MP3 (256 kbps), WAV (16-bit), FLAC, OGG Vorbis, Opus and AAC.'],
      ['Is the conversion lossless?', 'WAV and FLAC preserve every decoded sample. Converting between two lossy formats (MP3 to AAC) re-compresses; keep a lossless master when you can.'],
      ['Is there a file size or length limit?', 'No. The file is processed in your browser, so the only limit is your device memory. Hour-long recordings are fine.'],
    ],
    seo: `
      <h2>Convert audio without uploading it</h2>
      <p>This converter decodes with <code>@audio/decode</code> and encodes with <code>@audio/encode</code>, both open-source JavaScript and WebAssembly libraries from audiojs. Your file stays on your device; the page works offline once loaded. No account, no watermark, no queue.</p>
      <h3>MP3 to WAV, M4A to MP3, FLAC to MP3, WAV to FLAC</h3>
      <p>Pick the target format after the file loads. WAV and FLAC are lossless and suit editing, mastering and archiving. MP3 plays everywhere. Opus gives the smallest files for speech and music alike; AAC is the format Apple devices and video containers expect. OGG Vorbis remains common in games and open-source tooling.</p>
      <h3>Sample rate and channels</h3>
      <p>Channels and sample rate follow the source: a 44.1 kHz stereo MP3 becomes a 44.1 kHz stereo WAV. Opus always runs at 48 kHz and resamples internally. 5.1 tracks keep six channels in WAV and FLAC.</p>
      <h3>Video files</h3>
      <p>MP4, MOV, MKV, WebM and AVI files are accepted too: their audio track is extracted and converted. See <a href="/util/extract-audio/">extract audio from video</a> for the details.</p>`,
  },
  {
    slug: 'loudness', name: 'Loudness meter and normalizer', short: 'LUFS, true peak, loudness range; normalize for Spotify, YouTube, podcasts',
    title: 'LUFS meter: measure loudness and normalize for Spotify, YouTube, podcasts',
    description: 'Measure integrated loudness (LUFS), true peak (dBTP) and loudness range per ITU-R BS.1770-4 / EBU R128, in your browser. Normalize to -14, -16 or -23 LUFS with a true-peak limiter and save the file. No upload.',
    lead: 'Drop a track. Get LUFS, true peak and loudness range, then normalize to a platform target.',
    powered: ['@audio/loudness', '@audio/dynamics'], repo: 'https://github.com/audiojs/loudness',
    body: drop('Drop an audio or video file here') + `
    <form class="opts" id="opts">
      <label>Normalize to <select name="target"><option value="">measure only</option><option value="-14">-14 LUFS · Spotify, YouTube, Tidal</option><option value="-16">-16 LUFS · Apple Music, podcasts</option><option value="-18">-18 LUFS · SoundCloud, Amazon</option><option value="-23">-23 LUFS · EBU R128 broadcast</option><option value="-24">-24 LKFS · ATSC A/85 broadcast</option></select></label>
      <label>True-peak ceiling <select name="ceiling"><option value="-1">-1 dBTP</option><option value="-2">-2 dBTP</option><option value="-0.3">-0.3 dBTP</option></select></label>
    </form>`,
    script: `
    const lib = import('https://esm.sh/@audio/loudness@1.2.0')
    const dyn = import('https://esm.sh/@audio/dynamics@0.2.5')
    const TARGETS = [['Spotify', -14], ['YouTube', -14], ['Apple Music', -16], ['Podcasts', -16], ['EBU R128', -23]]
    const db = (x, d = 1) => (x > 0 ? '+' : '') + x.toFixed(d)
    tool({
      busy: 'Measuring loudness…',
      defaultFormat: 'wav',
      async process(a, o, ui) {
        const { lufs, truepeak, lra } = await lib
        const fs = a.sampleRate
        const L = lufs(a.channelData, { fs }), tp = truepeak(a.channelData, { fs }), range = lra(a.channelData, { fs })
        const report = [
          { k: 'Integrated loudness', v: db(L) + '<small>LUFS</small>' },
          { k: 'True peak', v: db(tp) + '<small>dBTP</small>', cls: tp > -1 ? 'warn' : '' },
          { k: 'Loudness range', v: range.toFixed(1) + '<small>LU</small>' },
          { k: 'Platform playback', cls: 'list wide', v: TARGETS.map(([n, t]) => n + ' ' + db(t - L) + ' dB').join(' · '), note: 'Gain each platform will apply on playback (negative = turned down). Mastering above the target buys nothing.' },
        ]
        if (!o.target) return { report }
        const target = +o.target, gain = target - L, g = Math.pow(10, gain / 20)
        ui.status('Normalizing to ' + target + ' LUFS…')
        const { limiter } = await dyn
        const channelData = a.channelData.map(ch => { const out = new Float32Array(ch.length); for (let i = 0; i < ch.length; i++) out[i] = ch[i] * g; return out })
        const limited = channelData.map(ch => limiter(ch, { ceiling: +o.ceiling, fs }))
        const after = lufs(limited, { fs }), tp2 = truepeak(limited, { fs })
        report.push({ k: 'Applied gain', v: db(gain) + '<small>dB</small>' }, { k: 'Result loudness', v: db(after) + '<small>LUFS</small>', cls: 'ok' }, { k: 'Result true peak', v: db(tp2) + '<small>dBTP</small>', cls: 'ok', note: Math.abs(after - target) > 0.5 ? 'The true-peak limiter pulled the level below target: the material is too dense for this target at this ceiling.' : 'Within 0.5 LU of target after limiting.' })
        return { report, audio: { channelData: limited, sampleRate: fs }, suffix: '-' + Math.abs(target) + 'lufs' }
      }
    })`,
    faq: [
      ['What is LUFS?', 'Loudness Units relative to Full Scale, the perceptual loudness measure defined by ITU-R BS.1770. Integrated LUFS describes the whole file with gating, so silence does not pull it down. Streaming services normalize to a LUFS target.'],
      ['What loudness should I master to?', 'Spotify, YouTube and Tidal play back at -14 LUFS, Apple Music and most podcast platforms at -16, EBU broadcast at -23 with a -1 dBTP ceiling. A louder master is simply turned down on playback.'],
      ['What is true peak?', 'The peak level after 4× oversampling, which reveals inter-sample peaks that clip in DACs and lossy codecs. Keep it at or below -1 dBTP for streaming.'],
      ['Is the measurement standard-compliant?', 'Yes. @audio/loudness implements ITU-R BS.1770-4 K-weighting with absolute and relative gating, EBU R128 loudness range (EBU Tech 3342) and 4× oversampled true peak, and is verified against the EBU test vectors.'],
    ],
    seo: `
      <h2>An EBU R128 loudness meter that runs on your device</h2>
      <p>Online LUFS meters upload your master. This one measures in the browser with <code>@audio/loudness</code>, an open-source ITU-R BS.1770-4 implementation verified against the EBU test set: integrated loudness with gating, loudness range and 4× oversampled true peak. Drop a WAV, FLAC, MP3 or even a video and read the numbers in seconds.</p>
      <h3>Normalize for Spotify, YouTube, Apple Music and podcasts</h3>
      <p>Choose a target and the page applies the exact gain, then a true-peak limiter at the ceiling you set, re-measures, and lets you save the result as WAV, FLAC, MP3, OGG, Opus or AAC. The report shows what each platform will do to your file on playback, so you can stop chasing loudness that gets undone anyway.</p>
      <h3>Targets in one place</h3>
      <ul>
        <li>Spotify, YouTube, Tidal, Deezer: -14 LUFS, -1 dBTP</li>
        <li>Apple Music, Apple Podcasts, most podcast hosts: -16 LUFS, -1 dBTP</li>
        <li>Amazon Music, SoundCloud: about -18 LUFS</li>
        <li>EBU R128 broadcast: -23 LUFS, -1 dBTP; ATSC A/85 (US): -24 LKFS, -2 dBTP</li>
      </ul>
      <h3>What the numbers mean</h3>
      <p><strong>Integrated LUFS</strong> is the loudness of the whole program. <strong>Loudness range (LRA)</strong> in LU describes how much the loudness varies; speech sits around 3 to 8 LU, dynamic music above 10. <strong>True peak</strong> catches inter-sample overs that a sample-peak meter misses.</p>`,
  },
  {
    slug: 'denoise', name: 'Noise remover', short: 'Background noise, hum, clicks, wind, plosives, reverb',
    title: 'Remove background noise from audio online, free, no upload',
    description: 'Remove background noise, mains hum, clicks, crackle, wind and plosives from a recording in your browser. Automatic method selection with a visible plan. No upload, no account, no length limit.',
    lead: 'Drop a recording. The classifier picks the right method, shows why, and lets you save the clean file.',
    powered: ['@audio/denoise'], repo: 'https://github.com/audiojs/denoise',
    body: drop('Drop a noisy recording here') + `
    <form class="opts" id="opts">
      <label>Method <select name="method">
        <option value="">auto (classify the noise)</option>
        <option value="wiener">wiener: steady broadband noise</option>
        <option value="omlsa">omlsa: noise under speech</option>
        <option value="specsub">specsub: spectral subtraction</option>
        <option value="dehum">dehum: mains hum 50/60 Hz</option>
        <option value="declick">declick: clicks and pops</option>
        <option value="decrackle">decrackle: vinyl crackle</option>
        <option value="declip">declip: repair clipping</option>
        <option value="dewind">dewind: wind rumble</option>
        <option value="deplosive">deplosive: microphone pops</option>
        <option value="deesser">deesser: harsh sibilance</option>
        <option value="dereverb">dereverb: room echo</option>
        <option value="gate">gate: silence between phrases</option>
      </select></label>
    </form>`,
    script: `
    const lib = import('https://esm.sh/@audio/denoise@0.3.7')
    const WHY = { wiener: 'steady broadband noise floor', omlsa: 'noise under speech, speech-presence tracking', specsub: 'stationary noise, spectral subtraction', dehum: 'mains hum and harmonics', declick: 'impulsive clicks', decrackle: 'dense crackle', declip: 'clipped peaks', dewind: 'low-frequency wind rumble', deplosive: 'plosive pops', deesser: 'sibilance', dereverb: 'room reverberation', gate: 'noise between phrases' }
    tool({
      busy: 'Analyzing noise…',
      async process(a, o, ui) {
        const m = await lib, fs = a.sampleRate
        let plan = null
        const channelData = []
        for (let c = 0; c < a.channelData.length; c++) {
          ui.status((o.method ? 'Applying ' + o.method : 'Classifying and cleaning') + (a.channelData.length > 1 ? ' · channel ' + (c + 1) : '') + '…')
          await new Promise(r => setTimeout(r, 20))
          const src = a.channelData[c].slice()
          if (o.method) channelData.push(m[o.method](src, { fs }))
          else { const r = m.denoise(src, { fs, returnPlan: true }); plan ??= r.plan; channelData.push(r.out) }
        }
        const method = o.method || plan?.method || 'wiener'
        const scores = plan?.scores ? Object.entries(plan.scores).filter(([k, v]) => typeof v === 'number' && k !== 'humFreq').map(([k, v]) => k + ' ' + v.toFixed(1)).join(' · ') : ''
        return {
          report: [{ k: o.method ? 'Method' : 'Method chosen by the classifier', v: method, note: (WHY[method] || '') + (scores ? '. Detector scores: ' + scores : '') }],
          audio: { channelData, sampleRate: fs }, suffix: '-' + method
        }
      }
    })`,
    faq: [
      ['How does automatic mode choose?', 'A classifier measures the recording: hum energy at 50/60 Hz and harmonics, click density, low-frequency rumble, noise-floor stationarity and sibilance. It picks the specialised method that scored highest and shows the plan.'],
      ['Which noises can it remove?', 'Steady background noise (fans, hiss, air conditioning), mains hum, clicks and pops, vinyl crackle, clipping, wind rumble, microphone plosives, sibilance, room reverb and noise between phrases.'],
      ['Is this AI noise removal?', 'No. Every method is classical signal processing: Wiener and OM-LSA spectral gain, spectral subtraction, adaptive notch filters, LPC click interpolation. It runs instantly on any device and never sends audio anywhere. For heavy speech-over-noise, ML models can do better; for hum, clicks, wind and hiss, these are the same algorithms the professional tools use.'],
      ['Does it work on music?', 'Yes for hum, clicks, crackle and clipping. Broadband denoising on music is gentler than on speech; use it lightly and compare with the original in the player.'],
    ],
    seo: `
      <h2>Noise removal that shows its work</h2>
      <p>Cloud noise removers hide what they do and charge per minute. This page runs <code>@audio/denoise</code>, thirteen open-source restoration methods plus a classifier, in your browser. Drop a file, read which method was chosen and why, listen, save. Nothing leaves your device.</p>
      <h3>Background noise, hum, clicks, wind, plosives, reverb</h3>
      <ul>
        <li><strong>Hiss and fans</strong>: Wiener / MMSE-LSA gain with decision-directed SNR tracking, or OM-LSA when speech is present.</li>
        <li><strong>Mains hum</strong>: adaptive notch bank on 50 or 60 Hz and harmonics, tracking drift.</li>
        <li><strong>Clicks, pops, crackle</strong>: detection and LPC interpolation, the same family as vinyl restoration tools.</li>
        <li><strong>Clipping</strong>: auto-detected clip level, waveform reconstruction.</li>
        <li><strong>Wind, plosives, sibilance, reverb</strong>: dedicated dewind, deplosive, de-esser and dereverb stages.</li>
      </ul>
      <h3>When to pick a method by hand</h3>
      <p>Automatic mode handles the common cases. If you know the problem, choose the method: dehum for a ground loop, declick for a scratched record, declip for a hot recording, gate for silence between takes. The output plays in the page so you can compare before saving.</p>`,
  },
  {
    slug: 'key-bpm', name: 'Key and BPM finder', short: 'Musical key, Camelot code, tempo, chords',
    title: 'Key and BPM finder: detect the key, tempo and chords of any song',
    description: 'Find the musical key, Camelot code, BPM and chord progression of a song in your browser. Drop an MP3, WAV, FLAC or video; nothing is uploaded.',
    lead: 'Drop a song. Get its key, Camelot code, BPM and chords in seconds.',
    powered: ['@audio/mir', '@audio/beat'], repo: 'https://github.com/audiojs/mir',
    body: drop('Drop a song here'),
    script: `
    const mir = import('https://esm.sh/@audio/mir@1.1.2')
    const beat = import('https://esm.sh/@audio/beat@2.1.2')
    const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
    const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B']
    const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A']
    tool({
      busy: 'Listening for key and tempo…',
      async process(a, o, ui) {
        const fs = a.sampleRate
        const n = a.channelData[0].length, mono = new Float32Array(n)
        for (const ch of a.channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / a.channelData.length
        const { chroma, key, smoothChords } = await mir
        const span = Math.min(n, fs * 120) // first two minutes are enough for key
        const frames = []
        for (let i = 0; i + 4096 <= span; i += 4096) frames.push(chroma(mono.subarray(i, i + 4096), { fs }))
        const k = key(frames)
        ui.status('Tracking the beat…')
        await new Promise(r => setTimeout(r, 20))
        const { detect } = await beat
        const b = detect(mono.subarray(0, Math.min(n, fs * 90)), { fs })
        let chords = []
        try { chords = smoothChords(frames, { selfProb: 0.5 }) } catch {}
        const seq = []
        for (const c of chords) { const label = c?.label ?? c; if (label && seq[seq.length - 1] !== label) seq.push(label) }
        const camelot = (k.mode === 'minor' ? CAMELOT_MINOR : CAMELOT_MAJOR)[k.tonic]
        return { report: [
          { k: 'Key', v: NAMES[k.tonic] + ' ' + k.mode + '<small>' + Math.round(k.confidence * 100) + '% sure</small>' },
          { k: 'Camelot', v: camelot, note: 'Mix with ' + camelot + ', ' + neighbours(camelot).join(', ') + ' for harmonic mixing.' },
          { k: 'Tempo', v: Math.round(b.bpm) + '<small>BPM</small>', note: b.confidence < 0.4 ? 'Low confidence: the beat is soft or the tempo drifts. Half or double time is possible.' : 'Alternatives: ' + Math.round(b.bpm / 2) + ' or ' + Math.round(b.bpm * 2) + ' BPM if you count half or double time.' },
          ...(seq.length ? [{ k: 'Chord progression', cls: 'list wide', v: seq.slice(0, 32).join(' · ') + (seq.length > 32 ? ' …' : '') }] : []),
        ] }
        function neighbours(c) { const num = parseInt(c), l = c.slice(-1); return [((num + 10) % 12 + 1) + l, (num % 12 + 1) + l, num + (l === 'A' ? 'B' : 'A')] }
      }
    })`,
    faq: [
      ['How accurate is key detection?', 'Chroma features over the first two minutes are matched against Krumhansl key profiles, the same approach as desktop DJ software. Clear tonal music lands the right key most of the time; ambiguous or modal material may report the relative major or minor, which shares every note.'],
      ['What is a Camelot code?', 'A wheel notation DJs use for harmonic mixing: 1A to 12A are minor keys, 1B to 12B their relative majors. Tracks that are one step apart on the wheel, or share a number, mix without clashing.'],
      ['Why is the BPM double or half what I expect?', 'Tempo has an octave ambiguity: a 90 BPM groove with strong eighth notes also fits 180. The report lists both. Pick the one that matches how you count.'],
      ['Does it upload my music?', 'No. Analysis runs in your browser with @audio/mir and @audio/beat, open-source music information retrieval libraries.'],
    ],
    seo: `
      <h2>Song key and tempo, found on your device</h2>
      <p>Key finders on the web upload your track to a server. This one runs <code>@audio/mir</code> (chroma, key, chord estimation) and <code>@audio/beat</code> (onset detection and beat tracking) in your browser. Drop an MP3, WAV, FLAC, M4A or a video and read the key, its Camelot code for harmonic mixing, the BPM, and the chord sequence.</p>
      <h3>For DJs</h3>
      <p>The Camelot code tells you which tracks mix harmonically: same number, one step around the wheel, or the A/B partner. The BPM is estimated from the beat grid; the report also gives the half and double time in case your genre counts differently.</p>
      <h3>For musicians and producers</h3>
      <p>The chord progression is read from the same chroma frames, smoothed to suppress passing notes. Use it as a starting point for a lead sheet or to find a sample's key before pitching it.</p>
      <h3>How it works</h3>
      <p>Chroma vectors (12 pitch classes per frame) are matched against major and minor key profiles; the best-scoring key wins with a confidence figure. Tempo comes from spectral-flux onsets and a comb-filter tempogram, then a beat tracker aligns the grid.</p>`,
  },
  {
    slug: 'vocal-remover', name: 'Vocal remover', short: 'Karaoke track or isolated vocal from a stereo mix',
    title: 'Vocal remover: make a karaoke track or isolate the vocal, free, in your browser',
    description: 'Remove vocals from a song to make a karaoke or instrumental track, or isolate the center vocal. Runs in your browser on the stereo mix; nothing is uploaded.',
    lead: 'Drop a stereo song. Remove the center vocal for karaoke, or keep only the vocal.',
    powered: ['@audio/vocals'], repo: 'https://github.com/audiojs/vocals',
    body: drop('Drop a stereo song here') + `
    <form class="opts" id="opts">
      <label><input type="radio" name="mode" value="remove" checked> Remove vocals (karaoke)</label>
      <label><input type="radio" name="mode" value="isolate"> Isolate vocals</label>
    </form>`,
    script: `
    const lib = import('https://esm.sh/@audio/vocals@1.0.4')
    tool({
      busy: 'Separating center and sides…',
      async process(a, o) {
        if (a.channels < 2) throw Error('This needs a stereo file: center-channel extraction has nothing to work with in mono.')
        const { remove, isolate } = await lib
        const [L, R] = [a.channelData[0].slice(), a.channelData[1].slice()]
        const out = (o.mode === 'isolate' ? isolate : remove)([L, R])
        return { audio: { channelData: out, sampleRate: a.sampleRate }, suffix: o.mode === 'isolate' ? '-vocals' : '-karaoke',
          report: [{ k: o.mode === 'isolate' ? 'Kept' : 'Removed', v: 'center channel', note: 'Mid/side separation: whatever is panned dead center (usually the lead vocal, often also bass and kick) is ' + (o.mode === 'isolate' ? 'kept' : 'cancelled') + '. Wide reverb and doubled vocals remain. This is the classic phase-cancellation method, not AI source separation.' }] }
      }
    })`,
    faq: [
      ['How does it remove the vocal?', 'Mid/side processing. In most mixes the lead vocal is panned dead center, so subtracting the right channel from the left cancels it while side-panned instruments remain. The isolate mode keeps the center instead.'],
      ['Why can I still hear some vocal?', 'Reverb, delays and doubled harmonies are usually panned wide and survive cancellation. Bass and kick, also centered, are reduced along with the vocal. AI separation handles these better; this method is instant, private and works on any device.'],
      ['Does it work on mono files?', 'No. Center extraction needs a stereo image. A mono file has no sides to keep.'],
      ['Is my song uploaded?', 'No. The processing runs in your browser with @audio/vocals, an open-source library. Nothing leaves your device.'],
    ],
    seo: `
      <h2>Karaoke tracks without uploading your music</h2>
      <p>Drop a stereo song and the page cancels the center channel with <code>@audio/vocals</code>, the mid/side complement to SoX's classic <code>oops</code> effect. Save the result as MP3, WAV, FLAC, OGG, Opus or AAC. Flip the mode to keep only the center for an a cappella reference.</p>
      <h3>What to expect</h3>
      <p>Center cancellation is honest about its limits: it removes what is panned center and leaves the rest. On a typical pop mix the lead vocal drops by 20 dB or more while guitars, keys and wide backing vocals stay. Bass and kick lose level too, because they sit in the center as well. For studio-grade separation you need a neural model; for a quick karaoke version, a sing-along practice track or checking a vocal's timing, this is the tool.</p>
      <h3>Tips</h3>
      <ul>
        <li>Use the original stereo release, not a mono or YouTube rip with collapsed stereo.</li>
        <li>Older recordings with hard-panned instruments separate the cleanest.</li>
        <li>Save as WAV or FLAC if you plan to process further.</li>
      </ul>`,
  },
  {
    slug: 'pitch-tempo', name: 'Pitch and tempo changer', short: 'Transpose semitones, change speed without changing pitch',
    title: 'Change pitch or tempo of a song: transpose, slow down or speed up without artifacts',
    description: 'Transpose a song by semitones or change its tempo without changing pitch, in your browser. Slow down music to practice, speed up lectures, pitch a backing track to your voice. No upload.',
    lead: 'Drop a track. Transpose it, slow it down or speed it up, keep the rest intact.',
    powered: ['@audio/shift', '@audio/stretch'], repo: 'https://github.com/audiojs/stretch',
    body: drop('Drop a song or recording here') + `
    <form class="opts" id="opts">
      <label>Pitch <input type="range" name="semitones" min="-12" max="12" step="1" value="0"> <output>0</output> semitones</label>
      <label>Tempo <input type="range" name="tempo" min="50" max="200" step="5" value="100"> <output>100</output> %</label>
    </form>`,
    script: `
    const shift = import('https://esm.sh/@audio/shift@1.1.3')
    const stretch = import('https://esm.sh/@audio/stretch@2.0.4')
    tool({
      busy: 'Processing…',
      async process(a, o, ui) {
        const semis = +o.semitones || 0, tempo = (+o.tempo || 100) / 100, fs = a.sampleRate
        if (!semis && tempo === 1) return { audio: a, report: [{ k: 'Unchanged', v: '0 st · 100 %', note: 'Move a slider to transpose or change tempo.' }] }
        const channelData = []
        for (let c = 0; c < a.channels; c++) {
          let ch = a.channelData[c]
          if (semis) { ui.status('Transposing ' + (semis > 0 ? '+' : '') + semis + ' st' + (a.channels > 1 ? ' · channel ' + (c + 1) : '') + '…'); await new Promise(r => setTimeout(r, 20)); ch = (await shift).transient(ch, { semitones: semis, fs }) }
          if (tempo !== 1) { ui.status('Stretching to ' + Math.round(tempo * 100) + ' %' + (a.channels > 1 ? ' · channel ' + (c + 1) : '') + '…'); await new Promise(r => setTimeout(r, 20)); ch = (await stretch).transient(ch, { factor: 1 / tempo, fs }) }
          channelData.push(ch)
        }
        return { audio: { channelData, sampleRate: fs }, suffix: (semis ? (semis > 0 ? '+' : '') + semis + 'st' : '') + (tempo !== 1 ? '-' + Math.round(tempo * 100) + 'pct' : ''),
          report: [{ k: 'Pitch', v: (semis > 0 ? '+' : '') + semis + '<small>semitones</small>' }, { k: 'Tempo', v: Math.round(tempo * 100) + '<small>%</small>' }, { k: 'New length', v: fmtTime(channelData[0].length / fs) }] }
      }
    })`,
    faq: [
      ['Does changing tempo change the pitch?', 'No. Time stretching keeps the pitch while changing duration, and pitch shifting keeps the duration while transposing. Both use transient-preserving phase vocoders, so drums stay sharp.'],
      ['How far can I transpose?', 'Up to an octave either way. Small moves (up to 3 or 4 semitones) are transparent; larger ones start to sound processed, as with any real-time algorithm.'],
      ['What is it good for?', 'Slowing a solo down to learn it, transposing a backing track to your vocal range, speeding up a lecture or audiobook, matching two songs for a mix.'],
      ['Is the audio uploaded?', 'No. @audio/shift and @audio/stretch run in your browser.'],
    ],
    seo: `
      <h2>Transpose and time-stretch in the browser</h2>
      <p>The two sliders drive <code>@audio/shift</code> (pitch) and <code>@audio/stretch</code> (tempo), open-source transient-aware phase vocoder implementations from audiojs. Nothing is uploaded, nothing is watermarked, and the result saves as MP3, WAV, FLAC, OGG, Opus or AAC.</p>
      <h3>Slow down music to practice</h3>
      <p>Set tempo to 50 to 75 % and the solo stays at the original pitch, so you can play along. Speed up to 125 to 200 % for lectures and podcasts.</p>
      <h3>Transpose a backing track</h3>
      <p>Shift by whole semitones up to an octave. Duration stays the same, so the track still lines up with a video or a click.</p>
      <h3>Quality notes</h3>
      <p>Transient detection keeps drum hits from smearing, the usual weakness of phase vocoders. Extreme settings (an octave, or 200 %) are audible on any algorithm; moderate settings are hard to tell from the original.</p>`,
  },
  {
    slug: 'tuner', name: 'Tuner', short: 'Chromatic tuner for guitar, bass, violin, voice',
    title: 'Online tuner: chromatic tuner for guitar, bass, ukulele, violin and voice',
    description: 'Free chromatic tuner in your browser. Uses your microphone, shows the note and cents, works for guitar, bass, ukulele, violin and singing. Adjustable A4 reference. No app, no upload.',
    lead: 'Play a note. The tuner shows the nearest pitch and how many cents you are off.',
    powered: ['@audio/pitch', '@audio/note', '@audio/mic'], repo: 'https://github.com/audiojs/pitch',
    body: `
    <div class="live" id="live">
      <div class="big" id="note">–</div>
      <div class="sub" id="hz">press start, then play a note</div>
      <div class="meter"><i id="needle"></i></div>
      <div class="actions">
        <button class="btn" id="start" type="button">Start tuner</button>
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:var(--fs-sm)">A4 <input type="number" id="a4" value="440" min="415" max="466" step="1" style="width:5em;font:inherit;padding:8px;border:1px solid var(--c-rule);border-radius:6px"> Hz</label>
      </div>
    </div>`,
    script: `
    const pitch = import('https://esm.sh/@audio/pitch@2.0.3')
    const note = import('https://esm.sh/@audio/note@1.0.1')
    const start = $('start'), noteEl = $('note'), hzEl = $('hz'), needle = $('needle'), a4 = $('a4')
    let stop = null, ring = new Float32Array(4096), filled = 0, last = 0
    start.addEventListener('click', async () => {
      if (stop) { stop(); stop = null; start.textContent = 'Start tuner'; noteEl.textContent = '–'; hzEl.textContent = 'stopped'; return }
      start.disabled = true; hzEl.textContent = 'asking for the microphone…'
      try {
        const [{ yin }, { cents }] = await Promise.all([pitch, note])
        stop = await mic((chunk, fs) => {
          ring.copyWithin(0, chunk.length); ring.set(chunk, ring.length - chunk.length); filled = Math.min(ring.length, filled + chunk.length)
          const now = performance.now(); if (filled < ring.length || now - last < 80) return; last = now
          let rms = 0; for (const x of ring) rms += x * x; rms = Math.sqrt(rms / ring.length)
          if (rms < 0.005) { hzEl.textContent = 'listening…'; needle.classList.remove('ok'); return }
          const r = yin(ring, { fs })
          if (!r || r.clarity < 0.85) return
          const ref = +a4.value || 440
          const c = cents(r.freq * 440 / ref)
          noteEl.textContent = c.name.replace(/(\\d)$/, '<sub style="font-size:.4em">$1</sub>'); noteEl.innerHTML = noteEl.textContent
          hzEl.textContent = r.freq.toFixed(1) + ' Hz · ' + (c.cents > 0 ? '+' : '') + c.cents.toFixed(0) + ' cents'
          needle.style.left = (50 + Math.max(-50, Math.min(50, c.cents))) + '%'
          needle.classList.toggle('ok', Math.abs(c.cents) < 5)
        })
        start.textContent = 'Stop'; hzEl.textContent = 'listening…'
      } catch (e) { hzEl.textContent = 'Microphone access is needed: ' + e.message }
      start.disabled = false
    })`,
    faq: [
      ['How do I tune a guitar with it?', 'Standard tuning is E2 A2 D3 G3 B3 E4. Play one string at a time, let it ring, and turn the peg until the needle sits in the green zone (within 5 cents).'],
      ['Which instruments does it work for?', 'Anything that produces a clear pitch: guitar, bass, ukulele, violin, cello, brass, woodwinds, voice. Detection uses the YIN algorithm on a 4096-sample window.'],
      ['Can I change the reference pitch?', 'Yes. A4 defaults to 440 Hz; set 432, 415 (baroque) or 442 to 443 (many orchestras).'],
      ['Is my microphone recorded?', 'No. Audio is analysed in the tab and discarded. Nothing is stored or sent.'],
    ],
    seo: `
      <h2>A chromatic tuner with nothing to install</h2>
      <p>The tuner reads your microphone with <code>@audio/mic</code>, estimates pitch with <code>@audio/pitch</code> (YIN) and names the note with <code>@audio/note</code>. The needle shows cents from the nearest semitone; green means within 5 cents. Works on phones and laptops in any modern browser.</p>
      <h3>Standard tunings</h3>
      <ul>
        <li>Guitar: E2 A2 D3 G3 B3 E4. Drop D: D2 A2 D3 G3 B3 E4</li>
        <li>Bass: E1 A1 D2 G2</li>
        <li>Ukulele: G4 C4 E4 A4</li>
        <li>Violin: G3 D4 A4 E5. Viola and cello: C G D A</li>
      </ul>
      <h3>Reference pitch</h3>
      <p>Most music uses A4 = 440 Hz. Orchestras often tune to 442 or 443, baroque ensembles to 415, and some players prefer 432. Set the field and every reading follows.</p>`,
  },
  {
    slug: 'recorder', name: 'Audio recorder', short: 'Record from the microphone, save as MP3, WAV, FLAC, Opus',
    title: 'Online voice recorder: record audio and save as MP3, WAV, FLAC or Opus',
    description: 'Record audio from your microphone in the browser and save it as MP3, WAV, FLAC, OGG, Opus or AAC. No account, no upload, no time limit; the recording stays on your device.',
    lead: 'Record from your microphone. Save as MP3, WAV, FLAC, OGG, Opus or AAC.',
    powered: ['@audio/mic', '@audio/encode'], repo: 'https://github.com/audiojs/mic',
    body: `
    <div class="live" id="live">
      <div class="time" id="time">0:00</div>
      <div class="sub" id="level">press record</div>
      <div class="meter" style="max-width:420px"><i id="peak" style="left:0"></i></div>
      <div class="actions">
        <button class="btn rec" id="rec" type="button">● Record</button>
      </div>
    </div>
    <section class="panel" id="panel" hidden>
      <div class="row out" id="out">
        <audio id="player" controls preload="metadata"></audio>
        <label class="fmt">Format <select id="fmt"></select></label>
        <span class="spacer"></span>
        <a class="btn" id="save" download><span id="saveLabel">Save</span></a>
      </div>
      <div class="row" id="progress" hidden><div class="status" id="status"></div></div>
    </section>`,
    script: `
    const rec = $('rec'), time = $('time'), level = $('level'), peak = $('peak'), panel = $('panel'), player = $('player'), fmt = $('fmt'), save = $('save'), saveLabel = $('saveLabel'), progress = $('progress'), status = $('status')
    for (const [k, f] of Object.entries(FORMATS)) fmt.append(el('option', { value: k }, f.label))
    fmt.value = 'mp3'
    let stop = null, chunks = [], t0 = 0, timer = 0, audio = null, fs = 48000
    rec.addEventListener('click', async () => {
      if (stop) { stop(); stop = null; clearInterval(timer); rec.textContent = '● Record'; rec.classList.add('rec'); finish(); return }
      rec.disabled = true; level.textContent = 'asking for the microphone…'
      try {
        chunks = []; panel.hidden = true
        stop = await mic((chunk, rate) => { fs = rate; chunks.push(chunk); let p = 0; for (const x of chunk) p = Math.max(p, Math.abs(x)); peak.style.left = Math.min(100, p * 100) + '%'; peak.classList.toggle('ok', p > 0.02 && p < 0.9) })
        t0 = performance.now(); timer = setInterval(() => time.textContent = fmtTime((performance.now() - t0) / 1000), 250)
        rec.textContent = '■ Stop'; rec.classList.remove('rec'); level.textContent = 'recording'
      } catch (e) { level.textContent = 'Microphone access is needed: ' + e.message }
      rec.disabled = false
    })
    fmt.addEventListener('change', () => audio && encode())
    async function finish() {
      const n = chunks.reduce((s, c) => s + c.length, 0); if (!n) return
      const d = new Float32Array(n); let off = 0; for (const c of chunks) { d.set(c, off); off += c.length }
      audio = { channelData: [d], sampleRate: fs }
      level.textContent = fmtTime(n / fs) + ' recorded · ' + (fs / 1000) + ' kHz mono'
      panel.hidden = false; encode()
    }
    async function encode() {
      const f = fmt.value
      progress.hidden = false; status.textContent = f === 'wav' ? 'Writing WAV…' : 'Encoding ' + f.toUpperCase() + '…'; save.style.visibility = 'hidden'
      try {
        const blob = await encodeAudio(f, audio)
        saveBlob(save, blob, 'recording-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.' + FORMATS[f].ext)
        player.src = save.href; saveLabel.textContent = 'Save ' + FORMATS[f].ext.toUpperCase() + ' · ' + fmtSize(blob.size); save.style.visibility = ''; progress.hidden = true
      } catch (e) { status.textContent = f.toUpperCase() + ' is not available in this browser. Pick another format.' }
    }`,
    faq: [
      ['Where is the recording stored?', 'In the tab memory only. When you press Save the file goes to your downloads folder. Close the tab and it is gone; nothing is uploaded.'],
      ['Is there a time limit?', 'No. A minute of mono audio at 48 kHz uses about 11 MB of memory, so an hour is fine on any laptop.'],
      ['Which formats can I save?', 'MP3, WAV (lossless), FLAC (lossless, compressed), OGG Vorbis, Opus (smallest) and AAC. Encoding runs in the browser with @audio/encode.'],
      ['Why does the meter turn red?', 'The dot turns green in a healthy range and stays grey when the level is too low or clipping. Move closer to or further from the microphone.'],
    ],
    seo: `
      <h2>A voice recorder that keeps recordings on your device</h2>
      <p>Browser recorders usually upload to a server or hand you a WebM file nobody wants. This page captures the microphone with <code>@audio/mic</code> as uncompressed float audio and encodes to the format you pick with <code>@audio/encode</code>: MP3 for sharing, WAV or FLAC for editing, Opus for the smallest file. No account, no ads, no watermark.</p>
      <h3>Voice memos, podcast takes, lecture notes</h3>
      <p>Press record, speak, press stop, save. The level meter shows when you are too quiet or clipping. Recordings are mono at your device sample rate, usually 48 kHz.</p>
      <h3>After recording</h3>
      <p>Drop the file into the <a href="/util/denoise/">noise remover</a> to clean it, or the <a href="/util/loudness/">loudness normalizer</a> to bring it to the -16 LUFS podcast standard.</p>`,
  },
  {
    slug: 'spectrogram', name: 'Spectrogram', short: 'Frequency-over-time image of any recording',
    title: 'Spectrogram viewer: see the frequencies in any audio or video file',
    description: 'Generate a spectrogram of an audio or video file in your browser. Log-frequency view, peak frequency and spectral centroid. No upload; works with MP3, WAV, FLAC, MP4 and more.',
    lead: 'Drop a file. See its frequencies over time, with peak frequency and bandwidth.',
    powered: ['@audio/stft', '@audio/spectral'], repo: 'https://github.com/audiojs/stft',
    body: drop('Drop an audio or video file here') + `
    <form class="opts" id="opts">
      <label>Frequency axis <select name="scale"><option value="log">logarithmic</option><option value="linear">linear</option></select></label>
      <label>Window <select name="frame"><option value="2048">2048 (balanced)</option><option value="4096">4096 (finer pitch)</option><option value="1024">1024 (finer time)</option></select></label>
    </form>`,
    script: `
    const stft = import('https://esm.sh/@audio/stft@1.0.5')
    const spectral = import('https://esm.sh/@audio/spectral@1.2.3')
    tool({
      busy: 'Computing spectrogram…',
      async process(a, o) {
        const { stftAnalyse } = await stft, { centroid } = await spectral
        const fs = a.sampleRate, n = a.channelData[0].length, mono = new Float32Array(n)
        for (const ch of a.channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / a.channels
        const frameSize = +o.frame || 2048, W = 1200, H = 400
        const hopSize = Math.max(frameSize / 8, Math.ceil(n / W))
        const frames = [], peaks = new Float64Array(frameSize / 2 + 1); let cent = 0, count = 0
        stftAnalyse(mono, mag => { frames.push(Float32Array.from(mag)); for (let k = 0; k < mag.length; k++) peaks[k] = Math.max(peaks[k], mag[k]); try { const c = centroid(mag, { fs }); if (c > 0) { cent += c; count++ } } catch {} }, { fs, frameSize, hopSize })
        const canvas = el('canvas'); canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H)
        const bins = frameSize / 2 + 1, nyq = fs / 2, fmin = 20, log = o.scale !== 'linear'
        let maxDb = -Infinity; for (const f of frames) for (let k = 1; k < bins; k++) { const v = f[k]; if (v > 0) { const d = 20 * Math.log10(v); if (d > maxDb) maxDb = d } }
        for (let x = 0; x < W; x++) {
          const f = frames[Math.min(frames.length - 1, Math.floor(x / W * frames.length))]
          for (let y = 0; y < H; y++) {
            const fr = log ? fmin * Math.pow(nyq / fmin, 1 - y / H) : nyq * (1 - y / H)
            const k = Math.min(bins - 1, Math.round(fr / nyq * (bins - 1)))
            const db = f[k] > 0 ? 20 * Math.log10(f[k]) - maxDb : -120
            const t = Math.max(0, Math.min(1, (db + 90) / 90)) // 90 dB range
            const i = (y * W + x) * 4
            img.data[i] = 13 + 240 * Math.pow(t, 1.6); img.data[i + 1] = 16 + 150 * Math.pow(t, 2.2); img.data[i + 2] = 20 + 90 * t; img.data[i + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        ctx.fillStyle = 'rgba(237,235,228,.85)'; ctx.font = '600 12px Manrope, sans-serif'
        for (const fr of (log ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [2000, 5000, 10000, 15000, 20000])) { if (fr >= nyq) continue; const y = log ? H * (1 - Math.log(fr / fmin) / Math.log(nyq / fmin)) : H * (1 - fr / nyq); ctx.fillRect(0, y, W, 1); ctx.fillText(fr >= 1000 ? fr / 1000 + ' kHz' : fr + ' Hz', 6, y - 3) }
        let pk = 1; for (let k = 2; k < bins; k++) if (peaks[k] > peaks[pk]) pk = k
        let hi = bins - 1; while (hi > 1 && 20 * Math.log10(peaks[hi] / peaks[pk] || 1e-9) < -60) hi--
        return { viz: canvas, report: [
          { k: 'Strongest frequency', v: fmtHz(pk / (bins - 1) * nyq) },
          { k: 'Content extends to', v: fmtHz(hi / (bins - 1) * nyq), note: 'Highest frequency within 60 dB of the peak. A hard wall below 16 kHz usually means a lossy source; content to 20 kHz means a lossless or high-bitrate one.' },
          ...(count ? [{ k: 'Spectral centroid', v: fmtHz(cent / count), note: 'Average brightness: where the energy balances.' }] : []),
          { k: 'Resolution', v: (fs / frameSize).toFixed(1) + '<small>Hz</small> / ' + (hopSize / fs * 1000).toFixed(0) + '<small>ms</small>' },
        ] }
        function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(2) + '<small>kHz</small>' : f.toFixed(0) + '<small>Hz</small>' }
      }
    })`,
    faq: [
      ['What does a spectrogram show?', 'Time runs left to right, frequency bottom to top, brightness is level. Harmonics appear as stacked lines, drums as vertical stripes, noise as a wash.'],
      ['How do I spot a fake lossless file?', 'A hard cutoff at 16 kHz is the MP3 128 kbps signature, 19 to 20 kHz suggests 320 kbps or AAC. True CD-quality material reaches 22 kHz with a natural roll-off.'],
      ['Why choose a different window?', 'A longer window (4096) resolves close pitches but blurs time; a shorter one (1024) shows fast transients but smears pitch. 2048 is the usual compromise at 44.1 or 48 kHz.'],
      ['Is the file uploaded?', 'No. The STFT is computed in your browser with @audio/stft; nothing leaves your device.'],
    ],
    seo: `
      <h2>Spectrogram analysis in the browser</h2>
      <p>The page computes a short-time Fourier transform with <code>@audio/stft</code> and renders it on a canvas: logarithmic frequency axis by default (what you hear), linear on request (what engineers measure). Audio and video files are accepted; nothing is uploaded.</p>
      <h3>Reading it</h3>
      <ul>
        <li><strong>Horizontal lines</strong> are sustained tones and their harmonics. Equal spacing on the linear axis means a harmonic series.</li>
        <li><strong>Vertical lines</strong> are transients: drum hits, clicks, consonants.</li>
        <li><strong>A flat ceiling</strong> is a codec low-pass: 16 kHz for low-bitrate MP3, 19 to 20 kHz for high bitrates.</li>
        <li><strong>A horizontal line at 50 or 60 Hz</strong> and its multiples is mains hum. The <a href="/util/denoise/">noise remover</a> takes it out.</li>
      </ul>
      <h3>Numbers alongside the picture</h3>
      <p>Strongest frequency across the file, the highest frequency with meaningful content (useful to judge a transcode), and the spectral centroid, the balance point of the energy that tracks perceived brightness.</p>`,
  },
  {
    slug: 'measure', name: 'Room and speaker measurement', short: 'Frequency response, reverb time (RT60), latency, via a sine sweep',
    title: 'Measure your speakers and room: frequency response and RT60 in the browser',
    description: 'Play a sine sweep through your speakers, record it with your microphone, and get the frequency response, reverberation time (RT60) and system latency. Runs in the browser with no software to install.',
    lead: 'A sine sweep plays through your speakers and is recorded by your microphone. You get the frequency response, RT60 and latency.',
    powered: ['@audio/measure', '@audio/synth', '@audio/mic'], repo: 'https://github.com/audiojs/measure',
    body: `
    <div class="live" id="live">
      <div class="sub" id="msg">Turn the volume to a comfortable level, place the microphone where you listen, then press start. The sweep lasts 3 seconds.</div>
      <div class="meter" style="max-width:420px"><i id="peak" style="left:0"></i></div>
      <div class="actions">
        <button class="btn" id="start" type="button">Start measurement</button>
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:var(--fs-sm)">Sweep level <select id="gain"><option value="0.1">-20 dB</option><option value="0.3" selected>-10 dB</option><option value="0.6">-4 dB</option></select></label>
      </div>
    </div>
    <section class="panel" id="panel" hidden>
      <div class="row report" id="report"></div>
      <div class="row viz" id="viz"></div>
    </section>`,
    script: `
    const lib = import('https://esm.sh/@audio/measure@1.1.2')
    const chirpLib = import('https://esm.sh/@audio/synth-chirp')
    const start = $('start'), msg = $('msg'), peak = $('peak'), panel = $('panel'), report = $('report'), viz = $('viz'), gainSel = $('gain')
    start.addEventListener('click', async () => {
      start.disabled = true; panel.hidden = true
      try {
        const fs = 48000, f0 = 20, f1 = 20000, duration = 3
        const [{ ir, response, latency }, chirp] = await Promise.all([lib, chirpLib])
        const sweep = chirp.default({ f0, f1, duration, fs })
        const ctx = new AudioContext({ sampleRate: fs }); await ctx.resume()
        const chunks = []; let received = 0, preroll = 0
        msg.textContent = 'asking for the microphone…'
        const stop = await mic((c, rate) => { if (rate !== fs) throw Error('rate'); chunks.push(c); received += c.length; let p = 0; for (const x of c) p = Math.max(p, Math.abs(x)); peak.style.left = Math.min(100, p * 100) + '%'; peak.classList.toggle('ok', p > 0.02 && p < 0.9) }, { sampleRate: fs })
        await new Promise(r => setTimeout(r, 500)) // settle
        const pad = fs // one second of room tail after the sweep
        const buf = ctx.createBuffer(1, sweep.length + pad, fs); buf.getChannelData(0).set(sweep)
        const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = +gainSel.value; src.connect(g).connect(ctx.destination)
        msg.textContent = 'playing the sweep…'
        const done = new Promise(r => src.onended = r); src.start(); preroll = received; await done
        await new Promise(r => setTimeout(r, 300)); stop(); ctx.close()
        const n = chunks.reduce((s, c) => s + c.length, 0), rec = new Float32Array(n); let off = 0; for (const c of chunks) { rec.set(c, off); off += c.length }
        let pk = 0; for (const x of rec) pk = Math.max(pk, Math.abs(x))
        if (pk < 0.01) throw Error('The microphone heard almost nothing. Raise the volume or move the microphone closer.')
        msg.textContent = 'computing…'
        const lat = latency(rec, sweep, { fs }); lat.seconds = Math.max(0, lat.samples - preroll) / fs
        const h = ir(rec, { sweep, f0, f1, fs, length: fs })
        const { freqs, db } = response(h, { fs, n: 16384 })
        // RT60 via Schroeder backward integration on the IR, T20 extrapolated
        let hs = 0, tail = new Float64Array(h.length); for (let i = h.length - 1; i >= 0; i--) { hs += h[i] * h[i]; tail[i] = hs }
        const edc = i => 10 * Math.log10(tail[i] / tail[0] + 1e-30)
        let i5 = 0; while (i5 < h.length && edc(i5) > -5) i5++
        let i25 = i5; while (i25 < h.length && edc(i25) > -25) i25++
        const rt60 = (i25 - i5) / fs * 3
        // 1/6-octave smoothed response from 30 Hz to 20 kHz, normalized at 1 kHz
        const W = 1200, H = 360, canvas = el('canvas'); canvas.width = W; canvas.height = H; const c2 = canvas.getContext('2d')
        c2.fillStyle = '#0d1014'; c2.fillRect(0, 0, W, H)
        const fx = f => W * Math.log(f / 30) / Math.log(20000 / 30)
        const smooth = f => { let s = 0, m = 0; const lo = f / Math.pow(2, 1 / 12), hi = f * Math.pow(2, 1 / 12); for (let k = 0; k < freqs.length; k++) if (freqs[k] >= lo && freqs[k] <= hi) { s += Math.pow(10, db[k] / 10); m++ } return m ? 10 * Math.log10(s / m) : -100 }
        const ref = smooth(1000), pts = []
        for (let x = 0; x < W; x += 2) { const f = 30 * Math.pow(20000 / 30, x / W); pts.push([x, smooth(f) - ref]) }
        c2.strokeStyle = 'rgba(237,235,228,.25)'; c2.fillStyle = 'rgba(237,235,228,.8)'; c2.font = '600 12px Manrope, sans-serif'
        for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = fx(f); c2.beginPath(); c2.moveTo(x, 0); c2.lineTo(x, H); c2.stroke(); c2.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 4, H - 6) }
        for (const d of [20, 10, 0, -10, -20]) { const y = H / 2 - d * (H / 60); c2.beginPath(); c2.moveTo(0, y); c2.lineTo(W, y); c2.stroke(); c2.fillText((d > 0 ? '+' : '') + d + ' dB', 6, y - 4) }
        c2.strokeStyle = '#00a4b8'; c2.lineWidth = 2; c2.beginPath()
        pts.forEach(([x, d], i) => { const y = H / 2 - Math.max(-30, Math.min(30, d)) * (H / 60); i ? c2.lineTo(x, y) : c2.moveTo(x, y) }); c2.stroke()
        const band = (lo, hi) => { const v = []; for (const [x, d] of pts) { const f = 30 * Math.pow(20000 / 30, x / W); if (f >= lo && f <= hi) v.push(d) } return v }
        const dev = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) }
        const rows = [
          { k: 'Reverb time RT60', v: rt60.toFixed(2) + '<small>s</small>', note: rt60 < 0.3 ? 'Dry, treated-room territory.' : rt60 < 0.6 ? 'Typical living room or small studio.' : 'Live room: expect smeared bass and blurred stereo image.' },
          { k: 'Response deviation 100 Hz to 10 kHz', v: '±' + dev(band(100, 10000)).toFixed(1) + '<small>dB</small>', note: 'Standard deviation of the 1/6-octave smoothed response. Below ±3 dB is very flat; room modes usually dominate below 300 Hz.' },
          { k: 'Loop latency', v: (lat.seconds * 1000).toFixed(1) + '<small>ms</small>', note: 'Speaker to microphone, including the audio stack. Divide the acoustic part by 0.343 m/ms for distance.' },
        ]
        report.replaceChildren(...rows.map(r => el('div', {}, el('div', { class: 'k' }, r.k), el('div', { class: 'v', html: r.v }), el('div', { class: 'note' }, r.note))))
        viz.replaceChildren(canvas); panel.hidden = false
        msg.textContent = 'Done. Press start to measure again from another spot.'
      } catch (e) { msg.textContent = e.message === 'rate' ? 'The microphone runs at a different sample rate than playback; try another browser.' : (e.message || 'Measurement failed') }
      start.disabled = false
    })`,
    faq: [
      ['What do I need?', 'Speakers or headphones and a microphone in the same room. A laptop measures itself; for real speaker data use an external microphone, ideally an omni measurement mic, at the listening position.'],
      ['What is RT60?', 'The time the sound field takes to decay by 60 dB after the source stops. It is estimated from the impulse response by Schroeder backward integration and extrapolated from the -5 to -25 dB slope (T20).'],
      ['Why does the response look wild below 200 Hz?', 'Room modes: standing waves between walls create peaks and dips of 10 dB or more. That is the room, not the speaker. Move the microphone and compare.'],
      ['Is anything uploaded?', 'No. The sweep, the recording and the analysis stay in your browser.'],
    ],
    seo: `
      <h2>Room acoustics measurement, no software to install</h2>
      <p>The page plays a logarithmic sine sweep from 20 Hz to 20 kHz through your speakers, records it with your microphone and computes the impulse response by deconvolution with <code>@audio/measure</code>. From the impulse response it derives the frequency response (1/6-octave smoothed, normalized at 1 kHz), the reverberation time RT60 and the round-trip latency. Everything runs in the browser.</p>
      <h3>How to get a useful measurement</h3>
      <ul>
        <li>Put the microphone at ear height in the listening position, pointing up or at the speakers.</li>
        <li>Set the volume so the sweep is clearly louder than the room noise, but not shouting; the level meter should reach the green zone.</li>
        <li>Measure a few positions 20 to 30 cm apart. Dips that move are room modes; dips that stay are the speaker or its placement.</li>
      </ul>
      <h3>Reading the result</h3>
      <p>A response within ±3 dB from 100 Hz to 10 kHz is good for an untreated room. RT60 below 0.4 s is what mixing rooms aim for; living rooms sit around 0.5 s. Latency includes your audio interface and operating system, so it is not a pure acoustic figure, but it is stable for the same setup.</p>`,
  },
]

const head = (p) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(p.title)} · audiojs</title>
  <meta name="description" content="${esc(p.description)}">
  <meta name="theme-color" content="#0d1014">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${SITE}/util/${p.slug}/">
  <link rel="icon" type="image/svg+xml" href="${ICON}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/util/${p.slug}/">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:site_name" content="audiojs">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:site" content="@audio_js">
  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', '@id': `${SITE}/util/${p.slug}/#app`, name: p.name, url: `${SITE}/util/${p.slug}/`, applicationCategory: 'MultimediaApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and Web Audio', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: p.description, author: { '@type': 'Organization', name: 'audiojs', url: SITE + '/' }, softwareHelp: { '@type': 'CreativeWork', url: p.repo } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'audiojs', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Utilities', item: SITE + '/util/' }, ...(p.slug ? [{ '@type': 'ListItem', position: 3, name: p.name, item: `${SITE}/util/${p.slug}/` }] : [])] },
      ...(p.faq.length ? [{ '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : []),
    ]
  }, null, 2).replace(/\n/g, '\n  ')}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://esm.sh">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${CSS}">
  <link rel="modulepreload" href="${JS}">
</head>`

const header = (repo) => `
  <header class="top">
    <div class="inner">
      <a class="brand" href="/" aria-label="audiojs home"><span class="name">audio</span><span class="js">JS</span></a>
      <nav><a href="/util/">All utilities</a> · <a href="${repo}" target="_blank" rel="noopener">Source</a></nav>
    </div>
  </header>`
const footer = `
  <footer><a href="/">audiojs</a> · open audio stack for JavaScript · <a href="https://github.com/sponsors/audiojs" target="_blank" rel="noopener">sponsor</a></footer>`

const page = (p) => `${head(p)}
<body>${header(p.repo)}
  <main class="inner">
    <section class="hero">
      <h1>${p.name}</h1>
      <p>${p.lead}</p>
    </section>
${p.body}
    <p class="privacy">${NO_UPLOAD}${p.powered.map(pkg).join(p.powered.length > 2 ? ', ' : ' and ')}.</p>
    <section class="seo">${p.seo}
      <h3>Questions</h3>
      ${p.faq.map(([q, a]) => `<p><strong>${q}</strong> ${a}</p>`).join('\n      ')}
      <div class="more">
        <h3>More audio utilities</h3>
        <ul>${pages.filter(o => o !== p).map(o => `\n          <li><a href="/util/${o.slug}/">${o.name}</a></li>`).join('')}
        </ul>
      </div>
    </section>
  </main>${footer}
  <script type="module">
    import { tool, mic, $, el, FORMATS, encodeAudio, saveBlob, fmtSize, fmtTime } from '${JS}'
    ${p.script.trim()}
  </script>
</body>
</html>
`

const index = () => `${head({ slug: '', title: 'Free audio utilities that run in your browser', name: 'Audio utilities', description: 'Extract audio from video, convert formats, measure loudness, remove noise, find key and BPM, remove vocals, change pitch and tempo, tune, record, view spectrograms and measure your room. Every tool runs in the browser on audiojs open-source packages; nothing is uploaded.', repo: 'https://github.com/audiojs', faq: [] }).replace(/util\/\//g, 'util/')}
<body>${header('https://github.com/audiojs')}
  <main class="inner">
    <section class="hero">
      <h1>Audio utilities</h1>
      <p>Each one runs in your browser on an open-source audiojs package. Nothing is uploaded.</p>
    </section>
    <ul class="index">${pages.map(p => `
      <li><a href="/util/${p.slug}/"><div class="n">${p.name}</div><div class="d">${p.short}</div><div class="p">${p.powered.map(n => `<code>${n}</code>`).join(' · ')}</div></a></li>`).join('')}
    </ul>
    <section class="seo">
      <h2>Why these run on your device</h2>
      <p>audiojs is a set of JavaScript and WebAssembly packages for decoding, encoding, measuring and processing audio. The same packages power these pages: <code>@audio/decode</code> reads the file, the tool's package does the work, <code>@audio/encode</code> writes the result. No server sees your audio, so there is no size limit, no queue and nothing to delete. Every page links the package it demonstrates; the code is on <a href="https://github.com/audiojs" target="_blank" rel="noopener">GitHub</a> and <a href="https://www.npmjs.com/org/audio" target="_blank" rel="noopener">npm</a>.</p>
    </section>
  </main>${footer}
</body>
</html>
`

const today = new Date().toISOString().slice(0, 10)
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/util/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>${pages.map(p => `
  <url><loc>${SITE}/util/${p.slug}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join('')}
</urlset>
`
const robots = () => `User-agent: *
Allow: /
Disallow: /index-v2.html
Disallow: /index-v3.html
Disallow: /index-v4.html

Sitemap: ${SITE}/sitemap.xml
`

for (const p of pages) { mkdirSync(`${ROOT}util/${p.slug}`, { recursive: true }); writeFileSync(`${ROOT}util/${p.slug}/index.html`, page(p)) }
writeFileSync(`${ROOT}util/index.html`, index())
writeFileSync(`${ROOT}sitemap.xml`, sitemap())
writeFileSync(`${ROOT}robots.txt`, robots())
console.log(`rendered ${pages.length} pages + index, sitemap, robots`)
