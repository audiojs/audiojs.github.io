// The bench: one frame, a layout in it at a desktop's width or a phone's, with the five panels planned or three.
// Switching builds the layout fresh: nothing is kept. Below, the verdict's numbers, measured on each layout as it
// opens with the script and the rack shown: how much of the frame the sound gets, and whether the script, the rack and
// the sound show at once; and each layout's size, in lines of this page's code.
import { demo } from '../kit.js'
import { create } from './app.js'
import splits from './variants/splits.js'
import dock from './variants/dock.js'
import fold from './variants/fold.js'
import context from './variants/context.js'
import tabs from './variants/tabs.js'
import float from './variants/float.js'
import modules from './variants/modules.js'
import { h } from './dom.js'

export const variants = [splits, dock, fold, context, tabs, float, modules]
const DESKTOP = { width: 1024, height: 720 }, PHONE = { width: 390, height: 760 }

const figure = document.querySelector('#bench'), stage = figure.querySelector('.stage'), caption = figure.querySelector('figcaption')
let app = null, key = ''
// read on a phone, the bench starts at a phone's width
if (figure.clientWidth < 600) figure.querySelectorAll('[data-name="size"] button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === 'phone')))
// the design size, and the scale that fits it into the stage
function fit(phone) {
  const room = figure.clientWidth
  if (phone) return { width: Math.min(PHONE.width, room), height: PHONE.height, scale: 1 }
  return room >= DESKTOP.width ? { width: room, height: DESKTOP.height, scale: 1 } : { width: DESKTOP.width, height: DESKTOP.height, scale: room / DESKTOP.width }
}
function place() {
  if (!app) return
  const { width, height, scale } = fit(app.phone)
  Object.assign(app.el.style, { width: width + 'px', height: height + 'px', transform: scale < 1 ? `scale(${scale})` : '' })
  app.el.dataset.scale = scale
  Object.assign(stage.style, { width: width * scale + 'px', height: height * scale + 'px' })
}
demo(figure, v => {
  const variant = variants.find(x => x.name === v.variant) ?? splits, phone = v.size === 'phone', panels = +v.panels || 5, next = [variant.name, phone, panels].join()
  if (next !== key) {
    const focus = figure.contains(document.activeElement) && stage.contains(document.activeElement)
    app?.destroy()
    key = next
    app = create(variant, { phone, panels })
    stage.replaceChildren(app.el)
    caption.querySelector('.name').textContent = variant.title
    caption.querySelector('.line').textContent = variant.line
    caption.querySelector('.keys').replaceChildren(...variant.keys.map(([k, text]) => h('li', {}, h('kbd', {}, k), text)), h('li', {}, h('kbd', {}, '⌘K'), 'the command line'), h('li', {}, h('kbd', {}, 'Space'), 'play'))
    if (focus) app.el.focus({ preventScroll: true })
  }
  place()
})

// ── The verdict's numbers ───────────────────────────────────────

// Each layout built out of sight at the bench's sizes: at work (three panels, as the REPL has them, the script and the
// rack shown), and with all five panels asked to show. A star: they cannot all show with the sound at once.
const table = document.querySelector('#verdict')
const percent = r => Math.round(r.sound * 100) + '%' + (r.together ? '' : '*')
// a module's size: its lines that are neither blank nor comments
const count = name => fetch(new URL(name, import.meta.url)).then(r => r.text()).then(text => text.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length).catch(() => null)
async function measure() {
  const sandbox = h('div', { 'aria-hidden': 'true', inert: '', style: { position: 'absolute', left: '-12000px', top: '0', visibility: 'hidden' } })
  document.body.append(sandbox)
  const trial = async (variant, phone, panels, want, alone = false) => {
    const size = phone ? PHONE : { width: 1392, height: DESKTOP.height }, a = create(variant, { phone, panels })
    Object.assign(a.el.style, { width: size.width + 'px', height: size.height + 'px' })
    sandbox.replaceChildren(a.el)
    want.forEach(n => a.show(n))
    if (alone) a.solo(true)
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    const r = a.measure(want)
    a.destroy()
    return r
  }
  const cell = (row, key, text) => { const c = row.querySelector(`[data-measure="${key}"]`); if (c) c.textContent = text }
  for (const variant of variants) {
    const row = table.querySelector(`tr[data-variant="${variant.name}"]`)
    if (!row) continue
    cell(row, 'desktop', percent(await trial(variant, false, 3, ['script', 'rack'])))
    cell(row, 'phone', percent(await trial(variant, true, 3, ['script', 'rack'])))
    cell(row, 'all', percent(await trial(variant, false, 5, ['script', 'console', 'rack', 'history', 'agent'])))
    const lines = await count(`variants/${variant.name}.js`)
    if (lines) cell(row, 'lines', lines)
  }
  const tree = document.querySelector('[data-measure="tree"]'), shared = await count('tree.js')
  if (tree && shared) tree.textContent = shared
  // for scale: every panel away
  const alone = document.querySelector('[data-measure="alone"]')
  if (alone) alone.textContent = Math.round((await trial(splits, false, 3, [], true)).sound * 100) + '%'
  sandbox.remove()
  table.classList.remove('measuring')
}
if (table) new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); measure() } }, { rootMargin: '400px' }).observe(table)
