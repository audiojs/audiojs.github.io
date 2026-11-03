// The site's chrome: one header for every page (the name, its mark drawn live, the sections, GitHub; its section marked
// current) and the head lines that bring it (Geist, the design system's tokens, bar.css, bar.js). node scripts/bar.mjs
// refreshes both in the hand-written pages and the home; util-pages.mjs and modules-page.mjs render them in theirs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { ROOT, sha } from './page-helpers.mjs'

// the mark's shapes, the logo page's (audiojs/audio logo/): a sine's lobes, each a layer of the gradient, in a sprite
// every still mark draws (<use href="#mark">), so one drawn live in its place takes none of them with it
const MARK = `<defs><path id="lobes" d="M-1 -0L-0.979 -0L-0.958 -0.001L-0.938 -0.003L-0.917 -0.006L-0.896 -0.012L-0.875 -0.021L-0.854 -0.033L-0.833 -0.048L-0.812 -0.068L-0.792 -0.091L-0.771 -0.118L-0.75 -0.15L-0.729 -0.185L-0.708 -0.225L-0.688 -0.267L-0.667 -0.313L-0.646 -0.362L-0.625 -0.413L-0.604 -0.465L-0.583 -0.518L-0.562 -0.571L-0.542 -0.624L-0.521 -0.675L-0.5 -0.724L-0.479 -0.769L-0.458 -0.811L-0.438 -0.848L-0.417 -0.88L-0.396 -0.905L-0.375 -0.924L-0.354 -0.936L-0.333 -0.94L-0.312 -0.936L-0.292 -0.924L-0.271 -0.903L-0.25 -0.873L-0.229 -0.836L-0.208 -0.79L-0.188 -0.736L-0.167 -0.675L-0.146 -0.607L-0.125 -0.533L-0.104 -0.453L-0.083 -0.368L-0.062 -0.28L-0.042 -0.188L-0.021 -0.095L0 0L0.021 0.095L0.042 0.188L0.062 0.28L0.083 0.368L0.104 0.453L0.125 0.533L0.146 0.607L0.167 0.675L0.188 0.736L0.208 0.79L0.229 0.836L0.25 0.873L0.271 0.903L0.292 0.924L0.312 0.936L0.333 0.94L0.354 0.936L0.375 0.924L0.396 0.905L0.417 0.88L0.438 0.848L0.458 0.811L0.479 0.769L0.5 0.724L0.521 0.675L0.542 0.624L0.562 0.571L0.583 0.518L0.604 0.465L0.625 0.413L0.646 0.362L0.667 0.313L0.688 0.267L0.708 0.225L0.729 0.185L0.75 0.15L0.771 0.118L0.792 0.091L0.812 0.068L0.833 0.048L0.854 0.033L0.875 0.021L0.896 0.012L0.917 0.006L0.938 0.003L0.958 0.001L0.979 0L1 0Z"/></defs><g id="mark"><use href="#lobes" transform="scale(1 1)" opacity="0.042"/><use href="#lobes" transform="scale(1 0.958)" opacity="0.043"/><use href="#lobes" transform="scale(1 0.917)" opacity="0.045"/><use href="#lobes" transform="scale(1 0.875)" opacity="0.048"/><use href="#lobes" transform="scale(1 0.833)" opacity="0.05"/><use href="#lobes" transform="scale(1 0.792)" opacity="0.053"/><use href="#lobes" transform="scale(1 0.75)" opacity="0.056"/><use href="#lobes" transform="scale(1 0.708)" opacity="0.059"/><use href="#lobes" transform="scale(1 0.667)" opacity="0.062"/><use href="#lobes" transform="scale(1 0.625)" opacity="0.067"/><use href="#lobes" transform="scale(1 0.583)" opacity="0.071"/><use href="#lobes" transform="scale(1 0.542)" opacity="0.077"/><use href="#lobes" transform="scale(1 0.5)" opacity="0.083"/><use href="#lobes" transform="scale(1 0.458)" opacity="0.091"/><use href="#lobes" transform="scale(1 0.417)" opacity="0.1"/><use href="#lobes" transform="scale(1 0.375)" opacity="0.111"/><use href="#lobes" transform="scale(1 0.333)" opacity="0.125"/><use href="#lobes" transform="scale(1 0.292)" opacity="0.143"/><use href="#lobes" transform="scale(1 0.25)" opacity="0.167"/><use href="#lobes" transform="scale(1 0.208)" opacity="0.2"/><use href="#lobes" transform="scale(1 0.167)" opacity="0.25"/><use href="#lobes" transform="scale(1 0.125)" opacity="0.333"/><use href="#lobes" transform="scale(1 0.083)" opacity="0.5"/><use href="#lobes" transform="scale(1 0.042)" opacity="1"/></g>`
const GH = `<svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C12.1381 15.0539 13.5182 14.0332 14.4958 12.6716C15.4735 11.3101 15.9996 9.6762 16 8C16 3.58 12.42 0 8 0Z"/></svg>`
// the home's sections (index.html); the playground is audiojs/audio's own Pages, served under /audio/
const LINKS = [['/modules/', 'modules'], ['/util/', 'utils'], ['/lab/', 'lab'], ['/audio/playground/', 'playground']]

