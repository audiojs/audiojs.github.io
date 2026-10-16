// E2E test for /util/audio-to-midi/ — mirrors scripts/util-e2e.mjs (server + STUB pattern), see
// scripts/pages/midi-to-mp3.test.mjs and dewow.test.mjs for the sibling convention this copies.
// Signals are synthesized in the browser (no fixture files):
// 1. Polyphonic mode (the default, Spotify's Basic Pitch): a C major triad for 1 s, then an F major triad for 1 s.
//    The saved .mid (parsed back with @audio/midi-parse) must hold those six notes, each onset within ±50 ms (the
//    MIREX note-onset tolerance, used in Basic Pitch's own evaluation: Bittner et al., ICASSP 2022, §4), and match
//    Spotify's Python basic-pitch on the same signal note for note, extra notes included. Also: the score is one
//    chord per onset and fills every measure exactly, the piano roll draws, and the page's faster note decoding
//    returns exactly what Basic Pitch's own outputToNotesPoly returns on the same activations.
// 2. Melody mode: an 8-note ascending scale (C4..C5, quarter notes at 120 BPM): report numbers, the .mid, the
//    .musicxml and the rendered "hear it" MP3; then the manual-tempo path.
// Usage: node scripts/pages/audio-to-midi.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(root, rel)
  if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end() }
  let body
  try { body = await readFile(path) } catch { res.writeHead(404); return res.end('404') }
  res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(body)
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }

// 12-TET with A4 = 440 Hz: f = 440 · 2^((m − 69) / 12). Reference values: B. H. Suits, "Frequencies for equal-tempered
// scale, A4 = 440 Hz", Michigan Technological University, https://pages.mtu.edu/~suits/notefreqs.html
const TABLE = { 60: 261.63, 64: 329.63, 67: 392.00, 65: 349.23, 69: 440.00, 72: 523.25 }
const hz = m => 440 * 2 ** ((m - 69) / 12)
ok(Object.entries(TABLE).every(([m, f]) => Math.abs(hz(+m) - f) < 0.005), `12-TET formula matches the reference table: ${Object.keys(TABLE).map(m => hz(+m).toFixed(2)).join(', ')} Hz`)

// Spotify's Python basic-pitch 0.4.0, predict() with its defaults (CoreML model on macOS), on this same triad signal
// written to a 16-bit WAV, as [midi, onset s]: the six triad notes, four overtones heard as notes (C5 over C4, G6
// over G4, A5 over A4, F5 over F4), and three notes restarting at 1.649 s, where its 2 s analysis windows join.
const REF = [[60, 0.012], [64, 0.012], [67, 0.012], [72, 0.012], [91, 0.012], [65, 0.975], [81, 0.987], [69, 0.998], [72, 0.998], [77, 0.998], [69, 1.649], [72, 1.649], [77, 1.649]]
const FRAME = 256 / 22050   // one Basic Pitch frame, 11.6 ms

