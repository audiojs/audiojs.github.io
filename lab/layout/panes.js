// What the layouts are built of: a divider that drags and takes arrow keys; panes in a row or a column that flex by
// weight, a divider between each two; a tree of those with tab sets for leaves; a tab strip; a titled section; a sheet
// that rises from the foot of a phone. Pixels are the app's own: the app may be drawn scaled (app.scale()).
import { h, icon, clamp, drag } from './dom.js'

// Between two panes of a row (it moves left and right) or a column: dragging it, or its arrow keys (Shift: four times
// further), moves size from one to the other, each kept at its data-min or 120 px. onmove(share) gets the part of
// the two that goes to the first.
export function divider(dir, { before, after, scale = () => 1, onmove, label = 'Resize' }) {
  const row = dir === 'row', el = h('div', { class: 'divider ' + dir, role: 'separator', tabindex: 0, 'aria-orientation': row ? 'vertical' : 'horizontal', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100 })
  const size = e => { const r = e.getBoundingClientRect(); return (row ? r.width : r.height) / scale() }
  const min = e => +(e.dataset.min || 120)
  const set = (a, total) => {
    const share = clamp(a, Math.min(min(before()), total / 2), total - Math.min(min(after()), total / 2)) / total
    onmove(share)
    el.setAttribute('aria-valuenow', Math.round(share * 100))
  }
  el.addEventListener('pointerdown', e => {
    if (e.button) return
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    el.classList.add('held')
    const start = row ? e.clientX : e.clientY, a = size(before()), total = a + size(after())
    const move = m => set(a + ((row ? m.clientX : m.clientY) - start) / scale(), total)
    const up = () => { el.classList.remove('held'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  })
  el.addEventListener('keydown', e => {
    const sign = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
    if (!sign && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    e.stopPropagation()
    const a = size(before()), total = a + size(after())
    set(e.key === 'Home' ? 0 : e.key === 'End' ? total : a + sign * (e.shiftKey ? 64 : 16), total)
  })
  return el
}

// Panes [{ el, weight }] in a row or a column; a divider between each two moves weight between them, and
// onweights(weights) hears where it settles
export function panes(dir, list, { scale, onweights, label } = {}) {
  const el = h('div', { class: 'split ' + dir }), weights = list.map(p => p.weight ?? 1)
  list.forEach((p, i) => {
    p.el.style.flex = `${weights[i]} 1 0`
    if (i) el.append(divider(dir, {
      before: () => list[i - 1].el, after: () => p.el, scale, label: label?.(i) ?? 'Resize',
      onmove(share) {
        const sum = weights[i - 1] + weights[i]
        weights[i - 1] = sum * share; weights[i] = sum - weights[i - 1]
        list[i - 1].el.style.flexGrow = weights[i - 1]; p.el.style.flexGrow = weights[i]
        onweights?.(weights)
      }
    }))
    el.append(p.el)
  })
  return el
}

// A tree (tree.js) as nested panes: leaf(set) draws each set; onweights(split, weights) hears a divider settle
export function drawTree(node, { leaf, scale, onweights }) {
  if (node.type === 'set') return leaf(node)
  return panes(node.dir, node.children.map((c, i) => ({ el: drawTree(c, { leaf, scale, onweights }), weight: node.weights[i] })), { scale, onweights: w => onweights?.(node, w) })
}

// A strip of tabs, one pressed: arrows move between them, Enter or a click shows one, Delete or its × closes it.
// tabs: [{ id, label, icon, closable }]
export function strip({ tabs, active, label, onselect, onclose, extra = [], dragger }) {
  const list = h('div', { class: 'tablist', role: 'tablist', 'aria-label': label })
  const buttons = tabs.map(t => {
    const b = h('button', { class: 'tab', role: 'tab', 'aria-selected': String(t.id === active), tabindex: t.id === active ? 0 : -1, 'data-tab': t.id, title: t.title ?? t.label, onclick: () => onselect?.(t.id) },
      t.icon && icon(t.icon), h('span', {}, t.label),
      t.closable !== false && onclose && h('span', { class: 'x', role: 'presentation', title: 'Close ' + t.label, onclick: e => { e.stopPropagation(); onclose(t.id) } }, icon('close', 1.7)))
    dragger?.(b, t.id)
    return b
  })
  list.append(...buttons)
  list.addEventListener('keydown', e => {
    const i = buttons.indexOf(e.target.closest('.tab'))
    if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: buttons.length - 1 }[e.key]
    if (to != null) { e.preventDefault(); e.stopPropagation(); const b = buttons[(to + buttons.length) % buttons.length]; buttons.forEach(x => x.tabIndex = -1); b.tabIndex = 0; b.focus() }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && onclose && tabs[i].closable !== false) { e.preventDefault(); e.stopPropagation(); onclose(tabs[i].id) }
  })
  return h('div', { class: 'strip' }, list, extra.length ? h('div', { class: 'strip-end' }, extra) : null)
}

// A part under a small caps title, with buttons at its right
export const titled = (title, part, actions = []) => h('section', { class: 'titled', 'data-part-of': part.dataset.part }, h('header', { class: 'panel-head' }, h('p', {}, title), actions.length ? h('div', { class: 'head-end' }, actions) : null), part)

export const button = (name, label, onclick, attrs = {}) => h('button', { class: 'icon-button', type: 'button', 'aria-label': label, title: label, onclick, ...attrs }, icon(name))

// A sheet over the foot of a phone's area: its grabber drags its height (arrow keys too), its × or Esc closes it
export function sheet({ title, body, height = .55, onclose, scale = () => 1, actions = [] }) {
  const grab = h('div', { class: 'grab', role: 'separator', tabindex: 0, 'aria-orientation': 'horizontal', 'aria-label': 'Sheet height', title: 'Drag to resize; arrow keys too' })
  const el = h('section', { class: 'sheet', 'data-float': '', 'aria-label': title, style: { height: height * 100 + '%' } },
    grab,
    h('header', { class: 'panel-head' }, h('p', {}, title), h('div', { class: 'head-end' }, ...actions, button('close', 'Close ' + title, () => onclose?.()))),
    body)
  const fit = share => { share = clamp(share, .25, .92); el.style.height = share * 100 + '%'; grab.setAttribute('aria-valuenow', Math.round(share * 100)) }
  grab.addEventListener('pointerdown', e => {
    e.preventDefault()
    grab.setPointerCapture(e.pointerId)
    const area = el.parentElement.getBoundingClientRect(), move = m => fit((area.bottom - m.clientY) / area.height)
    const up = () => { grab.removeEventListener('pointermove', move); grab.removeEventListener('pointerup', up) }
    grab.addEventListener('pointermove', move)
    grab.addEventListener('pointerup', up)
  })
  grab.addEventListener('keydown', e => {
    const d = { ArrowUp: .08, ArrowDown: -.08 }[e.key]
    if (!d) return
    e.preventDefault()
    e.stopPropagation()
    fit(el.getBoundingClientRect().height / el.parentElement.getBoundingClientRect().height + d)
  })
  return el
}

// A tab dragged: a ghost of its label follows the pointer, and where it would land is drawn over the app.
// target(e) returns { rect } (client pixels) or null; drop(target) acts on release.
export function dragTab(app, button, label, { target, drop }) {
  const ghost = h('div', { class: 'ghost' }, label), cover = h('div', { class: 'drop' })
  const local = (x, y) => { const r = app.el.getBoundingClientRect(), s = app.scale(); return [(x - r.left) / s, (y - r.top) / s] }
  drag(button, {
    start() { cover.hidden = true; app.layer.append(ghost, cover); app.el.classList.add('dragging') },
    move(e) {
      const [x, y] = local(e.clientX, e.clientY), to = target(e), s = app.scale()
      Object.assign(ghost.style, { left: x + 'px', top: y + 'px' })
      cover.hidden = !to
      if (!to) return
      const [left, top] = local(to.rect.left, to.rect.top)
      Object.assign(cover.style, { left: left + 'px', top: top + 'px', width: to.rect.width / s + 'px', height: to.rect.height / s + 'px' })
    },
    end(e) {
      const to = target(e)
      ghost.remove(); cover.remove()
      app.el.classList.remove('dragging')
      if (to) drop(to)
    }
  })
}
