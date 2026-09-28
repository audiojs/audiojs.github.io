// Modules: Lightroom Classic's answer. The work is cut into stages, each with a layout the designer made for it:
// Code for the script, Tune for the rack, Deliver for the check and the export. The picker in the bar switches them, and
// so do Alt 1–3. A panel belongs to one module; its key takes you there. On a phone the picker sits over the sound.
import { h } from '../dom.js'
import { panes } from '../panes.js'
import { PANELS } from '../app.js'

const MODULES = [
  { name: 'code', label: 'Code', panels: ['script', 'console', 'agent'] },
  { name: 'tune', label: 'Tune', panels: ['rack', 'history'] },
  { name: 'deliver', label: 'Deliver', panels: ['check'] }
]

export default {
  name: 'modules',
  title: 'Modules',
  line: 'Lightroom’s answer: the work in stages, each laid out by the designer. Code holds the script and the console, Tune the rack and the history, Deliver the check and the export.',
  keys: [['Alt 1–3', 'Code, Tune, Deliver'], ['1–5', 'a panel, in the module that holds it'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const has = n => app.inventory.includes(n) || n === 'check'
    let module = MODULES[0]
    const hidden = new Set(), weights = { left: 4, sound: 6, right: 3, script: 2.4, console: 1, rack: 2, history: 1, stack: 1 }
    const picker = h('div', { class: 'modules', role: 'group', 'aria-label': 'Module' }, MODULES.map((x, i) => h('button', { type: 'button', 'data-module': x.name, title: `${x.label} (Alt ${i + 1})`, onclick: () => go(x) }, x.label)))
    if (!app.phone) app.slot.replaceChildren(picker)
    const here = () => module.panels.filter(n => has(n) && !hidden.has(n))
    const keep = list => w => list.forEach((p, i) => weights[p.key] = w[i])
    const column = names => {
      const list = names.map(n => ({ key: n, el: n === 'script' || n === 'console' ? app.part(n) : app.titled(n), weight: weights[n] ?? 1 }))
      return list.length > 1 ? panes('col', list, { scale: app.scale, onweights: keep(list) }) : list[0].el
    }
    function render() {
      picker.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.module === module.name)))
      const shown = here(), view = app.part('view')
      let body
      if (app.phone) {
        const list = [{ key: 'sound', el: view, weight: weights.sound }, ...shown.length ? [{ key: 'stack', el: column(shown), weight: weights.stack * 5 }] : []]
        body = h('div', { class: 'split col' }, h('div', { class: 'module-row' }, picker), list.length > 1 ? panes('col', list, { scale: app.scale, onweights: keep(list) }) : view)
      } else {
        const code = module.name === 'code', left = code ? shown.filter(n => n !== 'agent') : [], right = code ? shown.filter(n => n === 'agent') : shown
        const cols = [...left.length ? [{ key: 'left', el: column(left), weight: weights.left }] : [], { key: 'sound', el: view, weight: weights.sound }, ...right.length ? [{ key: 'right', el: column(right), weight: weights.right }] : []]
        cols.forEach(c => c.el.dataset.min = c.key === 'sound' ? 280 : 200)
        body = cols.length > 1 ? panes('row', cols, { scale: app.scale, onweights: keep(cols) }) : view
      }
      app.area.replaceChildren(body)
      app.changed()
    }
    function go(x) { if (x !== module) { module = x; render() } }
    function toggle(n) {
      const owner = MODULES.find(x => x.panels.includes(n))
      if (owner !== module) { module = owner; hidden.delete(n) }
      else hidden.has(n) ? hidden.delete(n) : hidden.add(n)
      render()
    }
    render()
    return {
      toggle,
      shown: n => module.panels.includes(n) && !hidden.has(n),
      key(e) { const i = +e.code.replace('Digit', '') - 1; if (!e.altKey || !MODULES[i]) return false; go(MODULES[i]); return true },
      commands: () => MODULES.map((x, i) => ({ label: `${x.label} module`, key: `⌥${i + 1}`, checked: x === module, run: () => go(x) }))
    }
  }
}
