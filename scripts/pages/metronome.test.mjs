// Tests for /util/metronome/: the page's pure functions in node, then the page itself in a browser (server + ok()
// pattern as in the other page tests). Usage: node scripts/pages/metronome.test.mjs [chromium firefox webkit]
//
// Reference values:
// - A tempo of n BPM is n beats a minute: a beat every 60/n s (120 BPM: 0.5 s; 150 BPM: 0.4 s; 100 BPM in triplets:
//   a click every 0.2 s).
// - The beep preset of web-audio-api's metronome instrument (examples/graphs/metronome.js, web-audio-api@1.6.0): an
//   accent's fundamental 1320 Hz, a plain click's 880 Hz, each with a third harmonic; a muted beat ('-') starts nothing.
import { createServer } from 'http'
import { site } from '../serve.mjs'
import * as pw from 'playwright'
import { clampBpm, tapTempo, nextMark, resize, advance, strike } from './metronome.mjs'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ── pure functions ──
ok(clampBpm('120') === 120 && clampBpm(119.6) === 120 && clampBpm(10) === 20 && clampBpm(400) === 300, 'tempo: whole BPM, 20 to 300')
ok([clampBpm(''), clampBpm('  '), clampBpm('fast'), clampBpm(undefined)].every(Number.isNaN), 'tempo: nothing or no number is NaN')
ok(tapTempo([]) === null && tapTempo([1000]) === null, 'taps: under two, no tempo')
ok(tapTempo([0, 500, 1000, 1500]) === 120 && tapTempo([0, 400]) === 150, 'taps 500 ms apart: 120 BPM; 400 ms: 150')
ok(tapTempo([0, 500, 3000, 3600, 4200]) === 100, 'a pause over 2 s starts over: the taps after it, 600 ms apart, 100 BPM')
ok(tapTempo([0, 500, 1000, 1700, 2000, 2500]) === 120, 'one tap late and the next early: the median gap holds 120')
ok(tapTempo([...Array.from({ length: 12 }, (_, i) => i * 1000), ...Array.from({ length: 8 }, (_, i) => 11500 + i * 500)]) === 120, 'the last eight taps count, not the slower ones before')
ok(tapTempo([0, 100, 200]) === 300, 'taps faster than 300 BPM: 300')
ok(nextMark('X') === 'x' && nextMark('x') === '-' && nextMark('-') === 'X' && nextMark('?') === 'x', 'a beat pressed: accent, plain, muted, accent')
ok(resize(['X', 'x', 'x', 'x'], 3).join('') === 'Xxx' && resize(['X', '-'], 4).join('') === 'X-xx' && resize([], 2).join('') === 'Xx', 'beats resized: kept, added plain, the first an accent where there was none')
ok(String(advance(0, 0, 1, 4)) === '1,0' && String(advance(3, 0, 1, 4)) === '0,0', 'a click on: the next beat, the bar\'s first after its last')
ok(String(advance(1, 0, 3, 4)) === '1,1' && String(advance(1, 2, 3, 4)) === '2,0' && String(advance(5, 0, 2, 4)) === '1,1', 'subdivided: the parts of a beat, then the next beat; a beat past a shrunk bar wraps')
ok(String(strike(['X', 'x', '-'], 0, 0)) === 'X,1' && String(strike(['X', 'x', '-'], 2, 0)) === '-,1' && String(strike(['X', 'x', '-'], 1, 2)) === 'x,0.45', 'a beat sounds its mark at full level, a subdivision plain and soft')
{
  // a bar run click by click: n beats with their marks, sub − 1 soft clicks after each, back to its start
  const marks = ['X', '-', 'x', 'x', 'x'], sub = 3, out = []
  let at = [0, 0]
  for (let k = 0; k < marks.length * sub; k++) { out.push(strike(marks, ...at).join()); at = advance(...at, sub, marks.length) }
  ok(out.filter((_, k) => !(k % sub)).map(s => s[0]).join('') === marks.join('') && out.filter((_, k) => k % sub).every(s => s === 'x,0.45') && String(at) === '0,0', 'a bar of 5 in triplets: each beat\'s mark, two soft clicks after it, then the bar again')
}

// ── the page ──
const server = createServer(site)
await new Promise(r => server.listen(0, r))
const url = `http://127.0.0.1:${server.address().port}/util/metronome/`
// every AudioContext the page makes, and every oscillator started: when, at what frequency
const SPY = `{ const A = window.AudioContext; window.__ctx = []; window.__osc = []; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__ctx.push(this) } }
  const start = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (when = 0, ...rest) { window.__osc.push([when, this.frequency.value]); return start.call(this, when, ...rest) } }`

