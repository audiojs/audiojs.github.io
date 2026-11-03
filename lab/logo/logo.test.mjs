// The logo's lab in a browser: node --test lab/logo/logo.test.mjs. The logo is audiojs/audio's logo/logo.js and
// motion.js, served at /audio/ as npm run dev serves it (scripts/serve.mjs): from the checkout beside this one, else the live
// site's. Each test opens the lab afresh; a page error or a request off the site fails it.
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { site } from '../../scripts/serve.mjs'

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

// The window the tests were tuned on (audiojs/audio's own lab page, 800 × 760) with the site bar's 96 px added, so the
// stage under the bar, which the mark's size and its hover ellipse follow, stays as tall as it was
const VIEW = { width: 800, height: 760 + 96 }

let server, base, browser, page, errors
before(async () => {
  server = createServer(site)
  await new Promise(r => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
})
after(async () => { await browser?.close(); server?.close() })
beforeEach(async () => {
  page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : (errors.push(`External request: ${route.request().url()}`), route.abort()))
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
})
afterEach(async () => { await page?.close(); assert.deepEqual(errors, []) })

// A canvas as gray levels, one byte a pixel: the logo's tones are neutral, so red carries the whole image
async function logoShot(canvas = page.locator('.stage canvas')) {
  const png = (await canvas.screenshot()).toString('base64')
  const { w, h, gray } = await page.evaluate(async png => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + png
    await image.decode()
    const context = new OffscreenCanvas(image.width, image.height).getContext('2d')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, image.width, image.height).data
    let gray = ''
    for (let i = 0; i < rgba.length; i += 4) gray += String.fromCharCode(rgba[i])
    return { w: image.width, h: image.height, gray }
  }, png)
  return { w, h, gray, at: (x, y) => gray.charCodeAt(y * w + x), lit: gray.split('').some(pixel => pixel.charCodeAt(0) > 200) }
}
async function logoStill() {
  let last = await logoShot()
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100)
    const next = await logoShot()
    if (next.gray === last.gray) return next
    last = next
  }
  assert.fail('the logo never came to rest')
}
// How far a drawing is from landing on itself after half a turn about its centre, in gray levels a pixel: the logo is odd
function asymmetry({ w, h, at }) {
  let off = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) off += Math.abs(at(x, y) - at(w - 1 - x, h - 1 - y))
  return off / (w * h)
}

