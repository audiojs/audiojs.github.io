// Browser test for /util/desilence/ — shorten (podcast smart speed), remove and trim modes.
// Serves the repo root, synthesizes a speech-like fixture entirely in the page (no static
// fixture file — see window.__scene below), drops it, and checks the report/save against
// values computed the same way @audio/denoise-desilence's own test.js checks itself.
// Run: node scripts/pages/desilence.test.mjs
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
  // minimal mono WAV writer — the STUB's WAV writer idea, generalized to N channels
  window.__wavFromChannels = (channels, fs) => {
    const nCh = channels.length, N = channels[0].length
    const buf = new ArrayBuffer(44 + N * nCh * 2), dv = new DataView(buf)
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); dv.setUint32(4, 36 + N * nCh * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true)
    dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true); dv.setUint32(24, fs, true); dv.setUint32(28, fs * nCh * 2, true)
    dv.setUint16(32, nCh * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * nCh * 2, true)
    for (let i = 0; i < N; i++) for (let c = 0; c < nCh; c++) dv.setInt16(44 + (i * nCh + c) * 2, Math.max(-32768, Math.min(32767, channels[c][i] * 32767)), true)
    return new File([buf], 'desilence-scene.wav', { type: 'audio/wav' })
  }

  // four 0.6s voiced bursts (150 Hz + 8 harmonics, short attack/release envelope) separated by
  // 0.2s / 1.0s / 3.0s pauses over a -60dBFS noise floor — same shape as denoise-desilence's own
  // test scene. leadSilence prepends extra noise-floor-only silence so trim mode has something
  // to cut (the bare 4-burst scene starts and ends right at a burst, nothing for trim to find).
  window.__scene = (leadSilence = 0) => {
    const fs = 44100
    let seed = 0xC0FFEE >>> 0
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000)
    const burst = dur => {
      const n = Math.round(dur * fs), d = new Float32Array(n)
      for (let i = 0; i < n; i++) { let s = 0; for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * 150 * h * i / fs) / h; d[i] = s }
      const fade = Math.round(0.02 * fs)
      for (let i = 0; i < fade; i++) { const g = i / fade; d[i] *= g; d[n - 1 - i] *= g }
      let rms = 0; for (let i = 0; i < n; i++) rms += d[i] * d[i]; rms = Math.sqrt(rms / n)
      const g = Math.pow(10, -12 / 20) / Math.max(rms, 1e-9)
      for (let i = 0; i < n; i++) d[i] *= g
      return d
    }
    const gaps = [0.2, 1.0, 3.0], burstDur = 0.6, bounds = []
    let t = leadSilence
    for (let i = 0; i < 4; i++) { bounds.push([t, t + burstDur]); t += burstDur; if (i < 3) t += gaps[i] }
    const duration = t, n = Math.round(duration * fs), d = new Float32Array(n)
    for (let i = 0; i < n; i++) d[i] = (rng() * 2 - 1) * Math.pow(10, -60 / 20)
    for (const [a] of bounds) { const seg = burst(burstDur); const off = Math.round(a * fs); for (let k = 0; k < seg.length && off + k < n; k++) d[off + k] += seg[k] }
    return { data: d, fs, bounds, duration }
  }

  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 60000) => {
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      await new Promise(r => setTimeout(r, 200))
      const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)')
      if (err) return { err: err.textContent }
      if (p && p.hidden) break
    }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out')
    return {
      report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null,
      save: out && !out.hidden ? out.querySelector('a').download : null,
      viz: !!document.querySelector('.viz canvas'),
    }
  }