// The header. path: the page's own path, e.g. '/util/loudness/'; the longest link it starts with is its section
export const bar = (path) => {
  const cur = LINKS.map(([h]) => h).filter(h => path.startsWith(h)).sort((a, b) => b.length - a.length)[0]
  const at = h => h !== cur ? '' : h === path ? ' aria-current="page"' : ' aria-current="true"'
  return `<header class="site-bar">
    <div class="site-top">
      <a class="site-brand" href="/" aria-label="audiojs home"${path === '/' ? ' aria-current="page"' : ''} draggable="false"><span class="logo" aria-hidden="true"><svg viewBox="-1 -.94 2 1.88" fill="currentColor"><use href="#mark"/></svg><canvas hidden></canvas></span><span class="word">audio</span><span class="js">JS</span></a>
      <nav aria-label="Sections">${LINKS.map(([h, t]) => `<a class="ticked" href="${h}"${at(h)}>${t}</a>`).join('')}</nav>
      <a class="site-gh" href="https://github.com/audiojs" aria-label="audiojs on GitHub">${GH}</a>
    </div>
    <svg class="site-sprite" aria-hidden="true">${MARK}</svg>
  </header>`
}

// its stylesheet and script, versioned by content so browsers and CDNs drop the old ones the moment they change
const version = f => `/${f}?v=${sha(readFileSync(ROOT + f))}`
export const css = () => version('bar.css')
// The head lines: Geist (bar.css declares it), the tokens, the chrome's style and script
export const chrome = () => `  <link rel="preload" href="/audio/assets/geist.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/audio/assets/tokens.css">
  <link rel="stylesheet" href="${css()}">
  <script type="module" src="${version('bar.js')}"></script>
`
// what chrome() replaces in a page's head, the lines it once had too: the site's fonts from Google, a stylesheet of the
// chrome's (a page's own font from Google, a figure's, stays)
const OLD = /^  (<link (rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"( crossorigin)?|href="https:\/\/fonts\.googleapis\.com\/css2\?family=(Manrope|Geist)[^"]*" rel="stylesheet"|rel="preload" href="\/audio\/assets\/geist\.woff2"[^>]*|rel="stylesheet" href="\/(audio\/assets\/tokens|bar)\.css[^"]*")>|<script type="module" src="\/bar\.js[^"]*"><\/script>)\n/gm

// the hand-written pages and the home, and the modules page between its renders (scripts/modules-page.mjs), with their
// paths
export const pages = () => ['index.html', 'lab/index.html', ...readdirSync(ROOT + 'lab', { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(`${ROOT}lab/${d.name}/index.html`)).map(d => `lab/${d.name}/index.html`),
  ...existsSync(`${ROOT}modules/index.html`) ? ['modules/index.html'] : []]
  .map(f => [f, '/' + f.replace(/index\.html$/, '')])

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const [f, path] of pages()) {
  const html = readFileSync(ROOT + f, 'utf8')
  if (!html.includes('class="site-bar"')) throw Error(`${f}: no site bar`)
  // the head's lines of the chrome where the first of them was
  const first = html.search(OLD)
  const head = first < 0 ? html : html.slice(0, first) + chrome() + html.slice(first).replace(OLD, '')
  const next = head.replace(/<header class="site-bar">[\s\S]*?<\/header>/, bar(path))
  if (first < 0) throw Error(`${f}: no head lines of the chrome`)
  if (next !== html) writeFileSync(ROOT + f, next), console.log('bar', f)
}