test('logo: a signal through a window, filled by half a window as its gradient, turned by hand or moving, printed in two tones', async () => {
  // Reduced motion opens it at rest
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(VIEW)
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  assert.equal(await page.locator('#fail').isVisible(), false)
  // The control band is lit from above: its light a radial mask, which a browser drops whole if it can't parse it
  assert.match(await page.locator('.bar').evaluate(bar => getComputedStyle(bar, '::before').maskImage), /^radial-gradient/)
  // No hover, so a pointer over the drawing changes nothing
  const pick = (name, value) => page.selectOption(`select[name="${name}"]`, value)
  await pick('hover', 'none')
  const offered = name => page.locator(`select[name="${name}"] option`).evaluateAll(options => options.map(option => option.value))
  // The waveform and the gradient offer the same windows, the whole collection, rectangular first
  const windows = await offered('window')
  assert.deepEqual(await offered('gradient'), windows)
  assert(windows.length === 34 && windows[0] === 'rectangular' && ['bartlett', 'hann', 'dolphChebyshev'].every(name => windows.includes(name)), windows.join())
  // Every print style is drawn in its picker by the shader, and the tab's icon is the waveform
  const prints = await offered('print')
  assert.equal(await page.locator('select[name="print"] option .mask[style*="data:image/png"]').count(), prints.length)
  assert.match(await page.locator('link[rel=icon]').getAttribute('href'), /^data:image\/png/)

  await pick('print', 'smooth')
  const rest = await logoStill(), { w, h } = rest, axis = h >> 1, ground = rest.at(0, 0)
  // The lit pixels up a column from the axis
  const column = (shot, x) => {
    const lit = []
    for (let y = axis - 1; y >= 0 && shot.at(x, y) > ground + 8; y--) lit.push(shot.at(x, y))
    return lit
  }
  // At rest a sine cycle through Hann is the logo, odd: half a turn about the centre lands it on itself
  assert(asymmetry(rest) < 1, `the rest pose differs from its half turn by ${asymmetry(rest)} a pixel`)
  // Half of Bartlett is a straight fall: up the tallest column paper fades to ink, never brightening
  let peak = 0
  for (let x = 0; x < w / 2; x++) if (column(rest, x).length > column(rest, peak).length) peak = x
  const fall = column(rest, peak)
  assert(fall.length > h / 4 && fall[0] > 200 && fall.at(-1) < ground + 40, JSON.stringify([fall.length, fall[0], fall.at(-1)]))
  assert(fall.every((v, n) => !n || v <= fall[n - 1] + 1), 'the tone never brightens toward the edge')
  // Rectangular has no fall, so as a gradient it fills flat
  await pick('gradient', 'rectangular')
  const flat = column(await logoStill(), peak)
  assert(flat[0] > 200 && flat.slice(0, -2).every(v => Math.abs(v - flat[0]) <= 1), JSON.stringify(flat))
  await pick('gradient', 'bartlett')
  await logoStill()

  // A drag turns the phase by hand; brought back, it lands on the rest pose again
  const box = await page.locator('.stage canvas').boundingBox(), y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, y, { steps: 6 })
  assert(asymmetry(await logoStill()) > 5, 'a drag turns the signal under its window')
  await page.mouse.move(box.x + box.width / 2 + 1, y, { steps: 6 })
  await page.mouse.up()
  assert(asymmetry(await logoStill()) < 1, 'back near where it started, the drag lands on the rest pose')
  // At speed it moves on its own
  await page.locator('#speed').fill('0.5')
  const moving = await logoShot()
  await page.waitForTimeout(150)
  assert.notEqual((await logoShot()).gray, moving.gray, 'the signal moves at speed')
  await page.locator('#speed').fill('0')

  for (const mode of ['bayer2', 'bayer4', 'bayer8', 'blue', 'white', 'floyd', 'atkinson']) {
    await pick('print', mode)
    await logoStill()
    assert.equal(new Set((await logoShot()).gray).size, 2, `${mode} dithers to ink and paper only`)
  }
  // Engravings print paper inside the shape and leave the ground bare
  for (const mode of ['halftone', 'lines', 'spikes', 'bars', 'contours', 'traces', 'mesh', 'guilloche', 'stipple']) {
    await pick('print', mode)
    const { lit, at } = await logoStill()
    assert(lit && at(0, 0) === ground && at(w - 1, h - 1) === ground, mode)
  }
  // Gap is the space between lines: closer, more of them print. Traces are the mesh without its columns.
  const paper = ({ gray }) => gray.split('').filter(pixel => pixel.charCodeAt(0) > 128).length
  await pick('print', 'traces')
  await page.locator('#gap').fill('2')
  const close = paper(await logoStill())
  await page.locator('#gap').fill('16')
  const apart = paper(await logoStill())
  await pick('print', 'mesh')
  const mesh = paper(await logoStill())
  assert(close > apart && mesh > apart, JSON.stringify({ close, apart, mesh }))
  // Bars stand a size wide and a gap apart: along the row above the axis, lit runs and dark gaps alternate at those widths
  await pick('print', 'bars')
  await page.locator('#size').fill('4')
  await page.locator('#gap').fill('4')
  const bars = await logoStill(), runs = { true: [], false: [] }
  for (let x = 1, run = 1; x < w; x++, run++) {
    const lit = bars.at(x, axis - 2) > ground + 40
    if (lit !== bars.at(x - 1, axis - 2) > ground + 40) runs[!lit].push(run), run = 0
  }
  const [widths, gaps] = [runs.true, runs.false.slice(1, -1)]
  assert(widths.length > 8 && [...widths, ...gaps].every(run => run >= 3 && run <= 5), JSON.stringify({ widths, gaps }))
  await page.locator('#size').fill('2')
  await pick('print', 'bayer4')
  assert(await page.locator('#gap').isDisabled(), 'dithers have no gap')

  // Haar, a square cycle through a rectangular window, is the gradient rectangle itself: every column alike
  await pick('print', 'smooth')
  await pick('signal', 'square')
  await pick('window', 'rectangular')
  const haar = await logoStill()
  const inside = [...Array(w >> 1).keys()].filter(x => haar.at(x, axis - 2) > ground + 8)
  const l = inside[0], r = inside.at(-1), a = Math.round(l + (r - l) / 4), b = Math.round(l + (r - l) * 3 / 4)
  for (let y = 0; y < axis; y++) assert(Math.abs(haar.at(a, y) - haar.at(b, y)) <= 1, `row ${y}: ${haar.at(a, y)} ≠ ${haar.at(b, y)}`)
})

