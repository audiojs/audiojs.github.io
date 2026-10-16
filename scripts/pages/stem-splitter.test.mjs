// Browser test for /util/stem-splitter/: SCNet through @audio/neural-separate, a split cancelled and run again, the
// stems and mixes saved as 16-bit WAV and checked against the input: the stems sum to it less its DC (what SCNet hands to
// no stem), every stem at 0 dB saves the input, and a muted, lowered or soloed stem moves the mix by exactly its share,
// Σ (g − 1)·stem, to the WAV's rounding. Then play and pause, and the page at 390 px.
// Needs network: ONNX Runtime from jsDelivr, SCNet's 13 MB of weights from huggingface.co (cached after the first run).
// Headless Chromium has no GPU adapter here, so the CPU path runs; GPU=1 runs Chromium with WebGPU as well.
// Run: node scripts/pages/stem-splitter.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'
import { song, codesOf, FS, N } from '../song-fixture.mjs'

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
const LSB = 1 / 32768

const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m }

const { codes: x, wav: input } = song()
const STEMS = ['vocals', 'drums', 'bass', 'other']

async function run(label, launch) {
  console.log(`\n▶ ${label}`)
  const browser = await pw.chromium.launch(launch)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const save = async sel => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(sel)]); return { name: d.suggestedFilename(), codes: codesOf(await readFile(await d.path())) } }

  await page.goto(`${base}/util/stem-splitter/`)
  await page.waitForFunction(() => document.getElementById('hint').textContent)
  const hint = await page.textContent('#hint')
  ok(/WebGPU/.test(hint), `hint: ${hint}`)
  await page.setInputFiles('#file', { name: 'synthetic.wav', mimeType: 'audio/wav', buffer: input })
  await page.waitForSelector('#plan:not([hidden])', { timeout: 30000 })
  const planText = await page.textContent('#planText')
  ok(/^SCNet: (12\.9 MB to download, once, then about|downloaded already\. About) \d+ s to \d+ s on the (GPU|CPU) for 0:06 of audio\.$/.test(planText), `plan before starting: ${planText}`)

  // cancel: the worker goes, the plan comes back, nothing arrives later
  await page.click('#start')
  await page.waitForFunction(() => /Loading|Downloading|Starting|Separating/.test(document.getElementById('status').textContent))
  await page.click('#cancel')
  await page.waitForTimeout(1500)
  const stopped = await page.evaluate(() => ({ progress: document.getElementById('progress').hidden, plan: document.getElementById('planText').textContent, mixer: document.getElementById('mixer').hidden, select: document.querySelector('[name=model]').disabled }))
  ok(stopped.progress && /^Stopped\. SCNet/.test(stopped.plan) && stopped.mixer && !stopped.select, `cancel: ${JSON.stringify(stopped)}`)

  const t0 = Date.now()
  await page.click('#start')
  await page.waitForSelector('#mixer:not([hidden]), #status.err', { timeout: 300000 })
  const err = await page.evaluate(() => document.querySelector('#status.err')?.textContent || null)
  ok(!err, `split in ${((Date.now() - t0) / 1000).toFixed(1)} s` + (err ? ': ' + err : ''))
  if (err) { await browser.close(); return }
  const report = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#report > div')].map(d => [d.querySelector('.k').textContent, d.querySelector('.v').textContent])))
  ok(report.Model === 'SCNet' && /^\d+:\d\don the (GPU|CPU)$/.test(report['Separated in']), `report: ${JSON.stringify(report)}`)
  ok(await page.$$eval('.stem', rows => rows.map(r => r.dataset.stem).join()) === STEMS.join(), 'four stems: vocals, drums, bass, other')
  ok(await page.inputValue('#fmt') === 'wav', 'saves WAV by default')

  // the stems, as saved
  const stems = {}
  for (const s of STEMS) {
    const f = await save(`.stem[data-stem="${s}"] .save`)
    stems[s] = f.codes
    ok(f.name === `synthetic-${s}.wav` && f.codes.length === 2 && f.codes[0].length === N, `${s}: ${f.name}, ${f.codes.length} ch × ${f.codes[0].length}`)
  }
  // Σ stems = the input less its DC, to the model's own consistency: the rest, the residual, is the DC and little else
  for (let c = 0; c < 2; c++) {
    let mean = 0, ac = 0, xs = 0, xm = 0
    const r = Float64Array.from(x[c], (v, i) => v - STEMS.reduce((a, s) => a + stems[s][c][i], 0))
    for (let i = 0; i < N; i++) { mean += r[i]; xm += x[c][i] }
    mean /= N; xm /= N
    for (let i = 0; i < N; i++) { ac += (r[i] - mean) ** 2; xs += (x[c][i] - xm) ** 2 }
    const db = 10 * Math.log10(ac / xs)
    ok(Math.abs(mean - 0.01 * 32768) < 0.002 * 32768 && db < -20, `channel ${c}: input − Σ stems = DC ${(mean * LSB).toFixed(4)} (put in: 0.0100) + ${db.toFixed(1)} dB of the input`)
  }

  // the mix: x + Σ (g − 1)·stem, rounded once by the encoder; each stem rounded once too: a code or two apart at most.
  // Every stem at 0 dB saves the input as the page decoded it: @audio/decode 3.15's WAV reader divides a positive code by
  // 32767 (the writer multiplies by 32768), so a code may move by one; that saved input is the reference after it
  const mix = async (want, setup) => {
    await page.evaluate(code => (0, eval)(code), setup)
    const f = await save('#saveMix')
    return { name: f.name, codes: f.codes, d: x0 ? Math.max(...f.codes.map((c, k) => maxDiff(c, Int16Array.from(x0[k], (v, i) => Math.max(-32768, Math.min(32767, Math.round(want(v, k, i)))))))) : 0 }
  }
  const press = (s, act) => `document.querySelector('.stem[data-stem="${s}"] .tog[aria-label^="${act}"]').click()`
  const level = (s, db) => `{ const r = document.querySelector('.stem[data-stem="${s}"] input'); r.value = ${db}; r.dispatchEvent(new Event('input')) }`
  let x0 = null, m = await mix(v => v, '0')
  x0 = m.codes
  const d0 = Math.max(...x0.map((c, k) => maxDiff(c, x[k])))
  ok(m.name === 'synthetic-mix.wav' && d0 <= 1, `every stem at 0 dB saves the input: ${m.name}, ${d0} code from the file's`)
  m = await mix((v, c, i) => v - stems.vocals[c][i], press('vocals', 'Mute'))
  ok(m.name === 'synthetic-vocals-off.wav' && m.d <= 2, `vocals muted = input − vocals: ${m.name}, max diff ${m.d} codes`)
  const g = 10 ** (-6 / 20)
  m = await mix((v, c, i) => v + (g - 1) * stems.drums[c][i], press('vocals', 'Mute') + ';' + level('drums', -6))
  ok(m.name === 'synthetic-drums-6dB.wav' && m.d <= 2, `drums at −6 dB = input − 0.499·drums: ${m.name}, max diff ${m.d} codes`)
  m = await mix((v, c, i) => v - stems.vocals[c][i] - stems.drums[c][i] - stems.other[c][i], level('drums', 0) + ';' + press('bass', 'Solo'))
  ok(m.name === 'synthetic-vocals-off-drums-off-other-off.wav' && m.d <= 3, `bass soloed = input − the other three: ${m.name}, max diff ${m.d} codes`)
  const silent = await page.$$eval('.stem.silent', rows => rows.map(r => r.dataset.stem).join())
  ok(silent === 'vocals,drums,other', `soloed bass greys the others: ${silent}`)

  // play, then pause: the clock moves, the button says what it does
  await page.click('#play')
  await page.waitForTimeout(800)
  const playing = await page.evaluate(() => ({ time: document.getElementById('time').textContent, btn: document.getElementById('play').textContent, head: document.querySelector('.stem .head').style.left }))
  await page.click('#play')
  const paused = await page.evaluate(() => document.getElementById('play').textContent)
  ok(playing.btn === 'Pause' && parseFloat(playing.head) > 0 && paused === 'Play', `play ${JSON.stringify(playing)}, then ${paused}`)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 0, `no horizontal overflow at 390 px (${overflow})`)
  await page.click('#reset')
  ok(await page.isVisible('#drop') && await page.isHidden('#panel'), 'another file: the drop zone is back')
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))
  await browser.close()
}

await run('chromium', {})
if (process.env.GPU) await run('chromium, WebGPU', { channel: 'chromium', args: ['--enable-unsafe-webgpu'] })
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
