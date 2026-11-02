// Browser check for the home, the modules page and the archive. On the home: its instrument is the audio playground,
// embedded (audiojs/audio under /audio/, served as npm run dev serves it, scripts/serve.mjs, from a checkout of it beside
// this one): the blackbird opens by its path, the parts the home turns off are gone, its quick edits are one button's
// menu, one picked makes the sound and undo takes it back, a press on the page closes its menu; the mark is drawn live
// and moves with it; JS follows the word in outline, as tall as its x; a link's ticks run under its label, the one
// under the pointer swelling to fill its 4 px and the crest going where the pointer goes, over ticks that stay put;
// npm i audio copies; the menu goes where it says; a phone's width scrolls only down. On the modules page: the search
// keeps the rows that hold every word, in the address too. The archived pages load whole. Needs the network for the
// archive's packages from esm.sh.
// Run: node scripts/home-test.mjs
import { createServer } from 'http'
import { existsSync } from 'fs'
import { site, AUDIO } from './serve.mjs'

let chromium
try { ({ chromium } = await import('playwright')) } catch { console.error('playwright is not installed: npm i -D playwright'); process.exit(2) }

// the site as npm run dev serves it: /audio/ from the checkout of audiojs/audio beside this one
const server = createServer(site)
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

try {
  console.log('/')
  {
    const { page, errors, missing, context } = await open('/')
    const nav = await page.$$eval('.top nav a', as => as.map(a => a.textContent + ' ' + a.getAttribute('href')).join(', '))
    check(nav === 'modules /modules/, utils /util/, platform #platform, lab /lab/, playground /audio/playground/', `the menu: ${nav}`)
    // a link's ticks: one in each 4 px of its label, under it alone; pointed at, the one under the pointer swells to fill
    // its 4 px, alone, wherever in it the pointer is, the others thinner the further they are, down to a hairline; the
    // crest goes where the pointer goes, the ticks never moving; reached by the keys, the middle one swells
    const link = page.locator('.top nav a[href="/modules/"]'), width = await link.evaluate(a => a.offsetWidth)
    const ticks = () => link.evaluate(a => { const b = a.getBoundingClientRect(); return [...a.querySelectorAll('.ticks i')].map(i => { const r = i.getBoundingClientRect(); return { x: Math.round((r.x + r.width / 2 - b.x) * 10) / 10, w: r.width, left: r.left - b.left, right: b.right - r.right } }) })
    // the pointer over a tick a fraction of the way along, dx off its middle
    const point = async (f, dx = 0) => {
      const b = await link.boundingBox()
      await page.mouse.move(b.x + 1, b.y + b.height / 2)
      const row = await ticks(), x = row[Math.round(f * (row.length - 1))].x
      await page.mouse.move(b.x + x + dx, b.y + b.height / 2), await page.waitForTimeout(400)
      return [await ticks(), x]
    }
    const crest = (row, x) => { const ws = row.map(t => t.w).sort((a, b) => b - a), top = row.find(t => t.w === ws[0]); return { at: Math.abs(top.x - x) < .2, alone: ws[1] < ws[0] * .8, full: ws[0] > 3.9 && ws[0] <= 4.01, thin: ws.at(-1) < .6 } }
    const [near, x1] = await point(.25), [far, x2] = await point(.8, 1.6)
    check(near.length === Math.floor(width / 4) && near[0].left >= -.5 && near.at(-1).right >= -.5, `ticks under the label alone: ${near.length} over ${width} px`)
    const one = crest(near, x1), two = crest(far, x2)
    check(one.at && one.alone && one.full && one.thin, `the one under the pointer fills its 4 px, alone, the rest down to a hairline (${near.map(t => t.w.toFixed(1)).join(' ')})`)
    check(two.at && two.alone && two.full, `the pointer moved on, off a tick's middle, the crest with it on that tick (${far.map(t => t.w.toFixed(1)).join(' ')})`)
    check(far.every((t, i) => t.x === near[i].x), 'and none of the ticks moves')
    await page.mouse.move(0, 600), await link.focus(), await page.keyboard.press('Shift+Tab'), await page.keyboard.press('Tab'), await page.waitForTimeout(400)
    const keyed = await ticks(), mid = crest(keyed, keyed[keyed.length >> 1].x)
    check(mid.at && mid.alone && mid.full, `reached by the keys, the middle one swells (${keyed.map(t => t.w.toFixed(1)).join(' ')})`)
    await page.keyboard.press('Escape'), await link.evaluate(a => a.blur())
    // a link wider than its label (a section's cell): the pointer past the label's ends, the tick at that end the crest
    const cell = page.locator('.cell').first()
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    const ends = async x => { await page.mouse.move(x, box.y + box.height - 30), await page.waitForTimeout(400); return cell.locator('.s .ticks i').evaluateAll(is => is.map(i => i.getBoundingClientRect().width)) }
    const [right, left] = [await ends(box.x + box.width - 10), await ends(box.x + 5)]
    check(right.indexOf(Math.max(...right)) === right.length - 1 && left.indexOf(Math.max(...left)) === 0 && Math.max(...right) > 3.9, `past the label, its last tick the crest, before it its first (${right.length} ticks)`)
    await link.evaluate(a => a.style.fontSize = '24px'), await page.mouse.move(0, 600), await link.hover()
    const wider = await link.evaluate(a => [a.querySelectorAll('.ticks').length, a.querySelectorAll('.ticks i').length, a.offsetWidth])
    check(wider[0] === 1 && wider[1] === Math.floor(wider[2] / 4), `its label grown to ${wider[2]} px, its row made again to fit: ${wider[1]} ticks`)
    await link.evaluate(a => a.style.fontSize = '')
    await page.mouse.move(0, 600)
    // JS: the letters' outline only, on the word's baseline, close after it, its capitals with the outline as tall as
    // the word's x (each measured in the font as drawn)
    const js = await page.$eval('.top .brand', br => {
      const base = el => { const probe = Object.assign(document.createElement('span'), { style: 'display: inline-block; width: 0; height: 0' }); el.append(probe); const y = probe.getBoundingClientRect().bottom; probe.remove(); return y }
      const word = br.querySelector('.word'), it = br.querySelector('.js'), s = getComputedStyle(it), w = getComputedStyle(word), stroke = parseFloat(s.webkitTextStrokeWidth)
      const ink = (style, text) => { const c = document.createElement('canvas').getContext('2d'); c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; return c.measureText(text).actualBoundingBoxAscent }
      return { text: it.textContent, outline: s.color === 'rgba(0, 0, 0, 0)' && stroke > 0, tall: ink(s, 'H') + stroke / 2 - ink(w, 'x'), foot: base(it) - base(word), gap: (it.getBoundingClientRect().left - word.getBoundingClientRect().right) / parseFloat(w.fontSize) }
    })
    check(js.text === 'JS' && js.outline && Math.abs(js.tall) < .5 && Math.abs(js.foot) < .5 && js.gap >= 0 && js.gap < .1, `JS outlined, as tall as the word's x, on its baseline, close after it (${JSON.stringify(js)})`)
    await page.click('#install')
    check(await page.evaluate(() => navigator.clipboard.readText()) === 'npm i audio', 'npm i audio copies')
    if (!existsSync(AUDIO)) console.log(`  skip the playground: no checkout of audiojs/audio at ${AUDIO}`)
    else {
      await page.waitForFunction(() => !document.querySelector('.top .wordmark canvas')?.hidden, null, { timeout: 15000 }).catch(() => {})
      check(await page.$eval('.top .wordmark canvas', c => !c.hidden), 'the mark is drawn live, the logo page\'s gradient look')
      const src = new URL(await page.waitForSelector('audio-repl iframe').then(f => f.getAttribute('src')), base), ui = JSON.parse(src.searchParams.get('ui') ?? '{}')
      // the colour the page shows under the embed: the first box from it up that paints one
      const field = await page.$eval('audio-repl', e => { for (let b = e.parentElement; b; b = b.parentElement) { const c = getComputedStyle(b).backgroundColor; if (!/^(transparent|rgba\(.*,\s*0\))$/.test(c)) return c } })
      check(src.pathname === '/audio/playground/' && ui.controls?.join(' ') === 'sound play clock history save loudness rate channels link' && ui.ops?.join(' ') === 'trim(-40) normalize(-1) fade(1, 1) stretch(1.25) pitch(-2) reverse' && ui.background === field, `the playground embedded, one JSON of its parts, its quick edits and the page's ground (${ui.background})`)
      // what the playground says of its mark, as it says it
      await page.evaluate(() => { window.moods = []; document.querySelector('audio-repl').addEventListener('mark', e => e.detail.mode && moods.push(e.detail.mode)) })
      const mood = mode => page.waitForFunction(mode => moods.at(-1) === mode, mode, { timeout: 30000 })
      const frame = page.frameLocator('audio-repl iframe'), inside = f => page.evaluate(f => new Function('d', `return (${f})(d)`)(document.querySelector('audio-repl iframe').contentDocument), f.toString())
      const length = text => page.waitForFunction(text => document.querySelector('audio-repl iframe').contentDocument?.querySelector('.clock .length')?.textContent.includes(text), text, { timeout: 30000 })
      await length('0:18.800')
      check(true, 'the blackbird opens by its path: 0:18.800')
      // its edges, masked, fade into whatever is under them: the page's ground, with no slab's gradient over it
      const ground = await inside(d => [getComputedStyle(d.querySelector('.panes')).backgroundColor, getComputedStyle(d.querySelector('.panes')).backgroundImage])
      check(ground[0] === field && ground[1] === 'none', `no slab: the page's own ground under it (${ground[0]})`)
      const want = ['.embed-sound', '.play', '.clock', '.history', '.embed-ops', '.embed-save', '.readout', '.fact[popovertarget="rate-menu"]', '.fact[popovertarget="channels-menu"]', '.embed-open'], gone = ['.record', '.embed-open-file', '.embed-name', '.before', '.loop']
      const seen = await inside(d => Object.fromEntries(['.embed-sound', '.play', '.clock', '.history', '.embed-ops', '.embed-save', '.readout', '.fact[popovertarget="rate-menu"]', '.fact[popovertarget="channels-menu"]', '.embed-open', '.record', '.embed-open-file', '.embed-name', '.before', '.loop'].map(k => [k, !!d.querySelector('.panes ' + k)?.checkVisibility()])))
      check(want.every(k => seen[k]) && gone.every(k => !seen[k]), `the sound's name, play, the time, history, the edits, save, loudness, rate, channels and the way to the playground; no record or open buttons (the name's menu has them), name, Before or loop${want.every(k => seen[k]) && gone.every(k => !seen[k]) ? '' : ': ' + JSON.stringify(seen)}`)
      // the bar one line: the history, the edits, save, the level and the facts on the length's line, none wrapped under it
      const line = await inside(d => ['.clock .length', '.history', '.embed-ops', '.embed-files', '.readout', '.facts'].map(k => { const r = d.querySelector('.panes ' + k).getBoundingClientRect(); return Math.round(r.top + r.height / 2) }))
      check(Math.max(...line) - Math.min(...line) <= 6, `the bar's parts on one line, the length's (${line.join(', ')})`)
      check(await frame.locator('.embed-sound-name').textContent() === 'blackbird.mp3', 'the sound named by its file: blackbird.mp3')
      check(/LUFS/.test(await frame.locator('.readout').textContent()), `the level as loudness: ${(await frame.locator('.readout').textContent()).replace(/\s+/g, ' ')}`)
      await frame.locator('.embed-ops').click()
      const ops = await frame.locator('.menubar-menu .menu-row').evaluateAll(rs => rs.map(r => `${r.querySelector('.menu-label').textContent} ${r.querySelector('.menu-keys').textContent}`.trim()))
      check(ops.join(', ') === 'Trim −40dB, Normalize −1dB, Fade 1s · 1s, Stretch 1.25×, Pitch −2st, Reverse', `the quick edits, one button's menu, their values in units: ${ops.join(', ')}`)
      await frame.locator('.menubar-menu .menu-row', { hasText: 'Stretch' }).click()
      await length('0:23.500')
      check(true, 'Stretch 1.25 makes 0:18.800 into 0:23.500')
      await frame.locator('.history .undo').click()
      await length('0:18.800')
      check(true, 'and undo takes it back')
      // its menu open, a press on the page around it closes it, as one inside would
      await frame.locator('.embed-sound').click()
      await frame.locator('.menubar-menu').waitFor()
      await page.locator('h1').click()
      check(await frame.locator('.menubar-menu').waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false), 'the sound\'s menu open, a press on the page around it closes it')
      // the header's mark moves with the playground: still at rest, turning as the blackbird plays
      const logo = async () => (await (await page.$('.top .wordmark .logo')).screenshot()).toString('base64')
      await page.mouse.move(0, 800), await mood('rest'), await page.waitForTimeout(700)
      const rest = [await logo(), await (page.waitForTimeout(300).then(logo))]
      await frame.locator('.play').click(), await mood('play'), await page.waitForTimeout(300)
      const playing = [await logo(), await (page.waitForTimeout(250).then(logo))]
      check(rest[0] === rest[1], 'the mark holds still while the playground rests')
      check(playing[0] !== playing[1], `and turns as it plays (it said: ${(await page.evaluate(() => moods)).join(', ')})`)
      await frame.locator('.play').click()
    }
    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
    check(!missing.length, 'nothing missing' + (missing.length ? ': ' + missing.join(' ') : ''))
    await context.close()
  }
  for (const path of ['/', '/modules/']) {
    console.log(path, 'at 390 px')
    const { page, context } = await open(path, { width: 390, height: 844 })
    await page.waitForLoadState('networkidle')
    const { scroll, width, nav } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, nav: Math.max(...[...document.querySelectorAll('header nav a')].map(a => a.getBoundingClientRect().right)) }))
    check(scroll === width, `no sideways scroll (${scroll} px in ${width})`)
    check(nav <= width, 'the whole menu in sight')
    if (path === '/' && existsSync(AUDIO)) {
      await page.waitForFunction(() => document.querySelector('audio-repl iframe')?.contentDocument?.querySelector('.embed-ops'), null, { timeout: 30000 })
      const over = await page.evaluate(() => { const d = document.querySelector('audio-repl iframe').contentDocument; return Math.max(...[...d.querySelectorAll('.status button')].filter(b => b.checkVisibility()).map(b => b.getBoundingClientRect().right)) - d.documentElement.clientWidth })
      check(over <= 0, `the playground's bar fits its frame, nothing past its edge (${Math.round(over)} px)`)
    }
    await context.close()
  }
  console.log('/modules/')
  {
    const { page, errors, missing, context } = await open('/modules/')
    const all = await page.$$eval('.group li', li => li.length), shown = () => page.$$eval('.group li:not([hidden])', li => li.map(l => l.textContent.toLowerCase()))
    check(all > 250 && await page.$eval('#n', o => o.textContent) === `${all} modules`, `${all} modules listed, and counted`)
    check(await page.$$eval('.group li', li => li.every(l => l.querySelector('a[href^="https://"]') && l.querySelector('p').textContent.trim())), 'each with a link and what it does')
    await page.fill('#q', 'pitch shift')
    const hits = await shown()
    check(hits.length > 1 && hits.length < all && hits.every(t => t.includes('pitch') && t.includes('shift')), `"pitch shift" keeps the ${hits.length} rows holding both words`)
    check(await page.$eval('#n', o => o.textContent) === `${hits.length} of ${all}` && new URL(page.url()).searchParams.get('q') === 'pitch shift', 'counted, and in the address')
    check(await page.$$eval('.group', gs => gs.every(g => g.hidden === !g.querySelector('li:not([hidden])'))), 'a group with no row left hides')
    await page.fill('#q', 'qwxz')
    check((await shown()).length === 0 && await page.$eval('#none', p => !p.hidden), 'nothing found says so')
    await page.fill('#q', '')
    check((await shown()).length === all && await page.$eval('#none', p => p.hidden), 'cleared, every row is back')
    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
    check(!missing.length, 'nothing missing' + (missing.length ? ': ' + missing.join(' ') : ''))
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
