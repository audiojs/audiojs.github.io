// The home's own few lines; its instrument is the playground, embedded (/audio/playground/embed.js). The mark in the
// header drawn live (audiojs/audio's logo/mark.js) in the logo page's look, a sine through a Hann window filled with
// Bartlett's gradient: at rest it copies the pointer's sideways moves, and it moves as the playground below does,
// turning while it works, at the sound's pace while it plays or records, with the caret while it scrubs (its mark
// events); the still one stays where that can't load. Links' ticks; npm i audio copied; a list's length, where a
// page counts it.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]

import('/audio/logo/mark.js').then(({ mark, sways }) => {
  const it = mark($('.top .wordmark'), {}, { window: 'hann', gradient: 'bartlett' })
  $('audio-repl')?.addEventListener('mark', ({ detail: { mode, turn } }) => {
    if (mode) it?.set(sways[mode] ?? sways.rest)
    if (turn) it?.turn(turn)
  })
}, () => {})

// Links' ticks, made when one is pointed at or focused: one in each 4 px of its label, the row centred under it (made
// again where its width has changed since, a narrower screen's smaller type), each knowing its middle (--c); then, as
// the pointer moves, the middle of the tick under it (--x), the first or the last past the label's ends, so one tick
// is the thickest; reached by the keys, the middle one
const ticked = e => {
  const at = e.target.closest?.('a, button, label'), label = at && (at.matches('.s, .t-name') ? at : at.querySelector('.s, .t-name'))
  if (!label) return
  const w = label.offsetWidth, n = Math.floor(w / 4), o = (w - 4 * n) / 2
  let row = label.querySelector(':scope > .ticks')
  if (row?.childElementCount !== n) {
    const made = Object.assign(document.createElement('span'), { className: 'ticks' })
    made.ariaHidden = 'true'
    made.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--c:${o + 4 * i + 2}"></i>`).join('')
    row ? row.replaceWith(made) : label.append(made)
    row = made
  }
  const i = e.clientX == null ? n >> 1 : Math.floor((e.clientX - label.getBoundingClientRect().left - o) / 4)
  row.style.setProperty('--x', o + 4 * Math.min(n - 1, Math.max(0, i)) + 2)
}
for (const type of ['pointerover', 'pointermove', 'focusin']) addEventListener(type, ticked)

// a copy said done on its button for a moment
const install = $('#install')
install.onclick = async () => {
  await navigator.clipboard.writeText('npm i audio')
  install.dataset.label ??= install.innerHTML
  install.textContent = 'Copied'
  clearTimeout(install.timer), install.timer = setTimeout(() => install.innerHTML = install.dataset.label, 1400)
}

$$('[data-count]').forEach(el => el.textContent = $$(`#${el.dataset.count} li`).length)
