// E2E test for /util/audio-to-midi/ — mirrors scripts/util-e2e.mjs (server + STUB pattern), see
// scripts/pages/midi-to-mp3.test.mjs and dewow.test.mjs for the sibling convention this copies.
// Synthesizes a monophonic 8-note ascending scale (C4..C5, quarter notes at 120 BPM, decaying
// harmonic tone) directly in the browser — no fixture file needed — drops it, and checks the
// report numbers plus independently: the saved .mid parses back to the same note sequence with
// @audio/midi-parse, the .musicxml has the right note count and spells a C, and the rendered
// "hear it" MP3 is non-silent.
// Usage: node scripts/pages/audio-to-midi.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(root, rel)
  if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end('404') }
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }

const STUB = `
  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 120000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise(r => setTimeout(r, 200)); const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)'); if (err) return { err: err.textContent }; if (p && p.hidden) break }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out')
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a').download : null } }

  // one 0.5 s note: 4 decaying harmonics (fundamental + 3 overtones), short attack ramp
  window.__note = (freq, dur, fs) => {
    const N = Math.round(dur * fs), buf = new Float32Array(N), attack = Math.max(1, Math.round(0.005 * fs))
    for (let i = 0; i < N; i++) {
      const t = i / fs, env = Math.exp(-t / 0.3) * Math.min(1, i / attack)
      let s = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.25 * Math.sin(2 * Math.PI * freq * 3 * t) + 0.125 * Math.sin(2 * Math.PI * freq * 4 * t)
      buf[i] = 0.2 * env * s
    }
    return buf
  }
  // C4 D4 E4 F4 G4 A4 B4 C5 (midi 60,62,64,65,67,69,71,72), quarter notes at 120 BPM (0.5 s each)
  window.__melody = () => {
    const fs = 44100, midis = [60, 62, 64, 65, 67, 69, 71, 72]
    const parts = midis.map(m => window.__note(440 * Math.pow(2, (m - 69) / 12), 0.5, fs))
    const N = parts.reduce((s, p) => s + p.length, 0), data = new Float32Array(N)
    let off = 0; for (const p of parts) { data.set(p, off); off += p.length }
    return { data, fs }
  }
  window.__wavFromChannels = (channels, fs) => {
    const N = channels[0].length, nc = channels.length
    const buf = new ArrayBuffer(44 + N * nc * 2), dv = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); dv.setUint32(4, 36 + N * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true)
    dv.setUint32(24, fs, true); dv.setUint32(28, fs * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * nc * 2, true)
    for (let i = 0; i < N; i++) for (let c = 0; c < nc; c++) dv.setInt16(44 + (i * nc + c) * 2, Math.max(-32768, Math.min(32767, channels[c][i] * 32767)), true)
    return new File([buf], 'melody-test.wav', { type: 'audio/wav' })
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
await page.evaluate(() => { const m = window.__melody(); window.__drop(window.__wavFromChannels([m.data], m.fs)) })
let r = await page.evaluate(() => window.__done(90000))
ok(!r.err, 'audio-to-midi: transcribed' + (r.err ? ' — ' + r.err : ''))

const notesFound = parseInt(r.report?.['Notes found'] || 'NaN', 10)
ok(Math.abs(notesFound - 8) <= 1, `Notes found: ${r.report?.['Notes found']} (expect 8 ±1)`)

const tempoMatch = /(\d+(?:\.\d+)?)/.exec(r.report?.['Tempo used'] || '')
const tempoDetected = tempoMatch ? +tempoMatch[1] : NaN
ok(tempoDetected >= 100 && tempoDetected <= 140, `Tempo used: ${r.report?.['Tempo used']} (expect 100–140, injected 120 — beat tracking on a plain scale can be weak; a manual-tempo path is checked separately below)`)

ok(!!r.report?.['Key'], `Key: ${r.report?.['Key']}`)
ok(/[A-Ga-g]/.test(r.report?.['First bars'] || ''), `First bars shows ABC note tokens: ${r.report?.['First bars']}`)
ok(/\.mp3$/.test(r.save || ''), `default save format mp3: ${r.save}`)

const files = await page.evaluate(() => [...document.querySelectorAll('.panel .files a')].map(a => ({ name: a.download, href: a.href })))
ok(files.length === 3 && files.some(f => /\.mid$/.test(f.name)) && files.some(f => /\.musicxml$/.test(f.name)) && files.some(f => /\.abc$/.test(f.name)), `files: ${files.map(f => f.name).join(', ')}`)

// the saved .mid parses back with @audio/midi-parse to ~8 notes, midi 60..72, non-decreasing (ascending scale)
const midiCheck = await page.evaluate(async href => {
  const { default: parse } = await import('https://esm.sh/@audio/midi-parse@1.0.2')
  const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer())
  const parsed = parse(bytes)
  return { count: parsed.notes.length, midis: parsed.notes.map(n => n.midi) }
}, files.find(f => /\.mid$/.test(f.name)).href)
ok(Math.abs(midiCheck.count - 8) <= 1, `.mid parses to ${midiCheck.count} notes (expect 8 ±1)`)
ok(midiCheck.midis.every(m => m >= 59 && m <= 73), `.mid note numbers within 59..73: ${midiCheck.midis.join(',')}`)
const nonDecreasing = midiCheck.midis.every((m, i) => i === 0 || m >= midiCheck.midis[i - 1] - 1)
ok(nonDecreasing, `.mid note numbers ascend with the scale: ${midiCheck.midis.join(',')}`)
ok(midiCheck.midis[0] <= 62 && midiCheck.midis[midiCheck.midis.length - 1] >= 70, `.mid spans low ${midiCheck.midis[0]} to high ${midiCheck.midis[midiCheck.midis.length - 1]} (expect ≈60..72)`)

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
ok(!r2.err, 'audio-to-midi: manual tempo 120' + (r2.err ? ' — ' + r2.err : ''))
ok(/^120/.test(r2.report?.['Tempo used'] || ''), `manual tempo used: ${r2.report?.['Tempo used']}`)

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `no horizontal overflow at 390px (${overflow})`)

ok(errors.length === 0, `no page errors` + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