`

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
await context.addInitScript(STUB)
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

await page.goto(`${base}/util/desilence/`)

// --- default (shorten, minSilence 0.5s, maxSilence 0.25s) on the bare 4-burst scene ---
// duration = 4×0.6 + 0.2 + 1.0 + 3.0 = 6.6s. minSilence 0.5 leaves the 0.2s gap untouched;
// the 1.0s and 3.0s gaps each shrink to maxSilence(0.25) minus one 0.01s crossfade:
//   removed ≈ (1.0-0.25) + (3.0-0.25) - 2×0.01 = 3.48s → new length ≈ 3.12s
const scene = await page.evaluate(() => { const s = window.__scene(0); return { duration: s.duration } })
await page.evaluate(() => window.__drop(window.__wavFromChannels([window.__scene(0).data], 44100)))
let r = await page.evaluate(() => window.__done())
ok(!r.err, 'desilence: decoded and processed' + (r.err ? ' — ' + r.err : ''))

let report = r.report || {}
console.log('  report:', JSON.stringify(report))
const speechFound = report['Speech found'] || ''
const speechMatch = speechFound.match(/^(\d+)%$/)
ok(!!speechMatch, `desilence: "Speech found" is a plain percentage (${speechFound})`)

// __done() only captures .k/.v, not the .note explaining the number — read it directly to
// check the phrase count. merge defaults to 0.15s, well under every gap here (0.2/1.0/3.0s),
// so the 4 bursts should not get bridged into fewer phrases; measure what the VAD actually
// found rather than assume it.
const speechNote = await page.evaluate(() => [...document.querySelectorAll('.report > div')].find(d => d.querySelector('.k')?.textContent === 'Speech found')?.querySelector('.note')?.textContent || '')
const phraseMatch = speechNote.match(/^(\d+) phrase/)
const phraseCount = phraseMatch ? +phraseMatch[1] : NaN
console.log('  speech note:', speechNote)
ok(phraseCount === 4, `desilence: VAD finds all 4 bursts as separate phrases (merge 0.15s < every gap 0.2/1.0/3.0s), got ${phraseCount}`)

const pausesCut = report['Pauses cut']
const removedText = report['Removed'] || ''
const removedMatch = removedText.match(/^([\d.]+)s\s*\(([\d.]+)%\)$/)
ok(!!removedMatch, `desilence: "Removed" is "Ns (P%)" (${removedText})`)
const removedSec = removedMatch ? parseFloat(removedMatch[1]) : NaN
ok(pausesCut === '2', `desilence: shorten cuts the two gaps ≥ minSilence (1.0s, 3.0s), got ${pausesCut}`)
ok(removedSec > 3 && removedSec < 3.6, `desilence: shorten removes ~3.48s (1.0→0.25 + 3.0→0.25, minus crossfades), got ${removedSec}`)

const newLength = report['New length'] || ''
ok(/^0:0[23]$/.test(newLength), `desilence: new length ≈ 6.6 - 3.48 ≈ 3.1s (${newLength})`)
ok(r.viz, 'desilence: timeline canvas rendered')
ok(/-desilenced\.mp3$/.test(r.save || ''), `desilence: saved ${r.save}`)

// the saved MP3 decodes back to the expected new length, ±0.15s for encoder priming/padding
const mp3 = await page.evaluate(async () => {
  const { decodeLib } = await import('/util/util.js')
  const decode = await decodeLib()
  const bytes = new Uint8Array(await (await fetch(document.querySelector('.panel .out a').href)).arrayBuffer())
  const d = await decode(bytes)
  return { sec: d.channelData[0].length / d.sampleRate }
})
const expectedNew = scene.duration - (3.0 - 0.25) - (1.0 - 0.25) + 2 * 0.01 // = scene.duration - 3.48
ok(Math.abs(mp3.sec - expectedNew) < 0.15, `desilence: saved MP3 decodes to ${mp3.sec.toFixed(2)}s ≈ ${expectedNew.toFixed(2)}s`)

// --- switch to remove mode: sanity check it reprocesses without error and cuts something ---
await page.evaluate(() => { const s = document.querySelector('#opts [name=mode]'); s.value = 'remove'; s.dispatchEvent(new Event('change', { bubbles: true })) })
r = await page.evaluate(() => new Promise(res => setTimeout(() => res(window.__done()), 300)))
ok(!r.err, 'desilence: remove mode' + (r.err ? ' — ' + r.err : ''))
ok(r.report && parseFloat((r.report['Removed'] || '0').match(/^([\d.]+)/)?.[1] || 0) > 3, `desilence: remove mode also cuts the two long gaps, report ${JSON.stringify(r.report)}`)

// --- trim mode on the same (bare, no lead/trail) scene: nothing to cut ---
await page.evaluate(() => { const s = document.querySelector('#opts [name=mode]'); s.value = 'trim'; s.dispatchEvent(new Event('change', { bubbles: true })) })
r = await page.evaluate(() => new Promise(res => setTimeout(() => res(window.__done()), 300)))
ok(!r.err, 'desilence: trim mode on the bare scene' + (r.err ? ' — ' + r.err : ''))
report = r.report || {}
console.log('  trim (bare) report:', JSON.stringify(report))
const bareTrimRemoved = parseFloat((report['Removed'] || '').match(/^([\d.]+)/)?.[1] || 'NaN')
ok(bareTrimRemoved < 0.05, `desilence: trim removes ~nothing when the scene has no lead/trail silence (${bareTrimRemoved}s)`)
ok(/^0:0[67]$/.test(report['New length'] || ''), `desilence: trim leaves length ~unchanged at 6.6s (${report['New length']})`)

// --- trim mode on a scene with 1s of head silence: only the lead should be cut ---
await page.evaluate(() => window.__drop(window.__wavFromChannels([window.__scene(1).data], 44100)))
r = await page.evaluate(() => window.__done())
ok(!r.err, 'desilence: trim mode with 1s lead-in' + (r.err ? ' — ' + r.err : ''))
report = r.report || {}
console.log('  trim (1s lead) report:', JSON.stringify(report))
const trimRemoved = parseFloat((report['Removed'] || '').match(/^([\d.]+)/)?.[1] || 'NaN')
ok(Math.abs(trimRemoved - 1.0) < 0.1, `desilence: trim cuts ≈1s of head silence, got ${trimRemoved}`)
// the leading 1s span, plus — as the package's own test.js documents — an optional sub-hop
// (~0.01s) sliver at the very tail, an STFT-frame-grid quantization artifact of re-running VAD
// on a signal that now ends right at the last burst; the bare-scene run above hit this too
// (1 cut of 0.02s with nothing else to trim), so tolerate 1 or 2 here.
ok(report['Pauses cut'] === '1' || report['Pauses cut'] === '2', `desilence: trim cuts the leading span (+ optional sub-hop tail sliver), got ${report['Pauses cut']}`)

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `desilence: no horizontal overflow at 390 px (${overflow})`)
ok(errors.length === 0, 'desilence: no page errors' + (errors.length ? ' — ' + errors.slice(0, 5).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
