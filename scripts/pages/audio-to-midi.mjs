// Audio to MIDI: polyphonic transcription with Spotify's Basic Pitch (Bittner et al., ICASSP 2022; npm
// @spotify/basic-pitch, Apache-2.0) on TensorFlow.js, or the monophonic melody tracker of @audio/mir-transcribe
// (Klapuri 2006 multi-F0 frames). @audio/beat finds the tempo, @audio/mir-key reads the key from chroma the way the
// Key and BPM finder does. Notes are written as a Standard MIDI File (@audio/midi), MusicXML 4.0 and ABC
// (@audio/musicxml), drawn as a piano roll, and rendered back to audio with @audio/midi-render.
import { drop, src } from '../page-helpers.mjs'

const MIR = src('@audio/mir', '1.1.3')
const BEAT = src('@audio/beat', '2.1.3')
const MIDI = src('@audio/midi', '1.0.2')
const MUSICXML = src('@audio/musicxml', '0.1.0')
const MIDI_RENDER = src('@audio/midi-render', '0.1.0')
const NOTE = src('@audio/note', '1.0.2')
const RESAMPLE = src('@audio/resample-polyphase', '1.1.0')
// Basic Pitch pins TensorFlow.js ^3.2; 3.x reads `window` inside a worker (tfjs-core setTimeoutCustom), 4.22 does not
const TFJS = 'https://esm.sh/@tensorflow/tfjs@4.22.0'
const BASIC_PITCH = 'https://esm.sh/@spotify/basic-pitch@1.0.1?deps=@tensorflow/tfjs@4.22.0'
const MODEL = 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json'

