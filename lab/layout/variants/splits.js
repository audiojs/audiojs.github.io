// Splits: the REPL as it is. The script with its console under it, the rack beside them, the sound at the right; the
// history and the agent fold under the rack, as Lightroom folds its panels. Dividers drag, each panel has a key and a
// toggle at the end of the status bar. On a phone the same parts stack in one column under the sound.
import { h } from '../dom.js'
import { panes } from '../panes.js'
import { PANELS } from '../app.js'

export default {
  name: 'splits',
  title: 'Splits',
  line: 'Today’s layout: the script and its console at the left, the rack beside them, the sound at the right; with five panels the history and the agent fold under the rack. Every divider drags.',
  keys: [['1–5', 'show or hide a panel'], ['a divider', 'drag it, or focus it and use the arrows'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const has = n => app.inventory.includes(n)
    const open = { script: true, console: true, rack: true, history: false, agent: false }
    if (app.phone) open.console = false
    const weights = { left: 3, middle: 2.3, view: 4.7, script: 2.4, console: 1, sound: 1.2, rest: 1, below: 1 }
    // the REPL's own switch (View › Script beside the output): beside the sound, or under it
    let beside = true
    const FOLD = { rack: 2, history: 1, agent: 1.4, script: 1.6, console: 1 }
    // a panel under its title, which folds it
    const fold = name => h('section', { class: 'fold' + (open[name] ? ' open' : ''), style: { flexGrow: open[name] ? FOLD[name] : 0 } },
      h('button', { class: 'fold-head', type: 'button', 'data-panel': name, 'aria-expanded': String(open[name]), title: `${PANELS[name].label} (${PANELS[name].key})`, onclick: () => toggle(name) }, h('span', {}, PANELS[name].label), h('kbd', {}, PANELS[name].key)),
      open[name] ? app.part(name) : null)
    const keep = list => w => list.forEach((p, i) => weights[p.key] = w[i])
    function render() {
      if (app.phone) {
        const stack = h('div', { class: 'folds' }, app.inventory.map(fold)), any = app.inventory.some(n => open[n])
        const list = [{ key: 'sound', el: app.part('view'), weight: weights.sound }, { key: 'rest', el: stack, weight: weights.rest }]
        stack.dataset.min = 140
        return app.area.replaceChildren(any ? panes('col', list, { scale: app.scale, onweights: keep(list) }) : h('div', { class: 'split col' }, app.part('view'), stack))
      }
      const left = ['script', 'console'].filter(n => has(n) && open[n]).map(n => ({ key: n, el: app.part(n), weight: weights[n] })), middle = ['rack', 'history', 'agent'].filter(has)
      const cols = []
      if (left.length) cols.push({ key: 'left', el: left.length > 1 ? panes('col', left, { scale: app.scale, onweights: keep(left), label: () => 'Resize the script and the console' }) : left[0].el, weight: weights.left })
      if (middle.some(n => open[n])) cols.push({ key: 'middle', el: h('div', { class: 'folds' }, middle.map(fold)), weight: weights.middle })
      cols.push({ key: 'view', el: app.part('view'), weight: weights.view })
      cols.forEach(c => c.el.dataset.min = c.key === 'view' ? 260 : 190)
      if (!beside && cols.length > 1) {
        const rest = cols.slice(0, -1), under = rest.length > 1 ? panes('row', rest, { scale: app.scale, onweights: keep(rest) }) : rest[0].el, list = [{ key: 'sound', el: app.part('view'), weight: weights.sound }, { key: 'below', el: under, weight: weights.below }]
        under.dataset.min = 160
        return app.area.replaceChildren(panes('col', list, { scale: app.scale, onweights: keep(list) }))
      }
      app.area.replaceChildren(cols.length > 1 ? panes('row', cols, { scale: app.scale, onweights: keep(cols) }) : cols[0].el)
    }
    function toggle(name) {
      open[name] = !open[name]
      render()
      app.changed()
    }
    app.statusToggles()
    render()
    return {
      toggle, shown: n => has(n) && open[n],
      commands: () => app.phone ? [] : [{ label: 'Script beside the sound', checked: beside, run: () => { beside = !beside; render(); app.changed() } }]
    }
  }
}
