// Activity bar: VS Code's arrangement. A strip of icons down the left edge; each shows its panel in the one side bar,
// and pressing the shown one folds the side bar away. The console has the panel under the sound. On a phone the strip
// is a tab bar along the foot, and a panel rises over the sound as a sheet.
import { h, icon } from '../dom.js'
import { panes, sheet, button } from '../panes.js'
import { PANELS } from '../app.js'

export default {
  name: 'fold',
  title: 'Activity bar',
  line: 'VS Code’s arrangement: icons down the left edge, one panel beside them at a time, folded by pressing its icon again. The console sits under the sound.',
  keys: [['1, 3–5', 'show a panel in the side bar, or fold it'], ['2', 'the console under the sound'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const side = app.inventory.filter(n => n !== 'console')
    let active = 'script', folded = false, bottom = true, raised = app.phone ? 'script' : null, height = .5
    const weights = { side: 2.7, main: 7.3, view: 3.2, console: 1 }
    const keep = list => w => list.forEach((p, i) => weights[p.key] = w[i])
    const shown = n => app.phone ? raised === n : n === 'console' ? bottom : !folded && active === n
    function render() {
      if (app.phone) {
        const tabs = h('nav', { class: 'tabbar', 'aria-label': 'Panels' }, app.inventory.map(n => h('button', { type: 'button', 'data-panel': n, 'aria-pressed': String(raised === n), title: `${PANELS[n].label} (${PANELS[n].key})`, onclick: () => toggle(n) }, icon(PANELS[n].icon), h('span', {}, PANELS[n].label))))
        const over = raised && sheet({ title: PANELS[raised].label, body: app.part(raised), height, onclose: () => toggle(raised) })
        app.area.replaceChildren(h('div', { class: 'split col' }, h('div', { class: 'under' }, app.part('view'), over), tabs))
      } else {
        const strip = h('nav', { class: 'activity', 'aria-label': 'Activity bar' },
          side.map(n => h('button', { class: 'icon-button', type: 'button', 'data-panel': n, 'aria-pressed': String(shown(n)), 'aria-label': PANELS[n].label, title: `${PANELS[n].label} (${PANELS[n].key})`, onclick: () => toggle(n) }, icon(PANELS[n].icon))),
          h('span', { class: 'spacer' }),
          h('button', { class: 'icon-button', type: 'button', 'data-panel': 'console', 'aria-pressed': String(bottom), 'aria-label': 'Console', title: 'Console, under the sound (2)', onclick: () => toggle('console') }, icon('console')))
        const view = app.part('view')
        view.dataset.min = 160
        const lower = [{ key: 'view', el: view, weight: weights.view }, { key: 'console', el: app.part('console'), weight: weights.console }]
        const main = bottom ? panes('col', lower, { scale: app.scale, onweights: keep(lower), label: () => 'Resize the console' }) : view
        const bar = !folded && app.titled(active, [button('left', 'Fold the side bar', () => toggle(active))])
        const row = bar ? [{ key: 'side', el: bar, weight: weights.side }, { key: 'main', el: main, weight: weights.main }] : null
        if (bar) { bar.dataset.min = 200; main.dataset.min = 300 }
        app.area.replaceChildren(h('div', { class: 'split row' }, strip, row ? panes('row', row, { scale: app.scale, onweights: keep(row), label: () => 'Resize the side bar' }) : main))
      }
      app.changed()
    }
    function toggle(n) {
      const s = app.el.querySelector('.sheet')
      if (s) height = parseFloat(s.style.height) / 100 || height
      if (app.phone) raised = raised === n ? null : n
      else if (n === 'console') bottom = !bottom
      else if (active === n) folded = !folded
      else { active = n; folded = false }
      render()
    }
    render()
    return { toggle, shown }
  }
}
