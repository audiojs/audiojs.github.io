// Browser regression test for the util shell: container tags must survive decode → encode.
// Serves the site root, opens /util/convert-audio/, uploads a tagged M4A, and checks the
// saved MP3 / FLAC / OGG / Opus / WAV carry title, artist and cover art.
// Run: npm i -D playwright && node scripts/util-test.mjs   (needs network: pages load @audio/* from esm.sh)
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const FIXTURE = join(ROOT, 'scripts/fixtures/tagged.m4a')   // title "Lena Sine", artist "audiojs", 1 PNG cover
const EXPECT = { title: 'Lena Sine', artist: 'audiojs' }
const FORMATS = ['mp3', 'flac', 'ogg', 'opus', 'wav']

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.m4a': 'audio/mp4' }
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
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let failed = 0
const check = (ok, msg) => { console.log((ok ? '  ok ' : '  FAIL ') + msg); if (!ok) failed++ }

try {
  await page.goto(base + '/util/convert-audio/')
  await page.setInputFiles('#file', FIXTURE)
  await page.waitForSelector('.out:not([hidden]) a.btn[href^="blob:"]', { timeout: 60000 })
  check((await page.textContent('#panel .m')).includes('Lena Sine — audiojs'), 'file line shows title — artist')

  for (const fmt of FORMATS) {
    const before = await page.getAttribute('.out a.btn', 'href')
    await page.selectOption('.out select', fmt)
    await page.waitForFunction(b => { const a = document.querySelector('.out a.btn'); return a && a.href !== b && !a.closest('.out').hidden }, before, { timeout: 60000 })
    // parse the saved bytes with the same tag parsers the page decodes with
    const r = await page.evaluate(async fmt => {
      const bytes = new Uint8Array(await (await fetch(document.querySelector('.out a.btn').href)).arrayBuffer())
      const p = await import('https://esm.sh/@audio/decode@3.14.0/meta')
      const parse = { mp3: p.mp3, flac: p.flac, ogg: p.oga, opus: p.opus, wav: p.wav }[fmt]
      const m = parse?.(bytes)?.meta
      return { size: bytes.length, title: m?.title, artist: m?.artist, pictures: m?.pictures?.length ?? 0, parser: !!parse }
    }, fmt)
    check(r.parser && r.title === EXPECT.title && r.artist === EXPECT.artist, `${fmt}: title/artist kept (${r.title} / ${r.artist}, ${r.size} B)`)
    if (fmt === 'mp3' || fmt === 'flac') check(r.pictures === 1, `${fmt}: cover art kept (${r.pictures})`)
  }
  // untagged source → encoders get no `meta`, nothing invented, output still produced
  await page.click('#panel button.ghost')
  await page.setInputFiles('#file', join(ROOT, 'scripts/fixtures/plain.wav'))
  await page.waitForSelector('.out:not([hidden]) a.btn[href^="blob:"]', { timeout: 60000 })
  check(!(await page.textContent('#panel .m')).includes(' — '), 'untagged file line has no title')
  const prev = await page.getAttribute('.out a.btn', 'href')
  await page.selectOption('.out select', 'mp3')
  await page.waitForFunction(b => { const a = document.querySelector('.out a.btn'); return a && a.href !== b && !a.closest('.out').hidden }, prev, { timeout: 60000 })
  const plain = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await fetch(document.querySelector('.out a.btn').href)).arrayBuffer())
    const m = (await import('https://esm.sh/@audio/decode@3.14.0/meta')).mp3(bytes)?.meta
    return { size: bytes.length, title: m?.title ?? null }
  })
  check(plain.size > 1000 && plain.title === null, `untagged wav → mp3 without tags (${plain.size} B)`)
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
} finally {
  await browser.close()
  server.close()
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
