// e2e check for /util/dewow/ — see scripts/util-e2e.mjs for the pattern this copies.
// Synthesizes the denoise-dewow package's own test scenario (6 s chord, s(t) = 1 + 0.02·sin(2π·0.8t)
// + 0.004·sin(2π·30t) warp, linear-interpolated) in the browser, drops it, and checks the report
// numbers plus an independent pitch-track measurement of the saved WAV.
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.ico': 'image/x-icon' }
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
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a').download : null, viz: !!document.querySelector('.viz canvas') } }

  // 6 s chord (220 + 330 + 440 + 660 Hz, slow attack) at 44.1 kHz, warped by the package's own
  // test defect s(t) = 1 + 0.02 sin(2π 0.8 t) + 0.004 sin(2π 30 t) via linear-interpolated reading.
  window.__fixture = () => {
    const fs = 44100, N = 6 * fs
    const clean = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const t = i / fs, e = Math.min(1, i / (0.05 * fs))
      clean[i] = e * 0.25 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 660 * t))
    }
    const sOf = tt => 1 + 0.02 * Math.sin(2 * Math.PI * 0.8 * tt) + 0.004 * Math.sin(2 * Math.PI * 30 * tt)
    const dirty = new Float32Array(N)
    let pos = 0
    for (let i = 0; i < N; i++) {
      const i0 = Math.floor(pos), frac = pos - i0
      const a = clean[i0] || 0, b = clean[i0 + 1] || 0
      dirty[i] = a + (b - a) * frac
      pos += sOf(i / fs)
    }
    window.__dirty = dirty; window.__fs = fs
    const buf = new ArrayBuffer(44 + N * 2), dv = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); dv.setUint32(4, 36 + N * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
    dv.setUint32(24, fs, true); dv.setUint32(28, fs * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * 2, true)
    for (let i = 0; i < N; i++) dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, dirty[i] * 32767)), true)
    return new File([buf], 'wow-fixture.wav', { type: 'audio/wav' })
  }

  // Coarse per-100ms-window frequency track around a nominal tone via a single-bin Goertzel
  // swept across a small range (same recursive form the recorder e2e test uses) — enough to see
  // wow/flutter without pulling in an FFT library. Returns the RMS % deviation from nominal.
  window.__pitchDeviation = (samples, fs, nominal, span = 10, step = 0.5) => {
    const winN = Math.round(0.1 * fs), freqs = []
    for (let start = 0; start + winN <= samples.length; start += winN) {
      let bestF = nominal, bestMag = -1
      for (let f = nominal - span; f <= nominal + span; f += step) {
        const w = 2 * Math.PI * f / fs, c = 2 * Math.cos(w)
        let s0 = 0, s1 = 0, s2 = 0
        for (let i = 0; i < winN; i++) { s0 = samples[start + i] + c * s1 - s2; s2 = s1; s1 = s0 }
        const mag = s1 * s1 + s2 * s2 - c * s1 * s2
        if (mag > bestMag) { bestMag = mag; bestF = f }
      }
      freqs.push(bestF)
    }
    let s = 0
    for (const f of freqs) { const d = (f - nominal) / nominal; s += d * d }
    return 100 * Math.sqrt(s / freqs.length)
  }
`

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(STUB)
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

await page.goto(`${base}/util/dewow/`)
await page.evaluate(() => window.__drop(window.__fixture()))
const r = await page.evaluate(() => window.__done())
ok(!r.err, 'dewow: decoded and processed' + (r.err ? ' — ' + r.err : ''))
ok(r.viz, 'dewow: speed-curve canvas rendered')

const wowNums = (r.report?.Wow || '').match(/[\d.]+/g)?.map(Number) || []
ok(wowNums.length === 2, `dewow: Wow row has before → after numbers (${r.report?.Wow})`)
const [wowBefore, wowAfter] = wowNums
ok(wowBefore >= 1.5 && wowBefore <= 2.6, `dewow: wow before ${wowBefore}% (expect 1.5–2.6%, injected 2%)`)
ok(wowAfter < wowBefore / 3, `dewow: wow after ${wowAfter}% < before/3 = ${(wowBefore / 3).toFixed(2)}%`)

// select WAV for a sample-accurate length + pitch check
await page.evaluate(() => { const sel = document.querySelector('.panel select'); sel.value = 'wav'; sel.dispatchEvent(new Event('change')) })
const r2 = await page.evaluate(() => new Promise(res => setTimeout(() => res(window.__done()), 300)))
ok(!r2.err, 'dewow: wav re-encode' + (r2.err ? ' — ' + r2.err : ''))
ok(/-dewow\.wav$/.test(r2.save || ''), `dewow: output name ${r2.save}`)

const check = await page.evaluate(async () => {
  const bytes = new Uint8Array(await (await fetch(document.querySelector('.panel .out a').href)).arrayBuffer())
  const ctx = new AudioContext({ sampleRate: 44100 })
  const buf = await ctx.decodeAudioData(bytes.buffer.slice(0))
  const out = buf.getChannelData(0)
  return {
    duration: buf.duration,
    devBefore: window.__pitchDeviation(window.__dirty, window.__fs, 440),
    devAfter: window.__pitchDeviation(out, buf.sampleRate, 440),
  }
})
ok(Math.abs(check.duration - 6) < 0.01, `dewow: saved length ${check.duration.toFixed(4)}s (expect 6s ±10ms)`)
ok(check.devBefore > 1, `dewow: 440 Hz pitch deviation before correction ${check.devBefore.toFixed(2)}% (expect > 1%)`)
ok(check.devAfter < 0.5, `dewow: 440 Hz pitch deviation after correction ${check.devAfter.toFixed(2)}% (expect < 0.5%)`)

// reference mode: switching method reveals the frequency field and re-runs without error
const refCheck = await page.evaluate(async () => {
  const form = document.getElementById('opts')
  form.querySelector('[name=mode]').value = 'reference'
  form.querySelector('[name=mode]').dispatchEvent(new Event('change', { bubbles: true }))
  const rowHidden = document.getElementById('refRow').hidden
  form.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(res => setTimeout(res, 300))
  return { rowHidden }
})
ok(refCheck.rowHidden === false, 'dewow: reference frequency field appears in reference mode')
const r3 = await page.evaluate(() => window.__done())
ok(!r3.err, 'dewow: reference mode runs without error' + (r3.err ? ' — ' + r3.err : ''))

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `dewow: no horizontal overflow at 390 px (${overflow})`)

ok(errors.length === 0, 'dewow: no page errors' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
