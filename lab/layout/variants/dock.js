// Dock: every panel is a tab in a set, as in VS Code, Audition or Blender. Drag a tab onto another set's strip to join
// it, or onto an edge of a set to split beside it; Alt and an arrow move the focused tab the same way. The sound is a
// set of its own that takes panels at its edges only, so no tab can cover it. A closed panel comes back where it was.
// On a phone nothing docks: the panels share one set under the sound.
import { h } from '../dom.js'
import { drawTree, strip, dragTab } from '../panes.js'
import { PANELS } from '../app.js'
import { set, split, sets, where, add, beside, edge, remove, show } from '../tree.js'

export default {
  name: 'dock',
  title: 'Dock',
  line: 'Every panel is a tab in a set. Drag a tab onto a strip to join that set, onto an edge to split beside it. The sound takes panels at its edges only.',
  keys: [['1–5', 'show or close a panel'], ['drag a tab', 'to a strip or an edge'], ['Alt + arrows', 'move the focused tab'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const panels = app.inventory
    const initial = () => app.phone
      ? split('col', [set(['view'], 'view', 'sound'), set(panels, 'script')], [1.2, 1])
      : split('row', [
        split('col', [set(['script']), set(['console'])], [2.4, 1]),
        set(['view'], 'view', 'sound'),
        panels.length > 3 ? split('col', [set(['rack', 'history']), set(['agent'])], [1.6, 1]) : set(['rack'])
      ], [3, 4.6, 2.4])
    let tree = initial(), saved = null, focused = null
    const home = {}
    const isView = s => s.tabs[0] === 'view'

    // a set: its strip of tabs over the one shown; the sound's set has no strip
    function leaf(s) {
      if (isView(s)) return h('div', { class: 'tabset view-set', 'data-set': s.id, 'data-min': 260 }, h('div', { class: 'body' }, app.part('view')))
      const tabs = strip({
        tabs: s.tabs.map(t => ({ id: t, label: PANELS[t].label, icon: PANELS[t].icon, title: `${PANELS[t].label} (${PANELS[t].key})${app.phone ? '' : '; drag to dock'}` })), active: s.active, label: 'Panels',
        onselect: t => { tree = show(tree, t); render(t) }, onclose: close, dragger: app.phone ? null : dragger
      })
      return h('div', { class: 'tabset' + (s.id === focused ? ' focused' : ''), 'data-set': s.id, 'data-min': 150 }, tabs, h('div', { class: 'body' }, app.part(s.active)))
    }
    function render(focus) {
      app.area.replaceChildren(drawTree(tree, { leaf, scale: app.scale, onweights: (node, w) => { node.weights = [...w] } }))
      app.changed()
      if (focus) app.area.querySelector(`.tab[data-tab="${focus}"]`)?.focus({ preventScroll: true })
    }
    function close(t) {
      const s = where(tree, t)
      if (!s) return
      home[t] = { set: s.id, index: s.tabs.indexOf(t) }
      tree = remove(tree, t)
      render()
      if (!app.el.contains(document.activeElement)) app.el.focus({ preventScroll: true })
    }
    function open(t) {
      const back = home[t], there = back && sets(tree).find(s => s.id === back.set), other = sets(tree).find(s => !isView(s))
      tree = there ? add(tree, there.id, t, back.index) : app.phone && other ? add(tree, other.id, t) : app.phone ? split('col', [tree, set([t])], [1.2, 1]) : edge(tree, 'right', t)
      render(t)
    }

    // Dragging a tab: onto a strip it joins that set, onto an edge of a set it splits beside it
    function target(e) {
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find(x => app.area.contains(x) && x.closest('.tabset'))?.closest('.tabset')
      if (!hit) return null
      const r = hit.getBoundingClientRect(), view = hit.classList.contains('view-set'), bar = hit.querySelector('.strip')?.getBoundingClientRect()
      if (bar && e.clientY <= bar.bottom) {
        const index = [...hit.querySelectorAll('.tab')].filter(t => { const b = t.getBoundingClientRect(); return b.left + b.width / 2 < e.clientX }).length
        return { id: hit.dataset.set, side: 'center', index, rect: bar }
      }
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, d = { left: x, right: 1 - x, top: y, bottom: 1 - y }
      const side = Object.keys(d).reduce((a, b) => d[a] < d[b] ? a : b)
      if (!view && d[side] > .28) return { id: hit.dataset.set, side: 'center', rect: r }
      const [left, top, width, height] = { left: [r.left, r.top, r.width / 2, r.height], right: [r.left + r.width / 2, r.top, r.width / 2, r.height], top: [r.left, r.top, r.width, r.height / 2], bottom: [r.left, r.top + r.height / 2, r.width, r.height / 2] }[side]
      return { id: hit.dataset.set, side, rect: { left, top, width, height } }
    }
    const dragger = (button, t) => dragTab(app, button, PANELS[t].label, {
      target,
      drop(to) {
        if (to.side !== 'center') tree = beside(tree, to.id, to.side, t)
        else if (!isView(sets(tree).find(x => x.id === to.id))) tree = add(tree, to.id, t, to.index)
        render(t)
      }
    })
    // Alt and an arrow: the focused tab joins the nearest set that way, or splits off along the layout's outer edge
    function nudge(t, key) {
      const from = app.area.querySelector(`.tabset[data-set="${where(tree, t)?.id}"]`)?.getBoundingClientRect()
      if (!from) return
      const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key], mid = r => [r.left + r.width / 2, r.top + r.height / 2], [fx, fy] = mid(from)
      const ahead = ({ r }) => { const [x, y] = mid(r); return dx ? (x - fx) * dx > 8 && r.top < from.bottom && r.bottom > from.top : (y - fy) * dy > 8 && r.left < from.right && r.right > from.left }
      const next = [...app.area.querySelectorAll('.tabset:not(.view-set)')].map(el => ({ id: el.dataset.set, r: el.getBoundingClientRect() })).filter(ahead)
        .sort((a, b) => Math.hypot(mid(a.r)[0] - fx, mid(a.r)[1] - fy) - Math.hypot(mid(b.r)[0] - fx, mid(b.r)[1] - fy))[0]
      tree = next ? add(tree, next.id, t) : edge(tree, { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[key], t)
      render(t)
    }
    // the set holding the focus marks its tab: Alt and the arrows move that one
    const track = e => {
      const s = e.target.closest?.('.tabset:not(.view-set)'), id = s?.dataset.set ?? null
      if (id === focused) return
      app.area.querySelector('.tabset.focused')?.classList.remove('focused')
      s?.classList.add('focused')
      focused = id
    }
    app.el.addEventListener('focusin', track)

    render()
    return {
      shown: t => where(tree, t)?.active === t,
      toggle: t => where(tree, t)?.active === t ? close(t) : where(tree, t) ? (tree = show(tree, t), render(t)) : open(t),
      solo(on) { if (on) { saved = tree; tree = set(['view'], 'view', 'sound') } else { tree = saved ?? initial(); saved = null } render() },
      key(e) { const t = e.target.closest?.('.tab')?.dataset.tab; if (!e.altKey || app.phone || !t || !e.key.startsWith('Arrow')) return false; nudge(t, e.key); return true },
      commands: () => app.phone ? [] : [{ label: 'Reset the layout', run: () => { tree = initial(); render() } }],
      destroy: () => app.el.removeEventListener('focusin', track)
    }
  }
}