const STUB = `
  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 120000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise(r => setTimeout(r, 200)); const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)'); if (err) return { err: err.textContent }; if (p && p.hidden) break }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out'), c = document.querySelector('.panel .viz canvas')
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a').download : null, viz: c ? [c.width, c.height] : null } }
  window.__mode = mode => { const s = document.querySelector('#opts [name=mode]'); s.value = mode; s.dispatchEvent(new Event('change', { bubbles: true })) }

  // one note: 4 decaying harmonics (fundamental + 3 overtones), short attack ramp
  window.__note = (freq, dur, fs, gain = 0.2) => {
    const N = Math.round(dur * fs), buf = new Float32Array(N), attack = Math.max(1, Math.round(0.005 * fs))
    for (let i = 0; i < N; i++) {
      const t = i / fs, env = Math.exp(-t / 0.3) * Math.min(1, i / attack)
      let s = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.25 * Math.sin(2 * Math.PI * freq * 3 * t) + 0.125 * Math.sin(2 * Math.PI * freq * 4 * t)
      buf[i] = gain * env * s
    }
    return buf
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12)
  // C4 D4 E4 F4 G4 A4 B4 C5 (midi 60,62,64,65,67,69,71,72), quarter notes at 120 BPM (0.5 s each)
  window.__melody = () => {
    const fs = 44100, midis = [60, 62, 64, 65, 67, 69, 71, 72]
    const parts = midis.map(m => window.__note(hz(m), 0.5, fs))
    const N = parts.reduce((s, p) => s + p.length, 0), data = new Float32Array(N)
    let off = 0; for (const p of parts) { data.set(p, off); off += p.length }
    return { data, fs }
  }
  // C major triad (C4 E4 G4) for 1 s, then F major (F4 A4 C5) for 1 s; 0.1 per note keeps the peak under 0.6
  window.__triads = () => {
    const fs = 44100, data = new Float32Array(2 * fs)
    ;[[60, 64, 67], [65, 69, 72]].forEach((chord, k) => { for (const m of chord) { const x = window.__note(hz(m), 1, fs, 0.1); for (let i = 0; i < fs; i++) data[k * fs + i] += x[i] } })
    return { data, fs }
  }
  window.__wavFromChannels = (channels, fs, name = 'test.wav') => {
    const N = channels[0].length, nc = channels.length
    const buf = new ArrayBuffer(44 + N * nc * 2), dv = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); dv.setUint32(4, 36 + N * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true)
    dv.setUint32(24, fs, true); dv.setUint32(28, fs * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * nc * 2, true)
    for (let i = 0; i < N; i++) for (let c = 0; c < nc; c++) dv.setInt16(44 + (i * nc + c) * 2, Math.max(-32768, Math.min(32767, channels[c][i] * 32767)), true)
    return new File([buf], name, { type: 'audio/wav' })
  }
  window.__files = () => [...document.querySelectorAll('.panel .files a')].map(a => ({ name: a.download, href: a.href }))
  window.__parseMid = async href => {
    const { default: parse } = await import('https://esm.sh/@audio/midi-parse@1.0.2')
    return parse(new Uint8Array(await (await fetch(href)).arrayBuffer())).notes.map(n => ({ time: n.time, midi: n.midi }))
  }
`

console.log('\n▶ chromium')
const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
await context.addInitScript(STUB)
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

await page.goto(`${base}/util/audio-to-midi/`)

// ── 1. polyphonic (default): C major then F major triad ──
ok(await page.evaluate(() => document.querySelector('#opts [name=mode]').value) === 'poly', 'Polyphonic (Basic Pitch) is the default mode')
await page.evaluate(() => { document.querySelector('#opts [name=tempo]').value = '120' })   // a fixed grid for the score checks
await page.evaluate(() => { const t = window.__triads(); window.__drop(window.__wavFromChannels([t.data], t.fs, 'triads.wav')) })
const p = await page.evaluate(() => window.__done(180000))
ok(!p.err, 'polyphonic: transcribed' + (p.err ? ': ' + p.err : ''))
ok(/^\d+(\.\d+)?s on (WebGL|CPU)/.test(p.report?.['Basic Pitch took'] || ''), `Basic Pitch took: ${p.report?.['Basic Pitch took']}`)
ok(+p.report?.['Notes found'] === REF.length, `Notes found: ${p.report?.['Notes found']} (expect ${REF.length}, as Python basic-pitch)`)
ok(parseInt(p.report?.['Most at once']) >= 3, `Most at once: ${p.report?.['Most at once']} (expect at least 3)`)
ok(p.viz && p.viz[0] > 0 && p.viz[1] > 0, `piano roll drawn: ${p.viz?.join('×')}`)