export default {
  slug: 'audio-to-midi', order: 76,
  name: 'Audio to MIDI converter', short: 'Songs, chords, piano, guitar or voice to MIDI, MusicXML and ABC, with Spotify’s Basic Pitch',
  title: 'Audio to MIDI converter: song, piano, guitar or voice to MIDI, free in your browser',
  description: 'Convert a song, piano, guitar or voice to MIDI in your browser with Spotify’s Basic Pitch: chords, not just melodies. Tempo, key and sheet music too. No upload.',
  lead: 'Drop a song, a piano or guitar recording, or a sung melody. Get MIDI, MusicXML and ABC files, see the notes, and hear what was recognized.',
  powered: ['@spotify/basic-pitch', '@audio/mir', '@audio/beat', '@audio/midi', '@audio/musicxml', '@audio/midi-render'], repo: 'https://github.com/audiojs/mir',
  body: drop('Drop a song or a recording here') + `
    <style>.seo ol.refs { margin-top: 12px; padding-left: 1.4em; font-size: var(--fs-xs); color: var(--c-mute); } .seo sup { line-height: 0; } .seo sup a { text-decoration: none; color: var(--c-accent); font-weight: 600; }</style>
    <form class="opts" id="opts">
      <label>Mode <select name="mode">
        <option value="poly" selected>Polyphonic (Basic Pitch)</option>
        <option value="mono">Melody (monophonic)</option>
      </select></label>
      <label>Quantize <select name="quantize">
        <option value="8">1/8</option>
        <option value="16" selected>1/16</option>
        <option value="32">1/32</option>
      </select></label>
      <label>Minimum note <select name="minNote">
        <option value="50">50 ms</option>
        <option value="80">80 ms</option>
        <option value="128" selected>128 ms</option>
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
const tick = () => new Promise(r => setTimeout(r, 20))

// Basic Pitch: loaded on the first polyphonic run, the model kept for the next file
const SR = 22050, HOP = 256   // the model's input rate and frame hop (basic_pitch/constants.py)
let bpLib
const basicPitch = () => bpLib ??= (async () => {
  const [bp, tf, resample] = await Promise.all([import('${BASIC_PITCH}'), import('${TFJS}'), import('${RESAMPLE}')])
  tf.enableProdMode()
  await tf.ready()
  const model = await tf.loadGraphModel('${MODEL}')
  return { bp, tf, polyphase: resample.default, model: new bp.BasicPitch(Promise.resolve(model)) }
})().catch(e => { bpLib = null; throw e })

// Basic Pitch's note decoding (outputToNotesPoly: onset 0.5 and frame 0.3 thresholds from basic_pitch/constants.py,
// energy tolerance 11 frames as in the paper) with its "melodia" pass reordered. The original rescans the whole
// activation matrix for its maximum once per added note: minutes on a full song. Visiting cells largest first gives
// the same notes in the same order: a cell is only ever zeroed, so the next one still above threshold is the running
// maximum. Ties break as the original's argmax does: earliest frame, then highest pitch, (0, 0) first in frame 0.
export function decode(bp, frames, onsets, minNoteLen) {
  const T = 0.3, TOL = 11, nFrames = frames.length
  const notes = bp.outputToNotesPoly(frames, onsets, 0.5, T, minNoteLen, true, null, null, false, TOL)
  const energy = frames.map(r => r.slice())
  const clear = (i, f) => { energy[i][f] = 0; if (f < 87) energy[i][f + 1] = 0; if (f > 0) energy[i][f - 1] = 0 }
  for (const n of notes) for (let i = n.startFrame; i < n.startFrame + n.durationFrames; i++) clear(i, n.pitchMidi - 21)
  const cells = []
  for (let i = 0; i < nFrames; i++) for (let f = 0; f < 88; f++) if (energy[i][f] > T) cells.push(i * 88 + f)
  const v = c => energy[c / 88 | 0][c % 88]
  cells.sort((a, b) => v(b) - v(a) || (a / 88 | 0) - (b / 88 | 0) || (a === 0 ? -1 : b === 0 ? 1 : b - a))
  for (const c of cells) {
    const iMid = c / 88 | 0, f = c % 88
    if (energy[iMid][f] <= T) continue
    energy[iMid][f] = 0
    let i = iMid + 1, k = 0
    while (i < nFrames - 1 && k < TOL) { k = energy[i][f] < T ? k + 1 : 0; clear(i, f); i++ }
    const iEnd = i - 1 - k
    i = iMid - 1; k = 0
    while (i > 0 && k < TOL) { k = energy[i][f] < T ? k + 1 : 0; clear(i, f); i-- }
    const iStart = i + 1 + k
    if (iEnd - iStart <= minNoteLen) continue
    let sum = 0
    for (let j = iStart; j < iEnd; j++) sum += frames[j][f]
    notes.push({ startFrame: iStart, durationFrames: iEnd - iStart, pitchMidi: f + 21, amplitude: sum / (iEnd - iStart) })
  }
  return notes
}

// the model's output for the last file: a new tempo, key, grid or minimum note reuses it. One inference at a time:
// an option changed mid-run starts a second run in this worker, and TensorFlow.js scopes are one stack, not one per run.
let last = null, queue = Promise.resolve()
const fingerprint = (x, fs) => { let s = 0; for (let i = 0; i < x.length; i += 997) s += x[i] * (i % 7 + 1); return fs + ':' + x.length + ':' + s }

async function polyNotes(mono, fs, minMs, ui) {
  ui.status('Loading Basic Pitch…')
  const { bp, tf, polyphase, model } = await basicPitch()
  const id = fingerprint(mono, fs)
  const run = queue.then(async () => {
    if (last?.id === id) return last
    const backend = tf.getBackend() === 'webgl' ? 'WebGL' : tf.getBackend().toUpperCase()
    ui.status('Listening for notes with Basic Pitch on ' + backend + '…'); await tick()
    const t0 = performance.now(), x = fs === SR ? mono : polyphase(mono, { from: fs, to: SR })
    const frames = [], onsets = []
    tf.engine().startScope()   // Basic Pitch leaves its per-window tensors to the caller
    try { await model.evaluateModel(x, (f, o) => { frames.push(...f); onsets.push(...o) }, p => ui.progress(p)) }
    finally { tf.engine().endScope() }
    return last = { id, frames, onsets, backend, secs: (performance.now() - t0) / 1000 }
  })
  queue = run.catch(() => {})
  const out = await run
  ui.status('Reading notes…'); await tick()
  const notes = bp.noteFramesToTime(decode(bp, out.frames, out.onsets, Math.round(minMs / 1000 * SR / HOP)))
    .map(n => ({ time: n.startTimeSeconds, duration: n.durationSeconds, midi: n.pitchMidi, velocity: n.amplitude }))
    .sort((a, b) => a.time - b.time || a.midi - b.midi)
  return { notes, backend: out.backend, secs: out.secs }
}

// most notes sounding at once
function polyphony(notes) {
  const ev = notes.flatMap(n => [[n.time, 1], [n.time + n.duration, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let on = 0, max = 0
  for (const [, d] of ev) max = Math.max(max, on += d)
  return max
}

// piano roll: a row per semitone, black-key rows shaded, C rows ruled and named, stronger notes brighter
function roll(notes, dur) {
  const W = 1344, midis = notes.map(n => n.midi)
  const lo = Math.max(21, Math.min(...midis) - 2), hi = Math.min(108, Math.max(...midis) + 2), rows = hi - lo + 1
  const rowH = Math.max(4, Math.min(20, Math.floor(560 / rows))), H = rows * rowH
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d')
  const x = t => t / dur * W, y = m => (hi - m) * rowH
  ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H)
  for (let m = lo; m <= hi; m++) {
    if ([1, 3, 6, 8, 10].includes(m % 12)) { ctx.fillStyle = 'rgba(237,235,228,.05)'; ctx.fillRect(0, y(m), W, rowH) }
    if (m % 12 === 0) { ctx.fillStyle = 'rgba(237,235,228,.22)'; ctx.fillRect(0, y(m) + rowH - 1, W, 1) }
  }
  for (const n of notes) {
    ctx.fillStyle = 'rgba(0,164,184,' + (0.4 + 0.6 * Math.min(1, n.velocity)).toFixed(2) + ')'
    ctx.fillRect(x(n.time), y(n.midi) + 1, Math.max(2, x(n.duration)), Math.max(2, rowH - 2))
  }
  ctx.fillStyle = 'rgba(237,235,228,.8)'; ctx.font = '600 22px Manrope, sans-serif'
  for (let m = lo; m <= hi; m++) if (m % 12 === 0) ctx.fillText('C' + (m / 12 - 1), 10, y(m) + rowH - 6)
  return { width: W, height: H, data: ctx.getImageData(0, 0, W, H).data }
}

export default async function process(a, o, ui) {
  const fs = a.sampleRate, poly = o.mode !== 'mono'
  const n = a.channelData[0].length, mono = new Float32Array(n)
  for (const ch of a.channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / a.channelData.length

  let bpm, tempoAuto = !o.tempo, tempoConfidence = null
  if (!tempoAuto) bpm = +o.tempo
  else {
ui.status('Tracking the beat…'); await tick()
const { detect } = await beatLib
const b = detect(mono.subarray(0, Math.min(n, fs * 90)), { fs })
bpm = Math.round(b.bpm); tempoConfidence = b.confidence
  }

  const { transcribe, chroma, key } = await mirLib
  const minMs = +o.minNote || (poly ? 128 : 80)
  let notes, engine = null
  if (poly) ({ notes, ...engine } = await polyNotes(mono, fs, minMs, ui))
  else { ui.status('Listening for notes…'); await tick(); notes = transcribe(mono, { fs, minDuration: minMs / 1000 }) }
  if (!notes.length) throw Error('No notes detected. Try a shorter minimum note length' + (poly ? '.' : ', or Polyphonic mode.'))

  let keyStr, keyAuto = !o.key || o.key === 'auto', keyConfidence = null
  if (keyAuto) {
const span = Math.min(n, fs * 120), frames = []
for (let i = 0; i + 4096 <= span; i += 4096) frames.push(chroma(mono.subarray(i, i + 4096), { fs }))
const k = key(frames)
keyStr = (k.mode === 'minor' ? MINOR : MAJOR)[k.tonic]
keyConfidence = k.confidence
  } else keyStr = o.key

  // the scores need a grid (the MIDI file keeps every note as heard, unquantized)
  const quantize = +o.quantize || 16
  const { write } = await midiLib
  const smf = write(notes, { bpm })
  const { default: writeMusicxml, toAbc } = await musicxmlLib
  // every note, those that overlap as voices on one staff
  // a transcription's onsets on the grid alone: triplets would read its timing errors as rhythm
  const scoreOpts = { bpm, key: keyStr, quantize, title: 'Transcription', ...(poly && { triplets: false }) }
  const xml = writeMusicxml(notes, scoreOpts)
  const abc = toAbc(notes, scoreOpts)

  ui.status('Rendering the transcription…'); await tick()
  const render = (await renderLib).default
  const rendered = render(smf, { fs })

  const { name } = await noteLib
  const midis = notes.map(nn => nn.midi)
  const lo = Math.min(...midis), hi = Math.max(...midis)

  const lines = abc.split('\\n')
  let kIdx = 0
  for (let i = 0; i < lines.length; i++) if (lines[i].indexOf('K:') === 0) { kIdx = i; break }
  // each voice's first bars, a line each, the first four voices (each voice's bars come after its V: line)
  const voices = []
  for (const l of lines.slice(kIdx + 1)) if (/^V:/.test(l)) voices.push(''); else if (l.trim() && !/^%%/.test(l)) voices.length ? voices[voices.length - 1] += ' ' + l : voices.push(l)
  const first = (body, k) => {
    const closeAt = body.lastIndexOf('|]'), tokens = (closeAt >= 0 ? body.slice(0, closeAt) : body).split('|').map(s => s.trim()).filter(Boolean)
    return tokens.slice(0, k).join(' | ') + (tokens.length > k ? ' …' : '')
  }
  const bars = voices.length > 1 ? voices.slice(0, 4).map((v, i) => 'V' + (i + 1) + ': ' + first(v, 4)).concat(voices.length > 4 ? ['+ ' + (voices.length - 4) + ' more voices'] : []) : [first(voices[0] ?? '', 8)]

  return {
report: [
  { k: 'Notes found', v: String(notes.length) },
  ...(poly ? [{ k: 'Most at once', v: polyphony(notes) + '<small>notes</small>' }] : []),
  { k: 'Tempo used', v: bpm + '<small>BPM</small>', note: tempoAuto && (tempoConfidence < 0.4 ? 'Detected automatically, low confidence — set it manually if the notes look mistimed.' : 'Detected automatically from the beat.') },
  { k: 'Key', v: keyLabel(keyStr) + (keyAuto ? '<small>' + Math.round(keyConfidence * 100) + '% sure</small>' : ''), note: keyAuto && 'Detected from chroma frames over the first two minutes; used to spell the notation.' },
  { k: 'Pitch range', v: name(lo) + '–' + name(hi) },
  ...(poly ? [{ k: 'Basic Pitch took', v: engine.secs.toFixed(1) + '<small>s on ' + engine.backend + '</small>', note: engine.backend !== 'WebGL' && 'WebGL is not available here, so the model ran on the CPU, which is slower.' }] : []),
  { k: 'First bars', cls: 'list wide', v: '<code>' + bars.map(esc).join('<br>') + '</code>', note: poly ? 'ABC notation, a line for each voice. The scores keep every note: notes that overlap are written as voices on one staff.' : 'ABC notation. Melody mode keeps one note at a time; for chords, switch to Polyphonic.' },
],
viz: roll(notes, n / fs),
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
  script: `
    const form = $('opts'), minNote = form.querySelector('[name=minNote]')
    // each mode's own default minimum note: Basic Pitch's 127.7 ms, the melody tracker's 80 ms
    form.querySelector('[name=mode]').addEventListener('change', e => { minNote.value = e.target.value === 'mono' ? '80' : '128' })
    tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['Can it convert a whole song to MIDI?', 'Yes, in Polyphonic mode. Basic Pitch writes every pitched note it hears, voice included, into one MIDI track. It does not split the instruments apart and has no drum output, and its authors note it works best on one instrument at a time: a solo piano or guitar comes out cleaner than a dense mix. For only the tune of a song, isolate the vocal with the vocal remover on this site, then use Melody mode.'],
    ['Polyphonic or Melody mode?', 'Polyphonic, the default, runs Basic Pitch, a small neural network that hears several notes at once: chords, piano, guitar, a band. Melody mode follows one pitch at a time with a multiple-F0 estimator (Klapuri 2006) and suits a whistled or sung tune, a solo line or a bassline when you want exactly one note at each moment.'],
    ['Can I convert my voice to MIDI?', 'Yes. Record yourself singing, humming or whistling and drop the file here. Basic Pitch was trained with vocal recordings among its data; Melody mode keeps strictly one note at a time. Vibrato and slides land on the nearest semitone: the MIDI file has no pitch bends.'],
    ['What do I do with the MIDI, MusicXML and ABC files?', 'Import the .mid into any DAW or notation program: it holds every note with its own start, length and velocity, at the detected tempo. Open the .musicxml in MuseScore, Finale or Sibelius for engraved sheet music. The .abc file is plain text: paste it into any ABC renderer (abcjs, EasyABC). In Polyphonic mode both scores keep every note, notes that overlap written as voices on one staff; to split a piano part into two hands, import the .mid into MuseScore, whose MIDI import does that.'],
    ['Why is the tempo wrong?', 'Tempo comes from the @audio/beat onset and beat tracker, which can lock onto half or double the real tempo, or drift on rubato playing. Type a tempo in manually if the note grid looks off.'],
    ['Why is the key wrong?', 'Key comes from matching chroma (pitch-class) energy against major and minor key profiles over the first two minutes. Modal or ambiguous music can report the relative major or minor, which shares every note. Pick a key manually to force the spelling.'],
    ['Is my audio uploaded anywhere?', 'No. The file is decoded and transcribed in your browser. Basic Pitch runs with TensorFlow.js on your graphics chip through WebGL, or on the CPU without it; its model (0.9 MB) and TensorFlow.js (about 1.3 MB) download once from public CDNs, jsDelivr and esm.sh. Tempo, key, MIDI, MusicXML and ABC are computed and written locally.'],
  ],
  seo: `
    <h2>Polyphonic audio to MIDI transcription, on your device</h2>
    <p>Most audio to MIDI converters upload your file to a server. This page runs Spotify’s Basic Pitch in the browser: a neural network of 16,782 parameters from Spotify’s Audio Intelligence Lab, trained on recordings of piano, guitar, voice, synthesizers and other instruments.<sup><a href="#r1">1</a></sup> Every 11.6 ms it reads a constant-Q spectrum with three bins per semitone, stacks each bin with its harmonics, and marks for each of the 88 piano keys where a note starts and where a note sounds. A peak in the onset map starts a note and the note map holds it until it fades; strong stretches of the note map with no onset become notes too.<sup><a href="#r1">1</a>,<a href="#r2">2</a></sup> The model weighs 0.9 MB and runs on your graphics chip with TensorFlow.js.</p>
    <p>Tempo comes from <code>@audio/beat</code> and the key from chroma frames with <code>@audio/mir-key</code>, as in the <a href="/util/key-bpm/">Key and BPM finder</a>. <code>@audio/midi</code> writes the Standard MIDI File, <code>@audio/musicxml</code> the MusicXML 4.0<sup><a href="#r5">5</a></sup> and ABC 2.1<sup><a href="#r6">6</a></sup> scores, and <code>@audio/midi-render</code> plays the result back with a General MIDI synth so you can check it by ear before opening it anywhere else.</p>
    <h3>Song to MIDI: what comes out</h3>
    <p>One MIDI track with every pitched note Basic Pitch heard, voice included, from A0 to C8. It does not tell instruments apart and has no drum output. Its authors note it works best on one instrument at a time:<sup><a href="#r2">2</a></sup> a solo piano, guitar or voice comes out cleaner than a full mix, which gives a draft to edit. To transcribe only the tune of a song, isolate the vocal with the <a href="/util/vocal-remover/">vocal remover</a> first.</p>
    <p>Even a clean recording yields some extra notes. On this page’s test chords, C major then F major, one second each, it finds all six notes within 25 ms of their onsets, plus seven more: four overtones written as quieter notes an octave or more above, and A4, C5 and the F5 overtone struck again at 1.65 s. Spotify’s Python release writes the same thirteen notes from the same file.</p>
    <h3>Melody mode</h3>
    <p>The second mode is a classical tracker: <code>@audio/mir-transcribe</code> follows pitch continuity across <code>@audio/mir-multif0</code> frames (Klapuri’s 2006 multiple-F0 estimation<sup><a href="#r3">3</a></sup>) and keeps one note at a time. Use it for a whistled or sung tune, a solo line or a bassline when chords are not wanted.</p>
    <h3>MIDI and sheet music</h3>
    <p>The MIDI file keeps every note as heard: its own start and length, unquantized, at the detected tempo, with Basic Pitch’s note activation as velocity, as its own MIDI export does. Pitch bends are not written. The MusicXML and ABC scores are quantized to the grid you pick and spelled in the key. For polyphony they keep every note: notes that start and end together form a chord, and a note held under a moving line goes to a voice of its own on the same staff, each voice filling every bar.<sup><a href="#r5">5</a></sup> Notation programs show up to four voices on a staff; a dense transcription can have more. To split a piano part into two hands, import the MIDI file into MuseScore, whose MIDI import does that.<sup><a href="#r4">4</a></sup></p>
    <h3>Reading the report</h3>
    <p>Notes found, the most notes sounding at once, the tempo and key used (auto-detected or the value set above), the pitch range, how long Basic Pitch took and on which processor, and the first bars of the ABC transcription. The piano roll draws one row per semitone, C rows named, stronger notes brighter. A confidence percentage on an auto-detected key, or a low-confidence note on the tempo, is a signal to set that value manually.</p>
    <h3>References</h3>
    <ol class="refs">
      <li id="r1">R. M. Bittner, J. J. Bosch, D. Rubinstein, G. Meseguer-Brocal, S. Ewert, “<a href="https://arxiv.org/abs/2203.09893" target="_blank" rel="noopener">A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation</a>,” <i>Proc. IEEE ICASSP</i> 2022: 16,782 parameters; CQT with 3 bins per semitone, ≈11 ms hop, 7 harmonics and 1 sub-harmonic stacked; onset and note outputs per semitone; training data in Table 1 (GuitarSet, MAESTRO, Slakh, iKala, MedleyDB).</li>
      <li id="r2">Spotify, <a href="https://github.com/spotify/basic-pitch-ts" target="_blank" rel="noopener">basic-pitch-ts</a> (<a href="https://www.npmjs.com/package/@spotify/basic-pitch" target="_blank" rel="noopener">@spotify/basic-pitch</a> 1.0.1, Apache License 2.0): “Basic pitch works best on one instrument at a time.” Defaults used here, from <a href="https://github.com/spotify/basic-pitch/blob/main/basic_pitch/constants.py" target="_blank" rel="noopener">basic_pitch/constants.py</a>: onset threshold 0.5, frame threshold 0.3, minimum note 127.7 ms, 22,050 Hz input, 256-sample hop (11.6 ms), 88 keys from 27.5 Hz.</li>
      <li id="r3">A. Klapuri, “Multiple fundamental frequency estimation by summing harmonic amplitudes,” <i>Proc. ISMIR</i> 2006.</li>
      <li id="r4">MuseScore Handbook 3, “<a href="https://musescore.org/en/handbook/3/midi-import" target="_blank" rel="noopener">MIDI import</a>”: Max. voices, Split staff.</li>
      <li id="r5">W3C Music Notation Community Group, <a href="https://www.w3.org/2021/06/musicxml40/" target="_blank" rel="noopener">MusicXML 4.0</a>.</li>
      <li id="r6"><a href="https://abcnotation.com/wiki/abc:standard:v2.1" target="_blank" rel="noopener">The abc music standard 2.1</a>.</li>
    </ol>`,
}
