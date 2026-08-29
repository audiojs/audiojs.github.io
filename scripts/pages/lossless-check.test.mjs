// Playwright check for /util/lossless-check/ (see scripts/pages/lossless-check.mjs).
// Server + STUB pattern copied from scripts/util-e2e.mjs (that file is never imported/edited by page tests).
// Usage: node scripts/pages/lossless-check.test.mjs
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

// __drop(file) fires the page's drop handler; __done() polls until the panel settles (same contract as util-e2e.mjs)
const STUB = `
  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 120000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise(r => setTimeout(r, 200)); const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)'); if (err) return { err: err.textContent }; if (p && p.hidden) break }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out')
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a')?.download : null, viz: !!document.querySelector('.viz canvas') } }
`

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
await context.addInitScript(STUB)
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

await page.goto(`${base}/util/lossless-check/`)

// Build the two fixtures in the browser: a full-band 3 s mono signal — octave-spaced harmonic
// partials up to 18 kHz with a descending 1/n tilt (like a real instrument's harmonic series), a flat
// -30 dB white-noise bed, and periodic full-scale clicks every 0.5 s (transient stress so @audio/measure-lossy's
// max-hold tie-breaker can confirm real content near Nyquist, not just an averaged-down LTAS) — the same
// recipe @audio/measure-lossy's own test.js verifies against (see packages/measure-lossy/test.js `synth()`,
// which measures its mono 64 kbps MP3 fixture at cutoff 15500-17500 Hz; encoding must stay mono too — a
// stereo file at the same nominal bitrate gets roughly half the per-channel bits and a much lower cutoff).
// Plus the same signal encoded to MP3 at 64 kbps with @audio/encode's mp3 encoder (the shell's own encodeLib).
// fs matches measure-lossy's own test.js FS: at 48 kHz this same cutoff sits inside the package's fixed
// half-rate table (~16 kHz, a 32 kHz-source upsample candidate) and gets misclassified as "upsampled".
await page.evaluate(async () => {
  const fs = 44100, N = fs * 3
  const partials = [220, 440, 880, 1760, 3520, 7040, 11000, 14000, 18000]
  const amps = partials.map((_, i) => 1 / (i + 1))
  const ampSum = amps.reduce((a, b) => a + b, 0)
  const d = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let s = 0
    for (let p = 0; p < partials.length; p++) s += Math.sin(2 * Math.PI * partials[p] * i / fs) * amps[p] / ampSum
    s *= 0.7
    s += (Math.random() * 2 - 1) * 0.0316 // -30 dBFS white noise, full band to Nyquist
    d[i] = s
  }
  for (let time = 0; time < 3; time += 0.5) { const i = Math.round(time * fs); if (i < N) d[i] = 0.7 }
  const int16 = x => Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
  const buf = new ArrayBuffer(44 + N * 2), dv = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); dv.setUint32(4, 36 + N * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, fs, true); dv.setUint32(28, fs * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * 2, true)
  for (let i = 0; i < N; i++) dv.setInt16(44 + i * 2, int16(d[i]), true)

  const { encodeLib } = await import('/util/util.js')
  const enc = await encodeLib()
  const mp3Bytes = await enc.mp3([d], { sampleRate: fs, channels: 1, bitrate: 64 })

  window.__fixtures = {
    wav: new File([buf], 'fullband.wav', { type: 'audio/wav' }),
    mp3: new File([mp3Bytes], 'fullband-64k.mp3', { type: 'audio/mpeg' }),
  }
})

// (a) the raw WAV: full-band content up to Nyquist should not trip the lossy heuristic
await page.evaluate(() => window.__drop(window.__fixtures.wav))
const wav = await page.evaluate(() => window.__done())
ok(!wav.err, 'lossless-check: WAV fixture processed' + (wav.err ? ' — ' + wav.err : ''))
ok(wav.report && /No lossy signature found/.test(wav.report['Verdict'] || ''), `lossless-check: WAV verdict — ${wav.report?.['Verdict']}`)
const wavCutoff = parseFloat(wav.report?.['Cutoff frequency'] || '0')
ok(wavCutoff >= 0.45 * 44.1, `lossless-check: WAV cutoff ${wavCutoff} kHz >= ${(0.45 * 44.1).toFixed(1)} kHz`)
ok(wav.viz, 'lossless-check: WAV — viz canvas rendered')

// (b) the same signal encoded to MP3 at 64 kbps: LAME's own lowpass at that bitrate lands near 16.5 kHz
await page.evaluate(() => window.__drop(window.__fixtures.mp3))
const mp3 = await page.evaluate(() => window.__done())
ok(!mp3.err, 'lossless-check: MP3 fixture processed' + (mp3.err ? ' — ' + mp3.err : ''))
ok(mp3.report && /Lossy source detected/.test(mp3.report['Verdict'] || ''), `lossless-check: MP3 verdict — ${mp3.report?.['Verdict']}`)
ok(mp3.report && /mp3/i.test(mp3.report['Verdict'] || ''), `lossless-check: MP3 source guess mentions mp3 — ${mp3.report?.['Verdict']}`)
const mp3Cutoff = parseFloat(mp3.report?.['Cutoff frequency'] || '0')
ok(mp3Cutoff >= 15 && mp3Cutoff <= 18, `lossless-check: MP3 cutoff ${mp3Cutoff} kHz in [15, 18]`)
ok(mp3.viz, 'lossless-check: MP3 — viz canvas rendered')

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `lossless-check: no horizontal overflow at 390 px (${overflow})`)

ok(errors.length === 0, 'lossless-check: no page errors' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