const pFiles = await page.evaluate(() => window.__files())
const pNotes = await page.evaluate(href => window.__parseMid(href), pFiles.find(f => /\.mid$/.test(f.name))?.href)
const fmt = ns => ns.map(n => `${n.midi}@${n.time.toFixed(3)}`).join(' ')
for (const [midi, t] of [[60, 0], [64, 0], [67, 0], [65, 1], [69, 1], [72, 1]]) {
  const hit = pNotes.filter(n => n.midi === midi && Math.abs(n.time - t) <= 0.05)
  ok(hit.length === 1, `.mid has note ${midi} at ${t} s ± 50 ms: ${hit.map(n => n.time.toFixed(3)).join(', ') || 'missing'}`)
}
const unmatched = pNotes.slice()
const missing = REF.filter(([midi, t]) => { const i = unmatched.findIndex(n => n.midi === midi && Math.abs(n.time - t) <= FRAME * 1.3); if (i < 0) return true; unmatched.splice(i, 1) })
ok(!missing.length && !unmatched.length, `.mid matches Python basic-pitch note for note, onsets within one frame: ${fmt(pNotes)}` + (missing.length ? `; missing ${missing.map(([m, t]) => m + '@' + t).join(' ')}` : '') + (unmatched.length ? `; extra ${fmt(unmatched)}` : ''))

// the score: every note of the MIDI file written; those that start and end together a chord (C E G in octave 4 first,
// F4 A4 C5 together later); notes that overlap otherwise, voices of their own, each voice filling every measure exactly
// (MusicXML 4.0: <backup> returns to the measure's start for the next voice)
const pXml = await page.evaluate(async href => (await fetch(href)).text(), pFiles.find(f => /\.musicxml$/.test(f.name))?.href)
const divisions = +pXml.match(/<divisions>(\d+)<\/divisions>/)[1], measureTicks = divisions * 4
const scoreChords = [], fills = []
let written = 0
for (const [, m] of pXml.matchAll(/<measure number="\d+"[^>]*>([\s\S]*?)<\/measure>/g)) {
  const voices = new Map()
  for (const [, tag, body] of m.matchAll(/<(note|backup)>([\s\S]*?)<\/\1>/g)) {
    // a note tied on from before is the same note, not another
    const starts = !body.includes('<tie type="stop"/>')
    if (tag === 'backup' || body.includes('<chord/>') && !body.includes('<rest')) { if (tag === 'note' && starts) { written++; scoreChords[scoreChords.length - 1].push(pitchOf(body)) } continue }
    const v = body.match(/<voice>(\d+)<\/voice>/)?.[1] ?? '1'
    voices.set(v, (voices.get(v) ?? 0) + +body.match(/<duration>(\d+)<\/duration>/)[1])
    if (!body.includes('<rest') && starts) { written++; scoreChords.push([pitchOf(body)]) }
  }
  fills.push(...voices.values())
}
function pitchOf(n) { return n.match(/<step>(\w)<\/step>/)[1] + (n.match(/<alter>(-?\d)<\/alter>/)?.[1] || '') + n.match(/<octave>(\d)<\/octave>/)[1] }
const midiOf = p => { const [, step, alter, octave] = p.match(/^(\w)(-?\d)?(\d)$/) ?? p.match(/^(\w)()(\d)$/); return 12 * (+octave + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step] + +(alter || 0) }
ok(scoreChords.some(c => ['C4', 'E4', 'G4'].every(x => c.includes(x))), `musicxml: C E G one chord: ${scoreChords.map(c => c.join(' ')).join(' | ')}`)
ok(written === pNotes.length, `musicxml: every note of the MIDI file written once: ${written} of ${pNotes.length}`)
ok(JSON.stringify(scoreChords.flat().map(midiOf).sort((a, b) => a - b)) === JSON.stringify(pNotes.map(n => n.midi).sort((a, b) => a - b)), `musicxml: the MIDI file's pitches, each once: ${scoreChords.flat().join(' ')}`)
ok(fills.length > 0 && fills.every(t => t === measureTicks), `musicxml: every voice of every measure holds ${measureTicks} ticks: ${fills.join(', ')}`)
ok(/\[[^\]]{3,}\]/.test(p.report?.['First bars'] || ''), `First bars has ABC chords: ${p.report?.['First bars']}`)

