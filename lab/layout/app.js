// The mock REPL every layout arranges: the bar and its menus, the sound's view, the script, the console and its
// command line, the rack, the history, the agent, the check, the status bar. One model; each part repaints when the
// keys it reads change. A layout (variants/) only places the parts: mount(app) returns its controller,
// { toggle(name), shown(name), commands?(), key?(e), escape?(), solo?(on), destroy?() }. No audio plays; nothing is kept.
import { h, icon, clamp } from './dom.js'
import { channels, duration, envelope, spectrograms, level, spectrum, up } from './sound.js'
import { titled } from './panes.js'

// The panels a layout places around the view, with their keys: five as planned, or three when the history opens from
// the status bar and the agent answers in the console
export const PANELS = {
  script: { label: 'Script', key: '1', icon: 'script' },
  console: { label: 'Console', key: '2', icon: 'console' },
  rack: { label: 'Rack', key: '3', icon: 'rack' },
  history: { label: 'History', key: '4', icon: 'history' },
  agent: { label: 'Agent', key: '5', icon: 'agent' }
}
const UNITS = [
  { name: 'trim', params: [{ key: 'floor', label: 'floor', min: -90, max: -20, step: 1, unit: 'dB' }] },
  { name: 'normalize', params: [{ key: 'target', label: 'target', min: -24, max: 0, step: .5, unit: 'dB' }, { key: 'mode', label: 'mode', choices: ['peak', 'lufs', 'rms'] }] },
  { name: 'fade', params: [{ key: 'fin', label: 'in', min: 0, max: .5, step: .01, unit: 's' }, { key: 'fout', label: 'out', min: 0, max: .5, step: .01, unit: 's' }] }
]
const RULES = [['Integrated loudness', '−16.2', '−17 to −15', 'LUFS'], ['True peak', '−1.4', '≤ −1', 'dBTP'], ['Loudness range', '6.1', '≤ 15', 'LU'], ['Sample rate', '44.1', '≥ 44.1', 'kHz']]

