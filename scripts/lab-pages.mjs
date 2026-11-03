// The lab's pages in the site's page (bar.css .site-page). An article: its parts in a rail beside it (each h2, given an
// id where it has none), kept in sight as it scrolls, the part read marked (bar.js); its column a reading one, its
// figures wider. The front page: the articles, the newest first and largest. Made again from the pages as they are:
// run after editing an article's headings (npm run build runs it). The logo's lab is a stage of its own and stays so.
// Run: node scripts/lab-pages.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { ROOT } from './page-helpers.mjs'

const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&\w+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const STAGES = ['logo']
const articles = readdirSync(`${ROOT}lab`, { withFileTypes: true }).filter(d => d.isDirectory() && !STAGES.includes(d.name) && existsSync(`${ROOT}lab/${d.name}/index.html`)).map(d => `lab/${d.name}/index.html`)

// the page's <main> in the frame, the rail before it (none for the front page); made again if already in it
const frame = (html, rail, kind) => {
  const open = html.match(/(?:<div class="site-page">\s*(?:<nav class="site-rail"[\s\S]*?<\/nav>\s*)?)?<main(?: class="[^"]*")?>/)
  if (!open) throw Error('no <main>')
  html = html.replace(open[0], `<div class="site-page">\n${rail ? `${rail}\n` : ''}<main class="site-main ${kind}">`)
  return html.includes('</main>\n</div>') ? html : html.replace('</main>', '</main>\n</div>')
}

for (const f of articles) {
  let html = readFileSync(ROOT + f, 'utf8'), parts = []
  // each part's heading in the article (not the rail's own) an id, its number apart from its words
  const start = html.search(/<main[\s>]/), end = html.indexOf('</main>')
  // an id the page's own elements hold (a figure's, the script's handle on it) never given to a heading: its words' id
  // then marked as the part's. An id written on a heading by hand stays
  const head = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, number = /^<(small|span class="n")>([^<]*)<\/(?:small|span)>/
  const words = inner => inner.replace(number, '').trim()
  const taken = new Set([...html.slice(start, end).replace(head, (all, attrs = '', inner) => (attrs.match(/\sid="([^"]+)"/)?.[1] ?? '') === slug(words(inner)) ? '' : all).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))
  html = html.slice(0, start) + html.slice(start, end).replace(head, (all, attrs = '', inner) => {
    const said = attrs.match(/\sid="([^"]+)"/)?.[1], own = said && said !== slug(words(inner)) && !said.endsWith('-part')
    const id = own ? said : taken.has(slug(words(inner))) ? `${slug(words(inner))}-part` : slug(words(inner))
    parts.push({ id, n: (inner.match(number)?.[2] ?? '').replace(/^0+(?=\d)/, ''), words: words(inner) })
    return `<h2 id="${id}"${attrs.replace(/\sid="[^"]*"/, '')}>${inner}</h2>`
  }) + html.slice(end)
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]), twice = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (twice.length) throw Error(`${f}: ids used twice: ${[...new Set(twice)].join(', ')}`)
  const rail = `<nav class="site-rail" aria-label="Contents">
  <h2>Contents</h2>
  <ul>${parts.map(p => `<li><a href="#${p.id}"><span class="ticked">${p.words.replace(/<[^>]+>/g, '')}</span>${p.n ? `<small>${p.n}</small>` : ''}</a></li>`).join('')}</ul>
</nav>`
  const next = frame(html, parts.length ? rail : '', 'article')
  if (next !== readFileSync(ROOT + f, 'utf8')) writeFileSync(ROOT + f, next), console.log('lab', f)
}
{
  const f = 'lab/index.html', html = readFileSync(ROOT + f, 'utf8'), next = frame(html, '', 'magazine')
  if (next !== html) writeFileSync(ROOT + f, next), console.log('lab', f)
}
