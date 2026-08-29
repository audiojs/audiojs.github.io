// E2E test for /util/midi-to-mp3/ — mirrors scripts/util-e2e.mjs (server + STUB pattern).
// Fixture: scripts/fixtures/bwv846.mid — J.S. Bach, Das Wohltemperierte Clavier I, Praeludium I
// (Mutopia Project, public domain), copied from @audio/midi-render's own test fixture.
// Usage: node scripts/pages/midi-to-mp3.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mid': 'audio/midi' }
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

// same drop/done helpers as scripts/util-e2e.mjs's STUB
const STUB = `
  window.__drop = file => { const dt = new DataTransfer(); dt.items.add(file); document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })) }
  window.__done = async (ms = 120000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise(r => setTimeout(r, 200)); const err = document.querySelector('.status.err'), p = document.querySelector('.panel > .row:nth-child(2)'); if (err) return { err: err.textContent }; if (p && p.hidden) break }
    const rep = document.querySelector('.panel .report'), out = document.querySelector('.panel .out')
    return { report: rep && !rep.hidden ? Object.fromEntries([...rep.querySelectorAll(':scope > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])) : null, save: out && !out.hidden ? out.querySelector('a').download : null } }
`
// "2:27" / "1:02:27" -> seconds (fmtTime's format)
const toSeconds = s => { const p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1] }

console.log('\n▶ chromium')
const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
await context.addInitScript(STUB)
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

await page.goto(`${base}/util/midi-to-mp3/`)

// drop zone accepts .mid
const accept = await page.evaluate(() => document.getElementById('file').accept)
ok(/\.mid/.test(accept) && /\.midi/.test(accept), `drop zone accepts .mid/.midi: ${accept}`)

// drop the Bach fixture — rendering the synth atoms takes a few seconds, so give __done a long timeout
await page.evaluate(async base => {
  const bytes = new Uint8Array(await (await fetch(base + '/scripts/fixtures/bwv846.mid')).arrayBuffer())
  window.__drop(new File([bytes], 'bwv846.mid', { type: 'audio/midi' }))
}, base)
let r = await page.evaluate(() => window.__done(90000))
ok(!r.err, `midi-to-mp3: rendered` + (r.err ? ' — ' + r.err : ''))
ok(r.report?.['Notes'] === '549', `notes ${r.report?.['Notes']} (fixture has 549 per the package's own test)`)
ok(r.report?.['Tracks'] === '3', `tracks ${r.report?.['Tracks']}`)
ok(/Acoustic Grand Piano/.test(r.report?.['Instruments used'] || ''), `instruments used: ${r.report?.['Instruments used']}`)
const lenSec = r.report?.['Length'] ? toSeconds(r.report['Length']) : NaN
ok(lenSec > 120 && lenSec < 170, `reported length ${r.report?.['Length']} (${lenSec}s) ≈ 140s`)
ok(/\d+\s*ms/.test(r.report?.['Render time'] || ''), `render time ${r.report?.['Render time']}`)
ok(/\.mp3$/.test(r.save || ''), `default format mp3: ${r.save}`)

// the saved MP3 decodes to a duration within ±2s of the reported length, and is non-silent
const check = await page.evaluate(async () => {
  const { decodeLib } = await import('/util/util.js')
  const decode = await decodeLib()
  const href = document.querySelector('.panel .out a').href
  const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer())
  const d = await decode(bytes)
  const sec = d.channelData[0].length / d.sampleRate
  let sum = 0; for (const x of d.channelData[0]) sum += x * x
  return { sec, rms: Math.sqrt(sum / d.channelData[0].length) }
})
ok(Math.abs(check.sec - lenSec) < 2, `mp3 duration ${check.sec.toFixed(2)}s within ±2s of reported ${lenSec}s`)
ok(check.rms > 0.01, `mp3 is non-silent: rms ${check.rms.toFixed(4)}`)

// tempo 200% -> new length is roughly half (the schedule scales; a fixed tail does not, so it is not exact)
await page.evaluate(() => {
  const f = document.getElementById('opts')
  f.querySelector('[name=tempo]').value = '200'
  f.dispatchEvent(new Event('change', { bubbles: true }))
})
r = await page.evaluate(() => window.__done(90000))
ok(!r.err, `midi-to-mp3: tempo 200%` + (r.err ? ' — ' + r.err : ''))
const lenSec2 = r.report?.['Length'] ? toSeconds(r.report['Length']) : NaN
ok(lenSec2 > lenSec * 0.35 && lenSec2 < lenSec * 0.7, `tempo 200%: length ${r.report?.['Length']} (${lenSec2}s) ≈ half of ${lenSec}s`)

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `no horizontal overflow at 390px (${overflow})`)

ok(errors.length === 0, `no page errors` + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
