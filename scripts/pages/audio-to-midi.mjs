// Audio to MIDI and sheet music — monophonic melody transcription. @audio/mir-transcribe tracks
// @audio/mir-multif0 (Klapuri 2006 iterative spectral-subtraction) frames into note events, @audio/beat
// finds the tempo, @audio/mir-key reads the key from chroma the way the Key and BPM finder does. The
// notes are written out as a Standard MIDI File (@audio/midi), MusicXML 4.0 and ABC (@audio/musicxml),
// and rendered back to audio with @audio/midi-render so the result can be heard before it is opened
// anywhere else.
import { drop, src } from '../page-helpers.mjs'

const MIR = src('@audio/mir', '1.1.3')
const BEAT = src('@audio/beat', '2.1.3')
const MIDI = src('@audio/midi', '1.0.2')
const MUSICXML = src('@audio/musicxml', '0.1.0')
const MIDI_RENDER = src('@audio/midi-render', '0.1.0')
const NOTE = src('@audio/note', '1.0.2')

export default {
  slug: 'audio-to-midi', order: 76,
  name: 'Audio to MIDI and sheet music', short: 'Transcribe a melody to MIDI, MusicXML and ABC — with a synthesized playback',
  title: 'Audio to MIDI converter: transcribe a melody to MIDI and sheet music, free, in your browser',
  description: 'Transcribe a melody to MIDI, MusicXML and ABC notation in your browser. Notes, tempo and key detected automatically. Best on monophonic audio. No upload.',
  lead: 'Drop a melody. Get MIDI, MusicXML and ABC files, and hear back what was recognized.',
  powered: ['@audio/mir', '@audio/beat', '@audio/midi', '@audio/musicxml', '@audio/midi-render'], repo: 'https://github.com/audiojs/mir',
  body: drop('Drop a melody or song here') + `
    <form class="opts" id="opts">
      <label>Quantize <select name="quantize">
        <option value="0">none</option>
        <option value="8">1/8</option>
        <option value="16" selected>1/16</option>
        <option value="32">1/32</option>
      </select></label>
      <label>Minimum note <select name="minNote">
        <option value="50">50 ms</option>
        <option value="80" selected>80 ms</option>
        <option value="120">120 ms</option>
      </select></label>
      <label>Tempo <input type="number" name="tempo" min="60" max="200" step="1" placeholder="auto" style="width:4.5em;font:inherit;padding:8px;border:1px solid var(--c-rule);border-radius:6px"> BPM</label>
      <label>Key <select name="key">
        <option value="auto" selected>auto-detect</option>
        <optgroup label="Major">
          <option value="C">C major</option>
          <option value="Db">D♭ major</option>
          <option value="D">D major</option>
          <option value="Eb">E♭ major</option>
          <option value="E">E major</option>
          <option value="F">F major</option>
          <option value="F#">F♯ major</option>
          <option value="G">G major</option>
          <option value="Ab">A♭ major</option>
          <option value="A">A major</option>
          <option value="Bb">B♭ major</option>
          <option value="B">B major</option>
        </optgroup>
        <optgroup label="Minor">
          <option value="Cm">C minor</option>
          <option value="C#m">C♯ minor</option>
          <option value="Dm">D minor</option>
          <option value="Ebm">E♭ minor</option>
          <option value="Em">E minor</option>
          <option value="Fm">F minor</option>
          <option value="F#m">F♯ minor</option>
          <option value="Gm">G minor</option>
          <option value="G#m">G♯ minor</option>
          <option value="Am">A minor</option>
          <option value="Bbm">B♭ minor</option>
          <option value="Bm">B minor</option>
        </optgroup>
      </select></label>
    </form>`,
  worker: `
const mirLib = import('${MIR}')
const beatLib = import('${BEAT}')
const midiLib = import('${MIDI}')
const musicxmlLib = import('${MUSICXML}')
const renderLib = import('${MIDI_RENDER}')
const noteLib = import('${NOTE}')

const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const keyLabel = k => { const minor = k.slice(-1) === 'm', root = minor ? k.slice(0, -1) : k; return root.split('#').join('♯').split('b').join('♭') + ' ' + (minor ? 'minor' : 'major') }

export default async function process(a, o, ui) {
  const fs = a.sampleRate
  const n = a.channelData[0].length, mono = new Float32Array(n)
  for (const ch of a.channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / a.channelData.length

  let bpm, tempoAuto = !o.tempo, tempoConfidence = null
  if (!tempoAuto) bpm = +o.tempo
  else {
ui.status('Tracking the beat…'); await new Promise(r => setTimeout(r, 20))
const { detect } = await beatLib
const b = detect(mono.subarray(0, Math.min(n, fs * 90)), { fs })
bpm = Math.round(b.bpm); tempoConfidence = b.confidence
  }

  ui.status('Listening for notes…'); await new Promise(r => setTimeout(r, 20))
  const { transcribe, chroma, key } = await mirLib
  const minDuration = (+o.minNote || 80) / 1000
  const notes = transcribe(mono, { fs, minDuration })
  if (!notes.length) throw Error('No notes detected. Try a shorter minimum note length, or a file with a single clear melody line.')

  let keyStr, keyAuto = !o.key || o.key === 'auto', keyConfidence = null
  if (keyAuto) {
const span = Math.min(n, fs * 120), frames = []
for (let i = 0; i + 4096 <= span; i += 4096) frames.push(chroma(mono.subarray(i, i + 4096), { fs }))
const k = key(frames)
keyStr = (k.mode === 'minor' ? MINOR : MAJOR)[k.tonic]
keyConfidence = k.confidence
  } else keyStr = o.key

  const quantize = +o.quantize || 0
  const { write } = await midiLib
  const smf = write(notes, { bpm })
  const { default: writeMusicxml, toAbc } = await musicxmlLib
  const xml = writeMusicxml(notes, { bpm, key: keyStr, quantize, title: 'Transcription' })
  const abc = toAbc(notes, { bpm, key: keyStr, quantize })

  ui.status('Rendering the transcription…'); await new Promise(r => setTimeout(r, 20))
  const render = (await renderLib).default
  const rendered = render(smf, { fs })

  const { name } = await noteLib
  const midis = notes.map(nn => nn.midi)
  const lo = Math.min(...midis), hi = Math.max(...midis)

  const lines = abc.split('\\n')
  let kIdx = 0
  for (let i = 0; i < lines.length; i++) if (lines[i].indexOf('K:') === 0) { kIdx = i; break }
  const body = lines.slice(kIdx + 1).join(' ')
  const closeAt = body.lastIndexOf('|]')
  const trimmedBody = (closeAt >= 0 ? body.slice(0, closeAt) : body).trim()
  const barTokens = trimmedBody.split('|').map(s => s.trim()).filter(Boolean)
  const bars = barTokens.slice(0, 8).join(' | ') + (barTokens.length > 8 ? ' …' : '')

  return {
report: [
  { k: 'Notes found', v: String(notes.length) },
  { k: 'Tempo used', v: bpm + '<small>BPM</small>', note: tempoAuto ? (tempoConfidence < 0.4 ? 'Detected automatically, low confidence — set it manually if the notes look mistimed.' : 'Detected automatically from the beat.') : 'Set manually.' },
  { k: 'Key', v: keyLabel(keyStr) + (keyAuto ? '<small>' + Math.round(keyConfidence * 100) + '% sure</small>' : ''), note: keyAuto ? 'Detected from chroma frames over the first two minutes; used to spell the notation.' : 'Set manually.' },
  { k: 'Pitch range', v: name(lo) + '–' + name(hi) },
  { k: 'First bars', cls: 'list wide', v: '<code>' + esc(bars) + '</code>', note: 'ABC notation. Polyphonic recognition is approximate: best on monophonic melodies, piano and clean guitar. For a full mix, use an ML transcription tool instead.' },
],
audio: { channelData: rendered.channelData, sampleRate: rendered.sampleRate },
files: [
  { name: 'transcription.mid', data: smf, mime: 'audio/midi', label: 'Save MIDI' },
  { name: 'transcription.musicxml', data: xml, mime: 'application/vnd.recordare.musicxml+xml', label: 'Save MusicXML' },
  { name: 'transcription.abc', data: abc, mime: 'text/plain', label: 'Save ABC' },
],
  }
}
`,
  tool: { formats: ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aac'], busy: 'Listening for notes…' },
  script: `tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['Does this work on full songs with drums and vocals?', 'Not well. The multi-F0 tracker in @audio/mir-transcribe follows the loudest continuous pitch at each moment; a dense mix confuses it. It is built for one instrument or voice at a time: a whistled or sung melody, a solo piano line, a clean guitar or bass. For a full band mix, use a dedicated ML transcription tool.'],
    ['What do I do with the MusicXML and ABC files?', 'Open the .musicxml file in MuseScore, Finale or Sibelius for engraved sheet music. The .abc file is plain text: paste it into any ABC renderer (abcjs, EasyABC) to see or print the same tune without installing anything. The .mid file imports into any DAW.'],
    ['Why is the tempo wrong?', 'Tempo comes from the @audio/beat onset and beat tracker, which can lock onto half or double the real tempo, or drift on rubato playing. Type a tempo in manually if the note grid looks off.'],
    ['Why is the key wrong?', 'Key comes from matching chroma (pitch-class) energy against major and minor key profiles over the first two minutes. Modal or ambiguous melodies can report the relative major or minor, which shares every note. Pick a key manually to force the spelling.'],
    ['Is my audio uploaded anywhere?', 'No. Transcription, tempo and key detection run in your browser with @audio/mir and @audio/beat; the MIDI, MusicXML and ABC files are written locally with @audio/midi and @audio/musicxml. Nothing leaves your device.'],
  ],
  seo: `
    <h2>Melody transcription that runs on your device</h2>
    <p>Cloud audio-to-MIDI services upload your file and hand back a download. This page runs the whole pipeline in your browser: <code>@audio/mir-transcribe</code> tracks pitch continuity across <code>@audio/mir-multif0</code> frames (Klapuri's 2006 iterative spectral-subtraction multi-F0 estimation) into note events, <code>@audio/beat</code> finds the tempo, and <code>@audio/mir-key</code> reads the key from chroma frames the way the Key and BPM finder does. The notes are written out with <code>@audio/midi</code> (Standard MIDI File), <code>@audio/musicxml</code> (MusicXML 4.0, quantized and spelled to the key signature, plus ABC notation) and rendered back to audio with <code>@audio/midi-render</code>'s synthesized General MIDI instrument set, so the transcription can be checked by ear before it is opened anywhere else.</p>
    <h3>What it is good at</h3>
    <p>One instrument or voice at a time: a sung or whistled melody, a solo piano or guitar line, a bassline. The note tracker follows the strongest pitch and closes a note on a gap, so a clean monophonic recording transcribes cleanly.</p>
    <h3>What it will not do</h3>
    <p>It does not reliably separate a chord into its notes, does not follow drums, and will not cleanly split two independent melodic lines playing at once. Multi-F0 estimation reports which pitches are present, not which instrument they belong to; treat the output as a starting point, not a finished score.</p>
    <h3>Reading the report</h3>
    <p>Notes found, the tempo and key used (auto-detected or the value set above), the pitch range, and the first bars of the ABC transcription to sanity-check before downloading. A confidence percentage on an auto-detected key, or a low-confidence note on the tempo, is a signal to set that value manually instead.</p>`,
}
