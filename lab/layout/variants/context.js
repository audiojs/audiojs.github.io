// Contextual: nothing shows until something is chosen, as Figma's properties follow the selection. Select a stretch
// of the sound, or a step in the chain along its top, and an inspector opens at the right for it; Esc or its × closes
// it. The script is a drawer at the left; the console rises under the sound when it has news, and stays while pinned.
// On a phone the inspector and the drawer are sheets.
import { h } from '../dom.js'
import { button } from '../panes.js'
import { PANELS, chain, clock } from '../app.js'
import { duration } from '../sound.js'

export default {
  name: 'context',
  title: 'Contextual',
  line: 'Nothing shows until something is chosen. Select a stretch of the sound, or a step in the chain along the top, and an inspector opens for it. The script is a drawer; the console rises when it has news.',
  keys: [['drag on the sound', 'the inspector for that stretch'], ['1', 'the script drawer'], ['2', 'pin the console'], ['3–5', 'the inspector for the step, the history, the agent'], ['Esc', 'close it'], ['`', 'the sound alone']],
  mount(app) {
    const m = app.model, has = n => app.inventory.includes(n)
    let about = null, drawer = false, pinned = false, fresh = false, timer = 0
    const chips = h('div', { class: 'chips' }), title = h('p', {}), body = h('div', { class: 'inspect-body' })
    const inspector = h('aside', { class: 'inspector', 'aria-label': 'Inspector' }, h('header', { class: 'panel-head' }, title, h('div', { class: 'head-end' }, button('close', 'Close (Esc)', () => close()))), body)
    const scriptBox = h('aside', { class: 'drawer', 'aria-label': 'Script drawer' }, app.titled('script', [button('close', 'Close the script (1)', () => toggle('script'))]))
    const toast = h('div', { class: 'toast', 'data-float': '' }, app.part('console'))
    // on a phone the inspector and the drawer rise over the sound
    if (app.phone) { inspector.dataset.float = ''; scriptBox.dataset.float = '' }
    const center = h('div', { class: 'center' }, h('nav', { class: 'chain', 'aria-label': 'The chain' }, chips), app.part('view'), toast)
    app.area.replaceChildren(h('div', { class: 'split row' }, scriptBox, center, inspector))

    // The chain along the top: the source, each call, each edit; then what opens the script, the history, the agent
    function paintChips() {
      const calls = chain(m).slice(1).map(l => l.trim()), chip = (label, attrs) => h('button', { type: 'button', class: 'chip', ...attrs }, label)
      chips.replaceChildren(...[
        chip('chime.wav', { title: 'Select the whole sound', 'data-panel': 'source', onclick: () => app.set({ selection: [0, duration] }) }),
        ...calls.map((call, i) => {
          const name = call.match(/^\.(\w+)/)[1], args = call.slice(name.length + 2, -1).replace(/-/g, '−'), step = i < 3
          return [h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'), chip(h('span', {}, h('b', {}, name), args ? ' ' + args : ''), { 'aria-pressed': step ? String(about === 'rack' && m.focus === name) : null, 'data-panel': 'step:' + i, title: step ? `.${name}(): its settings` : `${call}: an edit`, onclick: () => { if (step) { app.set({ focus: name }); open('rack') } } })]
        }).flat(),
        h('span', { class: 'fill' }),
        chip('{ } Script', { 'aria-pressed': String(drawer), title: 'The script (1)', 'data-panel': 'script', onclick: () => toggle('script') }),
        has('history') && chip('History', { 'aria-pressed': String(about === 'history'), title: 'History (4)', 'data-panel': 'history', onclick: () => toggle('history') }),
        has('agent') && chip('Ask', { 'aria-pressed': String(about === 'agent'), title: 'Agent (5)', 'data-panel': 'agent', onclick: () => toggle('agent') })
      ].filter(Boolean))
    }
    // The inspector for what is chosen: a step's settings, a stretch's edits, the history, the agent
    function paintInspector() {
      inspector.classList.toggle('open', !!about)
      inspector.inert = !about
      if (!about) return
      if (about === 'selection') {
        const [a, b] = m.selection, range = `${+a.toFixed(2)}, ${+b.toFixed(2)}`, act = (label, call, clear) => h('button', { type: 'button', class: 'text-button', onclick: () => { app.say(call); if (clear) app.set({ selection: null }) } }, label)
        title.textContent = 'Selection'
        body.replaceChildren(h('div', { class: 'facts-block' }, h('p', { class: 'big' }, `${clock(a)}–${clock(b)}`), h('p', {}, `${(b - a).toFixed(3)} s · both channels`)),
          h('p', { class: 'menu-group' }, 'Edit'), h('div', { class: 'actions' }, act('Cut', `.remove(${range})`, true), act('Keep only', `.crop(${range})`, true), act('−3 dB', `.gain(-3, ${range})`), act('+3 dB', `.gain(3, ${range})`)),
          h('p', { class: 'menu-group' }, 'Apply'), h('div', { class: 'actions' }, act('Fade in', `.fade(${range}, 'in')`), act('Fade out', `.fade(${range}, 'out')`), act('Denoise', `.denoise(${range})`), act('Reverse', `.reverse(${range})`)))
        return
      }
      title.textContent = about === 'rack' ? '.' + m.focus + '()' : PANELS[about].label
      const part = app.part(about)
      if (body.firstChild !== part) body.replaceChildren(part)
      if (about === 'rack') part.querySelector('.step.current .step-toggle[aria-expanded="false"]')?.click()
    }
    function paint() {
      scriptBox.classList.toggle('open', drawer)
      scriptBox.inert = !drawer
      toast.classList.toggle('open', pinned || fresh)
      paintInspector()
      paintChips()
      app.changed()
    }
    function open(what) { about = what; paint() }
    function close() { const was = about; about = null; paint(); if (was === 'selection') app.set({ selection: null }) }
    function toggle(n) {
      if (n === 'script') drawer = !drawer
      else if (n === 'console') { pinned = !pinned; fresh = false }
      else return about === n ? close() : open(n)
      paint()
    }
    // a stretch chosen opens its inspector once the press ends, so nothing moves under the pointer
    const off = app.on(p => {
      if (('selection' in p || 'pressing' in p) && m.selection && !m.pressing) about === 'selection' ? paintInspector() : open('selection')
      else if ('selection' in p && !m.selection && about === 'selection') { about = null; paint() }
      if ('log' in p && !pinned) { fresh = true; clearTimeout(timer); timer = setTimeout(() => { fresh = toast.matches(':hover, :focus-within'); paint() }, 5000); paint() }
      else if ('params' in p || 'edits' in p || 'focus' in p) { paintChips(); if (about === 'rack') title.textContent = '.' + m.focus + '()' }
    })
    paint()
    return {
      toggle,
      shown: n => n === 'script' ? drawer : n === 'console' ? pinned || fresh : about === n,
      escape() { if (about && about !== 'selection') { close(); return true } if (drawer) { drawer = false; paint(); return true } return false },
      destroy() { off(); clearTimeout(timer) }
    }
  }
}
