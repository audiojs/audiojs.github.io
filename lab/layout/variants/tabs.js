// Tabs: the REPL as a set of tabs, the way a browser or VS Code's editor keeps documents. The waveform and the
// spectrogram are tabs like the script and the rack; a tab splits off to the right or below, so two show at once; a
// tab dragged onto another strip joins it. On a phone one set holds them all, and a split stacks two.
import { h } from '../dom.js'
import { drawTree, strip, dragTab, button } from '../panes.js'
import { PANELS } from '../app.js'
import { set, split, sets, where, add, beside, remove, show } from '../tree.js'

const VIEWS = { wave: { label: 'Waveform', key: '6', icon: 'wave' }, spec: { label: 'Spectrogram', key: '7', icon: 'spec' } }

export default {
  name: 'tabs',
  title: 'Tabs',
  line: 'Everything is a tab, the waveform and the spectrogram too. Split a tab off to the right or below to see two at once; drag a tab onto another strip to move it there.',
  keys: [['1–5', 'a panel’s tab'], ['6, 7', 'the waveform, the spectrogram'], ['\\ or |', 'split the tab off, right or below'], ['[ ]', 'the tab before, after'], ['`', 'the sound alone; hold to peek']],
  mount(app) {
    const info = t => VIEWS[t] ?? PANELS[t], views = {}
    const part = t => VIEWS[t] ? views[t] ||= app.view({ lanes: t }) : app.part(t)
    const initial = () => app.phone ? set(['wave', 'spec', ...app.inventory], 'wave') : split('row', [set(app.inventory, 'script'), set(['wave', 'spec'], 'wave')], [4, 6])
    let tree = initial(), focused = sets(tree)[0].id, saved = null
    const home = {}
    const focusedSet = () => sets(tree).find(s => s.id === focused) ?? sets(tree)[0]

    function leaf(s) {
      const one = s.tabs.length < 2, full = app.phone && sets(tree).length > 1
      const extra = [
        !app.phone && button('right', 'Split the tab off to the right (\\)', () => off(s.id, 'right'), { disabled: one }),
        button('down', 'Split the tab off below (|)', () => off(s.id, 'bottom'), { disabled: one || full })
      ].filter(Boolean)
      const tabs = strip({ tabs: s.tabs.map(t => ({ id: t, label: info(t).label, icon: info(t).icon, title: `${info(t).label} (${info(t).key})` })), active: s.active, label: 'Tabs', onselect: t => { tree = show(tree, t); render(t) }, onclose: close, extra, dragger })
      return h('div', { class: 'tabset' + (s.id === focused ? ' focused' : ''), 'data-set': s.id, 'data-min': 180 }, tabs, h('div', { class: 'body' }, part(s.active)))
    }
    function render(focus) {
      app.area.replaceChildren(tree ? drawTree(tree, { leaf, scale: app.scale, onweights: (node, w) => { node.weights = [...w] } }) : h('div', { class: 'empty' }, 'Every tab is closed. 1–7 open them.'))
      app.changed()
      if (focus) app.area.querySelector(`.tab[data-tab="${focus}"]`)?.focus({ preventScroll: true })
    }
    // the shown tab of set `id` in a set of its own, beside it
    function off(id, side) {
      const s = sets(tree).find(x => x.id === id)
      if (!s || s.tabs.length < 2 || (app.phone && sets(tree).length > 1)) return
      tree = beside(tree, id, app.phone ? 'bottom' : side, s.active)
      render(where(tree, s.active) && s.active)
    }
    function close(t) {
      const s = where(tree, t)
      if (!s) return
      home[t] = { set: s.id, index: s.tabs.indexOf(t) }
      tree = remove(tree, t)
      render()
    }
    function open(t) {
      const back = home[t], there = back && sets(tree).find(s => s.id === back.set), into = there ?? focusedSet()
      tree = into ? add(tree, into.id, t, there ? back.index : undefined) : set([t])
      render(t)
    }
    const toggle = t => where(tree, t)?.active === t ? close(t) : where(tree, t) ? (tree = show(tree, t), render(t)) : open(t)
    const step = d => { const s = focusedSet(); if (!s) return; const t = s.tabs[(s.tabs.indexOf(s.active) + d + s.tabs.length) % s.tabs.length]; tree = show(tree, t); render(t) }
    // a tab dropped anywhere on a set joins it, where the pointer is along its strip
    const dragger = (button, t) => dragTab(app, button, info(t).label, {
      target(e) {
        const hit = document.elementsFromPoint(e.clientX, e.clientY).find(x => app.area.contains(x) && x.closest('.tabset'))?.closest('.tabset')
        if (!hit) return null
        const index = [...hit.querySelectorAll('.tab')].filter(b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX }).length
        return { id: hit.dataset.set, index, rect: hit.querySelector('.strip').getBoundingClientRect() }
      },
      drop(to) { tree = add(tree, to.id, t, to.index); render(t) }
    })
    const track = e => {
      const s = e.target.closest?.('.tabset'), id = s?.dataset.set
      if (!id || id === focused) return
      app.area.querySelector('.tabset.focused')?.classList.remove('focused')
      s.classList.add('focused')
      focused = id
    }
    app.el.addEventListener('focusin', track)

    render()
    return {
      shown: t => where(tree, t)?.active === t,
      toggle,
      // the waveform and the spectrogram are tabs here, not lanes
      lanes: false,
      solo(on) {
        if (on) { saved = tree; const s = sets(tree).find(x => VIEWS[x.active]) ?? sets(tree).find(x => x.tabs.some(t => VIEWS[t])); tree = set(s ? s.tabs.filter(t => VIEWS[t]) : ['wave'], s && VIEWS[s.active] ? s.active : undefined) }
        else { tree = saved ?? initial(); saved = null }
        render()
      },
      key(e) {
        if (e.altKey) return false
        if (VIEWS[{ 6: 'wave', 7: 'spec' }[e.key]]) return toggle({ 6: 'wave', 7: 'spec' }[e.key]), true
        const s = focusedSet()
        if (e.key === '\\' || e.key === '|') return s && off(s.id, e.key === '|' ? 'bottom' : 'right'), true
        if (e.key === '[' || e.key === ']') return step(e.key === ']' ? 1 : -1), true
        return false
      },
      commands: () => [{ label: 'Waveform tab', key: '6', checked: where(tree, 'wave')?.active === 'wave', run: () => toggle('wave') }, { label: 'Spectrogram tab', key: '7', checked: where(tree, 'spec')?.active === 'spec', run: () => toggle('spec') }, { label: 'Split the tab off to the right', key: '\\', run: () => focusedSet() && off(focusedSet().id, 'right') }, { label: 'Reset the tabs', run: () => { tree = initial(); render() } }],
      destroy: () => app.el.removeEventListener('focusin', track)
    }
  }
}
