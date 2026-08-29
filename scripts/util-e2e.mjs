// End-to-end tests for every utility page across browser engines (scripts/util-test.mjs covers tag carry-over).
// Usage: node scripts/util-e2e.mjs [chromium] [firefox] [webkit]
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
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
const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']
let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }

// synthetic 3 s stereo track: A minor chord, 120 BPM kick, a little noise — or a pure tone
const STUB = `
  window.__wav = (kind = 'song') => {
    const fs = 48000, N = fs * 3, L = new Float32Array(N), R = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const t = i / fs
      if (kind === 'tone') { L[i] = R[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * t); continue }
      const beat = ((t * 2) % 1) < 0.05 ? 0.6 : 0
      L[i] = 0.25 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 261.63 * t) + 0.1 * Math.sin(2 * Math.PI * 329.63 * t) + beat * Math.sin(2 * Math.PI * 80 * t) + 0.01 * (Math.random() - 0.5)
      R[i] = 0.25 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 261.63 * t) + 0.1 * Math.sin(2 * Math.PI * 392 * t) + beat * Math.sin(2 * Math.PI * 80 * t) + 0.01 * (Math.random() - 0.5)
    }
    const buf = new ArrayBuffer(44 + N * 4), dv = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true)
    dv.setUint32(24, fs, true); dv.setUint32(28, fs * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, N * 4, true)
    for (let i = 0; i < N; i++) { dv.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, L[i] * 32767)), true); dv.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, R[i] * 32767)), true) }
    return new File([buf], 'test-' + kind + '.wav', { type: 'audio/wav' })
  }
  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 120000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise(r => setTimeout(r, 200)); const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)'); if (err) return { err: err.textContent }; if (p && p.hidden) break }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out')
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a').download : null, viz: !!document.querySelector('.viz canvas') } }
  // stubbed microphone: whatever __micSource() builds, in a MediaStream
  // stub on the prototype: WebKit hands out a fresh mediaDevices object per access, so an own property would not stick
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { configurable: true, writable: true, value: async () => { const ctx = new AudioContext({ sampleRate: 48000 }); const dest = ctx.createMediaStreamDestination(); await ctx.resume(); await window.__micSource(ctx, dest); return dest.stream } })
  window.__micSource = async (ctx, dest) => { const osc = ctx.createOscillator(); osc.frequency.value = 443; const g = ctx.createGain(); g.gain.value = 0.3; osc.connect(g).connect(dest); osc.start() }
`

const FILE_TOOLS = {
  'extract-audio': { save: /\.mp3$/ },
  'convert-audio': { save: /\.mp3$/ },
  'loudness': { report: r => Math.abs(parseFloat(r['Integrated loudness']) + 10.6) < 1, opts: { target: '-14' }, after: r => /-14\.0/.test(r['Result loudness']) },
  'denoise': { report: r => /wiener|omlsa|specsub/.test(r['Method chosen by the classifier']), opts: { method: 'dehum' }, after: r => r['Method'] === 'dehum' },
  'key-bpm': { report: r => /A minor/.test(r['Key']) && r['Camelot'] === '8A' && /12[01]|60/.test(r['Tempo']) },
  'vocal-remover': { save: /-karaoke\.mp3$/, opts: { mode: 'isolate' }, afterSave: /-vocals\.mp3$/ },
  'pitch-tempo': { report: r => /Unchanged/.test(Object.keys(r)[0]), opts: { semitones: '3', tempo: '150' }, afterSave: /\+3st-150pct\.mp3$/, after: r => /0:02/.test(r['New length']) },
  'spectrogram': { viz: true, report: r => /Hz/.test(r['Strongest frequency']) },
}

