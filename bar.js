// The audiojs site's chrome, on every page (bar.css; scripts/bar.mjs writes the header). The header's mark drawn live
// (audiojs/audio's logo/mark.js) in the logo page's look, a sine through a Hann window filled with Bartlett's gradient:
// at rest it copies the pointer's sideways moves, and it moves as a playground embedded on the page does, turning while
// it works, at the sound's pace while it plays or records, with the caret while it scrubs (the element's mark events,
// caught on their way down to it); the still one stays where that can't load. And the links' ticks.
import('/audio/logo/mark.js').then(({ mark, sways }) => {
  const it = mark(document.querySelector('.site-top .site-brand'), {}, { window: 'hann', gradient: 'bartlett' })
  document.addEventListener('mark', ({ detail: { mode, turn } }) => {
    if (mode) it?.set(sways[mode] ?? sways.rest)
    if (turn) it?.turn(turn)
  }, true)
}, () => {})

// Links' ticks, made when one is pointed at or focused: one in each 4 px of its label (.ticked), the row centred under
// it (made again where its width has changed since, a narrower screen's smaller type), each knowing its middle (--c);
// then, as the pointer moves, the middle of the tick under it (--x), the first or the last past the label's ends, so
// one tick is the thickest, kept till the pointer is STAY of a tick into the next: a hand at rest by the line between
// two trembles a fraction of a px across it, and each crossing would weigh every tick anew; reached by the keys, the
// middle one
const STAY = .25
const ticked = e => {
  const at = e.target.closest?.('a, button, label'), label = at && (at.matches('.ticked') ? at : at.querySelector('.ticked'))
  if (!label) return
  const w = label.offsetWidth, n = Math.floor(w / 4), o = (w - 4 * n) / 2
  let row = label.querySelector(':scope > .ticks')
  // (the tick kept is the row's, while the row still fits the label)
  const kept = row?.childElementCount === n ? row.i : null, p = e.clientX == null ? null : (e.clientX - label.getBoundingClientRect().left - o) / 4
  const i = Math.min(n - 1, Math.max(0, p == null ? n >> 1 : kept != null && p > kept - STAY && p < kept + 1 + STAY ? kept : Math.floor(p))), x = o + 4 * i + 2
  // (a row made knows where the pointer is before it is in the page: none of its ticks drawn whole for a frame first)
  if (row?.childElementCount !== n) {
    const made = Object.assign(document.createElement('span'), { className: 'ticks' })
    made.ariaHidden = 'true'
    made.style.setProperty('--x', x)
    made.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--c:${o + 4 * i + 2}"></i>`).join('')
    row ? row.replaceWith(made) : label.append(made)
    row = made
  }
  row.i = i
  row.style.setProperty('--x', x)
}
for (const type of ['pointerover', 'pointermove', 'focusin']) addEventListener(type, ticked)

// A rail's links to the parts of this page: the part being read marked (the last whose top has passed a line near the
// view's top, under a bar kept there: low enough for a long part, high enough that a short one under it isn't taken
// for the one read), and kept in the rail's own sight
const parts = [...document.querySelectorAll('.site-rail a[href*="#"]')].map(a => [a, new URL(a.href)])
  .filter(([, u]) => u.pathname === location.pathname && u.hash).map(([a, u]) => [a, document.getElementById(decodeURIComponent(u.hash.slice(1)))]).filter(([, el]) => el)
if (parts.length) {
  let frame = 0, marked
  const mark = () => {
    frame = 0
    // (at the page's end, its last part, whose top may never reach the line)
    const line = Math.min(innerHeight / 3, 140), shown = parts.filter(([, el]) => el.offsetParent), end = scrollY + innerHeight >= document.documentElement.scrollHeight - 2
    const [a] = (end ? shown.at(-1) : shown.findLast(([, el]) => el.getBoundingClientRect().top <= line)) ?? shown[0] ?? []
    if (a === marked) return
    for (const [b] of parts) b === a ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')
    if (!(marked = a)) return
    // (the rail scrolled, never the page: a rail out of sight above stays where it is)
    const rail = a.closest('.site-rail'), r = rail.getBoundingClientRect(), b = a.getBoundingClientRect()
    if (b.top < r.top || b.bottom > r.bottom) rail.scrollTop += b.top - r.top - r.height / 2
    if (b.left < r.left || b.right > r.right) rail.scrollLeft += b.left - r.left - r.width / 2
  }
  addEventListener('scroll', () => frame ||= requestAnimationFrame(mark), { passive: true })
  addEventListener('resize', () => frame ||= requestAnimationFrame(mark))
  mark()
}
