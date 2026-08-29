// Wow and flutter correction — pitch-drift removal for tape/cassette/vinyl transfers.
import { drop, src } from '../page-helpers.mjs'

const DEWOW = src('@audio/denoise-dewow', '0.1.0')

export default {
  slug: 'dewow', order: 46,
  name: 'Wow and flutter fixer', short: 'Correct slow pitch drift and fast wobble in tape, cassette and vinyl transfers',
  title: 'Fix wow and flutter: pitch drift in tape, cassette and vinyl transfers',
  description: 'Correct wow (slow pitch drift) and flutter (fast wobble) in a tape or vinyl transfer, in your browser. Tracks the music, a hum or a reference tone. No upload.',
  lead: 'Drop a transfer with pitch drift. See the wow and flutter measured, corrected, and the speed curve before and after.',
  powered: ['@audio/denoise-dewow'], repo: 'https://github.com/audiojs/denoise',
  body: drop('Drop a tape, cassette or vinyl transfer here') + `
    <style>#opts label { min-width: 0 } #opts select[name=mode] { min-width: 0; max-width: 100%; text-overflow: ellipsis }</style>
    <form class="opts" id="opts">
      <label>Method <select name="mode">
        <option value="partial" selected>Track the music's own partials</option>
        <option value="reference">Lock to a reference tone (mains hum, test tone)</option>
        <option value="pitch">Monophonic pitch (voice, solo instrument)</option>
      </select></label>
      <label id="refRow" hidden>Reference frequency <input type="number" name="refFreq" value="50" min="1" max="20000" step="1" style="width:5.5em;font:inherit;padding:8px;border:1px solid var(--c-rule);border-radius:6px"> Hz <span style="color:var(--c-mute);font-size:var(--fs-xs)">60 for US mains, 1000+ for a calibration tone</span></label>
      <label><input type="checkbox" name="wow" checked> Wow <span style="color:var(--c-mute);font-size:var(--fs-xs)">slow drift</span></label>
      <label><input type="checkbox" name="flutter" checked> Flutter <span style="color:var(--c-mute);font-size:var(--fs-xs)">fast wobble</span></label>
    </form>`,
  worker: `
const lib = import('${DEWOW}')
const LOW_CONF = 'Few stable partials — try the reference mode or the pitch mode.'

export default async function process(a, o, ui) {
  const { default: dewow, analyze } = await lib
  const fs = a.sampleRate
  const mode = o.mode || 'partial', refFreq = +o.refFreq || 50
  const wow = !!o.wow, flutter = !!o.flutter
  const n = a.channelData[0].length, mono = new Float32Array(n)
  for (const ch of a.channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / a.channelData.length
  const curveOpts = { fs, mode, refFreq, wow, flutter }

  ui.status('Measuring speed drift…')
  await new Promise(r => setTimeout(r, 20))
  const before = analyze(mono, curveOpts)

  ui.status('Correcting speed…')
  await new Promise(r => setTimeout(r, 20))
  const channelData = dewow(a.channelData, curveOpts)

  ui.status('Checking the result…')
  await new Promise(r => setTimeout(r, 20))
  const outN = channelData[0].length, outMono = new Float32Array(outN)
  for (const ch of channelData) for (let i = 0; i < outN; i++) outMono[i] += ch[i] / channelData.length
  const after = analyze(outMono, curveOpts)

  let lo = Infinity, hi = -Infinity
  for (const s of before.speed) { if (s < lo) lo = s; if (s > hi) hi = s }

  const dur = n / fs, W = 1200, H = 200
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H)
  const range = 3, yOf = dev => H / 2 - Math.max(-range, Math.min(range, dev)) * (H / 2 / range)
  ctx.strokeStyle = 'rgba(237,235,228,.3)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, yOf(0)); ctx.lineTo(W, yOf(0)); ctx.stroke()
  const plot = (times, curve, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
    for (let i = 0; i < curve.length; i++) {
      const x = dur > 0 ? Math.min(W, times[i] / dur * W) : 0, y = yOf((curve[i] - 1) * 100)
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.stroke()
  }
  plot(before.times, before.speed, 'rgba(237,235,228,.5)')
  plot(after.times, after.speed, '#00a4b8')
  ctx.fillStyle = 'rgba(237,235,228,.8)'; ctx.font = '600 11px Manrope, sans-serif'
  ctx.fillText('+3%', 6, 13); ctx.fillText('0%', 6, H / 2 + 4); ctx.fillText('-3%', 6, H - 6)

  const pct = x => x.toFixed(2)
  return {
    audio: { channelData, sampleRate: fs }, suffix: '-dewow',
    viz: { width: W, height: H, data: ctx.getImageData(0, 0, W, H).data },
    report: [
      { k: 'Wow', v: pct(before.wowPeak) + ' → ' + pct(after.wowPeak) + '<small>% peak</small>', cls: after.wowPeak < before.wowPeak ? 'ok' : '', note: 'Peak deviation from nominal speed, unweighted (not the IEC 60386 figure). Slow drift, below about 6 Hz.' },
      { k: 'Flutter', v: pct(before.flutterPeak) + ' → ' + pct(after.flutterPeak) + '<small>% peak</small>', cls: after.flutterPeak < before.flutterPeak ? 'ok' : '', note: 'Peak deviation, unweighted. Faster wobble; this analysis only sees it up to about 40 Hz.' },
      { k: 'Confidence', v: (before.confidence * 100).toFixed(0) + '<small>%</small>', cls: before.confidence < 0.5 ? 'warn' : '', note: before.confidence < 0.5 ? LOW_CONF : 'Fraction of the recording with a usable speed reading.' },
      { k: 'Speed range', v: (lo * 100).toFixed(1) + '% – ' + (hi * 100).toFixed(1) + '<small>% of nominal</small>', note: 'The transport speed found in the source, before correction — 100% is nominal.' },
    ],
  }
}
`,
  tool: { formats: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac'], defaultFormat: 'wav', busy: 'Tracking pitch drift…' },
  script: `
    const form = $('opts'), refRow = $('refRow'), mode = form.querySelector('[name=mode]')
    const syncMode = () => refRow.hidden = mode.value !== 'reference'
    mode.addEventListener('change', syncMode)
    syncMode()
    tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['What is wow and flutter?', 'Wow is slow pitch drift, below about 6 Hz: a stretched belt, an eccentric capstan, a warped record. Flutter is faster wobble, up to a few tens of Hz: a rough motor, a dirty pinch roller. Both come from a transport that does not turn at a constant speed.'],
    ['How does it find the speed without a reference recording?', 'The default mode tracks stable partials in the music itself: a tone that should hold one frequency reveals the transport\'s actual speed when it wobbles instead (a phase-vocoder implementation of the technique behind Celemony Capstan). Reference mode does the same on one known tone, mains hum or a calibration tone; pitch mode follows a monophonic voice or instrument.'],
    ['What can it not fix?', 'Dropouts, azimuth error (a stereo time skew, not a speed error), and anything with no stable partial or reference tone to lock onto: a cappella breath, pure noise, hard cuts. Pitch mode also cannot tell real musical vibrato from mechanical wow, so it only works well on lightly-inflected material.'],
    ['Why does flutter above about 40 Hz not show up?', 'The speed curve is itself sampled at roughly 86 Hz (sample rate divided by the analysis hop), so anything above its Nyquist, about 43 Hz, cannot be represented at all. Most tape and turntable flutter sits below that.'],
    ['Does it work on drum loops or spoken word with no held notes?', 'Not well. Percussion-only material gives the estimator nothing to lock onto. Pick a passage with a sustained note or vowel, or switch to reference mode if a hum or tone runs through the recording.'],
  ],
  seo: `
    <h2>Wow and flutter correction that shows its work</h2>
    <p>This page runs <code>@audio/denoise-dewow</code>, an open-source phase-vocoder implementation of the classical (non-machine-learning) technique behind tools like Celemony Capstan. It estimates the transport's instantaneous speed over time and corrects it by variable-rate resampling, in your browser. Nothing is uploaded.</p>
    <h3>Three ways to find the speed</h3>
    <ul>
      <li><strong>Track partials</strong> (default): follows several stable tones in the music at once with McAulay-Quatieri partial tracking, combining them into one speed curve. Works on anything with a few seconds of sustained pitched content.</li>
      <li><strong>Lock to a reference tone</strong>: locks onto one known frequency, such as 50 or 60 Hz mains hum bleeding into the recording, or a calibration tone. Often the most accurate option when a hum is present.</li>
      <li><strong>Monophonic pitch</strong>: follows a single voice or instrument's fundamental. A functional correction rather than a precise one, since real pitch inflection and mechanical wow are hard to tell apart.</li>
    </ul>
    <h3>What the numbers mean</h3>
    <p>Wow and flutter are reported as unweighted peak deviation from nominal speed, before and after correction: not the IEC 60386 / DIN 45507 figure, which applies a psychoacoustic weighting curve this page does not implement. Confidence is the fraction of the recording with a usable speed reading. The speed curve chart plots the source's drift in grey and the corrected result in the accent color, both against a ±3% scale.</p>
    <h3>Honest limits</h3>
    <p>This corrects speed, nothing else. Dropouts and azimuth error (a stereo channel time-skew, not a speed defect) are out of scope, as is anything with no stable tone to track: a cappella breath, pure noise, hard cuts. See the <a href="https://github.com/audiojs/denoise/tree/main/packages/denoise-dewow" target="_blank" rel="noopener">package README</a> for the measured accuracy this method achieves on its own test signal.</p>`,
}
