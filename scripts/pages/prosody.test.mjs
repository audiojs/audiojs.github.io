import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav' }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), path = resolve(root, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''))
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return }
  try { const bytes = await readFile(path); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(bytes) }
  catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

try {
  for (const engine of (process.argv.length > 2 ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit'])) {
    const browser = await pw[engine].launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, reducedMotion: 'reduce' })
      // WAV + the complete edit/export path must work with all external requests blocked.
      await page.route('**/*', route => [base, 'blob:' + base].some(prefix => route.request().url().startsWith(prefix)) ? route.continue() : route.abort())
      const errors = []; page.on('pageerror', e => errors.push(e.message))
      await page.goto(base + '/util/prosody/')
      assert.equal(await page.locator('#editor').isVisible(), false)
      await page.click('#demo')
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'))
      const before = await page.locator('.target').getAttribute('d')
      assert.ok(before.length > 300, 'speech sample has a pitch contour')
      await page.screenshot({ path: `/tmp/audiojs-prosody-${engine}-desktop.png`, fullPage: true })
      await page.fill('#start', '0.5'); await page.fill('#end', '2'); await page.locator('#end').blur()
      await page.click('#flatten')
      assert.notEqual(await page.locator('.target').getAttribute('d'), before)
      assert.equal(await page.locator('#save').getAttribute('href'), null, 'edits invalidate stale export')
      assert.equal(await page.locator('#edited').getAttribute('src'), null, 'edits invalidate stale preview')
      await page.click('#undo')
      assert.equal(await page.locator('.target').getAttribute('d'), before, 'undo restores original curve')
      await page.fill('#semitones', '3'); await page.click('#shift')
      await page.fill('#duration', '2'); await page.click('#retime')
      assert.match(await page.locator('#length').textContent(), /6\.18 s original → 6\.68 s edited/)
      await page.click('#render')
      await page.waitForFunction(() => document.querySelector('#render-state').textContent.startsWith('Rendered'))
      const output = await page.evaluate(async () => {
        const bytes = await (await fetch(document.querySelector('#save').href)).arrayBuffer(), d = new DataView(bytes)
        return { rate: d.getUint32(24, true), channels: d.getUint16(22, true), seconds: (bytes.byteLength - 44) / 4 / d.getUint32(24, true), name: document.querySelector('#save').download }
      })
      assert.equal(output.rate, 22050); assert.equal(output.channels, 1); assert.ok(Math.abs(output.seconds - 6.678866) < .001)
      assert.equal(output.name, 'speech-sample-prosody.wav')
      await page.evaluate(async () => { await document.querySelector('#edited').play() })
      await page.waitForFunction(() => document.querySelector('#edited').currentTime > .05)
      await page.evaluate(async () => { await document.querySelector('#original').play() })
      assert.equal(await page.locator('#edited').evaluate(e => e.paused), true, 'A/B never plays both together')
      await page.locator('#original').evaluate(e => e.pause())

      // Same point can be edited using the keyboard, numeric field or pointer drag.
      await page.locator('#curve').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp')
      assert.ok(await page.locator('#point-hz').isEnabled())
      const hz = +(await page.locator('#point-hz').inputValue())
      await page.fill('#point-hz', String(hz + 8)); await page.click('#set-point')
      assert.ok(Math.abs(+(await page.locator('#point-hz').inputValue()) - hz - 8) < .2)
      await page.locator('#curve').scrollIntoViewIfNeeded()
      const circle = await page.locator('.point').boundingBox()
      await page.mouse.move(circle.x + circle.width / 2, circle.y + circle.height / 2)
      await page.mouse.down(); await page.mouse.move(circle.x + circle.width / 2, circle.y - 15, { steps: 5 }); await page.mouse.up()
      assert.ok(+(await page.locator('#point-hz').inputValue()) > hz + 8)
      await page.fill('#duration', '100'); await page.click('#retime')
      assert.match(await page.locator('#status').textContent(), /half and twice/)
      await page.locator('#curve').scrollIntoViewIfNeeded()
      const chart = await page.locator('#curve').boundingBox()
      await page.mouse.move(chart.x + 100, chart.y + 20)
      await page.mouse.down(); await page.mouse.move(chart.x + 260, chart.y + 20, { steps: 5 }); await page.mouse.up()
      assert.ok(+(await page.locator('#end').inputValue()) > +(await page.locator('#start').inputValue()) + .5, 'background drag selects source time')
      await page.click('#reset'); await page.click('#render')
      await page.waitForFunction(() => document.querySelector('#render-state').textContent.startsWith('Rendered'))
      assert.equal(await page.locator('.target').getAttribute('d'), before)
      assert.match(await page.locator('#length').textContent(), /6\.18 s original → 6\.18 s edited/)

      // Pointer selection and zoom remain usable on small screens.
      for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
        await page.setViewportSize(viewport)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      }
      await page.setViewportSize({ width: 375, height: 812 })
      await page.fill('#start', '1'); await page.fill('#end', '2'); await page.click('#zoom')
      assert.match(await page.locator('#curve').textContent(), /1.00 s/)
      await page.screenshot({ path: `/tmp/audiojs-prosody-${engine}-mobile.png`, fullPage: true })
      await page.click('#zoom-out')

      // Change file cancels any outstanding render and clears all editing state.
      await page.click('#rise')
      await page.evaluate(() => { document.querySelector('#render').click(); document.querySelector('#replace').click() })
      assert.equal(await page.locator('#editor').isVisible(), false)
      assert.equal(await page.locator('#save').getAttribute('href'), null)
      await page.click('#demo')
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'))
      assert.match(await page.locator('#render-state').textContent(), /no edits/)
      assert.equal(await page.locator('#undo').isEnabled(), false)

      const upload = async (kind, seconds = 1) => {
        const bytes = await page.evaluate(async ({ kind, seconds }) => {
          const { encode } = await import('/util/prosody/process.js')
          const samples = new Float32Array(Math.round(16000 * seconds))
          if (kind === 'tone') for (let i = 0; i < samples.length; i++) samples[i] = .3 * Math.sin(2 * Math.PI * 260 * i / 16000)
          return [...await encode(samples, 16000)]
        }, { kind, seconds })
        await page.setInputFiles('#file', { name: `${kind}.wav`, mimeType: 'audio/wav', buffer: Buffer.from(bytes) })
      }
      await upload('silence')
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('No reliable'))
      assert.equal(await page.locator('.target').getAttribute('d'), '')
      await page.click('#rise'); assert.match(await page.locator('#status').textContent(), /No voiced/)
      await page.fill('#duration', '1.5'); await page.click('#retime'); await page.click('#render')
      await page.waitForFunction(() => document.querySelector('#render-state').textContent.startsWith('Rendered'))
      await upload('tone')
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'))
      assert.notEqual(await page.locator('.target').getAttribute('d'), before, 'different file has independent analysis')
      await upload('silence', .02)
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('No reliable'))
      await upload('silence', 0)
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('no decodable audio'))
      assert.equal(await page.locator('#editor').isVisible(), false)
      assert.equal(await page.locator('#drop').isVisible(), true)
      assert.deepEqual(errors, [])
      console.log(`✓ ${engine}: sample, rules, duration, export, A/B, undo/reset, keyboard/pointer, mobile, replacement, silence, short/empty input; no external services`)
    } finally { await browser.close() }
  }
} finally { server.close() }
