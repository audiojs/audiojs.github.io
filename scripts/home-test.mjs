// Browser check for the home page and the archive. On the home: the waveform draws, the library loads and measures,
// a call turned on changes the picture, the code and the length, playback moves the playhead, .save() downloads a
// WAV that opens back in as a file, the copy button copies the chain, and a phone's width scrolls only down. The
// archived pages load whole. Needs the network: audio comes from esm.sh, as the utilities' packages do.
// Run: node scripts/home-test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  let rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(ROOT, rel)
  if (!path.startsWith(ROOT + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

let failed = 0
const check = (ok, msg) => { console.log((ok ? '  ok ' : '  FAIL ') + msg); if (!ok) failed++ }
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const open = async (path, viewport = { width: 1440, height: 900 }) => {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  const page = await context.newPage(), errors = [], missing = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => r.status() >= 400 && r.url().startsWith(base) && missing.push(r.url()))
  await page.goto(base + path)
  return { page, errors, missing, context }
}
// the canvas's pixels, as one string to compare
const pixels = page => page.$eval('#wave', c => c.toDataURL())
const cap = (page, key) => page.$eval(`[data-cap=${key}]`, e => e.textContent)
const settled = page => page.waitForFunction(() => document.querySelector('#scope').getAttribute('aria-busy') === 'false' && /\d LUFS/.test(document.querySelector('[data-cap=lufs]').textContent), null, { timeout: 30000 })

try {
  console.log('/')
  {
    const { page, errors, missing, context } = await open('/')
    await settled(page)
    check(/^\d+$/.test(await page.$eval('[data-stat=plugins]', e => e.textContent)), 'the plugin count comes from the library')
    const lit = await page.$eval('#wave', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 100; return n / (d.length / 4) })
    check(lit > .02, `the waveform draws (${(lit * 100).toFixed(1)}% of pixels lit)`)

    const before = await pixels(page), length = parseFloat(await cap(page, 'time'))
    await page.click('[data-call=stretch]')
    await page.waitForFunction(was => parseFloat(document.querySelector('[data-cap=time]').textContent) !== was, length, { timeout: 30000 })
    await page.waitForTimeout(700)
    const stretched = parseFloat(await cap(page, 'time'))
    check(Math.abs(stretched / length - 1.5) < .01, `.stretch(1.5) makes ${length} s into ${stretched} s`)
    check(await pixels(page) !== before, 'and the picture changes')
    check(await page.$eval('[data-call=stretch]', b => b.getAttribute('aria-pressed')) === 'true', 'its call shows pressed')

    await page.click('#copy')
    const code = await page.evaluate(() => navigator.clipboard.readText())
    check(code === "await audio('chime.wav')\n  .trim()\n  .stretch(1.5)\n  .normalize(-1)\n  .save('out.wav')", 'Copy copies the chain as code')

    await page.click('#play')
    await page.waitForTimeout(600)
    const x = await page.$eval('#head', e => +e.style.getPropertyValue('--x'))
    check(x > 0 && await page.$eval('#play', b => b.getAttribute('aria-pressed')) === 'true', `playing moves the playhead (to ${(x * 100).toFixed(1)}%)`)
    await page.click('#play')
    check(await page.$eval('#play', b => b.getAttribute('aria-pressed')) === 'false', 'and pauses')

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')])
    const path = await download.path(), wav = await readFile(path)
    check(download.suggestedFilename() === 'out.wav' && wav.subarray(0, 4).toString() === 'RIFF' && wav.length > 44, `.save('out.wav') downloads a WAV (${wav.length} bytes)`)
    await page.setInputFiles('#file', { name: 'take.wav', mimeType: 'audio/wav', buffer: wav })
    await page.waitForFunction(() => document.querySelector('[data-cap=name]').textContent === 'take', null, { timeout: 30000 })
    await settled(page)
    check(await page.$eval('#src', e => e.textContent) === "'take.wav'", 'a file opened becomes the source, in the code too')

    await page.click('[data-sound=handpan]')
    await page.waitForFunction(() => document.querySelector('[data-cap=name]').textContent === 'handpan')
    await settled(page)
    check(await page.$eval('[data-sound=handpan]', b => b.getAttribute('aria-pressed')) === 'true', 'a sound picked is the source')

    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
    check(!missing.length, 'nothing missing' + (missing.length ? ': ' + missing.join(' ') : ''))
    await context.close()
  }
  console.log('/ at 390 px')
  {
    const { page, context } = await open('/', { width: 390, height: 844 })
    await settled(page)
    const { scroll, width, nav } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, nav: Math.max(...[...document.querySelectorAll('.top nav a')].map(a => a.getBoundingClientRect().right)) }))
    check(scroll === width, `no sideways scroll (${scroll} px in ${width})`)
    check(nav <= width, 'the whole menu in sight')
    await context.close()
  }
  for (const path of ['/archive/2026/', '/archive/2026/audio/']) {
    console.log(path)
    const { page, errors, missing, context } = await open(path)
    await page.waitForLoadState('networkidle')
    check(await page.$('.archive-note') !== null, 'says it is the archive')
    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
    check(!missing.length, 'nothing missing' + (missing.length ? ': ' + missing.join(' ') : ''))
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n# home ${failed ? 'failed ' + failed : 'ok'}`)
process.exit(failed ? 1 : 0)