test('logo motion: at rest it is the logo; near its middle it stirs; flung it spins on and settles; a tap or Space gives the next signal; a lift can stretch it', async () => {
  // Reduced motion gives it no speed of its own
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(VIEW)
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  await page.selectOption('#print', 'smooth')
  const canvas = page.locator('.stage canvas'), box = await canvas.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
  const away = () => page.mouse.move(x, box.y + box.height + 30)
  const apart = (a, b) => { let sum = 0; for (let i = 0; i < a.gray.length; i++) sum += Math.abs(a.gray.charCodeAt(i) - b.gray.charCodeAt(i)); return sum / a.gray.length }
  const top = shot => { for (let row = 0; row < shot.h; row++) for (let col = 0; col < shot.w; col++) if (shot.at(col, row) > 60) return row }

  const rest = await logoStill()
  assert(asymmetry(rest) < 1, 'at rest it is the logo')
  assert.equal(await page.locator('#sound').inputValue(), 'none', 'silent until asked')
  // Hover counts near its middle only: at the stage's edge it rests; over its centre it stirs
  await page.mouse.move(box.x + 30, y)
  assert(apart(rest, await logoStill()) < .05, 'at the edge of the stage it rests')
  await page.mouse.move(x, y)
  await page.waitForTimeout(600)
  assert(apart(rest, await logoShot()) > .5, 'near its middle, it stirs')
  // Flung mid-drag, it spins on; left alone, it settles into the logo again
  await page.mouse.down()
  await page.mouse.move(x + 90, y, { steps: 3 })
  await page.mouse.up()
  const early = await logoShot()
  await page.waitForTimeout(150)
  assert(apart(early, await logoShot()) > .5, 'flung, it spins on')
  await away()
  assert(asymmetry(await logoStill()) < 1, 'it settles into the logo')

  // A tap, a press that never moves, gives the next signal, and the picker follows; so does Space
  const sine = await logoStill()
  await canvas.click()
  await away()
  const triangle = await logoStill()
  assert(apart(sine, triangle) > .5 && await page.locator('#signal').inputValue() === 'triangle', 'a tap changes the signal')
  await canvas.focus()
  await page.keyboard.press('Space')
  await canvas.blur()
  assert(apart(triangle, await logoStill()) > .5 && await page.locator('#signal').inputValue() === 'square', 'Space changes it too')

  // Lifting does nothing by default; set to amplitude, a drag upward pulls it taller at once
  const lifted = async () => {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 80, { steps: 8 })
    await page.waitForTimeout(300)
    const shot = await logoShot()
    await page.mouse.up()
    await away()
    return shot
  }
  const still = await logoStill(), plain = await lifted()
  await logoStill()
  await page.selectOption('#lift', 'amplitude')
  const tall = await lifted()
  assert(top(tall) < top(plain) - 10 && Math.abs(top(plain) - top(still)) < 30, JSON.stringify({ still: top(still), plain: top(plain), tall: top(tall) }))

  // A tick for each peak through the middle, crest and trough: two a turn, none at the rest turn itself
  assert.deepEqual(await page.evaluate(async () => { const { peak } = await import('/audio/logo/motion.js'); return [-.26, 0, .24, .26, .74, .76, 1, 1.26].map(peak) }), [-2, -1, -1, 0, 0, 1, 1, 2])
  // Both sounds play under the hand
  for (const sound of ['tone', 'ticks']) {
    await page.selectOption('#sound', sound)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y, { steps: 4 })
    await page.mouse.up()
    await away()
  }
  await logoStill()
})

test('logo: the zero axis runs across the window under a silent wave, thin, taking as much of the ink as it is given', async () => {
  const rows = await page.evaluate(async () => {
    const { logo } = await import('/audio/logo/logo.js'), canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'fixed', left: 0, top: 0, width: '96px', height: '40px' })
    document.body.append(canvas)
    const view = logo(canvas, { clear: true, fit: 'width' })
    await new Promise(r => setTimeout(r, 100))
    const shot = () => {
      view.render()
      const c = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')
      c.drawImage(canvas, 0, 0)
      const d = c.getImageData(0, 0, canvas.width, canvas.height).data, w = canvas.width, h = canvas.height
      const at = (x, y) => d[(y * w + x) * 4 + 3]
      return { across: [.1, .5, .9].map(f => at(Math.round(w * f), h >> 1)), above: [.5, 1.5].map(dy => at(w >> 1, Math.round(h / 2 + dy * canvas.width / 96 * 6))) }
    }
    view.set({ figure: '#000', amplitude: 0, axis: 0 })
    const none = shot()
    view.set({ axis: 1 })
    const full = shot()
    view.set({ axis: .5 })
    const faint = shot()
    canvas.remove()
    return { none, full, faint }
  })
  assert.deepEqual(rows.none.across, [0, 0, 0], 'no axis unless asked')
  assert(rows.full.across.every(a => a > 200), `the axis crosses the window: ${rows.full.across}`)
  assert(rows.faint.across.every(a => a > 90 && a < 160), `half the ink is faint: ${rows.faint.across}`)
  assert(rows.full.above.every(a => a === 0), `and is thin: ${rows.full.above}`)
})