const code = v => String(+v.toFixed(2))
// where the chime is struck (kit.js stereo()), the hits the REPL marks on its time row
const HITS = [.1, .6, 1.1, 1.6]
const minus = s => s.replace(/-/g, '−')
export const clock = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`
// a listener that runs only when one of `keys` changed (or on the first paint)
const when = (keys, f) => patch => (!patch || keys.some(k => k in patch)) && f()

// The script the model stands for: the chain with the rack's numbers, the view's edits after it
export function chain(m) {
  const p = m.params
  return [
    `audio('chime.wav')`,
    `  .trim(${p.floor === -60 ? '' : code(p.floor)})`,
    `  .normalize(${code(p.target)}${p.mode === 'peak' ? '' : `, '${p.mode}'`})`,
    `  .fade(${code(p.fin)}, ${code(p.fout)})`,
    ...m.edits.map(e => '  ' + e)
  ]
}
// JavaScript in the REPL's greys: names ink, strings and numbers muted, the rest soft
const highlight = line => [...line.matchAll(/('[^']*')|(-?\d+(?:\.\d+)?)|(\.?[A-Za-z_$][\w$]*)|[\s\S]/g)].map(([t, str, n, name]) => str || n ? h('span', { class: 'lit' }, t) : name ? h('span', { class: 'fn' }, t) : t)

export function create(variant, { phone = false, panels = 5 } = {}) {
  const inventory = Object.keys(PANELS).slice(0, panels)
  const m = {
    caret: .62, selection: null, pressing: false, playhead: null, playing: false, loop: false, before: false,
    lanes: { wave: true, spec: true }, focus: 'normalize', solo: false, layout: 0,
    params: { floor: -60, target: -1, mode: 'peak', fin: .02, fout: .1 }, edits: [],
    history: ['The script as it opened', 'normalize: −3 → −1', 'fade: 0.05, 0.1 → 0.02, 0.1'], at: 2,
    log: [{ text: 'chime.wav · 2.20 s · 44.1 kHz · stereo', level: 'value' }, { text: 'peak −1.0 dBFS · −16.2 LUFS', level: 'value' }],
    chat: [{ who: 'you', text: 'Make it even and quiet at the ends.' }, { who: 'agent', text: 'Normalized to −1 dB peak and faded both ends: lines 3 and 4 of the script.' }]
  }
  const listeners = new Set(), cleanups = []
  const el = h('div', { class: 'app', tabindex: -1, 'data-variant': variant.name, 'data-panels': panels, 'data-phone': phone || null })
  const layer = h('div', { class: 'layer' })
  let ctl = null, lastFocus = null
  el.addEventListener('focusin', e => { lastFocus = e.target })
  const app = {
    el, model: m, phone, inventory, variant, layer,
    set(patch) { Object.assign(m, patch); for (const f of [...listeners]) f(patch) },
    on(f) { listeners.add(f); return () => listeners.delete(f) },
    // f now, and again whenever one of `keys` changes
    watch(keys, f) { f(); return app.on(when(keys, f)) },
    // a layout tells the toggles and the menus that what shows has changed; if drawing it again took the focus
    // away, the focus goes back where it was, or to the app
    changed() {
      const f = lastFocus
      if (document.activeElement === document.body && f) {
        const key = f.dataset?.panel ?? f.dataset?.tab, kind = f.classList?.[0]
        const again = !f.isConnected && key && kind && el.querySelector(`.${kind}[data-panel="${key}"], .${kind}[data-tab="${key}"]`)
        ;(again || (f.isConnected && el.contains(f) ? f : el)).focus({ preventScroll: true })
      }
      app.set({ layout: m.layout + 1 })
    },
    scale: () => +(el.dataset.scale || 1),
    cleanup: f => cleanups.push(f),
    view: opts => view(app, opts),
    log: (text, level = 'value') => app.set({ log: [...m.log, { text, level }].slice(-60) }),
    did: text => app.set({ history: [...m.history.slice(0, m.at + 1), minus(text)], at: m.at + 1 }),
    say
  }
  const made = {}
  app.part = name => made[name] ||= ({ view: () => view(app), script, console: consoleOf, rack, history, agent, check })[name]()
  app.titled = (name, actions) => titled(PANELS[name]?.label ?? name[0].toUpperCase() + name.slice(1), app.part(name), actions)

  // ── The bar ────────────────────────────────────────────────────

  const MENUS = ['File', 'Edit', 'Select', 'View', 'Process', 'Play', 'Help']
  const menubar = h('nav', { class: 'menus', role: 'menubar', 'aria-label': 'Menu' }, (phone ? ['Menu'] : MENUS).map(name => h('button', { class: 'bar-button', type: 'button', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-menu': name, onclick: e => openMenu(name, e.currentTarget) }, name)))
  app.slot = h('div', { class: 'bar-slot' })
  const bar = h('header', { class: 'bar' },
    h('span', { class: 'wordmark' }, logo(), 'audio'), menubar, app.slot,
    h('div', { class: 'bar-end' },
      h('button', { class: 'bar-button share', type: 'button' }, 'Share'),
      h('span', { class: 'split-button' }, h('button', { class: 'bar-button primary', type: 'button', title: 'Export (⌘S)' }, 'Export'), h('button', { class: 'bar-button primary format', type: 'button', 'aria-label': 'Format: WAV' }, 'WAV'))))

  // ── The status bar ─────────────────────────────────────────────

  const time = h('button', { class: 'time', type: 'button', title: 'Caret' })
  const play = h('button', { class: 'transport', type: 'button', 'aria-label': 'Play', title: 'Play (Space)', onclick: () => toggle() }, h('span', { class: 'play-icon', 'aria-hidden': 'true' }))
  const undo = h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Undo', title: 'Undo (⌘Z)', onclick: () => m.at > 0 && app.set({ at: m.at - 1 }) }, icon('undo'))
  // three panels: the history is the list under the undo button's chevron, as the REPL has it
  const past = inventory.includes('history') ? null : h('button', { class: 'icon-button more', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'History', title: 'History: go back or forward to any step (4)', onclick: e => historyPopover(e.currentTarget) }, icon('chevron', 1.6))
  const loop = h('button', { class: 'lamp', type: 'button', 'aria-label': 'Loop', title: 'Loop playback', 'aria-pressed': 'false', onclick: () => app.set({ loop: !m.loop }) }, icon('loop', 1.8))
  const ab = h('button', { class: 'icon-button ab', type: 'button', 'aria-pressed': 'false', title: 'Before the edits, level-matched (B)', onclick: () => app.set({ before: !m.before }) }, 'Before')
  const checkButton = h('button', { class: 'check-button pass', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Apple Podcasts: passes. Open for each rule', onclick: e => checkPopover(e.currentTarget) }, '✓ Apple')
  app.toggles = h('div', { class: 'panel-toggles', role: 'group', 'aria-label': 'Panels' })
  const status = h('footer', { class: 'status' },
    play, h('div', { class: 'timecode' }, time, h('div', { class: 'display' }, h('p', { class: 'facts' }, loop, h('span', {}, '44.1 kHz · stereo')), h('p', { class: 'levels' }, 'peak −1.0 dBFS · −16.2 LUFS'))),
    ab, checkButton, h('div', { class: 'tools' }, h('div', { class: 'history' }, undo, past), app.toggles))
  app.status = status
  app.area = h('div', { class: 'area' })
  el.append(bar, h('div', { class: 'slab' }, app.area, status), layer)
  app.watch(['playing', 'playhead', 'selection', 'caret', 'loop', 'before', 'at'], () => {
    time.textContent = m.playing ? clock(m.playhead) : m.selection ? `${clock(m.selection[0])}–${clock(m.selection[1])}` : clock(m.caret)
    time.classList.toggle('range', !!m.selection && !m.playing)
    time.title = m.playing ? 'Playhead' : m.selection ? 'Selection' : 'Caret'
    play.setAttribute('aria-label', m.playing ? 'Pause' : 'Play')
    play.firstChild.classList.toggle('paused', m.playing)
    loop.setAttribute('aria-pressed', String(m.loop))
    ab.setAttribute('aria-pressed', String(m.before))
    undo.disabled = m.at === 0
  })
  // a toggle per panel at the end of the status bar, for the layouts that keep them there
  app.statusToggles = (names = inventory) => {
    const buttons = names.map(n => h('button', { class: 'icon-button', type: 'button', 'data-panel': n, 'aria-label': PANELS[n].label, title: `${PANELS[n].label} (${PANELS[n].key})`, onclick: () => ctl.toggle(n) }, icon(PANELS[n].icon)))
    app.toggles.replaceChildren(...buttons)
    app.watch(['layout'], () => ctl && buttons.forEach(b => b.setAttribute('aria-pressed', String(ctl.shown(b.dataset.panel)))))
  }

  // ── Playing: a playhead crosses the view, the meter and the outline follow it. Nothing sounds. ──

  let frame = 0, last = 0
  function toggle() {
    if (m.playing) { cancelAnimationFrame(frame); return app.set({ playing: false, playhead: null }) }
    const from = m.selection ? m.selection[0] : m.caret >= duration - .01 ? 0 : m.caret
    last = performance.now()
    app.set({ playing: true, playhead: from })
    frame = requestAnimationFrame(tick)
  }
  function tick(now) {
    const [from, to] = m.selection || [0, duration]
    let t = m.playhead + (now - last) / 1000
    last = now
    if (t >= to) { if (!m.loop) return app.set({ playing: false, playhead: null }); t = from }
    app.set({ playhead: t })
    frame = requestAnimationFrame(tick)
  }
  cleanups.push(() => cancelAnimationFrame(frame))

  // ── Menus, popovers, the command line: drawn in the app's own layer, so a scaled frame holds them ──

  let open = null
  function closeFloat(refocus = true) {
    if (!open) return false
    const { panel, anchor } = open
    open = null
    panel.remove()
    if (anchor?.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', 'false')
    if (refocus && anchor?.isConnected) anchor.focus({ preventScroll: true })
    return true
  }
  // `panel` by `anchor`: under it, or above it, kept inside the app
  function place(panel, anchor, { above = false } = {}) {
    closeFloat(false)
    layer.append(panel)
    const s = app.scale(), a = anchor.getBoundingClientRect(), r = el.getBoundingClientRect(), W = el.clientWidth, H = el.clientHeight
    panel.style.left = clamp((a.left - r.left) / s, 6, Math.max(6, W - panel.offsetWidth - 6)) + 'px'
    if (above) panel.style.bottom = clamp(H - (a.top - r.top) / s + 6, 6, H - 60) + 'px'
    else panel.style.top = (a.bottom - r.top) / s + 4 + 'px'
    anchor.setAttribute('aria-expanded', 'true')
    open = { panel, anchor }
  }
  const away = e => { if (open && !open.panel.contains(e.target) && !open.anchor?.contains(e.target)) closeFloat(false) }
  document.addEventListener('pointerdown', away, true)
  cleanups.push(() => document.removeEventListener('pointerdown', away, true))
  app.popover = place
  app.close = closeFloat

  function menuItems(name) {
    const shown = inventory.map(p => ({ label: PANELS[p].label, key: PANELS[p].key, checked: ctl.shown(p), run: () => ctl.toggle(p) }))
    const elsewhere = past ? [{ label: 'History…', key: '4', run: () => historyPopover(past) }, { label: 'Ask the agent…', key: '5', run: () => commandLine() }] : []
    const menus = {
      File: () => [{ label: 'Open file…', key: '⌘O' }, { label: 'Record' }, { label: 'Find a sound…' }, null, { label: 'Share link' }, { label: 'Export WAV', key: '⌘S' }],
      Edit: () => [{ label: 'Undo', key: '⌘Z', run: () => undo.click() }, { label: 'Redo', key: '⇧⌘Z', run: () => m.at < m.history.length - 1 && app.set({ at: m.at + 1 }) }],
      Select: () => [{ label: 'All', key: '⌘A', run: () => app.set({ selection: [0, duration] }) }, { label: 'None', key: 'Esc', run: () => app.set({ selection: null }) }],
      View: () => [...(ctl.lanes === false ? [] : [{ label: 'Waveform', checked: m.lanes.wave, run: () => lane('wave') }, { label: 'Spectrogram', checked: m.lanes.spec, run: () => lane('spec') }, null]),
        ...shown, ...elsewhere, null,
        ...(ctl.commands?.() ?? []), { label: 'The sound alone', key: '`', checked: m.solo, run: () => solo(!m.solo) }, null,
        { label: 'Command line…', key: '⌘K', run: () => commandLine() }],
      Process: () => [{ label: 'Gain −3 dB', run: () => say('.gain(-3)') }, { label: 'Normalize', run: () => say('.normalize(-1)') }, { label: 'Denoise', run: () => say('.denoise()') }, { label: 'Reverse', run: () => say('.reverse()') }],
      Play: () => [{ label: m.playing ? 'Pause' : 'Play', key: 'Space', run: () => toggle() }, { label: 'Loop', checked: m.loop, run: () => app.set({ loop: !m.loop }) }, { label: 'Before the edits', key: 'B', checked: m.before, run: () => app.set({ before: !m.before }) }],
      Help: () => [{ label: 'Keys' }, { label: 'Manual' }],
      // a phone's one menu: what the View menu holds, then playing and editing
      Menu: () => [...menus.View(), null, ...menus.Play(), null, ...menus.Edit()]
    }
    return menus[name]()
  }
  function openMenu(name, anchor) {
    if (open?.anchor === anchor) return closeFloat()
    const items = menuItems(name).filter((x, i, all) => x || (i > 0 && all[i - 1] && i < all.length - 1))
    const panel = h('div', { class: 'menu', role: 'menu', 'aria-label': name, 'data-float': '' }, items.map(x => x
      ? h('button', { class: 'menu-item', type: 'button', tabindex: -1, role: x.checked == null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': x.checked == null ? null : String(x.checked), onclick: () => { closeFloat(); x.run?.() } }, h('span', { class: 'mark', 'aria-hidden': 'true' }, x.checked ? '✓' : ''), h('span', { class: 'label' }, x.label), x.key ? h('kbd', {}, x.key) : null)
      : h('hr', {})))
    place(panel, anchor)
    panel.addEventListener('keydown', e => {
      const list = [...panel.querySelectorAll('.menu-item')], i = list.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus() }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const all = [...menubar.querySelectorAll('button')].filter(b => b.offsetParent), next = all[(all.indexOf(anchor) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]
        openMenu(next.dataset.menu, next)
        layer.querySelector('.menu-item')?.focus()
      } else if (e.key === 'Tab') closeFloat(false)
    })
    panel.querySelector('.menu-item')?.focus({ preventScroll: true })
  }
  menubar.addEventListener('keydown', e => {
    const b = e.target.closest('[data-menu]')
    if (b && e.key === 'ArrowDown') { e.preventDefault(); if (open?.anchor !== b) openMenu(b.dataset.menu, b); layer.querySelector('.menu-item')?.focus() }
  })
  function historyPopover(anchor) {
    if (open?.anchor === anchor) return closeFloat()
    const panel = h('div', { class: 'menu pop', role: 'dialog', 'aria-label': 'History', 'data-float': '' }, h('p', { class: 'menu-group' }, 'History, newest first'), historyList())
    place(panel, anchor, { above: true })
    panel.querySelector('[aria-current]')?.focus({ preventScroll: true })
  }
  function checkPopover(anchor) {
    if (open?.anchor === anchor) return closeFloat()
    const panel = h('div', { class: 'menu pop wide', role: 'dialog', tabindex: -1, 'aria-label': 'Check', 'data-float': '' }, h('p', { class: 'menu-group' }, 'Check against Apple Podcasts'), checkTable())
    place(panel, anchor, { above: true })
    panel.focus({ preventScroll: true })
  }
  // The command line: in the console when it shows, else over the top of the sound until Esc or Enter
  function commandLine(text = '') {
    const docked = made.console?.offsetParent && ctl.shown('console') && made.console.querySelector('.cmd')
    if (docked) { docked.value = text; return docked.focus() }
    const from = document.activeElement
    closeFloat(false)
    const line = prompt(app, { onclose: () => closeFloat() })
    const panel = h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Command line', 'data-float': '' }, line.el)
    layer.append(panel)
    open = { panel, anchor: el.contains(from) ? from : null }
    line.input.value = text
    line.input.focus()
  }
  app.commandLine = commandLine
  // Every command the menus hold, for the command line to find
  app.commands = () => ['View', 'Play', 'Edit', 'Select', 'Process'].flatMap(name => menuItems(name).filter(x => x?.run).map(x => ({ ...x, label: name !== 'View' || x.checked == null ? x.label : `${x.checked ? 'Hide' : 'Show'} ${x.label.toLowerCase()}` })))
  // Text the command line could not match: a call joins the chain; words go to the agent, which answers in the
  // console when there is no agent panel
  function say(text) {
    text = text.trim()
    if (!text) return
    if (/^\.?[A-Za-z_$][\w$]*\(.*\)$/.test(text)) {
      const call = text.startsWith('.') ? text : '.' + text
      app.set({ edits: [...m.edits, call] })
      app.did(call)
      return app.log(`added ${minus(call)} to the chain`)
    }
    if (inventory.includes('agent')) return app.log('Not a command or a call. The agent is on 5.', 'warn')
    app.set({ log: [...m.log, { text, level: 'you' }] })
    setTimeout(() => app.log(reply(text), 'agent'), 350)
  }

  // ── Lanes, the sound alone, keys ───────────────────────────────

  function lane(name) {
    const lanes = { ...m.lanes, [name]: !m.lanes[name] }
    if (lanes.wave || lanes.spec) app.set({ lanes })
  }
  // The sound alone: every panel away, then back as it was. A tap of ` keeps it so; held, it lasts while the key is
  // down (a quasimode: nothing to remember to undo)
  let kept = null
  function solo(on) {
    if (on === m.solo) return
    if (ctl.solo) ctl.solo(on)
    else if (on) { kept = inventory.filter(n => ctl.shown(n)); kept.forEach(n => ctl.toggle(n)) }
    else { kept?.forEach(n => !ctl.shown(n) && ctl.toggle(n)); kept = null }
    app.set({ solo: on })
  }
  app.solo = solo
  let held = 0
  el.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, typing = e.target.closest('input, textarea, select')
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); return commandLine() }
    if (e.key === 'Escape') {
      if (closeFloat() || ctl.escape?.(e)) return e.preventDefault()
      if (m.selection) { e.preventDefault(); return app.set({ selection: null }) }
      if (m.solo) return solo(false)
      return
    }
    if (typing || mod) return
    if (ctl.key?.(e)) return e.preventDefault()
    if (e.altKey) return
    const panel = Object.keys(PANELS).find(n => PANELS[n].key === e.key)
    if (panel) {
      e.preventDefault()
      if (inventory.includes(panel)) { if (m.solo) solo(false); return ctl.toggle(panel) }
      return panel === 'history' ? historyPopover(past) : commandLine()
    }
    if (e.code === 'Backquote') { e.preventDefault(); if (e.repeat) return; if (m.solo) return solo(false); held = performance.now(); return solo(true) }
    if (e.key === ' ' && !e.target.closest('button, [role=tab], [role=separator], a')) { e.preventDefault(); return toggle() }
    if (e.key.toLowerCase() === 'b') app.set({ before: !m.before })
  })
  el.addEventListener('keyup', e => { if (e.code !== 'Backquote') return; if (held && performance.now() - held > 350) solo(false); held = 0 })

  // ── The layout ─────────────────────────────────────────────────

  ctl = variant.mount(app)
  app.ctl = ctl
  app.show = name => ctl.shown(name) || ctl.toggle(name)
  app.changed()
  app.destroy = () => { cleanups.forEach(f => f()); ctl.destroy?.(); listeners.clear(); el.remove() }
  // How much of the frame shows the sound where nothing floats over it, and whether each of `parts` shows at once
  // with it, more than half uncovered
  app.measure = (parts = []) => {
    const frameRect = el.getBoundingClientRect(), floats = [...el.querySelectorAll('[data-float]')].filter(x => x.getClientRects().length)
    const seen = (r, skip) => {
      const covers = floats.filter(x => !x.contains(skip)).map(x => x.getBoundingClientRect())
      let n = 0
      for (let i = .5; i < 32; i++) for (let j = .5; j < 20; j++) { const x = r.left + r.width * i / 32, y = r.top + r.height * j / 20; if (!covers.some(c => x > c.left && x < c.right && y > c.top && y < c.bottom)) n++ }
      return n / 640
    }
    const area = r => r.width * r.height
    const plots = [...el.querySelectorAll('.view .plot')].filter(p => p.offsetParent)
    const visible = name => { const p = made[name]; if (!p?.offsetParent) return false; const r = p.getBoundingClientRect(); return area(r) > 900 && seen(r, p) > .5 }
    return { sound: plots.reduce((a, p) => a + area(p.getBoundingClientRect()) * seen(p.getBoundingClientRect(), p), 0) / area(frameRect), together: plots.length > 0 && parts.every(visible) }
  }
  return app

  // ── Parts ──────────────────────────────────────────────────────

  // The rack: a unit per call of the chain, opening to its sliders; a slider rewrites its number in the script
  function rack() {
    const units = UNITS.map((u, k) => {
      const args = h('span', { class: 'step-args' }), params = h('div', { class: 'params', hidden: u.name !== 'normalize' })
      const head = h('button', { class: 'step-toggle', type: 'button', 'aria-expanded': String(u.name === 'normalize'), title: `.${u.name}(): open or close its settings`, onclick: () => {
        const on = head.getAttribute('aria-expanded') !== 'true'
        head.setAttribute('aria-expanded', String(on)); li.classList.toggle('open', on); params.hidden = !on
        app.set({ focus: u.name })
      } }, h('span', { class: 'step-name' }, u.name), args)
      const li = h('li', { class: 'step' + (u.name === 'normalize' ? ' open' : '') }, h('div', { class: 'step-head' }, head, h('button', { class: 'icon-button step-remove', type: 'button', 'aria-label': `Remove ${u.name}`, title: `Remove .${u.name}()` }, icon('close'))), params)
      const line = () => chain(m)[k + 1].trim()
      for (const p of u.params) {
        if (p.choices) {
          const group = h('div', { class: 'choices', role: 'group', 'aria-label': p.label }, p.choices.map(c => h('button', { type: 'button', 'aria-pressed': String(m.params[p.key] === c), onclick: () => { const was = m.params[p.key]; app.set({ params: { ...m.params, [p.key]: c }, focus: u.name }); app.did(`${u.name}: ${was} → ${c}`) } }, c)))
          app.watch(['params'], () => group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === m.params[p.key]))))
          params.append(h('div', { class: 'param choice' }, h('span', { class: 'param-name' }, p.label), group))
          continue
        }
        const out = h('output', {}), input = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: m.params[p.key], 'aria-label': `${u.name} ${p.label}` })
        let from = null
        input.addEventListener('input', () => { from ??= args.textContent; app.set({ params: { ...m.params, [p.key]: +input.value }, focus: u.name }) })
        input.addEventListener('change', () => { app.did(`${u.name}: ${from} → ${args.textContent}`); from = null })
        const paint = () => { out.textContent = `${minus(code(m.params[p.key]))} ${p.unit}`; if (+input.value !== m.params[p.key]) input.value = m.params[p.key] }
        app.watch(['params'], paint)
        params.append(h('div', { class: 'param' }, h('span', { class: 'param-name', 'aria-hidden': 'true' }, p.label), input, out))
      }
      const paint = () => { args.textContent = minus(line().replace(/^\.\w+\((.*)\)$/, '$1')); li.classList.toggle('current', m.focus === u.name) }
      app.watch(['params', 'focus'], paint)
      return li
    })
    return h('section', { class: 'part rack', 'data-part': 'rack', 'aria-label': 'Rack' }, h('div', { class: 'steps' }, h('ol', { class: 'steps-list' }, units), h('button', { class: 'add-step', type: 'button', title: 'Add a method to the end of the chain' }, icon('add', 1.7), 'Add a step')))
  }

  function script() {
    const lines = h('div', { class: 'code', tabindex: 0, role: 'textbox', 'aria-readonly': 'true', 'aria-multiline': 'true', 'aria-label': 'Script' })
    let before = []
    app.watch(['params', 'edits'], () => {
      const now = chain(m)
      if (now.join('\n') === before.join('\n')) return
      lines.replaceChildren(...now.map((text, i) => h('div', { class: 'line' + (before.length && before[i] !== text ? ' hot' : '') }, h('span', { class: 'n', 'aria-hidden': 'true' }, i + 1), h('span', { class: 't' }, highlight(text)))))
      before = now
    })
    return h('section', { class: 'part script', 'data-part': 'script', 'aria-label': 'Script' }, lines)
  }

  function consoleOf() {
    const log = h('div', { class: 'log', role: 'log', 'aria-label': 'Console' })
    app.watch(['log'], () => { log.replaceChildren(...m.log.map(l => h('div', { class: 'line ' + l.level }, l.text))); log.scrollTop = log.scrollHeight })
    return h('section', { class: 'part console', 'data-part': 'console', 'aria-label': 'Console' }, log, prompt(app).el)
  }

  function historyList() {
    const list = h('ol', { class: 'history-list' })
    const paint = () => list.replaceChildren(...m.history.map((text, i) => h('li', {}, h('button', { type: 'button', class: i > m.at ? 'undone' : null, 'aria-current': i === m.at ? 'step' : null, title: i > m.at ? 'Redo to here' : i === m.at ? 'Where the script is now' : 'Undo to here', onclick: () => app.set({ at: i }) }, h('span', {}, text), h('small', {}, i > m.at ? 'undone' : i === m.at ? 'now' : '')))).reverse())
    // a list shown in a popover goes when the popover does
    const off = app.on(when(['history', 'at'], () => list.isConnected || list === made.history?.firstChild ? paint() : off()))
    paint()
    return list
  }
  function history() { return h('section', { class: 'part history', 'data-part': 'history', 'aria-label': 'History' }, historyList()) }

  function agent() {
    const thread = h('div', { class: 'thread', role: 'log', 'aria-label': 'Conversation' })
    const input = h('input', { type: 'text', class: 'cmd', 'aria-label': 'Ask the agent', placeholder: 'Ask about the sound', autocomplete: 'off' })
    app.watch(['chat'], () => { thread.replaceChildren(...m.chat.map(c => h('p', { class: 'msg ' + c.who }, c.text))); thread.scrollTop = thread.scrollHeight })
    const form = h('form', { class: 'prompt', onsubmit: e => {
      e.preventDefault()
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      app.set({ chat: [...m.chat, { who: 'you', text }] })
      setTimeout(() => app.set({ chat: [...m.chat, { who: 'agent', text: reply(text) }] }), 350)
    } }, h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'), input)
    return h('section', { class: 'part agent', 'data-part': 'agent', 'aria-label': 'Agent' }, thread, form)
  }

  function checkTable() {
    return h('table', { class: 'check-table' },
      h('thead', {}, h('tr', {}, ...['Rule', 'After', 'Limit'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, RULES.map(([name, value, limit, unit]) => h('tr', {}, h('th', { scope: 'row' }, name), h('td', { class: 'pass' }, h('span', { class: 'mark' }, '✓ '), value), h('td', { class: 'limit' }, `${limit} ${unit}`)))))
  }
  // The check and the export, as a panel (the Deliver module lays it beside the sound)
  function check() {
    const choose = e => e.currentTarget.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)))
    return h('section', { class: 'part check', 'data-part': 'check', 'aria-label': 'Check' },
      h('div', { class: 'choices', role: 'group', 'aria-label': 'Delivery spec' }, ['Apple Podcasts', 'Spotify', 'EBU R 128', 'ACX'].map((s, i) => h('button', { type: 'button', 'aria-pressed': String(!i), onclick: choose }, s))),
      checkTable(),
      h('p', { class: 'menu-group' }, 'Export as'),
      h('div', { class: 'choices', role: 'group', 'aria-label': 'Format' }, ['WAV', 'FLAC', 'MP3', 'OGG'].map((f, i) => h('button', { type: 'button', 'aria-pressed': String(!i), onclick: choose }, f))))
  }
}

