import { drop, src } from '../page-helpers.mjs'

const LOSSY = src('@audio/measure-lossy', '0.1.0')

export default {
  slug: 'lossless-check', order: 95,
  name: 'Lossless audio checker', short: 'Detect a fake lossless FLAC or WAV: spectral cutoff, edge sharpness, spectral holes',
  title: 'Is this FLAC really lossless? Detect MP3/AAC transcodes',
  description: 'Check whether a FLAC or WAV is really lossless, or an upsampled/transcoded MP3, AAC, Vorbis or Opus file. Spectral-cutoff analysis in your browser, no upload.',
  lead: 'Drop a FLAC or WAV. See exactly where its spectrum stops, and whether that edge looks like a codec lowpass.',
  powered: ['@audio/measure-lossy'], repo: 'https://github.com/audiojs/measure',
  body: drop('Drop a FLAC or WAV file here'),
  worker: `

const lib = import('${LOSSY}')
const kHz = hz => (hz / 1000).toFixed(1) + '<small>kHz</small>'

export default async function process(a, o, ui) {
  const lossy = (await lib).default
  const fs = a.sampleRate, nyq = fs / 2
  const r = lossy(a.channelData, { fs })
  const pct = Math.round(r.confidence * 100)
  const known = isFinite(r.cutoff)

  // long-term average spectrum, drawn in the worker: no DOM here, so grid lines and the curve only
  const W = 1200, H = 360, canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H)
  const fmin = 20
  const fx = f => W * Math.log(f / fmin) / Math.log(nyq / fmin)
  ctx.strokeStyle = 'rgba(237,235,228,.15)'; ctx.lineWidth = 1
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) { if (f <= fmin || f >= nyq) continue; const x = fx(f); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let i = 1; i < 4; i++) { const y = H * i / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  const { freqs, db } = r.spectrum
  let maxDb = -Infinity
  for (let i = 0; i < freqs.length; i++) if (freqs[i] >= fmin && db[i] > maxDb) maxDb = db[i]
  const minDb = maxDb - 90
  const fy = d => H * (1 - (Math.max(minDb, Math.min(maxDb, d)) - minDb) / (maxDb - minDb))
  ctx.strokeStyle = '#00a4b8'; ctx.lineWidth = 2; ctx.beginPath()
  let started = false
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < fmin) continue
    const x = fx(Math.min(freqs[i], nyq)), y = fy(db[i])
    if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true }
  }
  ctx.stroke()
  if (known && r.cutoff > fmin && r.cutoff < nyq * 0.995) {
    const x = fx(r.cutoff)
    ctx.strokeStyle = 'rgba(237,235,228,.5)'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([])
  }

  const report = [
    { k: 'Verdict', cls: r.lossy ? 'warn' : 'ok', v: (r.lossy ? 'Lossy source detected' : 'No lossy signature found') + '<small>' + (r.lossy ? r.source + ' guess, ' : '') + pct + '% confidence</small>' },
    { k: 'Cutoff frequency', v: known ? kHz(r.cutoff) : 'unknown<small>file too short</small>',
      note: !known ? 'Not enough audio to estimate a spectral cutoff reliably.' :
        'Content reaches ' + (r.cutoff / 1000).toFixed(1) + ' kHz; this ' + (fs / 1000) + ' kHz file could carry content up to ' + (nyq / 1000).toFixed(1) + ' kHz, its Nyquist frequency. ' +
        (nyq - r.cutoff < 500 ? 'No real gap between the two: this looks like full bandwidth.' : 'The gap between them is what a codec lowpass filter leaves behind.') },
    { k: 'Edge sharpness', v: (Math.round(r.evidence.cutoffSharpness) || 0) + '<small>dB/oct</small>',
      note: r.evidence.cutoffSharpness > 60 ? 'Steeper than 60 dB/octave: the signature of an encoder brick-wall lowpass filter, not a microphone or tape roll-off.' : 'Gentle slope: consistent with a natural roll-off (microphone, tape, room) rather than a codec filter.' },
    { k: 'Spectral holes', v: r.evidence.holes.toFixed(1) + '<small>/s</small>',
      note: 'Persistent gaps in the 4-16 kHz band where an encoder ran out of bits for that frame. More than a couple per second is the low-bitrate MP3 swiss-cheese pattern.' },
    { k: 'Upsampled', v: r.evidence.upsampled ? 'Yes' : 'No',
      note: r.evidence.upsampled ? 'The cutoff sits at a clean fraction of the sample rate: this looks like a lower-rate source padded back up, not a bitrate-driven codec filter.' : 'The cutoff does not line up with a simple fraction of the sample rate.' },
    { k: 'What this means', cls: 'list wide',
      v: 'This test loses power above roughly 128-160 kbps: a well-tuned high-bitrate MP3 or AAC can show no lowpass at all and read as lossless. It can also misfire the other way on naturally band-limited audio, an old tape dub, a narrow-band microphone, heavy de-essing, plain speech, which can look exactly like a lossy cutoff. Read the cutoff, edge sharpness and spectral holes together; do not trust the verdict alone.' },
  ]
  return { report, viz: { width: W, height: H, data: ctx.getImageData(0, 0, W, H).data } }
}
`,
  tool: { busy: 'Reading the spectrum…' },
  script: `tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['How does this detect a fake lossless file?', 'It reads the long-term average spectrum (Welch, via @audio/spectral-ltas) plus a per-frame max-hold spectrum, then finds the highest frequency where the level drops and stays down to Nyquist, not a narrow notch. It also measures the edge slope, counts short spectral holes in the 4-16 kHz band, and checks for the MP3 sfb21 notch near 16 kHz. This is the numeric form of the manual spectrogram-reading method used by Spek and aucdtect-style guessers.'],
    ['Can a real lossless file get flagged as lossy?', 'Yes. Naturally band-limited audio, an old tape dub, a narrow-band microphone, heavy de-essing, plain speech, produces the same spectral cutoff as a lossy encoder. The verdict is a heuristic, not a certificate: read the cutoff, edge sharpness and holes yourself before trusting it.'],
    ['Can a fake lossless file pass as clean?', 'Yes, above roughly 128 to 160 kbps. A well-tuned MP3 or AAC at that bitrate or higher often shows no measurable lowpass at all. That is a documented limit of spectral-cutoff detection in general, shared by Spek-based guessers and aucdtect, not specific to this page.'],
    ['What is a spectral hole and the sfb21 notch?', 'A spectral hole is a short gap in the 4-16 kHz band where a low-bitrate encoder ran out of bits for that frame, the swiss-cheese pattern. The sfb21 notch is a narrow dip near 16 kHz specific to MP3: its last long-block scalefactor band stays bit-starved even above the nominal cutoff.'],
    ['Is my file uploaded anywhere?', 'No. The spectrum analysis and classification run in this tab with @audio/measure-lossy, an open-source library. The file never leaves your device.'],
  ],
  seo: `
    <h2>Spectral-cutoff detection, measured instead of eyeballed</h2>
    <p>A "lossless" file traded online is sometimes a 128 kbps MP3 re-encoded to FLAC. The classic tell is a spectrogram with a hard wall around 16 kHz, the Spek screenshot audiophile forums have traded for years. This page turns that manual read into a number: <code>@audio/measure-lossy</code> computes the long-term average spectrum (Welch, via <code>@audio/spectral-ltas</code>) and a max-hold spectrum, finds the sustained drop that marks the true cutoff, and matches it against the published lowpass tables of LAME MP3, AAC, Vorbis and Opus.</p>
    <h3>What the numbers mean</h3>
    <ul>
      <li><strong>Cutoff frequency</strong>: the highest frequency the file actually carries. Compare it with the file's own Nyquist, half its sample rate; a gap is the signature of a codec lowpass filter.</li>
      <li><strong>Edge sharpness</strong>: how steep the drop is, in dB per octave. Psychoacoustic encoders cut sharply, above 60 dB/octave; microphones and tape roll off gently.</li>
      <li><strong>Spectral holes</strong>: short 4-16 kHz gaps per second where a low-bitrate encoder ran out of bits, the classic MP3 swiss-cheese pattern.</li>
      <li><strong>Upsampled</strong>: a cutoff sitting at a clean fraction of the sample rate, the 22.05, 24 or 32 kHz half-rates, means a lower-rate source padded back up, not a bitrate-driven filter.</li>
    </ul>
    <h3>Where this method breaks down</h3>
    <p>Above roughly 128 to 160 kbps a well-tuned MP3 or AAC often shows no measurable lowpass, so it can read as lossless even though it was transcoded. The reverse happens too: an old tape dub, a narrow-band microphone, or plain speech is naturally band-limited and can look exactly like a lossy cutoff. This is a known limit of spectral-cutoff detection generally, shared by Spek and aucdtect-style guessers, not a defect specific to this page. Treat the verdict as one data point and read the cutoff, sharpness and holes together.</p>`,
}
