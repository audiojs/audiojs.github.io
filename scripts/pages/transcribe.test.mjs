// Browser test for /util/transcribe/ — Whisper speech-to-text via @audio/neural-asr + @audio/subtitle.
// Fixture: scripts/fixtures/speech.wav — macOS `say -v Samantha "The quick brown fox jumps over the lazy dog"`,
// resampled to 16 kHz mono with ffmpeg. Needs network: the page loads the vendored ASR bundle, which pulls
// @huggingface/transformers from esm.sh and the Whisper "base" weights from huggingface.co on first run.
// Run: node scripts/pages/transcribe.test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const FIXTURE = join(ROOT, 'scripts/fixtures/speech.wav')
const WORDS = ['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog']

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

// WAV duration: walk chunks (ffmpeg wrote a LIST/INFO chunk before data, so 'data' isn't at a fixed offset)
function wavDuration(buf) {
  let pos = 12, fmt = null, dataSize = 0
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4)
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) }
    if (id === 'data') dataSize = size
    pos += 8 + size + (size % 2)
  }
  return dataSize / (fmt.channels * (fmt.bits / 8) * fmt.rate)
}
const duration = wavDuration(await readFile(FIXTURE))

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(ROOT, rel)
  if (!path.startsWith(ROOT + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

let failed = 0
const check = (ok, msg) => { console.log((ok ? '  ok ' : '  FAIL ') + msg); if (!ok) failed++ }

try {
  await page.goto(base + '/util/transcribe/')
  await page.setInputFiles('#file', FIXTURE)

  const t0 = Date.now()
  // first run downloads the Whisper "base" weights (~77 MB) from huggingface.co: generous timeout
  await page.waitForSelector('.panel .files:not([hidden]) a, .panel .status.err', { timeout: 300000 })
  const elapsed = (Date.now() - t0) / 1000
  console.log(`  · transcription took ${elapsed.toFixed(1)}s (cold: includes the model download)`)

  const errText = await page.evaluate(() => document.querySelector('.status.err')?.textContent || null)
  check(!errText, 'no error status' + (errText ? ` — ${errText}` : ''))

  const report = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.panel .report > div')].map(d => [d.querySelector('.k')?.textContent, d.querySelector('.v')?.textContent])))
  check(report.Language === 'English', `Language: ${report.Language} (Auto defaults to English)`)
  check(/^\d+$/.test(report.Words) && +report.Words >= 4, `Words: ${report.Words}`)
  check(/^\d/.test(report['Duration processed'] || ''), `Duration processed: ${report['Duration processed']}`)
  check(/\d\.\ds$/.test(report.Model || ''), `Model + time: ${report.Model}`)

  const files = await page.evaluate(() => [...document.querySelectorAll('.panel .files a')].map(a => ({ name: a.download, href: a.href })))
  check(files.length === 3 && files.some(f => /\.txt$/.test(f.name)) && files.some(f => /\.srt$/.test(f.name)) && files.some(f => /\.vtt$/.test(f.name)), `files: ${files.map(f => f.name).join(', ')}`)
  // blob: URLs only resolve inside the page that created them — fetch from the browser context, not Node
  const fetchBlob = href => page.evaluate(async (href) => (await fetch(href)).text(), href)

  const txt = await fetchBlob(files.find(f => f.name.endsWith('.txt')).href)
  const hit = WORDS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(txt))
  check(hit.length >= 4, `transcript contains ${hit.length}/${WORDS.length} expected words (${hit.join(', ')}) — got ${JSON.stringify(txt)}`)

  const srtText = await fetchBlob(files.find(f => f.name.endsWith('.srt')).href)
  const times = [...srtText.matchAll(/(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)/g)]
    .map(m => ({ start: (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000, end: (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000 }))
  check(times.length >= 1, `srt: ${times.length} cue(s) parsed`)
  const monotonic = times.every((t, i) => t.end >= t.start && (i === 0 || t.start >= times[i - 1].start) && t.start >= 0 && t.end <= duration + 0.5)
  check(monotonic, `srt: cue times monotonic within [0, ${(duration + 0.5).toFixed(2)}]s — ${JSON.stringify(times)}`)

  const vttText = await fetchBlob(files.find(f => f.name.endsWith('.vtt')).href)
  check(vttText.startsWith('WEBVTT'), `vtt starts with WEBVTT — got ${JSON.stringify(vttText.slice(0, 20))}`)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(overflow <= 0, `no horizontal overflow at 390px (${overflow})`)

  check(errors.length === 0, `no page errors` + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''))
} finally {
  await browser.close()
  server.close()
}

console.log(`\n# ${failed ? 'FAIL' : 'pass'} (${failed} failed)`)
process.exit(failed ? 1 : 0)
