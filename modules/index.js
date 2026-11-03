// The modules' pages. On the catalog: a tag in the rail shows the packages it holds; a search, the packages whose name,
// description, keywords or tags hold every word typed; a unit with none left hidden, a fold opened where it
// holds one; both ride in the address (?tag=, ?q=), so a list can be shared and back returns to it; / reaches the box.
// On a dossier: its install command copies on a press, and its place in the rail is in sight.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]

document.addEventListener('click', async e => {
  const copy = e.target.closest('.copy')
  if (!copy) return
  await navigator.clipboard.writeText(copy.dataset.copy)
  copy.dataset.was ??= copy.innerHTML
  copy.textContent = 'Copied'
  clearTimeout(copy.timer), copy.timer = setTimeout(() => copy.innerHTML = copy.dataset.was, 1400)
})

const q = $('#q')
if (q) {
  const out = $('#n'), none = $('#none'), rows = $$('.unit li'), units = $$('.unit'), folds = $$('.unit .kin'), tags = $$('.site-rail a[data-tag]')
  const words = new Map(rows.map(li => [li, li.querySelector('a').dataset.search])), tagged = new Map(rows.map(li => [li, li.dataset.tags.split(' ')]))
  // (a tag the rail doesn't hold, all of them)
  let tag = new URLSearchParams(location.search).get('tag') ?? ''
  if (!tags.some(a => a.dataset.tag === tag)) tag = ''
  // a fold as the reader left it, kept while a search opens the folds that hold what it found, given back when cleared
  const left = new Map()
  const find = () => {
    const ws = q.value.toLowerCase().split(/\s+/).filter(Boolean)
    let found = 0
    for (const li of rows) found += !(li.hidden = tag && !tagged.get(li).includes(tag) || !ws.every(w => words.get(li).includes(w)))
    for (const u of units) u.hidden = !u.querySelector('li:not([hidden])')
    for (const a of tags) a.dataset.tag === tag ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')
    for (const d of folds) {
      if (ws.length && !left.has(d)) left.set(d, d.open)
      d.open = ws.length ? !!d.querySelector('li:not([hidden])') : left.get(d) ?? d.open
      d.hidden = ws.length > 0 && !d.open
    }
    if (!ws.length) left.clear()
    out.textContent = ws.length || tag ? `${found} of ${rows.length}` : `${rows.length} modules`
    none.hidden = !!found
    const query = new URLSearchParams(Object.entries({ tag, q: q.value.trim() }).filter(([, v]) => v)).toString()
    history.replaceState(history.state, '', `${location.pathname}${query && `?${query}`}${location.hash}`)
  }
  q.oninput = find
  q.value = new URLSearchParams(location.search).get('q') ?? ''
  if (q.value || tag) find()
  for (const a of tags) a.onclick = e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); tag = a.dataset.tag; find() }
  addEventListener('keydown', e => { if (e.key === '/' && !e.target.closest('input, textarea')) e.preventDefault(), q.focus() })
} else {
  // (the rail scrolled, never the page)
  const here = $('.site-rail [aria-current="page"]'), rail = here?.closest('.site-rail')
  if (here) {
    const r = rail.getBoundingClientRect(), b = here.getBoundingClientRect()
    rail.scrollTop += b.top - r.top - r.height / 2, rail.scrollLeft += b.left - r.left - r.width / 2
  }
}
