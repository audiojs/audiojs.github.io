// De-silence: shorten/remove/trim pauses in speech via VAD. @audio/denoise-desilence.
import { drop, src } from '../page-helpers.mjs'

const DESILENCE = src('@audio/denoise-desilence', '0.1.0')

export default {
  order: 45,
  slug: 'desilence', name: 'Remove silence from audio', short: 'Podcast smart speed, silence removal, trim start/end — voice activity detection',
  title: 'Remove silence from audio online, free, no upload',
  description: 'Shorten long pauses for podcast smart speed, remove silence between takes, or trim the start and end. Runs in your browser; nothing is uploaded.',
  lead: 'Drop a recording. Shorten or cut its pauses, or trim just the start and end, and save.',
  powered: ['@audio/denoise-desilence'], repo: 'https://github.com/audiojs/denoise',
  body: drop('Drop a recording here') + `
    <form class="opts" id="opts">
      <!-- reads as one sentence: "Shorten pauses longer than 0.5 s to 0.25 s" · "Cut out pauses longer than 0.5 s, keeping 0.1 s around speech" · "Trim silence at the start and end" -->
      <span class="sentence"><label><select name="mode">
        <option value="shorten" selected>Shorten</option>
        <option value="remove">Cut out</option>
        <option value="trim">Trim</option>
      </select></label>
      <label data-for="shorten remove">pauses longer than <select name="minSilence">
        <option value="0.3">0.3 s</option>
        <option value="0.5" selected>0.5 s</option>
        <option value="0.75">0.75 s</option>
        <option value="1">1 s</option>
        <option value="2">2 s</option>
      </select></label>
      <label data-for="shorten">to <select name="maxSilence">
        <option value="0.15">0.15 s</option>
        <option value="0.25" selected>0.25 s</option>
        <option value="0.4">0.4 s</option>
        <option value="0.6">0.6 s</option>
      </select></label>
      <label data-for="remove">keeping <select name="pad">
        <option value="0.05">0.05 s</option>
        <option value="0.1" selected>0.1 s</option>
        <option value="0.2">0.2 s</option>
      </select> around speech</label>
      <span data-for="trim">silence at the start and end</span></span>
    </form>`,
  worker: `

const lib = import('${DESILENCE}')

const MODE_NOTE = {
  shorten: (minSilence, maxSilence) => 'Pauses longer than ' + minSilence + 's are shortened to ' + maxSilence + 's, cut from the middle so the onset and offset of each phrase survive.',
  remove: (minSilence, pad) => 'Pauses longer than ' + minSilence + 's are cut down to ' + pad + 's kept on each side.',
  trim: () => 'Only silence at the very start and end is removed; pauses inside the recording are left alone.',
}

// gaps between out.segments (kept spans, input-timeline seconds) are exactly the cut spans —
// reusing the library's own output instead of re-deciding which pauses qualify
function complement(ranges, duration) {
  const out = []
  let pos = 0
  for (const r of ranges) { if (r.start > pos) out.push({ start: pos, end: r.start }); pos = Math.max(pos, r.end) }
  if (pos < duration) out.push({ start: pos, end: duration })
  return out
}

// timeline canvas: speech in accent, cut spans in dark red, kept silence in grey
function makeViz(speech, cuts, duration) {
  const W = 1200, H = 60
  if (!duration || speech.length + cuts.length > 20000) return null
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgb(241,239,233)'; ctx.fillRect(0, 0, W, H)
  const hit = (t, ranges) => { for (const r of ranges) if (t >= r.start && t < r.end) return true; return false }
  for (let x = 0; x < W; x++) {
    const t = duration * (x + 0.5) / W
    ctx.fillStyle = hit(t, speech) ? 'rgb(0,164,184)' : hit(t, cuts) ? 'rgb(179,38,30)' : 'rgb(107,111,115)'
    ctx.fillRect(x, 12, 1, H - 24)
  }
  return { width: W, height: H, data: ctx.getImageData(0, 0, W, H).data }
}

export default async function process(a, o, ui) {
  const { default: desilence, segments } = await lib
  const fs = a.sampleRate
  const mode = o.mode || 'shorten'
  const minSilence = +o.minSilence || 0.5
  const maxSilence = +o.maxSilence || 0.25
  const pad = +o.pad || 0.1
  const opts = { fs, mode, minSilence, maxSilence, pad }

  ui.status('Finding pauses…')
  const channels = a.channelData
  const duration = channels[0].length / fs

  const { speech } = segments(channels, { fs })
  const speechSec = speech.reduce((s, x) => s + (x.end - x.start), 0)
  const speechPct = duration > 0 ? speechSec / duration * 100 : 0

  const out = desilence(channels, opts)
  const newDuration = out.data[0].length / fs
  const cuts = complement(out.segments, duration)
  const removedPct = duration > 0 ? out.removed / duration * 100 : 0

  const report = [
    { k: 'Speech found', v: speechPct.toFixed(0) + '<small>%</small>', note: speech.length + ' phrase' + (speech.length === 1 ? '' : 's') + ' detected by voice activity detection, ' + speechSec.toFixed(1) + 's of ' + fmtTime(duration) + ' total.' },
    { k: 'Pauses cut', v: String(cuts.length), note: cuts.length ? MODE_NOTE[mode](minSilence, mode === 'shorten' ? maxSilence : pad) : (mode === 'trim' ? 'No silence at the very start or end of this file.' : 'No pause in this file is longer than ' + minSilence + 's.') },
    { k: 'Removed', v: out.removed.toFixed(2) + 's <small>(' + removedPct.toFixed(0) + '%)</small>' },
    { k: 'New length', v: fmtTime(newDuration) },
  ]

  const viz = makeViz(speech, cuts, duration)
  return { audio: { channelData: out.data, sampleRate: fs }, report, ...(viz ? { viz } : {}), suffix: '-desilenced' }
}
`,
  tool: { formats: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac'], busy: 'Finding pauses…' },
  script: `
    const form = $('opts')
    const modeSel = form.querySelector('[name=mode]')
    const sync = () => { for (const label of form.querySelectorAll('[data-for]')) label.hidden = !label.dataset.for.split(' ').includes(modeSel.value) }
    modeSel.addEventListener('change', sync)
    sync()
    tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['How does it find the pauses?', 'A voice activity detector (@audio/vad) measures frame energy and spectral flatness — speech is tonal, silence and noise are flat — and groups the active frames into phrases. It is tuned for close-miced narration, not far-field or noisy conference audio.'],
    ["What's the difference between shorten, cut out and trim?", 'Shorten is podcast "Smart Speed" (the technique Overcast popularized in 2015): every pause longer than the threshold collapses to the target length, cut from the middle so the natural onset and offset survive. Cut out removes the same pauses down to a small buffer kept on each side. Trim only strips silence at the very start and end and leaves every internal pause untouched.'],
    ['Will it cut into music?', 'No — this is a speech tool. A rest in a musical passage looks like a speech pause to the detector and gets shortened or cut the same way, so it is not meant for music or mixed program audio with silences you want to keep.'],
    ['Does a cut ever click?', 'No. Every cut is an equal-power crossfade, not a hard splice, so removing or shortening a pause never produces an audible click.'],
    ['Is my file uploaded anywhere?', 'No. Detection and editing run in your browser with @audio/denoise-desilence; nothing leaves your device.'],
  ],
  seo: `
      <h2>Podcast smart speed and silence removal, in the browser</h2>
      <p>This page runs <code>@audio/denoise-desilence</code>: a voice activity detector (<code>@audio/vad</code>) finds the speech from frame energy and spectral flatness, then <code>shorten</code>, <code>remove</code> or <code>trim</code> edits the silence around it. Every cut is an equal-power crossfade, so nothing clicks. Nothing is uploaded.</p>
      <h3>Shorten: podcast "Smart Speed"</h3>
      <p>Every pause longer than the threshold collapses to the target length, trimmed from the middle so the onset and offset around each phrase survive — the technique Marco Arment described for Overcast in 2015. Good for tightening narration without cutting anything out.</p>
      <h3>Remove: cut pauses down to a buffer</h3>
      <p>Every pause longer than the threshold is cut down to a small buffer kept on each side bordering speech. Good for batch-trimming long pauses out of a take, or closing gaps between spliced clips.</p>
      <h3>Trim: just the ends</h3>
      <p>Strips only the silence at the very start and end of the file — room tone before someone starts talking, dead air after they stop — and leaves every pause inside the recording exactly as it is.</p>`,
}
