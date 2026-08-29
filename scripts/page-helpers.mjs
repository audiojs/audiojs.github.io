// Shared by scripts/util-pages.mjs and every page module in scripts/pages/.
import { existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 8)
export const hash = f => sha(readFileSync(`${ROOT}util/${f}`))

export const WAVE = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="23.5" stroke="#0d1014"/><path d="M3.73 24.42c5.39 0 6.26-.12 9-6.15 3.54-7.78 6.18-8.6 10.08 6.15 3.9 14.74 7.04 12.71 9.84 3.95 4.07-12.77 5.14-3.95 9.91-3.95h1.7" stroke="#0d1014" fill="none"/></svg>`
export const drop = (text, accept = 'audio/*,video/*,.mkv,.m4a,.flac,.opus,.ac3,.dts', id = '') => `
    <div class="drop" id="drop${id}" tabindex="0" role="button" aria-label="Choose a file">
      ${WAVE}
      <div class="t">${text}</div>
      <div class="s">or click to choose, or paste with <kbd>Ctrl</kbd>+<kbd>V</kbd></div>
      <input type="file" id="file${id}" accept="${accept}">
    </div>`
export const pkg = n => `<a href="https://npmjs.com/package/${n}" target="_blank" rel="noopener"><code>${n}</code></a>`
// foldable FAQ: native <details>, answers stay in the document for search engines (the FAQPage JSON-LD is emitted separately)
export const faq = (items, title = 'Questions') => items.length ? `
      <section class="faq" aria-label="${title}">
        <h3>${title}</h3>${items.map(([q, a]) => `
        <details><summary>${q}</summary><p>${a}</p></details>`).join('')}
      </section>` : ''
export const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

// Module URL for a package: the vendored bundle in util/vendor/ while the package is unpublished
// (see scripts/vendor.mjs), esm.sh at the pinned version once it is. Delete the bundle to flip.
export const src = (name, version, sub = '') => {
  const base = name.replace(/^@audio\//, '')
  const single = `vendor/${base}.js`, dir = `vendor/${base}/index.js`
  if (existsSync(`${ROOT}util/${single}`)) return `/util/${single}?v=${hash(single)}`
  if (existsSync(`${ROOT}util/${dir}`)) return `/util/${dir}?v=${hash(dir)}`
  return `https://esm.sh/${name}@${version}${sub ? '/' + sub : ''}`
}