// the page's decoding (melodia pass reordered) against Basic Pitch's own outputToNotesPoly, on activations with
// many exact ties (values in steps of 0.1) and sparse onsets: same notes in the same order
const diff = await page.evaluate(async () => {
  const bp = await import('https://esm.sh/@spotify/basic-pitch@1.0.1?deps=@tensorflow/tfjs@4.22.0')
  const { decode } = await import(document.body.innerHTML.match(/'(\/util\/audio-to-midi\/process\.js[^']*)'/)[1])
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const frames = [], onsets = []
  for (let i = 0; i < 700; i++) { frames.push(Array.from({ length: 88 }, () => Math.round(rnd() * rnd() * 10) / 10)); onsets.push(Array.from({ length: 88 }, () => rnd() < 0.01 ? 0.5 + rnd() / 2 : rnd() * 0.05)) }
  const key = ns => JSON.stringify(ns.map(n => [n.startFrame, n.durationFrames, n.pitchMidi, n.amplitude]))
  return [4, 11].map(len => { const a = bp.outputToNotesPoly(frames.map(r => r.slice()), onsets.map(r => r.slice()), 0.5, 0.3, len), b = decode(bp, frames, onsets, len); return { len, n: a.length, same: key(a) === key(b) } })
})
for (const d of diff) ok(d.same && d.n > 100, `decode matches Basic Pitch's outputToNotesPoly (min note ${d.len} frames, ${d.n} notes)`)

// an option changed while Basic Pitch is still listening: the worker starts a second run beside the first; both share
// one TensorFlow.js engine, so the second must wait for the first and then reuse its output
await page.evaluate(() => { const t = window.__triads(), x = new Float32Array(t.data.length * 5); for (let k = 0; k < 5; k++) x.set(t.data, k * t.data.length); window.__drop(window.__wavFromChannels([x], t.fs, 'triads-x5.wav')) })
await page.waitForFunction(() => /Listening for notes with Basic Pitch/.test(document.querySelector('.panel .status')?.textContent || ''), null, { timeout: 60000 })
await page.evaluate(() => { const f = document.getElementById('opts'); f.querySelector('[name=quantize]').value = '8'; f.dispatchEvent(new Event('change', { bubbles: true })) })
const race = await page.evaluate(() => window.__done(180000))
ok(!race.err, 'option changed mid-inference: transcribed' + (race.err ? ': ' + race.err : ''))
const raceNotes = race.err ? [] : await page.evaluate(async () => window.__parseMid(window.__files().find(f => /\.mid$/.test(f.name)).href))
const raceMissing = [0, 1, 2, 3, 4].flatMap(k => [[60, 0], [64, 0], [67, 0], [65, 1], [69, 1], [72, 1]].map(([m, t]) => [m, 2 * k + t])).filter(([m, t]) => !raceNotes.some(n => n.midi === m && Math.abs(n.time - t) <= 0.05))
ok(!race.err && !raceMissing.length, `option changed mid-inference: all 30 triad notes within ±50 ms (${raceNotes.length} notes in all)` + (raceMissing.length ? `; missing ${raceMissing.map(([m, t]) => m + '@' + t).join(' ')}` : ''))

// ── 2. melody mode: ascending scale ──
await page.evaluate(() => window.__mode('mono'))
ok(await page.evaluate(() => document.querySelector('#opts [name=minNote]').value) === '80', 'melody mode sets the minimum note to 80 ms')
const rm = await page.evaluate(() => window.__done(90000))   // switching mode re-runs the triads, now in melody mode
ok(!rm.err && rm.report && !('Most at once' in rm.report), 'switching to melody mode re-transcribes the loaded file' + (rm.err ? ': ' + rm.err : ''))
await page.evaluate(() => { document.querySelector('#opts [name=tempo]').value = '' })   // back to auto tempo for the scale
await page.evaluate(() => { const m = window.__melody(); window.__drop(window.__wavFromChannels([m.data], m.fs, 'melody-test.wav')) })
let r = await page.evaluate(() => window.__done(90000))
ok(!r.err, 'audio-to-midi: transcribed' + (r.err ? ': ' + r.err : ''))
ok(r.report && !('Basic Pitch took' in r.report), 'melody mode does not run Basic Pitch')

const notesFound = parseInt(r.report?.['Notes found'] || 'NaN', 10)
ok(Math.abs(notesFound - 8) <= 1, `Notes found: ${r.report?.['Notes found']} (expect 8 ±1)`)