test('logo motion: a mimic copies the pointer\'s sideways moves near its middle, and catches in the logo pose when the pointer leaves', async () => {
  await page.setViewportSize(VIEW)
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  await page.selectOption('#print', 'smooth')
  await page.selectOption('#hover', 'mimic')
  await page.locator('#speed').fill('0')
  const canvas = page.locator('.stage canvas'), box = await canvas.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
  const apart = (a, b) => { let sum = 0; for (let i = 0; i < a.gray.length; i++) sum += Math.abs(a.gray.charCodeAt(i) - b.gray.charCodeAt(i)); return sum / a.gray.length }
  const rest = await logoStill()
  assert(asymmetry(rest) < 1, 'at rest it is the logo')
  await page.mouse.move(x, y)
  await page.waitForTimeout(500)
  assert(apart(rest, await logoShot()) < .05, 'hovering alone leaves it as it is')
  // across, it turns with the pointer; back to where it was, it is as it was
  await page.mouse.move(x + 60, y, { steps: 8 })
  await page.waitForTimeout(500)
  assert(apart(rest, await logoShot()) > 1, 'moved across, it turns with the pointer')
  await page.mouse.move(x, y, { steps: 8 })
  await page.waitForTimeout(500)
  assert(apart(rest, await logoShot()) < .05, 'and back, it is as it was')
  // the pointer leaving, in the middle of a move, catches it in a pose
  await page.mouse.move(x + 45, y, { steps: 6 })
  await page.mouse.move(box.x + 10, box.y + box.height - 10)
  assert(asymmetry(await logoStill()) < 1, 'gone, it is the logo again')
  // asked for less motion, it leaves the pointer alone
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(x, y)
  const calm = await logoStill()
  await page.mouse.move(x + 60, y, { steps: 8 })
  await page.waitForTimeout(500)
  assert(apart(calm, await logoShot()) < .05, 'with reduced motion the pointer does not move it')
})

// and is drawn without reading the GPU back: a read waits for all the GPU has queued, the page's other drawing too,
// which behind a window-wide waveform held the page up 50 to 100 ms, a few times a second as the icon turned
test('logo: the tab icon holds the whole wave as it turns, no crest cut at its edge', async () => {
  const { clipped, reads } = await page.evaluate(async () => {
    const { logo } = await import('/audio/logo/logo.js'), canvas = document.createElement('canvas')
    const view = logo(canvas), clipped = [], read = WebGL2RenderingContext.prototype.readPixels
    let reads = 0
    for (let phase = 0; phase < 1; phase += 1 / 16) {
      view.set({ phase }); view.render()
      const image = new Image()
      WebGL2RenderingContext.prototype.readPixels = function (...a) { reads++; return read.apply(this, a) }
      try { image.src = view.favicon('#000') } finally { WebGL2RenderingContext.prototype.readPixels = read }
      await image.decode()
      const { width: w, height: h } = image, context = new OffscreenCanvas(w, h).getContext('2d')
      context.drawImage(image, 0, 0)
      const alpha = context.getImageData(0, 0, w, h).data, edge = y => Array.from({ length: w }, (_, x) => alpha[(y * w + x) * 4 + 3]).some(a => a > 8)
      if (edge(0) || edge(h - 1)) clipped.push(phase)
    }
    return { clipped, reads }
  })
  assert.deepEqual(clipped, [], `crests reach the icon's edge at phases ${clipped}`)
  assert.equal(reads, 0, 'pixels read back from the GPU')
})