// A command line: as it is typed, the menus' commands whose names hold its words; Enter runs the one marked, or else
// hands the text to app.say
export function prompt(app, { onclose } = {}) {
  const input = h('input', { class: 'cmd', type: 'text', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-label': 'Command line', 'aria-expanded': 'false', 'aria-autocomplete': 'list', placeholder: app.inventory.includes('agent') ? 'A command or a call: rack, .gain(-3)' : 'A command, a call or a question' })
  const list = h('ul', { class: 'suggest', role: 'listbox', 'aria-label': 'Commands', hidden: true })
  let items = [], at = -1
  const paint = () => {
    list.hidden = !items.length
    input.setAttribute('aria-expanded', String(!!items.length))
    list.replaceChildren(...items.map((c, i) => h('li', { role: 'option', 'aria-selected': String(i === at), onpointerdown: e => { e.preventDefault(); run(c) } }, h('span', {}, c.label), c.key ? h('kbd', {}, c.key) : null)))
  }
  const find = q => { const words = q.toLowerCase().split(/\s+/).filter(Boolean); return words.length ? app.commands().filter(c => words.every(w => c.label.toLowerCase().includes(w))).slice(0, 6) : [] }
  const run = c => { input.value = ''; items = []; paint(); onclose?.(); c.run() }
  input.addEventListener('input', () => { items = find(input.value); at = items.length ? 0 : -1; paint() })
  input.addEventListener('blur', () => { items = []; paint() })
  input.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint() }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[at]) return run(items[at]); const text = input.value; input.value = ''; items = []; paint(); onclose?.(); app.say(text) }
    else if (e.key === 'Escape' && (input.value || items.length)) { e.preventDefault(); e.stopPropagation(); input.value = ''; items = []; paint() }
  })
  return { el: h('form', { class: 'prompt', onsubmit: e => e.preventDefault() }, h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'), input, list), input }
}

// What the mock agent says: what it would change, and where
function reply(text) {
  if (/loud|quiet|level|gain/i.test(text)) return 'I would add .gain(3) after .normalize() on line 3; the check would still pass. (A mock: nothing changed.)'
  if (/noise|hiss|clean/i.test(text)) return 'I would add .denoise() before .normalize(); B plays the file before it. (A mock: nothing changed.)'
  return 'The agent would answer here; an edit it makes lands in the script as a line you can undo. (A mock.)'
}

// The view: a lane per channel (its spectrogram above, its waveform below, or either alone), levels and frequencies on
// the right, then the meter by each waveform and the spectrum outline by each spectrogram; the hits on the time row;
// the edits under the selection. `lanes` fixes what it shows ('wave' or 'spec'); else the model's lanes do.
function view(app, { lanes: fixed } = {}) {
  const m = app.model, canvas = h('canvas', { 'aria-hidden': 'true' })
  const range = () => m.selection.map(code).join(', ')
  const apply = (call, clear) => { app.set({ edits: [...m.edits, call], ...clear && { selection: null } }); app.did(call); app.log(minus(call)) }
  const edit = (name, label, action) => h('button', { class: 'icon-button', type: 'button', 'aria-label': label, title: label, onclick: action }, icon(name))
  const gain = (text, label, db) => h('button', { class: 'text-button', type: 'button', title: label, onclick: () => apply(`.gain(${db}, ${range()})`) }, text)
  const edits = h('div', { class: 'edits', role: 'toolbar', 'aria-label': 'Edit the selection', hidden: true },
    edit('cut', 'Cut (⌘X)', () => apply(`.remove(${range()})`, true)), edit('copy', 'Copy (⌘C)', () => app.log('copied ' + range() + ' s')),
    edit('remove', 'Delete (⌫)', () => apply(`.remove(${range()})`, true)), edit('crop', 'Keep only this', () => apply(`.crop(${range()})`, true)),
    gain('−3 dB', '3 dB quieter', -3), gain('+3 dB', '3 dB louder', 3))
  const plot = h('div', { class: 'plot', tabindex: 0, role: 'application', 'aria-label': 'The sound: drag to select, arrows move the caret, Shift and arrows select, Esc clears' }, canvas, edits)
  const toggles = fixed ? null : h('div', { class: 'lanes', role: 'group', 'aria-label': 'Lanes' }, ['wave', 'spec'].map(name => h('button', { class: 'icon-button', type: 'button', 'data-lane': name, 'aria-label': name === 'wave' ? 'Waveform' : 'Spectrogram', title: name === 'wave' ? 'Waveform' : 'Spectrogram', onclick: () => { const lanes = { ...m.lanes, [name]: !m.lanes[name] }; if (lanes.wave || lanes.spec) app.set({ lanes }) } }, icon(name))))
  const el = h('section', { class: 'part view', 'data-part': 'view', 'aria-label': 'Sound' }, h('header', { class: 'view-head' }, h('p', { class: 'source' }, 'chime.wav'), toggles), plot)

  const GUTTER = 40, STRIP = 30, RULER = 18, GAP = 10
  const show = () => fixed ? { wave: fixed === 'wave', spec: fixed === 'spec' } : m.lanes
  function geometry(W, H) {
    const w = Math.max(1, W - GUTTER - STRIP), hgt = Math.max(1, H - RULER), s = show(), n = channels.length, lh = (hgt - GAP * (n - 1)) / n, lanes = []
    for (let ch = 0; ch < n; ch++) {
      const y = ch * (lh + GAP), low = Math.round(lh * .38)
      if (s.wave && s.spec) lanes.push({ kind: 'spec', ch, y, h: lh - low }, { kind: 'wave', ch, y: y + lh - low, h: low })
      else lanes.push({ kind: s.spec ? 'spec' : 'wave', ch, y, h: lh })
    }
    return { w, hgt, lanes }
  }
  let colors = null
  function draw() {
    const W = plot.clientWidth, H = plot.clientHeight
    if (!W || !H) return
    const css = getComputedStyle(el)
    colors ||= Object.fromEntries(['wave', 'dim', 'muted', 'bright', 'ink', 'soft', 'rule', 'select', 'accent'].map(k => [k, css.getPropertyValue('--color-screen-' + k).trim() || '#999']))
    const dpr = Math.min(2, devicePixelRatio || 1), cw = Math.round(W * dpr), ch = Math.round(H * dpr)
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }
    const g = canvas.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const { w, hgt, lanes } = geometry(W, H), X = t => t / duration * w, now = m.playhead ?? (m.selection ? (m.selection[0] + m.selection[1]) / 2 : m.caret)
    g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    g.textBaseline = 'middle'
    for (const L of lanes) {
      if (L.kind === 'spec') { g.drawImage(spectrograms()[L.ch], 0, L.y, w, L.h); continue }
      const env = envelope(L.ch, Math.max(1, Math.round(w))), mid = L.y + L.h / 2
      g.fillStyle = colors.wave
      for (let c = 0; c < env.length / 2; c++) g.fillRect(c, mid - env[2 * c + 1] * L.h / 2, 1, Math.max(1, (env[2 * c + 1] - env[2 * c]) * L.h / 2))
    }
    // what the rack unit last touched sets, over the waveforms in the accent
    g.strokeStyle = g.fillStyle = colors.accent
    g.lineWidth = 1
    for (const L of lanes) {
      if (L.kind !== 'wave') continue
      const mid = L.y + L.h / 2
      if (m.focus === 'normalize') {
        const a = 10 ** (m.params.target / 20) * L.h / 2
        g.setLineDash([4, 3])
        for (const y of [mid - a, mid + a]) { g.beginPath(); g.moveTo(0, Math.round(y) + .5); g.lineTo(w, Math.round(y) + .5); g.stroke() }
        g.setLineDash([])
      } else if (m.focus === 'fade') {
        g.beginPath()
        g.moveTo(0, mid); g.lineTo(X(m.params.fin), L.y + 1); g.moveTo(0, mid); g.lineTo(X(m.params.fin), L.y + L.h - 1)
        g.moveTo(X(duration - m.params.fout), L.y + 1); g.lineTo(w, mid); g.lineTo(X(duration - m.params.fout), L.y + L.h - 1)
        g.stroke()
      } else if (m.focus === 'trim') {
        const a = Math.max(1, 10 ** (m.params.floor / 20) * L.h / 2)
        g.globalAlpha = .5; g.fillRect(0, mid - a, w, 2 * a); g.globalAlpha = 1
      }
    }
    if (m.selection) { g.fillStyle = colors.select; for (const L of lanes) g.fillRect(X(m.selection[0]), L.y, X(m.selection[1]) - X(m.selection[0]), L.h) }
    const line = (t, fill) => { g.fillStyle = fill; for (const L of lanes) g.fillRect(Math.round(X(t)), L.y, 1, L.h) }
    line(m.caret, colors.muted)
    if (m.playhead != null) line(m.playhead, colors.bright)
    // the right edge: levels or frequencies, then the meter by each waveform, the spectrum outline by each spectrogram
    const labels = (L, marks) => {
      g.fillStyle = colors.dim
      let last = -99
      for (const [y, text] of marks.sort((a, b) => a[0] - b[0])) { const cy = clamp(y, L.y + 5, L.y + L.h - 5); if (cy - last < 11) continue; g.fillText(text, w + 5, cy); last = cy }
    }
    for (const L of lanes) {
      const mid = L.y + L.h / 2, x0 = w + GUTTER, sw = STRIP - 6
      if (L.kind === 'wave') {
        labels(L, [[L.y, '0 dB'], [mid - L.h / 4, '−6'], [mid + L.h / 4, '−6'], [L.y + L.h, '0 dB']])
        const { rms, peak } = level(L.ch, now), cx = x0 + sw / 2
        g.fillStyle = colors.rule; g.fillRect(cx - 2, L.y, 4, L.h)
        g.fillStyle = colors.soft; g.fillRect(cx - 2, mid - rms * L.h / 2, 4, rms * L.h)
        g.fillStyle = colors.bright; for (const y of [mid - peak * L.h / 2, mid + peak * L.h / 2]) g.fillRect(cx - 5, Math.round(y), 10, 1)
      } else {
        labels(L, [[20000, '20k'], [10000, '10k'], [5000, '5k'], [2000, '2k'], [1000, '1k'], [500, '500'], [200, '200'], [100, '100'], [50, '50']].map(([f, t]) => [L.y + L.h - up(f) * L.h, t]))
        const rows = 64, s = spectrum(L.ch, now, rows)
        g.beginPath(); g.moveTo(x0, L.y + L.h)
        for (let r = 0; r < rows; r++) g.lineTo(x0 + clamp((s[r] + 96) / 96, 0, 1) * sw, L.y + L.h - (r + .5) / rows * L.h)
        g.lineTo(x0, L.y)
        g.globalAlpha = .22; g.fillStyle = colors.soft; g.fill(); g.globalAlpha = 1
        g.strokeStyle = colors.ink; g.stroke()
      }
    }
    // the time along the foot, and the hits on it (the chime's strikes), as the REPL marks them
    g.fillStyle = colors.accent
    for (const t of HITS) g.fillRect(Math.round(X(t)), hgt + 1, 1, 6)
    g.textAlign = 'center'
    for (let t = .5; t < duration; t += .5) { g.fillStyle = colors.rule; g.fillRect(Math.round(X(t)), hgt + 1, 1, 4); g.fillStyle = colors.dim; g.fillText(t.toFixed(1), X(t), hgt + 11) }
    g.textAlign = 'left'
    // the edits hang under the selection, inside the plot
    edits.hidden = !m.selection || m.playing
    if (!edits.hidden) {
      const half = edits.offsetWidth / 2
      edits.style.left = clamp((X(m.selection[0]) + X(m.selection[1])) / 2, half + 4, Math.max(half + 4, w - half)) + 'px'
      edits.style.top = Math.max(4, hgt - 46) + 'px'
    }
    toggles?.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(m.lanes[b.dataset.lane])))
  }
  let queued = 0
  const redraw = () => { queued ||= requestAnimationFrame(() => { queued = 0; draw() }) }
  const off = app.on(redraw), watch = new ResizeObserver(redraw)
  watch.observe(plot)
  app.cleanup(() => { off(); watch.disconnect(); cancelAnimationFrame(queued) })

  // Selecting: a drag makes a range, a press places the caret; arrows move it, Shift and arrows grow a range
  const timeAt = e => { const r = plot.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width * plot.clientWidth / Math.max(1, plot.clientWidth - GUTTER - STRIP) * duration, 0, duration) }
  plot.addEventListener('pointerdown', e => {
    if (e.button || e.target.closest('.edits')) return
    plot.focus({ preventScroll: true })
    const t0 = timeAt(e)
    let moved = false
    plot.setPointerCapture(e.pointerId)
    app.set({ pressing: true })
    const move = ev => { if (!moved && Math.abs(ev.clientX - e.clientX) < 4) return; moved = true; const t = timeAt(ev); app.set({ selection: [Math.min(t0, t), Math.max(t0, t)], caret: t0 }) }
    const up = () => {
      app.set(moved ? { pressing: false } : { caret: t0, selection: null, pressing: false })
      plot.removeEventListener('pointermove', move); plot.removeEventListener('pointerup', up); plot.removeEventListener('pointercancel', up)
    }
    plot.addEventListener('pointermove', move)
    plot.addEventListener('pointerup', up)
    plot.addEventListener('pointercancel', up)
  })
  plot.addEventListener('keydown', e => {
    const d = { ArrowLeft: -.05, ArrowRight: .05 }[e.key]
    if (!d) return
    e.preventDefault()
    if (!e.shiftKey) return app.set({ caret: clamp(m.caret + d, 0, duration), selection: null })
    const [a, b] = m.selection || [m.caret, m.caret], edge = clamp((m.selection ? b : m.caret) + d, 0, duration)
    app.set({ selection: edge > a ? [a, edge] : [edge, a] })
  })
  return el
}

// The REPL's mark, still
function logo() {
  const svg = h('svg:svg', { viewBox: '0 0 96 101', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 4.5, 'aria-hidden': 'true', class: 'logo' })
  svg.append(h('svg:path', { d: 'M0 50.4159C5.08842 50.4159 8.70378 49.9251 17.0681 24.9808C27.8621 -7.20948 35.9058 -10.5986 47.7771 50.4159H0Z' }), h('svg:path', { d: 'M95.5543 50.416C90.4658 50.416 86.8505 50.9067 78.4862 75.8511C67.6922 108.041 59.6484 111.43 47.7771 50.416H95.5543Z' }))
  return svg
}
