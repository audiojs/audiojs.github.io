// Browser check for the home, the modules page and the archive. On the home: its instrument is the audio playground,
// embedded (audiojs/audio under /audio/, served as npm run dev serves it, scripts/serve.mjs, from a checkout of it beside
// this one): the blackbird opens by its path, the parts the home turns off are gone, its quick edits are one button's
// menu, one picked makes the sound, counted on the button, and undo takes it back, a press on the page closes its menu;
// the utilities featured, each its preview, all of them a link away; the desktop app; the CLI's door; the mark is drawn live
// and moves with it; JS follows the word in outline, as tall as its x; a link's ticks run under its label, the one
// under the pointer swelling to fill its 4 px (1 px tall in a page, 4 px in the menu) and the crest going where the
// pointer goes, over ticks that stay put; npm i audio copies; the menu goes where it says; a phone's width scrolls only
// down; it is set in Geist Mono. On the modules page: a tag keeps its packages, a search the rows that hold every word,
// both in the address; the libraries under their categories; a dossier a page of its own, a technical file. The
// archived pages load whole. Needs the network for the archive's packages from esm.sh and the plots from jsDelivr.
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
    // the embed's text (for where scripts don't run) never in sight: hidden before its script comes, then its skeleton
    check(await page.$eval('audio-repl pre', p => !p.checkVisibility({ visibilityProperty: true })), 'the embed\'s code text out of sight while it loads')
    const nav = await page.$$eval('.site-bar nav a', as => as.map(a => a.textContent + ' ' + a.getAttribute('href')).join(', '))
    check(nav === 'modules /modules/, utils /util/, lab /lab/, playground /audio/playground/', `the menu: ${nav}`)
    // set in Geist Mono, as a spec is and the dossiers are; the header in its Sans
    const type = await page.evaluate(async () => (await document.fonts.ready, { body: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector('h1')).fontFamily, list: getComputedStyle(document.querySelector('.t-desc')).fontFamily, nav: getComputedStyle(document.querySelector('.site-bar nav a')).fontFamily, loaded: document.fonts.check('15px "Geist Mono"') }))
    check([type.body, type.h1, type.list].every(f => f.startsWith('"Geist Mono"')) && type.loaded && !type.nav.startsWith('"Geist Mono"'), `the home in Geist Mono, the header in Sans (${type.nav.split(',')[0]})`)
    // a link's ticks: one in each 4 px of its label, under it alone; pointed at, the one under the pointer swells to fill
    // its 4 px, alone, wherever in it the pointer is, the others thinner the further they are, down to a hairline; the
    // crest goes where the pointer goes, the ticks never moving; reached by the keys, the middle one swells
    const link = page.locator('.site-bar nav a[href="/modules/"]'), width = await link.evaluate(a => a.offsetWidth)
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
    // a hand at rest by the line between two ticks trembles across it: the crest stays on its tick; a px and a half past
    // the line, it goes to the next
    const lb = await link.boundingBox(), line = lb.x + near[5].x + 2, my = lb.y + lb.height / 2, at = () => link.evaluate(a => +a.querySelector('.ticks').style.getPropertyValue('--x'))
    await page.mouse.move(line - 3, my), await page.waitForTimeout(100)
    const held = []
    for (let k = 0; k < 8; k++) await page.mouse.move(line + (k % 2 ? .3 : -.3), my), held.push(await at())
    await page.mouse.move(line + 1.5, my)
    const moved = await at(), back = []
    // ... and from that side the same: kept on it, then back a px and a half past the line
    for (let k = 0; k < 8; k++) await page.mouse.move(line + (k % 2 ? -.3 : .3), my), back.push(await at())
    await page.mouse.move(line - 1.5, my)
    const returned = await at()
    check(held.every(x => Math.abs(x - near[5].x) < .2) && Math.abs(moved - near[6].x) < .2, `a tremor across the line between two ticks keeps the crest (${[...new Set(held)].join(', ')}); a px and a half past, the next (${moved})`)
    check(back.every(x => Math.abs(x - near[6].x) < .2) && Math.abs(returned - near[5].x) < .2, `the other way alike: kept (${[...new Set(back)].join(', ')}), then back (${returned})`)
    await page.mouse.move(0, 600), await link.focus(), await page.keyboard.press('Shift+Tab'), await page.keyboard.press('Tab'), await page.waitForTimeout(400)
    const keyed = await ticks(), mid = crest(keyed, keyed[keyed.length >> 1].x)
    check(mid.at && mid.alone && mid.full, `reached by the keys, the middle one swells (${keyed.map(t => t.w.toFixed(1)).join(' ')})`)
    await page.keyboard.press('Escape'), await link.evaluate(a => a.blur())
    // a link pointed at the first time: its ticks grow in from nothing to where they stay, none past it on the way
    const fresh = page.locator('.site-bar nav a[href="/util/"]'), fb = await fresh.boundingBox()
    await page.evaluate(() => { window.grown = []; const tick = () => { const is = [...document.querySelectorAll('.site-bar nav a[href="/util/"] .ticks i')]; if (is.length) grown.push(is.map(i => i.getBoundingClientRect().width)); if (grown.length < 40) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2), await page.waitForTimeout(900)
    const grown = await page.evaluate(() => grown), settled = grown.at(-1)
    check(grown.length > 5 && grown[0].every(w => w < .5) && grown.every(f => f.every((w, i) => w <= settled[i] + .01)), `pointed at the first time, its ticks grow in from nothing, none past where they stay (${grown.length} frames)`)
    // a link wider than its label (a section's cell): the pointer past the label's ends, the tick at that end the crest
    const cell = page.locator('.cell').first()
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    const ends = async x => { await page.mouse.move(x, box.y + box.height - 30), await page.waitForTimeout(400); return cell.locator('.ticked .ticks i').evaluateAll(is => is.map(i => i.getBoundingClientRect().width)) }
    const [right, left] = [await ends(box.x + box.width - 10), await ends(box.x + 5)]
    check(right.indexOf(Math.max(...right)) === right.length - 1 && left.indexOf(Math.max(...left)) === 0 && Math.max(...right) > 3.9, `past the label, its last tick the crest, before it its first (${right.length} ticks)`)
    // a page's link's ticks 1 px tall, the menu's 4 px
    const tall = sel => page.$eval(sel, t => t.getBoundingClientRect().height)
    check(await tall('.cell .ticks') === 1 && await tall('.site-bar nav .ticks') === 4, 'a page\'s link underlined 1 px tall, the menu\'s 4 px')
    await link.evaluate(a => a.style.fontSize = '24px'), await page.mouse.move(0, 600), await link.hover()
    const wider = await link.evaluate(a => [a.querySelectorAll('.ticks').length, a.querySelectorAll('.ticks i').length, a.offsetWidth])
    check(wider[0] === 1 && wider[1] === Math.floor(wider[2] / 4), `its label grown to ${wider[2]} px, its row made again to fit: ${wider[1]} ticks`)
    await link.evaluate(a => a.style.fontSize = '')
    await page.mouse.move(0, 600)
    // JS: the letters' outline only, on the word's baseline, close after it, its capitals with the outline as tall as
    // the word's x (each measured in the font as drawn)
    const js = await page.$eval('.site-top .site-brand', br => {
      const base = el => { const probe = Object.assign(document.createElement('span'), { style: 'display: inline-block; width: 0; height: 0' }); el.append(probe); const y = probe.getBoundingClientRect().bottom; probe.remove(); return y }
      const word = br.querySelector('.word'), it = br.querySelector('.js'), s = getComputedStyle(it), w = getComputedStyle(word), stroke = parseFloat(s.webkitTextStrokeWidth)
      const ink = (style, text) => { const c = document.createElement('canvas').getContext('2d'); c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; return c.measureText(text).actualBoundingBoxAscent }
      return { text: it.textContent, outline: s.color === 'rgba(0, 0, 0, 0)' && stroke > 0, tall: ink(s, 'H') + stroke / 2 - ink(w, 'x'), foot: base(it) - base(word), gap: (it.getBoundingClientRect().left - word.getBoundingClientRect().right) / parseFloat(w.fontSize) }
    })
    check(js.text === 'JS' && js.outline && Math.abs(js.tall) < .5 && Math.abs(js.foot) < .5 && js.gap >= 0 && js.gap < .1, `JS outlined, as tall as the word's x, on its baseline, close after it (${JSON.stringify(js)})`)
    await page.click('#install')
    check(await page.evaluate(() => navigator.clipboard.readText()) === 'npm i audio', 'npm i audio copies')
    // the utilities a reader comes for, each to its page with its shelf and its preview; all of them a link away, counted
    // as many as the utilities' index holds; the desktop app, coming; the CLI's door to its part of audio's dossier; no
    // platform list (the modules' platform category is it)
    const featured = await page.$$eval('.featured li a', as => as.map(a => ({ href: a.getAttribute('href'), name: a.querySelector('.t-name')?.textContent, shelf: a.querySelector('small')?.textContent, fig: a.querySelector('svg.fig')?.childElementCount })))
    check(featured.length === 8 && featured.every(f => /^\/util\/[\w-]+\/$/.test(f.href) && f.name && f.shelf && f.fig > 0), `${featured.length} utilities featured, each its shelf and preview: ${featured.map(f => f.href.split('/')[2]).join(', ')}`)
    const counted = await page.$$eval('[data-utils]', bs => bs.map(b => +b.textContent)), all = await page.$eval('.featured .all', a => a.getAttribute('href'))
    const shelved = await (await fetch(base + '/util/')).text().then(t => (t.match(/<li><a href="\/util\/[\w-]+\/"/g) ?? []).length)
    check(all === '/util/' && counted.length === 2 && counted.every(n => n === shelved) && shelved > 8, `all ${counted[0]} utilities a link away, as many as the index shelves (${shelved})`)
    check(await page.$eval('.desktop h2', h => h.textContent.replace(/\s+/g, ' ').trim()) === 'Audio for Mac Coming', 'the desktop app, coming')
    const cli = await page.$eval('.cell[href^="/modules/audio/#"]', a => a.getAttribute('href'))
    check(cli === '/modules/audio/#cli' && (await (await fetch(base + '/modules/audio/')).text()).includes('id="cli"'), `the CLI's door to audio's dossier, its part there (${cli})`)
    check(!await page.$('[href="#platform"], [href="/#platform"], #platform'), 'no platform list, nor a link to one')
    if (!existsSync(AUDIO)) console.log(`  skip the playground: no checkout of audiojs/audio at ${AUDIO}`)
    else {
      await page.waitForFunction(() => !document.querySelector('.site-top .site-brand canvas')?.hidden, null, { timeout: 15000 }).catch(() => {})
      check(await page.$eval('.site-top .site-brand canvas', c => !c.hidden), 'the mark is drawn live, the logo page\'s gradient look')
      const src = new URL(await page.waitForSelector('audio-repl iframe').then(f => f.getAttribute('src')), base), ui = JSON.parse(src.searchParams.get('ui') ?? '{}')
      // the colour the page shows under the embed: the first box from it up that paints one
      const field = await page.$eval('audio-repl', e => { for (let b = e.parentElement; b; b = b.parentElement) { const c = getComputedStyle(b).backgroundColor; if (!/^(transparent|rgba\(.*,\s*0\))$/.test(c)) return c } })
      check(src.pathname === '/audio/playground/' && ui.controls?.join(' ') === 'sound play clock history save loudness rate channels view link' && ui.ops?.join(' ') === 'trim(-40) normalize(-1) fade(1, 1) stretch(1.25) pitch(-2) reverse' && ui.background === field, `the playground embedded, one JSON of its parts, its quick edits and the page's ground (${ui.background})`)
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
      const want = ['.embed-sound', '.play', '.clock', '.history', '.embed-ops', '.embed-save', '.readout', '.fact[popovertarget="rate-menu"]', '.fact[popovertarget="channels-menu"]', '.embed-view', '.embed-open'], gone = ['.record', '.embed-open-file', '.embed-name', '.before', '.loop', '.lane-look']
      const seen = await inside(d => Object.fromEntries(['.embed-sound', '.play', '.clock', '.history', '.embed-ops', '.embed-save', '.readout', '.fact[popovertarget="rate-menu"]', '.fact[popovertarget="channels-menu"]', '.embed-view', '.embed-open', '.record', '.embed-open-file', '.embed-name', '.before', '.loop', '.lane-look'].map(k => [k, !!d.querySelector('.panes ' + k)?.checkVisibility()])))
      check(want.every(k => seen[k]) && gone.every(k => !seen[k]), `the sound's name, play, the time, history, the edits, save, loudness, rate, channels, the view's switch and the way to the playground; no record or open buttons (the name's menu has them), name, Before, loop or a look over the picture${want.every(k => seen[k]) && gone.every(k => !seen[k]) ? '' : ': ' + JSON.stringify(seen)}`)
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
      check(await frame.locator('.embed-ops').getAttribute('aria-label') === 'Edits, 1 made', 'the edits\' button counts it')
      await frame.locator('.history .undo').click()
      await length('0:18.800')
      check(true, 'and undo takes it back')
      // its menu open, a press on the page around it closes it, as one inside would
      await frame.locator('.embed-sound').click()
      await frame.locator('.menubar-menu').waitFor()
      await page.locator('h1').click()
      check(await frame.locator('.menubar-menu').waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false), 'the sound\'s menu open, a press on the page around it closes it')
      // the header's mark moves with the playground: still at rest, turning as the blackbird plays
      const logo = async () => (await (await page.$('.site-top .site-brand .logo')).screenshot()).toString('base64')
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
    // the catalog: every package a row, a family's own first, the others folded under it, the libraries under their
    // category; audio first, the rest by name; each to its dossier here, none to a repo
    const all = await page.$$eval('.unit li', li => li.length), shown = () => page.$$eval('.unit li:not([hidden]) a', as => as.map(a => a.dataset.search))
    const visible = () => page.$$eval('.unit:not([hidden])', us => us.map(u => u.id))
    check(all > 300 && await page.$eval('#n', o => o.textContent) === `${all} modules`, `${all} modules listed, and counted`)
    check(await page.$$eval('.unit li a', as => as.every(a => /^\/modules\/[\w-]+\/$/.test(a.getAttribute('href')) && a.querySelector('.desc').textContent.trim())), 'each to its dossier, with what it does')
    const ids = await visible()
    check(ids[0] === 'audio' && ids.slice(1).every((id, i, a) => !i || a[i - 1].localeCompare(id) < 0), `audio first, the rest by name (${ids.length} units)`)
    // the rail, its tags: each with how many packages it holds, all of them marked first; a tag pressed keeps its
    // units, as many as it said, the tag in the address and marked; a unit under two tags under each
    const rail = await page.$$eval('.site-rail a[data-tag]', as => as.map(a => [a.dataset.tag, +a.querySelector('small').textContent, a.hasAttribute('aria-current')]))
    check(rail.length > 6 && rail[0][0] === '' && rail[0][1] === all && rail[0][2] && rail.slice(1).every(([t, n, on]) => t && n > 0 && !on), `the rail: ${rail.map(([t, n]) => `${t || 'all'} ${n}`).join(', ')}`)
    const pick = async t => { await page.locator(`.site-rail a[data-tag="${t}"]`).click(); return [await visible(), (await shown()).length] }
    const [measure, inMeasure] = await pick('measure')
    check(measure.length > 3 && await page.$$eval('.unit li:not([hidden])', li => li.every(l => l.dataset.tags.split(' ').includes('measure'))) && inMeasure === rail.find(([t]) => t === 'measure')[1], `measure: its ${measure.length} units, ${inMeasure} packages, as the rail counts`)
    check(await page.$eval('#n', o => o.textContent) === `${inMeasure} of ${all}` && new URL(page.url()).searchParams.get('tag') === 'measure' && await page.$eval('.site-rail a[aria-current]', a => a.dataset.tag) === 'measure', 'counted, in the address, marked in the rail')
    const [shape] = await pick('shape')
    check(measure.includes('auditory') && shape.includes('auditory') && !shape.includes('loudness'), 'a family for two things under both tags (auditory: measure, shape), one for one under its own')
    // a category's libraries each by their own tags: under shape, digital-filter alone of dsp's
    check(shape.includes('dsp') && (await page.$$eval('#dsp li:not([hidden]) a', as => as.map(a => a.getAttribute('href')))).join() === '/modules/digital-filter/', 'a category\'s libraries each under their own tags (shape: digital-filter of dsp)')
    const [every] = await pick('')
    check(every.length === ids.length && !new URL(page.url()).search && await page.$eval('#n', o => o.textContent) === `${all} modules`, 'all: every unit back, the address clean')
    // a family's packages folded under its own, their names in the fold; pressed, open
    const fold = () => page.$eval('#decode .kin', d => ({ open: d.open, count: d.querySelector('.count').textContent, names: d.querySelector('.names').textContent, rows: [...d.querySelectorAll('li')].filter(li => li.checkVisibility()).length }))
    const shut = await fold()
    check(!shut.open && shut.count === '25 packages' && shut.names.includes('mp3, mp4') && shut.rows === 0, `a family's packages folded under its own: ${shut.count}`)
    await page.locator('#decode .kin summary').click()
    check((await fold()).open && (await fold()).rows === 25, 'pressed, its fold opens, every package a row')
    await page.locator('#decode .kin summary').click()
    // the libraries under their category, by what they are, each open to a press: its name, what it holds, how many
    const platform = await page.$eval('#platform', u => ({ head: u.querySelector('.head .name').textContent, count: u.querySelector('.head .ver').textContent, rows: [...u.querySelectorAll('li a')].map(a => a.getAttribute('href')), fold: !!u.querySelector('details') }))
    check(platform.head === 'platform' && platform.count === '2 libraries' && platform.rows.join() === '/modules/web-audio-api/,/modules/audio-buffer/' && !platform.fold, `a category over its libraries, open: ${platform.head}, ${platform.count}`)
    // a search opens the folds holding what it found, and gives them back as they were once cleared
    await page.fill('#q', 'moog')
    check(await page.$eval('#filter .kin', d => d.open && d.querySelector('a[href="/modules/filter-moog-ladder/"]').checkVisibility()) && (await visible()).join() === 'filter', 'a search opens the fold that holds it, the other units hidden')
    await pick('make')
    check((await shown()).length === 0 && await page.$eval('#none', p => !p.hidden) && new URL(page.url()).search === '?tag=make&q=moog', 'a search under a tag: what both hold, here nothing, said so; both in the address')
    await pick('')
    await page.fill('#q', '')
    check(await page.$$eval('.unit .kin', ds => ds.every(d => !d.open && !d.hidden)), 'cleared, the folds shut again')
    await page.fill('#q', 'pitch shift')
    const hits = await shown()
    check(hits.length > 1 && hits.length < all && hits.every(t => t.includes('pitch') && t.includes('shift')), `"pitch shift" keeps the ${hits.length} rows holding both words`)
    check(await page.$eval('#n', o => o.textContent) === `${hits.length} of ${all}` && new URL(page.url()).searchParams.get('q') === 'pitch shift', 'counted, and in the address')
    check(await page.$$eval('.unit', us => us.every(u => u.hidden === !u.querySelector('li:not([hidden])'))), 'a unit with no row left hides')
    await page.fill('#q', 'qwxz')
    check((await shown()).length === 0 && await page.$eval('#none', p => !p.hidden), 'nothing found says so')
    await page.fill('#q', '')
    check((await shown()).length === all && await page.$eval('#none', p => p.hidden), 'cleared, every row is back')
    // a package pressed: its dossier, a page of its own, a technical file in the mono, the page's own scroll; a
    // breadcrumb up, the packages before and after it at its top and its foot; back, the catalog as it was left
    await page.fill('#q', 'moog')
    await page.locator('.unit li a[href="/modules/filter-moog-ladder/"]').click()
    await page.waitForURL('**/modules/filter-moog-ladder/')
    check(await page.$('dialog') === null && await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), 'a package pressed opens its dossier as a page, scrolled as the page')
    check(await page.$eval('.readme', r => !!r.querySelector('math') && !/\$[^$\s][^$]*\$/.test(r.textContent)), 'its README in it, its maths set')
    const file = await page.$eval('.dossier', d => ({ font: getComputedStyle(d).fontFamily, loaded: document.fonts.check('15px "Geist Mono"'), standing: d.querySelector('.standing').textContent.replace(/\s+/g, ' ').trim(), npm: d.querySelector('.badges a').textContent, trail: d.querySelector('.trail').textContent.replace(/\s+/g, ' ').trim(), up: [...d.querySelectorAll('.trail a')].map(a => a.getAttribute('href')), pace: [...d.querySelectorAll('.pace a')].map(a => a.rel) }))
    check(file.font.startsWith('"Geist Mono"') && file.loaded && file.standing === 'Status calibrated' && /^npm\d+\.\d+\.\d+$/.test(file.npm), `set as a file, in Geist Mono: ${file.standing}, ${file.npm}`)
    check(file.trail === 'modules / filter / moog-ladder' && file.up.join() === '/modules/,/modules/filter/' && file.pace.join() === 'prev,next', `a breadcrumb up (${file.trail}), previous and next at its top`)
    await page.locator('.pace a[rel="next"]').click()
    await page.waitForURL(u => u.pathname !== '/modules/filter-moog-ladder/')
    check(/^\/modules\/[\w-]+\/$/.test(new URL(page.url()).pathname) && await page.$eval('.pace a[rel="prev"]', a => a.getAttribute('href')) === '/modules/filter-moog-ladder/', `next along the catalog: ${new URL(page.url()).pathname}, and back to it from there`)
    await page.goBack(), await page.goBack()
    await page.waitForURL(u => u.pathname === '/modules/')
    check(await page.$eval('#q', i => i.value) === 'moog' && (await visible()).join() === 'filter', 'back: the catalog as it was left, its search kept')
    await page.fill('#q', '')
    // its tag pressed: the catalog under that tag
    await page.goto(base + '/modules/filter-moog-ladder/')
    await page.locator('.facts a[href="/modules/?tag=shape"]').click()
    await page.waitForURL(u => u.pathname === '/modules/')
    check(new URL(page.url()).search === '?tag=shape' && await page.$eval('.site-rail a[aria-current]', a => a.dataset.tag) === 'shape' && (await visible()).includes('filter') && !(await visible()).includes('loudness'), 'its tag pressed: the catalog under that tag')
    // a README's link to its own part: that part, in sight
    await page.goto(base + '/modules/effect/')
    const hash = await page.$eval('.readme a[href^="#"]:not([href="#"])', a => a.getAttribute('href'))
    await page.locator(`.readme a[href="${hash}"]`).first().click()
    check(await page.waitForFunction(h => { const t = document.querySelector(`[id="${h.slice(1)}"]`)?.getBoundingClientRect(); return t && t.top >= -2 && t.top < innerHeight / 2 }, hash, { timeout: 3000 }).then(() => true, () => false), `a README's own link (${hash}) goes to its part`)
    // a dossier opened as a page: its rail every unit, its own open to its packages, itself marked; the standards it
    // names down the sheet's edge; its README's plots on the dark, each numbered
    await page.goto(base + '/modules/filter-moog-ladder/')
    const dir = await page.$eval('.site-rail', r => ({ here: r.querySelector('a[aria-current="page"]')?.getAttribute('href'), open: [...r.querySelectorAll('ul ul a')].map(a => a.getAttribute('href')), units: r.querySelectorAll(':scope > ul > li').length, names: [...r.querySelectorAll(':scope > ul > li > a')].map(a => [a.getAttribute('href'), a.textContent]) }))
    check(dir.here === '/modules/filter-moog-ladder/' && dir.open.includes('/modules/filter-biquad/') && dir.units === ids.length, `a dossier as a page: its rail every unit (${dir.units}), its family open, itself marked`)
    check(dir.names.every(([href, name]) => href === `/modules/${name}/` || href === `/modules/#${name}`), 'each unit in it by its whole name, a category to its place in the catalog')
    // a library: up through its category, its category among its facts
    await page.goto(base + '/modules/web-audio-api/')
    const lib = await page.$eval('.dossier', d => ({ trail: d.querySelector('.trail').textContent.replace(/\s+/g, ' ').trim(), up: [...d.querySelectorAll('.trail a')].map(a => a.getAttribute('href')), fact: [...d.querySelectorAll('.facts div')].find(f => f.querySelector('dt').textContent === 'Category')?.querySelector('dd').textContent, rail: [...document.querySelectorAll('.site-rail ul ul a')].map(a => a.getAttribute('href')) }))
    check(lib.trail === 'modules / platform / web-audio-api' && lib.up.join() === '/modules/,/modules/#platform' && lib.fact === 'platform, 2 libraries' && lib.rail.join() === '/modules/web-audio-api/,/modules/audio-buffer/', `a library up through its category (${lib.trail}), its category open in the rail`)
    check(await page.$('.edge') === null, 'one naming no standard, no tab')
    await page.goto(base + '/modules/weighting-a/')
    check(await page.$eval('.edge', e => e.textContent === 'IEC 61672-1' && e.checkVisibility()), 'the standards it names down the sheet\'s edge')
    await page.goto(base + '/modules/assert/')
    check(await page.$eval('.standing', s => s.textContent.replace(/\s+/g, ' ').trim() === 'Status pending calibration' && /version 0/i.test(s.title)), 'a version 0 pending calibration, what that means on it')
    await page.goto(base + '/modules/a-weighting/')
    check(await page.$$eval('figure', fs => fs.length === 1 && !!fs[0].closest('.overview') && fs[0].querySelector('figcaption').textContent === 'A-weighting' && !fs[0].matches('.plot')), 'its README\'s one picture beside the overview, not in it twice; a picture from elsewhere as it is, off the dark')
    await page.goto(base + '/modules/?tag=nothing-such')
    check(await page.$eval('#n', o => o.textContent) === `${all} modules` && await page.$eval('.site-rail a[aria-current]', a => a.dataset.tag === ''), 'a tag the rail doesn\'t hold: all of them')
    await page.goto(base + '/modules/digital-filter/')
    const plot = page.locator('.readme figure.plot').first()
    await plot.scrollIntoViewIfNeeded()
    check(await plot.evaluate(f => new Promise(done => { const img = f.querySelector('img'), seen = () => done(img.naturalWidth > 0 && getComputedStyle(f.querySelector('.plate')).backgroundColor !== getComputedStyle(document.body).backgroundColor && f.querySelector('figcaption').checkVisibility()); img.complete ? seen() : (img.onload = seen, img.onerror = () => done(false)) })), 'its plots from its repo, on the dark, each with its number')
    check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''))
    check(!missing.length, 'nothing missing' + (missing.length ? ': ' + missing.join(' ') : ''))
    await context.close()
  }
  // every page in the home's style: its header, the name's mark drawn live, Geist, the page on the dot grid, its
  // column filled in the paper's colour
  for (const path of ['/modules/', '/util/', '/util/loudness/', '/lab/', '/lab/waveform/', '/lab/auditory-illusions/']) {
    console.log(path)
    const { page, errors, missing, context } = await open(path)
    await page.waitForLoadState('networkidle')
    const look = await page.evaluate(() => {
      const body = getComputedStyle(document.body), column = document.querySelector('main'), paper = getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim()
      const probe = Object.assign(document.createElement('i'), { style: `color: ${paper}` }); document.body.append(probe)
      const fill = getComputedStyle(probe).color; probe.remove()
      return { header: !!document.querySelector('header.site-bar .site-top .site-brand .js'), nav: [...document.querySelectorAll('.site-bar nav a')].map(a => a.textContent).join(' '), font: body.fontFamily.split(',')[0].replace(/"/g, ''), dots: body.backgroundImage.includes('radial-gradient'), column: getComputedStyle(column).backgroundColor === fill, loaded: document.fonts.check('16px Geist') }
    })
    check(look.header && look.nav === 'modules utils lab playground', `the site's header (${look.nav})`)
    // commas between things, never a middle dot (a product's · in a formula stays)
    check(await page.evaluate(() => ![document.title, ...[...document.querySelectorAll('footer, .unit .tags, .kin .names, .site-rail, .apps .p, .kicker')].map(e => e.textContent)].some(t => t.includes('·'))), 'no middle dot between things: its title, rails, lists, footer')
    check(look.font === 'Geist' && look.loaded, `in Geist (${look.font})`)
    check(look.dots && look.column, 'on the dot grid, its column filled')
    // the utilities on their shelves, each its icon; a utility's rail, every utility, its own marked; an article's
    // rail, each of its parts, each heading it names there
    if (path === '/util/') check(await page.$$eval('.shelf .apps li', li => li.length >= 20 && li.every(l => l.querySelector('a[href^="/util/"] svg.icon > *'))), 'every utility on a shelf, with its icon')
    if (path === '/util/loudness/') check(await page.$eval('.site-rail a[aria-current]', a => a.getAttribute('href')) === '/util/loudness/' && await page.$$eval('.site-rail a', as => as.length >= 20), 'its rail: every utility, this one marked')
    if (path.startsWith('/lab/') && path !== '/lab/') check(await page.$$eval('.site-rail a', as => as.length > 0 && as.every(a => document.querySelector(`main h2${a.hash}`))), 'its rail: each of its parts, each a heading in it')
    // a page's embedded playgrounds, their script from the site itself (/audio/playground/embed.js), as the page is served
    if (await page.$('audio-repl')) check(await page.evaluate(() => !!customElements.get('audio-repl')), 'its embedded playgrounds come')
    if (existsSync(AUDIO)) {
      await page.waitForFunction(() => !document.querySelector('.site-top .site-brand canvas')?.hidden, null, { timeout: 15000 }).catch(() => {})
      check(await page.$eval('.site-top .site-brand canvas', c => !c.hidden), 'the mark drawn live')
    }
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