test('logo: a morph of nothing takes a new signal, window or gradient at once', async () => {
  const same = await page.evaluate(async () => {
    const { logo } = await import('/audio/logo/logo.js'), canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'fixed', left: 0, top: 0, width: '96px', height: '40px' })
    document.body.append(canvas)
    const view = logo(canvas, { clear: true, fit: 'width' })
    await new Promise(r => setTimeout(r, 100))
    const shot = now => {
      const morphing = view.render(now)
      const c = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')
      c.drawImage(canvas, 0, 0)
      return { morphing, data: [...c.getImageData(0, 0, canvas.width, canvas.height).data] }
    }
    view.set({ figure: '#000', signal: 'triangle', window: 'cosine', gradient: 'rectangular', morph: 0 }, 1000)
    const at = shot(1000), later = shot(9000)
    // and with a morph, the same moment is mid-way
    view.set({ signal: 'square', morph: 600 }, 20000)
    const half = shot(20200)
    canvas.remove()
    return { morphing: at.morphing, equal: at.data.every((v, i) => v === later.data[i]), midway: half.morphing }
  })
  assert.equal(same.morphing, false, 'nothing under way')
  assert(same.equal, 'the first frame is the last')
  assert.equal(same.midway, true, 'where a morph of 600 ms is still under way after 200')
})

test('logo motion: the axis is there or not at once, with no fade in or out', async () => {
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  const axes = await page.evaluate(async () => {
    const { logo } = await import('/audio/logo/logo.js'), { motion } = await import('/audio/logo/motion.js'), canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'fixed', left: 0, top: 0, width: '96px', height: '40px' })
    document.body.append(canvas)
    const view = logo(canvas, { clear: true, fit: 'width' })
    const mark = motion(view, canvas, {})
    const frames = n => new Promise(resolve => { let k = 0; const tick = () => ++k < n ? requestAnimationFrame(tick) : resolve(); tick() })
    await frames(5)
    mark.set({ axis: .5 })
    await frames(3)
    const on = view.state.axis
    mark.set({ axis: 0 })
    await frames(3)
    const off = view.state.axis
    canvas.remove()
    return { on, off }
  })
  assert.deepEqual(axes, { on: .5, off: 0 })
})

test('logo motion: a height or a cycle count that is no number for a moment does not freeze the mark', async () => {
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  const state = await page.evaluate(async () => {
    const { logo } = await import('/audio/logo/logo.js'), { motion } = await import('/audio/logo/motion.js'), canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'fixed', left: 0, top: 0, width: '96px', height: '40px' })
    document.body.append(canvas)
    const view = logo(canvas, { clear: true, fit: 'width' })
    let bad = false
    const mark = motion(view, canvas, { amplitude: () => bad ? NaN : .8, cycles: () => bad ? Infinity * 0 : 2, axis: () => bad ? NaN : .5 })
    const frames = n => new Promise(resolve => { let k = 0; const tick = () => ++k < n ? requestAnimationFrame(tick) : resolve(); tick() })
    await frames(60)
    bad = true
    await frames(30)
    const during = { ...view.state }
    bad = false
    mark.set({})
    await frames(90)
    canvas.remove()
    return { during: [during.amplitude, during.cycles, during.axis], after: [view.state.amplitude, view.state.cycles, view.state.axis] }
  })
  assert(state.during.every(Number.isFinite), `held while it is bad: ${state.during}`)
  assert(Math.abs(state.after[0] - .8) < .02 && Math.abs(state.after[1] - 2) < .02 && Math.abs(state.after[2] - .5) < .02, `and back after: ${state.after}`)
})

test('logo motion: a hover sets off at once and eases out to the pace it keeps', async () => {
  await page.goto(base + '/lab/logo/', { waitUntil: 'networkidle' })
  const pace = await page.evaluate(async () => {
    const { extra, HOVERS } = await import('/audio/logo/motion.js'), h = HOVERS.creep, at = ms => extra(h, ms)
    const after = Array.from({ length: 200 }, (_, i) => at(150 + i * (h.ms - 150) / 199))
    return { start: at(0), soon: at(150), fast: Math.max(...after), eased: after.every((v, i) => !i || v <= after[i - 1] + 1e-9), end: at(h.ms), later: at(10 * h.ms), keeps: h.speed, ms: h.ms }
  })
  assert.equal(pace.start, 0)
  assert.equal(pace.keeps, .5, 'it keeps half a turn a second')
  assert(pace.soon > 2 && pace.soon === pace.fast, `it is off within 150 ms, at ${pace.soon} turns a second`)
  assert(pace.eased, 'and slows, never speeding up again')
  assert(Math.abs(pace.end - pace.keeps) < 1e-9 && pace.later === pace.end, 'to the pace it keeps')
  assert(pace.ms <= 1200, 'within about a second')
})

