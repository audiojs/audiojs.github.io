// Search: the modules whose call, description or package hold every word typed; a group with none left hides, and its
// link in the contents with it. The query rides in the address (?q=), so a search can be shared; / reaches the box.
const q = document.getElementById('q'), out = document.getElementById('n'), none = document.getElementById('none')
const items = [...document.querySelectorAll('.group li')], text = new Map(items.map(li => [li, li.textContent.toLowerCase()]))
const groups = [...document.querySelectorAll('.group')], links = new Map(groups.map(g => [g, document.querySelector(`.toc a[href="#${g.id}"]`)]))

function find() {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  let found = 0
  for (const li of items) found += !(li.hidden = !words.every(w => text.get(li).includes(w)))
  for (const g of groups) {
    const left = g.querySelectorAll('li:not([hidden])').length, n = g.querySelector('h3 small')
    links.get(g).hidden = g.hidden = !left
    n.textContent = words.length ? `${left} of ${n.dataset.all ??= n.textContent}` : n.dataset.all ?? n.textContent
  }
  for (const part of document.querySelectorAll('.part')) part.hidden = !part.querySelector('.group:not([hidden])')
  out.textContent = words.length ? `${found} of ${items.length}` : `${items.length} modules`
  none.hidden = !!found
  history.replaceState(null, '', words.length ? `?q=${encodeURIComponent(q.value.trim())}` : location.pathname)
}

q.oninput = find
q.value = new URLSearchParams(location.search).get('q') ?? ''
if (q.value) find()
addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== q) e.preventDefault(), q.focus() })
