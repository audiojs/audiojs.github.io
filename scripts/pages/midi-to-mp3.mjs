// MIDI to MP3: render a Standard MIDI File to audio in the browser with a General MIDI synth
// (no soundfont) — @audio/midi-render (vendored) for the render, @audio/midi-parse (esm.sh)
// for the report (track count, note count, duration, programs used).
import { drop, src } from '../page-helpers.mjs'

const RENDER = src('@audio/midi-render', '0.1.0')
const PARSE = src('@audio/midi-parse', '1.0.2')

export default {
  slug: 'midi-to-mp3', order: 75,
  name: 'MIDI to MP3', short: 'Render a MIDI file with a synth-GM instrument set, no soundfont',
  title: 'MIDI to MP3: render a MIDI file to audio in your browser',
  description: 'Render a MIDI file to MP3, WAV, FLAC, OGG, Opus or M4A in your browser. Synthesized General MIDI (FM, Karplus-Strong, modal), no soundfont. No upload.',
  lead: 'Drop a MIDI file. Hear it played by a synthesized General MIDI instrument set, then save it as MP3, WAV, FLAC, OGG, Opus or M4A.',
  powered: ['@audio/midi-render', '@audio/midi-parse'], repo: 'https://github.com/audiojs/midi',
  body: drop('Drop a MIDI file here', '.mid,.midi,audio/midi,audio/x-midi') + `
    <form class="opts" id="opts">
      <label>Sample rate <select name="rate"><option value="44100" selected>44.1 kHz</option><option value="48000">48 kHz</option></select></label>
      <label>Channels <select name="channels"><option value="2" selected>stereo</option><option value="1">mono</option></select></label>
      <label>Tempo <input type="range" name="tempo" min="50" max="200" step="5" value="100"> <output>100</output> %</label>
      <label>Transpose <input type="range" name="semitones" min="-12" max="12" step="1" value="0"> <output>0</output> semitones</label>
    </form>`,
  worker: `
const renderLib = import('${RENDER}')
const parseLib = import('${PARSE}')

export default async function process(a, o, ui) {
  const parse = (await parseLib).default
  let parsed
  try { parsed = parse(a.bytes) } catch (e) { throw Error('Could not read this MIDI file: ' + e.message) }
  const fs = +o.rate || 44100
  const channels = +o.channels === 1 ? 1 : 2
  const tempoScale = (+o.tempo || 100) / 100
  const transpose = +o.semitones || 0
  ui.status('Rendering ' + parsed.notes.length + ' notes with the synth atoms…')
  await new Promise(r => setTimeout(r, 20))
  const { default: render, GM } = await renderLib
  const t0 = performance.now()
  const out = render(parsed, { fs, channels, tempoScale, transpose })
  const ms = performance.now() - t0

  // resolve the GM program in effect at each note — the same rule @audio/midi-render applies internally
  const progEvents = new Map()
  for (const track of parsed.tracks) for (const e of track) {
    if (e.type !== 'program' || e.channel == null) continue
    let evs = progEvents.get(e.channel); if (!evs) progEvents.set(e.channel, evs = []); evs.push(e)
  }
  for (const evs of progEvents.values()) evs.sort((x, y) => x.time - y.time)
  const lastAtOrBefore = (events, t) => { let r; for (const e of events) { if (e.time <= t) r = e; else break } return r }
  const names = new Set(); let drums = false
  for (const n of parsed.notes) {
    if (n.channel === 9) { drums = true; continue }
    const evs = progEvents.get(n.channel) || []
    const p = evs.length ? (lastAtOrBefore(evs, n.time)?.program ?? 0) : 0
    names.add(GM.programs[p]?.name || ('Program ' + p))
  }
  if (drums) names.add('Percussion (GM drum kit)')

  const duration = out.channelData[0].length / fs
  return {
    audio: { channelData: out.channelData, sampleRate: fs }, suffix: '',
    report: [
      { k: 'Notes', v: String(parsed.notes.length) },
      { k: 'Tracks', v: String(parsed.tracks.length) },
      { k: 'Instruments used', cls: 'list wide', v: [...names].join(' · '), note: 'Every voice is synthesized (FM, Karplus–Strong, modal resonators) from its General MIDI program number — no soundfont, no samples.' },
      { k: 'Length', v: fmtTime(duration) },
      { k: 'Render time', v: Math.round(ms) + '<small>ms</small>' },
    ]
  }
}
`,
  tool: { raw: true, formats: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a'], busy: 'Rendering with the synth atoms…' },
  script: `tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['Is this a real soundfont or sampled instruments?', 'No. Every General MIDI program is synthesized live from scratch with FM synthesis, Karplus–Strong plucked strings and modal resonator banks — the same algorithm families real synthesizers use, not a recording. It sounds like a synth-GM module, not a sample library.'],
    ['Which MIDI files work?', 'Standard MIDI Files, format 0 or 1, .mid or .midi. Multi-track, multi-channel files are supported: program changes, channel volume (CC7), pan (CC10, read once per channel), sustain pedal (CC64) and pitch bend are all read from the file.'],
    ['What happens on the drum channel?', 'Channel 10 always uses the fixed General MIDI percussion map (kick, snare, hi-hat, toms, cymbals, latin percussion on keys 35 to 81), regardless of any program change on that channel — that is what GM Level 1 specifies.'],
    ['Why does rendering take a few seconds?', 'Every note is synthesized sample by sample in your browser, then encoded to the format you pick. A multi-minute, several-hundred-note piece takes a few seconds on a laptop. Nothing is uploaded and nothing is cached on a server.'],
    ['Can I change the tempo or key?', 'Yes. Tempo (50 to 200%) stretches or compresses the note schedule before synthesis; transpose (±12 semitones) shifts every non-percussion note. Both apply to the render itself, not as after-the-fact audio processing.'],
  ],
  seo: `
    <h2>MIDI to MP3 with a synthesizer, not a soundfont</h2>
    <p>This page reads the file with <code>@audio/midi-parse</code> (tracks, tempo map, note and controller events) and renders it with <code>@audio/midi-render</code>: every one of the 128 General MIDI Level 1 programs is a from-scratch synth voice — FM synthesis (Chowning, 1973) for pianos, brass and bells, Karplus–Strong plucked strings for guitars and bass, and modal resonator banks (Fletcher &amp; Rossing) for bars, plates and struck strings. There is no soundfont, no sample bank, nothing to download beyond the JavaScript itself.</p>
    <h3>What it sounds like</h3>
    <p>A synth-GM module, not a recording. Pianos ring with a modal string body under an FM hammer transient, organs are nine-partial additive drawbars, brass patches rise in FM modulation index through the attack the way a real embouchure builds. It is a faithful, coded approximation of each GM voice, not a substitute for a sampled soundfont when exact GM timbre matching matters.</p>
    <h3>Tempo, transpose, sample rate, channels</h3>
    <p>Tempo from 50% to 200% stretches or compresses the whole note schedule before synthesis, so slowing down re-renders the piece at the new speed rather than just stretching silence. Transpose shifts every non-percussion note up to an octave either way. Sample rate (44.1 or 48 kHz) and channel count (stereo or mono) set the render's output directly.</p>
    <h3>What the report shows</h3>
    <p>Note and track counts come straight from <code>@audio/midi-parse</code>. Instruments used lists the General MIDI program names in effect on each channel — the same per-channel program resolution the renderer itself uses — plus percussion when channel 10 has notes.</p>`,
}
