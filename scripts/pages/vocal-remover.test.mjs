// Browser test for /util/vocal-remover/ (its page lives inline in scripts/util-pages.mjs): the trained model by default,
// the karaoke track and the isolated vocals from one separation that add back to the input, mid/side as the
// instant option, a mono file through the model, Mel-Band RoFormer offered only with WebGPU, the page at 390 px.
// Needs network: ONNX Runtime from jsDelivr, SCNet's 13 MB of weights from huggingface.co (cached after the first run).
// Run: node scripts/pages/vocal-remover.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'
import { song, wav, codesOf, N } from '../song-fixture.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' }
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

const { codes: x, wav: input } = song()

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
const page = await context.newPage(), errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/needs a stereo file/.test(m.text())) errors.push(m.text()) })   // the shell logs the mid/side refusal below

// the shell's run: done when its progress row hides or an error shows
const done = async () => {
  await page.waitForFunction(() => document.querySelector('.status.err') || document.querySelector('.panel > .row:nth-child(2)')?.hidden, null, { timeout: 300000 })
  return page.evaluate(() => ({
    err: document.querySelector('.status.err')?.textContent || null,
    report: Object.fromEntries([...document.querySelectorAll('.panel .report > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])),
    save: document.querySelector('.panel .out a')?.download,
  }))
}
const set = async (name, value) => {
  await page.evaluate(([name, value]) => { const f = document.getElementById('opts'), i = f.querySelector(`[name="${name}"]`); if (i.type === 'radio') f.querySelector(`[name="${name}"][value="${value}"]`).checked = true; else i.value = value; f.dispatchEvent(new Event('change', { bubbles: true })) }, [name, value])
  await page.waitForTimeout(100)
}
const format = async f => { await page.evaluate(f => { const s = document.querySelector('.panel select'); s.value = f; s.dispatchEvent(new Event('change')) }, f); await page.waitForTimeout(100) }
const saved = async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.click('.panel .out a')]); return codesOf(await readFile(await d.path())) }

await page.goto(`${base}/util/vocal-remover/`)
const opts = await page.evaluate(() => { const m = document.querySelector('[name=method]'); return { method: m.value, mel: m.querySelector('[value="mel-roformer"]').disabled } })
ok(opts.method === 'scnet' && opts.mel, `defaults: the trained model; Mel-Band RoFormer off without a GPU adapter ${JSON.stringify(opts)}`)

let t0 = Date.now()
await page.setInputFiles('#file', { name: 'synthetic.wav', mimeType: 'audio/wav', buffer: input })
let r = await done()
ok(!r.err && r.save === 'synthetic-karaoke.mp3', `karaoke by SCNet in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${r.save}` + (r.err ? ': ' + r.err : ''))
ok(r.report.Removed === 'the vocals' && /^SCNet\d+:\d\d on the (CPU|GPU)$/.test(r.report.Model) && r.report['Vocals SDR'] === '9.88dB', `report ${JSON.stringify(r.report)}`)

await format('wav')
r = await done()
const karaoke = await saved()
t0 = Date.now()
await set('mode', 'isolate')
r = await done()
const secs = (Date.now() - t0) / 1000
ok(!r.err && r.save === 'synthetic-vocals.wav' && secs < 5, `isolate reuses the separation: ${r.save} in ${secs.toFixed(1)} s`)
const vocals = await saved()
let d = 0
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) d = Math.max(d, Math.abs(karaoke[c][i] + vocals[c][i] - x[c][i]))
// two roundings, and @audio/decode 3.15's WAV reader divides a positive code by 32767 where the writer multiplies by 32768
ok(karaoke[0].length === N && vocals[0].length === N && d <= 2, `karaoke + vocals = the input, within ${d} code(s)`)

await set('method', 'midside')
r = await done()
ok(!r.err && r.report.Kept === 'center channel' && r.save === 'synthetic-vocals.wav', `mid/side: ${JSON.stringify(r.report).slice(0, 80)}…`)

// a mono file: the model hears it as stereo and gives mono back; mid/side has nothing to work with
await page.click('.panel .btn.ghost')
await set('method', 'scnet'); await set('mode', 'remove')
await page.setInputFiles('#file', { name: 'mono.wav', mimeType: 'audio/wav', buffer: wav([x[0]]) })
r = await done()
const mono = r.err ? null : await saved()
ok(!r.err && r.save === 'mono-karaoke.wav' && mono?.length === 1 && mono[0].length === N, `mono through the model: ${r.save}, ${mono?.length} ch` + (r.err ? ': ' + r.err : ''))
await set('method', 'midside')
r = await done()
ok(/stereo/.test(r.err || ''), `mono with mid/side says why: ${r.err}`)

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `no horizontal overflow at 390 px (${overflow})`)
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))

await browser.close()
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