const tempoMatch = /(\d+(?:\.\d+)?)/.exec(r.report?.['Tempo used'] || '')
const tempoDetected = tempoMatch ? +tempoMatch[1] : NaN
ok(tempoDetected >= 100 && tempoDetected <= 140, `Tempo used: ${r.report?.['Tempo used']} (expect 100–140, injected 120 — beat tracking on a plain scale can be weak; a manual-tempo path is checked separately below)`)

ok(!!r.report?.['Key'], `Key: ${r.report?.['Key']}`)
ok(/[A-Ga-g]/.test(r.report?.['First bars'] || ''), `First bars shows ABC note tokens: ${r.report?.['First bars']}`)
ok(/\.mp3$/.test(r.save || ''), `default save format mp3: ${r.save}`)

const files = await page.evaluate(() => window.__files())
ok(files.length === 3 && files.some(f => /\.mid$/.test(f.name)) && files.some(f => /\.musicxml$/.test(f.name)) && files.some(f => /\.abc$/.test(f.name)), `files: ${files.map(f => f.name).join(', ')}`)

// the saved .mid parses back with @audio/midi-parse to ~8 notes, midi 60..72, non-decreasing (ascending scale)
const midis = (await page.evaluate(href => window.__parseMid(href), files.find(f => /\.mid$/.test(f.name)).href)).map(n => n.midi)
ok(Math.abs(midis.length - 8) <= 1, `.mid parses to ${midis.length} notes (expect 8 ±1)`)
ok(midis.every(m => m >= 59 && m <= 73), `.mid note numbers within 59..73: ${midis.join(',')}`)
ok(midis.every((m, i) => i === 0 || m >= midis[i - 1] - 1), `.mid note numbers ascend with the scale: ${midis.join(',')}`)
ok(midis[0] <= 62 && midis[midis.length - 1] >= 70, `.mid spans low ${midis[0]} to high ${midis[midis.length - 1]} (expect ≈60..72)`)

// the saved .musicxml spells a C and has ~8 sounding <note> elements (rests do not count)
// (the href is a blob: URL, only resolvable inside the page that created it — fetch runs in-browser)
const xmlText = await page.evaluate(async href => (await fetch(href)).text(), files.find(f => /\.musicxml$/.test(f.name)).href)
ok(xmlText.includes('<step>C</step>'), 'musicxml contains <step>C</step>')
const noteTags = (xmlText.match(/<note>/g) || []).length
const restTags = (xmlText.match(/<rest\/?>/g) || []).length
ok(Math.abs(noteTags - restTags - 8) <= 1, `musicxml: ${noteTags} <note> - ${restTags} rests = ${noteTags - restTags} sounding notes (expect 8 ±1)`)

// the rendered "hear it" MP3 decodes and is non-silent
const audioCheck = await page.evaluate(async href => {
  const ctx = new AudioContext()
  const bytes = await (await fetch(href)).arrayBuffer()
  const buf = await ctx.decodeAudioData(bytes)
  const d = buf.getChannelData(0)
  let sum = 0; for (const x of d) sum += x * x
  return { duration: buf.duration, rms: Math.sqrt(sum / d.length) }
}, (await page.evaluate(() => document.querySelector('.panel .out a').href)))
ok(audioCheck.duration > 0.5, `rendered mp3 duration ${audioCheck.duration.toFixed(2)}s`)
ok(audioCheck.rms > 0.01, `rendered mp3 is non-silent: rms ${audioCheck.rms.toFixed(4)}`)

// manual tempo path (brief: the plain-scale beat detector can be weak, so this must work independently)
await page.evaluate(() => {
  const f = document.getElementById('opts')
  f.querySelector('[name=tempo]').value = '120'
  f.dispatchEvent(new Event('change', { bubbles: true }))
})
const r2 = await page.evaluate(() => window.__done(90000))
ok(!r2.err, 'audio-to-midi: manual tempo 120' + (r2.err ? ': ' + r2.err : ''))
ok(/^120/.test(r2.report?.['Tempo used'] || ''), `manual tempo used: ${r2.report?.['Tempo used']}`)

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `no horizontal overflow at 390px (${overflow})`)

ok(errors.length === 0, `no page errors` + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
