// Floating: the sound takes the whole slab and the panels float over it as windows, the way plug-in windows float
// over a DAW. Drag a window by its title, size it by its corner, raise it with a click; drop it on the left or right
// edge (or use its buttons) to dock it there, beside the sound, and float it again from its title. On a phone there is
// no room to float: a panel rises as a sheet.
import { h, drag, clamp } from '../dom.js'
import { panes, sheet, button } from '../panes.js'
import { PANELS } from '../app.js'

// where each window opens, as parts of the slab: left, top, width, height; clear of the view's own head
const PLACES = { script: [.015, .08, .36, .42], rack: [.735, .08, .25, .56], console: [.015, .56, .42, .3], history: [.5, .52, .22, .38], agent: [.47, .08, .25, .42] }

export default {
  name: 'float',
  title: 'Floating',
  line: 'The sound takes the whole slab; the panels float over it as windows. Drag a title to move one, its corner to size it, onto the left or right edge to dock it.',
  keys: [['1–5', 'open or close a window'], ['a title', 'drag to move, to an edge to dock'], ['Alt + arrows', 'move the focused window; with Shift, size it'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const wins = Object.fromEntries(app.inventory.map(n => [n, { at: [...PLACES[n]], open: n === 'script' || n === 'rack', dock: null, z: 1 }]))
    let top = 2, raised = app.phone ? 'script' : null, height = .5, preview = null
    const weights = { left: 2.6, floor: 7.4, right: 2.4 }
    const floor = h('div', { class: 'floor' })
    const minW = 220, minH = 120

    function frame(n) {
      const w = wins[n], docked = !!w.dock
      const head = h('header', { class: 'window-head', title: docked ? 'Drag to float' : 'Drag to move; drop on an edge to dock' }, h('p', {}, PANELS[n].label),
        h('div', { class: 'head-end' },
          docked ? button('float', 'Float it', () => place(n, null)) : [button('left', 'Dock it left', () => place(n, 'left')), button('dock-right', 'Dock it right', () => place(n, 'right'))],
          button('close', `Close ${PANELS[n].label} (${PANELS[n].key})`, () => toggle(n))))
      const el = h('section', { class: 'window' + (docked ? ' docked' : ''), 'data-panel': n, 'aria-label': PANELS[n].label, 'data-float': docked ? null : '' }, head, app.part(n))
      if (!docked) {
        const [x, y, ww, hh] = w.at
        Object.assign(el.style, { left: x * 100 + '%', top: y * 100 + '%', width: ww * 100 + '%', height: hh * 100 + '%', zIndex: w.z })
        const grip = h('div', { class: 'grip', 'aria-hidden': 'true' })
        el.append(grip)
        // the corner stays where it was grabbed, not under the pointer's tip
        let off = [0, 0]
        drag(grip, { threshold: 0, start: down => { raise(n, el); const r = el.getBoundingClientRect(); off = [r.right - down.clientX, r.bottom - down.clientY] }, move: e => resize(n, el, e.clientX + off[0], e.clientY + off[1]) })
      }
      drag(head, { filter: e => !e.target.closest('button'), start: e => { raise(n, el); grab = { x: e.clientX, y: e.clientY, at: [...w.at], docked } }, move: e => move(n, el, e), end: e => drop(n, e) })
      el.addEventListener('pointerdown', () => raise(n, el))
      return el
    }
    let grab = null
    const size = () => { const r = floor.getBoundingClientRect(), s = app.scale(); return { r, W: r.width / s, H: r.height / s, s } }
    function raise(n, el) { if (wins[n].z < top) { wins[n].z = ++top; el.style.zIndex = top } }
    function move(n, el, e) {
      const w = wins[n], { r, W, H } = size()
      if (grab.docked) return edge(e, r)
      const [x0, y0, ww, hh] = grab.at
      w.at[0] = clamp(x0 + (e.clientX - grab.x) / r.width, 0, 1 - ww)
      w.at[1] = clamp(y0 + (e.clientY - grab.y) / r.height, 0, 1 - hh)
      Object.assign(el.style, { left: w.at[0] * 100 + '%', top: w.at[1] * 100 + '%' })
      edge(e, r, W, H)
    }
    // near the left or right edge a window would dock: show where
    function edge(e, r) {
      const side = e.clientX < r.left + 28 ? 'left' : e.clientX > r.right - 28 ? 'right' : null
      preview?.remove(); preview = null
      if (!side) return
      preview = h('div', { class: 'drop' })
      Object.assign(preview.style, { top: 0, bottom: 0, width: '26%', [side]: 0, left: side === 'left' ? 0 : 'auto', position: 'absolute' })
      floor.append(preview)
    }
    function drop(n, e) {
      const { r } = size(), side = e.clientX < r.left + 28 ? 'left' : e.clientX > r.right - 28 ? 'right' : null
      preview?.remove(); preview = null
      if (side) return place(n, side)
      if (grab?.docked) {
        // a docked window dragged out floats where it was let go
        const w = wins[n]
        w.at[0] = clamp((e.clientX - r.left) / r.width - w.at[2] / 2, 0, 1 - w.at[2]); w.at[1] = clamp((e.clientY - r.top) / r.height - .02, 0, 1 - w.at[3])
        place(n, null)
      }
    }
    function resize(n, el, cx, cy) {
      const w = wins[n], { r, W, H } = size(), [x, y] = w.at
      w.at[2] = clamp((cx - r.left) / r.width - x, minW / W, 1 - x)
      w.at[3] = clamp((cy - r.top) / r.height - y, minH / H, 1 - y)
      Object.assign(el.style, { width: w.at[2] * 100 + '%', height: w.at[3] * 100 + '%' })
    }
    function place(n, dock) { wins[n].dock = dock; wins[n].open = true; render(n) }

    function render(focus) {
      if (app.phone) {
        const over = raised && sheet({ title: PANELS[raised].label, body: app.part(raised), height, onclose: () => toggle(raised) })
        floor.replaceChildren(app.part('view'), ...over ? [over] : [])
        app.area.replaceChildren(floor)
        return app.changed()
      }
      const open = n => wins[n].open, side = d => app.inventory.filter(n => open(n) && wins[n].dock === d)
      floor.replaceChildren(app.part('view'), ...app.inventory.filter(n => open(n) && !wins[n].dock).map(frame))
      const columns = [['left', side('left')], ['floor'], ['right', side('right')]].filter(([k, list]) => k === 'floor' || list.length)
        .map(([key, list]) => ({ key, weight: weights[key], el: key === 'floor' ? floor : h('div', { class: 'split col docks', 'data-min': 220 }, list.map(frame)) }))
      floor.dataset.min = 280
      app.area.replaceChildren(columns.length > 1 ? panes('row', columns, { scale: app.scale, onweights: w => columns.forEach((c, i) => weights[c.key] = w[i]) }) : floor)
      app.changed()
      if (focus) app.area.querySelector(`.window[data-panel="${focus}"] .window-head button`)?.focus({ preventScroll: true })
    }
    function toggle(n) {
      const s = app.el.querySelector('.sheet')
      if (s) height = parseFloat(s.style.height) / 100 || height
      if (app.phone) raised = raised === n ? null : n
      else { wins[n].open = !wins[n].open; if (wins[n].open) wins[n].z = ++top }
      render()
    }
    // Alt and the arrows move the window holding the focus; with Shift they size it
    function key(e) {
      const el = e.target.closest?.('.window:not(.docked)'), n = el?.dataset.panel, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!e.altKey || !n || !d || app.phone) return false
      const w = wins[n], { W, H } = size(), step = 24
      if (e.shiftKey) { w.at[2] = clamp(w.at[2] + d[0] * step / W, minW / W, 1 - w.at[0]); w.at[3] = clamp(w.at[3] + d[1] * step / H, minH / H, 1 - w.at[1]) }
      else { w.at[0] = clamp(w.at[0] + d[0] * step / W, 0, 1 - w.at[2]); w.at[1] = clamp(w.at[1] + d[1] * step / H, 0, 1 - w.at[3]) }
      Object.assign(el.style, { left: w.at[0] * 100 + '%', top: w.at[1] * 100 + '%', width: w.at[2] * 100 + '%', height: w.at[3] * 100 + '%' })
      return true
    }
    app.statusToggles()
    render()
    return {
      toggle, key,
      shown: n => app.phone ? raised === n : wins[n].open,
      commands: () => app.phone ? [] : [{ label: 'Tidy the windows', run: () => { app.inventory.forEach((n, i) => { if (!wins[n].dock) wins[n].at = [.02 + i * .03, .03 + i * .05, .34, .42] }); render() } }]
    }
  }
}