for (const engine of process.argv.length > 2 ? process.argv.slice(2) : ['chromium']) {
  console.log(`\n▶ ${engine}`)
  const browser = await pw[engine].launch({ args: engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(SPY)
  const page = await context.newPage(), errors = []
  page.setDefaultTimeout(30000)
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const tag = s => `${engine}: ${s}`
  const state = () => page.evaluate(() => window.__ctx[0]?.state)
  const fill = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change') }
  // the fundamentals started since `from`, as [time after the first, frequency]
  const clicks = (from = 0, hz = [1320, 880]) => page.evaluate(([from, hz]) => { const o = window.__osc.filter(([t, f]) => t >= from && hz.includes(f)).sort((a, b) => a[0] - b[0]); return o.map(([t, f]) => [t - o[0][0], f]) }, [from, hz])
  const now = () => page.evaluate(() => window.__ctx[0].currentTime)

  await page.waitForFunction(() => document.querySelectorAll('#sound option').length === 9)
  ok(await page.$$eval('#sound option', os => os.map(o => o.value).join()) === 'classic,wood,bell,beep,signal,karatala,pendulum,quartz,clave', tag('the instrument\'s nine sounds to pick from'))
  ok(await state() === undefined, tag('no AudioContext before a press'))
  ok(await page.$$eval('#beats button', bs => bs.map(b => b.dataset.mark).join('')) === 'Xxxx', tag('four beats, the first accented'))

  // layout: no sideways scroll on a phone or a desktop
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h })
    ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, tag(`no horizontal overflow at ${w} px`))
  }

  // a bar of three at 150 BPM, its second beat muted, in the beep: clicks 0.4 s apart, accent 1320 Hz, plain 880 Hz
  await page.selectOption('#sound', 'beep'); await page.selectOption('#count', '3'); await fill('#bpm', 150)
  await page.click('#beats button[data-i="1"]')
  ok(await page.$$eval('#beats button', bs => bs.map(b => b.dataset.mark).join('')) === 'X-x' && await page.getAttribute('#beats button[data-i="1"]', 'aria-label') === 'Beat 2, muted', tag('three beats, the plain second pressed: muted'))
  await page.click('#play'); await page.waitForTimeout(2100)
  ok(await state() === 'running' && await page.getAttribute('#play', 'aria-pressed') === 'true', tag('Start: the context runs, the button pressed'))
  ok(await page.$$eval('#beats .on', bs => bs.length) === 1, tag('one beat lit as it sounds'))
  let c = await clicks()
  const grid = c.every(([t]) => near(t / 0.4, Math.round(t / 0.4), 1e-6)), slots = c.map(([t]) => Math.round(t / 0.4))
  ok(c.length >= 4 && grid && slots.every(k => k % 3 !== 1) && c.every(([, f], i) => f === (slots[i] % 3 ? 880 : 1320)), tag(`clicks on a 0.4 s grid, beat 2 silent, 1320 Hz on 1, 880 Hz on 3 (${c.map(([t, f]) => t.toFixed(3) + '@' + f).join(' ')})`))
  await page.click('#play'); await page.waitForTimeout(300)
  ok(await state() === 'suspended' && await page.$$eval('#beats .on', bs => bs.length) === 0, tag('Stop: the context suspended, nothing lit'))

  // triplets at 100 BPM: a click every 0.2 s, beats and the soft ones between
  await page.click('#beats button[data-i="1"]'); await page.click('[data-sub="3"]'); await fill('#bpm', 100)
  let from = await page.evaluate(() => window.__ctx[0].currentTime)
  await page.click('#play'); await page.waitForTimeout(1500); await page.click('#play')
  c = await clicks(from)
  ok(c.length >= 5 && c.every(([t]) => near(t / 0.2, Math.round(t / 0.2), 1e-6)) && c.slice(1).every(([t], i) => near(t - c[i][0], 0.2, 1e-6)), tag(`triplets at 100 BPM: every 0.2 s (${c.length} clicks)`))

  // the tempo by its keys and its taps
  await fill('#bpm', 120); await page.focus('#bpm'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowUp')
  ok(await page.inputValue('#bpm') === '131' && await page.inputValue('#slider') === '131', tag(`↑ then Shift+↑: 120 → ${await page.inputValue('#bpm')}, the slider with it`))
  await page.click('[data-step="-1"]')
  ok(await page.inputValue('#bpm') === '130', tag('− : 130'))
  await fill('#bpm', 500)
  ok(await page.inputValue('#bpm') === '300', tag('500 typed: 300, the fastest'))
  await page.click('h1')
  for (let k = 0; k < 5; k++) { await page.keyboard.press('t'); await page.waitForTimeout(500) }
  const tapped = +await page.inputValue('#bpm')
  ok(tapped >= 112 && tapped <= 120, tag(`T five times 500 ms apart: ${tapped} BPM (120, less a test runner's own delay)`))

  // Space starts and stops where no field has the focus; Escape stops
  await page.click('h1'); await page.keyboard.press(' '); await page.waitForTimeout(300)
  ok(await state() === 'running', tag('Space starts'))
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  ok(await state() === 'suspended', tag('Escape stops'))

  // a hidden tab lays its clicks two seconds ahead, its timers being slowed
  await page.click('#play'); await page.waitForTimeout(200)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(200)
  const ahead = await page.evaluate(() => Math.max(...window.__osc.map(([t]) => t)) - window.__ctx[0].currentTime)
  ok(ahead > 1.5 && ahead <= 2.05, tag(`hidden, the clicks laid ${ahead.toFixed(2)} s ahead`))
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  await page.click('#play')

  // what was set is kept for the next visit
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#sound option').length === 9)
  ok(await page.inputValue('#bpm') === String(tapped) && await page.inputValue('#count') === '3' && await page.getAttribute('[data-sub="3"]', 'aria-pressed') === 'true' && await page.inputValue('#sound') === 'beep', tag('kept for the next visit: tempo, beats, subdivision, sound'))

  ok(errors.length === 0, tag('no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '')))
  await browser.close()
}
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
