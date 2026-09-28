// Small DOM helpers the mock is built with: an element from a tag, attributes and children; the REPL's icons; a press
// that turns into a drag.
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v

// h('button', { class: 'tab', onclick }, 'Script', child…): attributes set as given, on* as listeners, null skipped
export function h(tag, attrs = {}, ...children) {
  const el = tag.includes(':') ? document.createElementNS('http://www.w3.org/2000/svg', tag.split(':')[1]) : document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  el.append(...children.flat().filter(c => c != null && c !== false))
  return el
}

// The REPL's icons, 24 × 24, stroked (repl.html, repl/repl.js), and a few more in their manner
const PATHS = {
  script: 'm8 7-5 5 5 5m8-10 5 5-5 5',
  rack: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4',
  console: 'm5 8 4 4-4 4m7 1h7',
  history: 'M12 8v4l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v3.5h3.5',
  agent: 'M5 5h14v10h-8l-4 4v-4H5z',
  check: 'M4 12.5 9 17 20 6',
  wave: 'M3 12h2m2-5v10m4-13v16m4-11v6m4-9v12m2-6h1',
  spec: 'M4 6h4m3 0h9M4 10h9m3 0h4M4 14h3m4 0h9M4 18h11m3 0h2',
  select: 'M9 4h6M9 20h6M12 4v16',
  cue: 'M6 4v16M6 4l5 3-5 3M16 4v16m0-16 5 3-5 3',
  pen: 'm3 21 1-5L16 4l4 4L8 20ZM13 7l4 4',
  pitch: 'M3 16c2-6 4-9 6-9s3 4 5 4 4-5 7-7',
  loop: 'M3 11V6h17m-4-4 4 4-4 4M21 13v5H4m4-4-4 4 4 4',
  undo: 'M9 15 3 9l6-6M3 9h12a6 6 0 0 1 0 12h-4',
  cut: 'M8.1 8.1 21 21M8.1 15.9 21 3M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0m0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5',
  remove: 'M7 4H4v16h3M17 4h3v16h-3M8 12h8',
  crop: 'M7 2v13a2 2 0 0 0 2 2h13M2 7h13a2 2 0 0 1 2 2v13',
  add: 'M12 5v14M5 12h14',
  close: 'm7 7 10 10M17 7 7 17',
  right: 'M4 5h16v14H4zM13 5v14',
  down: 'M4 5h16v14H4zM4 13h16',
  left: 'M4 5h16v14H4zM9 5v14',
  'dock-right': 'M4 5h16v14H4zM15 5v14',
  bottom: 'M4 5h16v14H4zM4 15h16',
  float: 'M3 8h12v11H3zM9 8V4h12v11h-6',
  chevron: 'm8 10 4 4 4-4',
  sound: 'M4 12h2l2-6 3 12 3-9 2 5 2-2h2'
}
export const icon = (name, width = 1.5) => {
  const svg = h('svg:svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })
  svg.append(h('svg:path', { d: PATHS[name] }))
  return svg
}

// A press on `el` that becomes a drag once it moves 4 px: start(e) then move(e) and end(e), in client pixels; a press
// that never moves is left to be a click
export function drag(el, { start, move, end, threshold = 4, filter = () => true }) {
  el.addEventListener('pointerdown', down => {
    if (down.button || !filter(down)) return
    let on = false
    const x0 = down.clientX, y0 = down.clientY
    const onmove = e => {
      if (!on && Math.hypot(e.clientX - x0, e.clientY - y0) < threshold) return
      if (!on) { on = true; el.setPointerCapture?.(down.pointerId); start?.(down, e) }
      move?.(e)
    }
    const onup = e => {
      removeEventListener('pointermove', onmove)
      removeEventListener('pointerup', onup)
      removeEventListener('pointercancel', onup)
      if (on) { end?.(e); el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 0) }
    }
    addEventListener('pointermove', onmove)
    addEventListener('pointerup', onup)
    addEventListener('pointercancel', onup)
  })
}
const stop = e => { e.stopPropagation(); e.preventDefault() }