for (const name of engines) {
  console.log(`\n▶ ${name}`)
  const browser = await pw[name].launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
  await context.addInitScript(STUB)
  const errors = []
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  // console errors count unless they are Firefox's log line for a CDN module fetch that the worker retried
  page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

  for (const [slug, t] of Object.entries(FILE_TOOLS)) {
    await page.goto(`${base}/util/${slug}/`)
    await page.evaluate(() => window.__drop(window.__wav()))
    let r = await page.evaluate(() => window.__done())
    ok(!r.err, `${slug}: decoded and processed` + (r.err ? ' — ' + r.err : ''))
    if (t.save) ok(t.save.test(r.save || ''), `${slug}: output ${r.save}`)
    if (t.report) ok(r.report && t.report(r.report), `${slug}: report ${JSON.stringify(r.report)}`)
    if (t.viz) ok(r.viz, `${slug}: canvas rendered`)
    if (t.opts) {
      await page.evaluate(opts => { const f = document.getElementById('opts'); for (const [k, v] of Object.entries(opts)) { const i = f.querySelector(`[name="${k}"]`); i.type === 'radio' ? f.querySelector(`[name="${k}"][value="${v}"]`).checked = true : i.value = v } f.dispatchEvent(new Event('change', { bubbles: true })) }, t.opts)
      r = await page.evaluate(() => new Promise(res => setTimeout(() => res(window.__done()), 300)))
      ok(!r.err, `${slug}: options ${JSON.stringify(t.opts)}` + (r.err ? ' — ' + r.err : ''))
      if (t.after) ok(r.report && t.after(r.report), `${slug}: after options ${JSON.stringify(r.report)}`)
      if (t.afterSave) ok(t.afterSave.test(r.save || ''), `${slug}: output ${r.save}`)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(overflow <= 0, `${slug}: no horizontal overflow at 390 px (${overflow})`)
  }

  // converter: every target decodes back with the same length; params reach the encoder and the resampler
  await page.goto(`${base}/util/convert-audio/`)
  await page.evaluate(() => window.__drop(window.__wav()))
  await page.evaluate(() => window.__done())
  const conv = await page.evaluate(async () => {
    const { decodeLib } = await import('/util/util.js'); const decode = await decodeLib()
    const out = {}, sel = document.querySelector('.panel select')
    for (const f of [...sel.options].map(o => o.value)) {
      sel.value = f; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 200))
      const r = await window.__done()
      if (r.err) { out[f] = 'ERR ' + r.err; continue }
      try { const bytes = new Uint8Array(await (await fetch(document.querySelector('.panel .out a').href)).arrayBuffer()); const d = await decode(bytes); out[f] = { name: r.save, ch: d.channelData.length, rate: d.sampleRate, sec: +(d.channelData[0].length / d.sampleRate).toFixed(2), preview: document.querySelector('.panel .out .note').hidden ? 'native' : 'wav copy' } }
      catch (e) { out[f] = 'undecodable: ' + e.message }
    }
    return out
  })
  for (const [f, r] of Object.entries(conv)) {
    // AAC rides on WebCodecs: Firefox has no encoder, and the page must say so instead of failing silently
    if ((f === 'aac' || f === 'm4a') && name === 'firefox') { ok(/isn't available/.test(String(r)), `convert-audio → ${f} on firefox: explains the missing encoder`); continue }
    ok(typeof r === 'object' && r.ch === 2 && r.sec > 2.9 && r.sec < 3.2, `convert-audio → ${f}: ${JSON.stringify(r)}`)
  }
  const params = await page.evaluate(async () => {
    const { decodeLib } = await import('/util/util.js'); const decode = await decodeLib()
    const form = document.getElementById('opts'); form.querySelector('[name=rate]').value = '16000'; form.querySelector('[name=channels]').value = '1'
    const sel = document.querySelector('.panel select'); sel.value = 'flac'; sel.dispatchEvent(new Event('change'))
    form.querySelector('[name=bitDepth]').value = '24'; form.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300)); const r = await window.__done()
    const bytes = new Uint8Array(await (await fetch(document.querySelector('.panel .out a').href)).arrayBuffer()); const d = await decode(bytes)
    const bps = (((bytes[20] & 1) << 4) | (bytes[21] >> 4)) + 1 // STREAMINFO bits per sample
    return { output: r.report?.Output, ch: d.channelData.length, rate: d.sampleRate, sec: +(d.channelData[0].length / d.sampleRate).toFixed(2), bps }
  })
  ok(params.ch === 1 && params.rate === 16000 && params.sec > 2.9 && params.sec < 3.1 && params.bps === 24 && /16 kHz · mono/.test(params.output || ''), `convert-audio: 16 kHz mono 24-bit FLAC ${JSON.stringify(params)}`)

  // spectrogram centroid on a pure 1 kHz tone
  await page.goto(`${base}/util/spectrogram/`)
  await page.evaluate(() => window.__drop(window.__wav('tone')))
  const tone = await page.evaluate(() => window.__done())
  ok(tone.report && /^1\.0\dkHz|^0\.9\dkHz|^1\.00kHz/.test(tone.report['Strongest frequency']), `spectrogram: 1 kHz tone peak ${tone.report?.['Strongest frequency']}`)
  ok(tone.report && Math.abs(parseFloat(tone.report['Spectral centroid']) - 1) < 0.15, `spectrogram: centroid ${tone.report?.['Spectral centroid']} ≈ 1 kHz`)

  // tuner: 443 Hz → A4, +12 cents at A=440
  await page.goto(`${base}/util/tuner/`)
  await page.click('#start')
  const tuner = await page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 10000) { await new Promise(r => setTimeout(r, 200)); if (/Hz/.test(document.getElementById('hz').textContent)) break } return { hz: document.getElementById('hz').textContent, note: document.getElementById('note').textContent } })
  ok(tuner.note === 'A4' && Math.abs(parseFloat(tuner.hz) - 443) < 2 && /\+(0?[8-9]|1[0-8]) cents/.test(tuner.hz), `tuner: ${tuner.note} ${tuner.hz}`)

  // recorder: 1.5 s → MP3 with a 443 Hz tone
  await page.goto(`${base}/util/recorder/`)
  await page.click('#rec')
  const rec = await page.evaluate(async () => { const b = document.getElementById('rec'); const t0 = performance.now(); while (performance.now() - t0 < 10000 && !/Stop/.test(b.textContent)) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 1500)); b.click(); const t1 = performance.now(); while (performance.now() - t1 < 30000 && !/Save \w+ ·/.test(document.getElementById('saveLabel').textContent)) await new Promise(r => setTimeout(r, 200)); const ab = await (await fetch(document.getElementById('save').href)).arrayBuffer(); const a = await new AudioContext().decodeAudioData(ab.slice(0)); const d = a.getChannelData(0); const g = f => { const w = 2 * Math.PI * f / a.sampleRate, c = 2 * Math.cos(w); let s0 = 0, s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0 } return s1 * s1 + s2 * s2 - c * s1 * s2 }; return { dur: a.duration, hz: [221, 330, 443, 631, 886].map(f => [f, g(f)]).sort((x, y) => y[1] - x[1])[0][0], name: document.getElementById('save').download } })
  ok(rec.dur > 1.3 && rec.dur < 4 && rec.hz === 443, `recorder: ${rec.dur.toFixed(2)} s, dominant ${rec.hz} Hz, ${rec.name}`)

  // measure: loopback of the sweep, 200 ms late, with a 50 ms echo
  await page.goto(`${base}/util/measure/`)
  await page.evaluate(async () => { const chirp = (await import('https://esm.sh/@audio/synth-chirp')).default; window.__micSource = async (ctx, dest) => { const fs = 48000, sweep = chirp({ f0: 20, f1: 20000, duration: 3, fs }); const buf = ctx.createBuffer(1, sweep.length, fs); buf.getChannelData(0).set(sweep); const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.5; const echo = ctx.createDelay(1); echo.delayTime.value = 0.05; const eg = ctx.createGain(); eg.gain.value = 0.3; src.connect(g).connect(dest); g.connect(echo).connect(eg).connect(dest); src.start(ctx.currentTime + 0.7) } })
  await page.click('#start')
  const meas = await page.evaluate(async () => { const msg = document.getElementById('msg'); const t0 = performance.now(); while (performance.now() - t0 < 40000 && !/Done|failed|nothing|different|needed/i.test(msg.textContent)) await new Promise(r => setTimeout(r, 300)); return { msg: msg.textContent, report: Object.fromEntries([...document.querySelectorAll('#report > div')].map(d => [d.querySelector('.k').textContent, d.querySelector('.v').textContent])) } })
  ok(/Done/.test(meas.msg) && parseFloat(meas.report['Response deviation 100 Hz to 10 kHz'].replace('±', '')) < 1 && parseFloat(meas.report['Loop latency']) < 400, `measure: ${JSON.stringify(meas.report)}`)

  ok(errors.length === 0, `${name}: no page errors` + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))
  await browser.close()
}
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
