// Browser check for the lab: every figure on a lab page draws, in light and dark, without a page error.
// Serves the site root, opens each page, scrolls every figure into view, and checks each figure shows a picture
// (every visible canvas more than one flat colour) and that each of its controls redraws it. Run: node scripts/lab-test.mjs
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const PAGES = ['/lab/', '/lab/words-under-the-waveform/', '/lab/waveform/', '/lab/spectrogram/', '/lab/scrub/']

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg' }
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
// a figure shows a picture: some part of its plate besides controls and readouts is drawn (24 px tall or more),
// and every visible canvas holds more than one colour. A canvas is read through a copy, so the check claims
// no context on it (a 2D one would lock out WebGL) and reads WebGL canvases too.
const shows = figure => {
  const drawn = canvas => {
    const { width: w, height: h } = canvas
    if (!w || !h) return false
    const copy = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = copy.getContext('2d', { willReadFrequently: true })
    g.drawImage(canvas, 0, 0)
    const d = g.getImageData(0, 0, w, h).data
    for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) return true
    return false
  }
  const plate = figure.querySelector('.plate') ?? figure
  return [...plate.querySelectorAll('canvas')].filter(c => c.getClientRects().length).every(drawn)
    && [...plate.children].some(e => !e.matches('.controls, .readout') && e.getBoundingClientRect().height >= 24)
}
// what a figure shows, to tell that a control redrew it: its markup besides controls and readouts, and its pixels
const picture = figure => {
  const plate = figure.querySelector('.plate') ?? figure
  return [...plate.children].filter(e => !e.matches('.controls, .readout')).map(e => e.outerHTML).join('') + [...plate.querySelectorAll('canvas')].map(c => c.toDataURL()).join('')
}

const browser = await chromium.launch()
try {
  for (const scheme of ['light', 'dark']) for (const path of PAGES) {
    console.log(`${path} (${scheme})`)
    const page = await browser.newPage({ colorScheme: scheme }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    // the fonts come from Google: not needed to draw
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    const figures = await page.$$eval('figure[id]', fs => fs.map(f => f.id))
    for (const id of figures) {
      await page.$eval('#' + id, f => f.scrollIntoView({ block: 'center' }))
      const ok = await page.waitForFunction(([id, shows]) => new Function('return ' + shows)()(document.getElementById(id)), [id, shows.toString()], { timeout: 10000 }).then(() => true, () => false)
      check(ok, `#${id} draws`)
      // each control group redraws the figure: its first button not pressed
      for (const name of await page.$$eval(`#${id} [data-name]`, gs => gs.map(g => g.dataset.name))) {
        const button = await page.$(`#${id} [data-name="${name}"] button[aria-pressed="false"]`)
        if (!button) continue
        const before = await page.$eval('#' + id, picture)
        await button.click()
        const changed = await page.waitForFunction(([id, before, picture, shows]) => { const f = document.getElementById(id), fn = src => new Function('return ' + src)(); return fn(picture)(f) !== before && fn(shows)(f) }, [id, before, picture.toString(), shows.toString()], { timeout: 10000 }).then(() => true, () => false)
        check(changed, `#${id} redraws on ${name}`)
      }
    }
    check(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n# lab ${failed ? 'failed ' + failed : 'ok'}`)
process.exit(failed ? 1 : 0)
