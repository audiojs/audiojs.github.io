// Renders the modules: every package of audiojs, the audio library, the @audio families and the libraries under them,
// as a catalog (modules/index.html), a family's own package with the others folded under it, the libraries by what
// they are (CATEGORIES), each tagged with what it is for (as many things as it is for), and a dossier each from its
// own README
// (modules/<name>/index.html), a page set as a technical file. Read from the checkouts, at the versions they hold:
// audiojs/audio beside this repo (AUDIO, as npm run dev serves it), the @audio family repos (AUDIO_ROOT,
// ~/projects/@audio) and each library's repo beside this one (PROJECTS, ~/projects). Run: npm run modules
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, resolve, relative } from 'path'
import { homedir } from 'os'
import { Marked } from 'marked'
import katex from 'katex'
import { ROOT, esc } from './page-helpers.mjs'
import { bar, chrome } from './bar.mjs'
import { AUDIO } from './serve.mjs'

const FAMILIES = resolve(process.env.AUDIO_ROOT || join(homedir(), 'projects/@audio')), PROJECTS = resolve(process.env.PROJECTS || join(homedir(), 'projects'))
if (!existsSync(join(AUDIO, 'package.json')) || !existsSync(FAMILIES)) throw Error(`modules: needs the checkouts of audiojs/audio (${AUDIO}) and the @audio families (${FAMILIES}, or AUDIO_ROOT)`)
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const readme = dir => { const f = readdirSync(dir).find(f => /^readme\.md$/i.test(f)); return f ? readFileSync(join(dir, f), 'utf8') : '' }

// What each is for: a tag, the families and libraries it holds, a family (all of its packages) or a library under as many
// as it is for. audio, which loads them all, under none; another under none is named when the page is made, to be given
// its tags here
const TAGS = {
  'read & write': ['decode', 'encode', 'midi', 'resample', 'mic', 'speaker', 'audio-type', 'pcm-convert', 'audio-buffer'],
  measure: ['loudness', 'measure', 'weighting', 'spectral', 'stft', 'window', 'auditory', 'pitch', 'beat', 'mir', 'note', 'assert', 'fourier-transform', 'window-function', 'a-weighting'],
  shape: ['filter', 'eq', 'dynamics', 'effect', 'saturate', 'amp', 'reverb', 'spatial', 'weighting', 'auditory', 'chain', 'digital-filter'],
  'clean up': ['denoise', 'defeedback', 'vocals', 'tune', 'chain'],
  'time & pitch': ['stretch', 'shift', 'tune', 'sinusoidal', 'scrub', 'pitch', 'resample'],
  make: ['synth', 'voice', 'note', 'midi', 'sinusoidal', 'periodic-function'],
  build: ['chain', 'compile', 'assert', 'test'],
  platform: ['web-audio-api', 'audio-buffer', 'mic', 'speaker', 'compile'],
  display: ['wavearea', 'gl-waveform', 'gl-spectrogram', 'wavefont'],
  primitives: ['digital-filter', 'fourier-transform', 'window-function', 'periodic-function', 'a-weighting', 'pcm-convert', 'audio-buffer', 'stft', 'window', 'note']
}
// The libraries the families stand on, each its own repo with no family package over it, by what they are, as a
// family's own package gathers its others: a category, what it holds, its libraries
const CATEGORIES = {
  platform: ['The Web Audio API and its AudioBuffer, the same in Node as in a browser', ['web-audio-api', 'audio-buffer']],
  dsp: ['The signal processing the families are built on: filters, the FFT, windows, waveforms, weightings', ['digital-filter', 'fourier-transform', 'window-function', 'periodic-function', 'a-weighting']],
  util: ['Small helpers for audio data: its format told from its bytes, its samples from one layout to another', ['audio-type', 'pcm-convert']],
  ui: ['A sound shown and edited on a page: a waveform, a spectrogram, a typeface, a text field', ['wavearea', 'gl-waveform', 'gl-spectrogram', 'wavefont']]
}

// A package: its name, its page's (the name without the scope), its name in its family (a family's own and a library
// by theirs whole), what it does, its version, its checkout
const packageOf = (dir, family, whole) => {
  const p = json(join(dir, 'package.json')), short = p.name.replace(/^@audio\//, '')
  return { name: p.name, short, family, dir, label: whole ? short : short.replace(new RegExp(`^${family}-`), ''), description: (p.description ?? '').trim(), version: p.version, license: p.license ?? '', deprecated: p.deprecated, keywords: (p.keywords ?? []).filter(k => !['audio', 'dsp', family].includes(k)), readme: readme(dir) }
}
const families = new Map([['audio', [packageOf(AUDIO, 'audio', true)]]])
for (const repo of readdirSync(FAMILIES).sort()) {
  const dir = join(FAMILIES, repo), head = join(dir, 'package.json')
  if (!existsSync(head) || json(head).private || !json(head).name) continue
  const atoms = existsSync(join(dir, 'packages')) ? readdirSync(join(dir, 'packages')).sort().map(a => join(dir, 'packages', a))
    .filter(a => existsSync(join(a, 'package.json')) && (p => p.name && !p.private && !(p.os && p.cpu))(json(join(a, 'package.json')))) : []
  families.set(repo, [packageOf(dir, repo, true), ...atoms.map(a => packageOf(a, repo, false))])
}
// two of a family by the same name in it (@audio/biquad and @audio/filter-biquad) each by its whole name
for (const kin of families.values()) for (const p of kin) if (kin.some(q => q !== p && q.label === p.label)) p.label = p.short
// The catalog's units: a family over a package of its own, the others under it; a category over its libraries (each
// its own name whole, the category its family). audio first, the rest by name; the packages in that order, a
// dossier's previous and next
const units = [
  ...[...families].map(([id, [head, ...kin]]) => ({ id, head, kin })),
  ...Object.entries(CATEGORIES).map(([id, [line, repos]]) => ({ id, line, kin: repos.filter(r => existsSync(join(PROJECTS, r, 'package.json'))).map(r => packageOf(join(PROJECTS, r), id, true)) })).filter(u => u.kin.length)
].sort((a, b) => (b.id === 'audio') - (a.id === 'audio') || a.id.localeCompare(b.id))
const members = u => u.head ? [u.head, ...u.kin] : u.kin
const all = units.flatMap(members), byName = new Map(all.map(p => [p.short, p])), unitOf = new Map(units.flatMap(u => members(u).map(p => [p, u])))
// each package's tags: its family's, a library its own
const tagsOf = new Map(all.map(p => [p, Object.keys(TAGS).filter(t => TAGS[t].includes(unitOf.get(p).head ? unitOf.get(p).id : p.short))]))
const untagged = units.flatMap(u => u.head ? [[u.id, u.head]] : u.kin.map(p => [p.short, p])).filter(([id, p]) => id !== 'audio' && !tagsOf.get(p).length)
if (untagged.length) console.warn(`modules: no tag for ${untagged.map(([id]) => id).join(', ')}: give them theirs in TAGS`)

// From a package's checkout: when it last changed, and a picture its README sets by a path of its repo's, from the commit
// last pushed, at jsDelivr (which serves it from GitHub as an image); one not pushed yet left out
const git = (dir, ...args) => { try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const repos = new Map()
const repoOf = dir => {
  const top = git(dir, 'rev-parse', '--show-toplevel')
  if (top && !repos.has(top)) repos.set(top, { top, url: git(top, 'remote', 'get-url', 'origin')?.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1], sha: git(top, 'rev-parse', '@{u}') })
  return repos.get(top) ?? {}
}
const pushed = (dir, src) => {
  const { top, url, sha } = repoOf(dir)
  if (!url || !sha) return null
  for (const at of [dir, top]) {
    const path = relative(top, join(at, src.replace(/[?#].*$/, '')))
    if (!path.startsWith('..') && git(top, 'cat-file', '-e', `${sha}:${path}`) != null) return `https://cdn.jsdelivr.net/gh/${url}@${sha}/${path}`
  }
  return null
}
// (a badge none)
const picture = (dir, src) => /shields\.io|badge|actions\/workflows|nodei\.co/.test(src) ? null : /^https?:/.test(src) ? src : pushed(dir, src)

// A README as a dossier shows it: its title line (name and badges) and its install block left to the dossier's head;
// a link to another package of the family to its dossier, a relative link elsewhere to its words, badges and pictures
// kept beside the README out; headings a level under the dossier's, given ids for the README's own contents links
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&\w+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// its maths ($…$ in a line, $$…$$ set apart) as MathML, which the browser sets with no script or font of ours
const math = { name: 'math', level: 'inline', start: src => src.indexOf('$'),
  tokenizer(src) { const m = src.match(/^\$\$([^$]+)\$\$|^\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\w$])/); if (m) return { type: 'math', raw: m[0], tex: m[1] ?? m[2], display: !!m[1] } },
  renderer: t => katex.renderToString(t.tex, { output: 'mathml', displayMode: t.display, throwOnError: false }) }
// each heading's id its own in the page, as GitHub numbers a README's repeats (-1, -2), so its contents links land
let ids, reading
const reserved = () => new Set()
const unique = base => { let id = base; for (let k = 1; ids.has(id); k++) id = `${base}-${k}`; ids.add(id); return id }
const md = new Marked({
  extensions: [math],
  renderer: {
    heading({ tokens, depth }) { const html = this.parser.parseInline(tokens); return `<h${Math.min(6, depth + 1)} id="${unique(slug(html))}">${html}</h${Math.min(6, depth + 1)}>\n` },
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens), sibling = href.match(/^(?:\.\.?\/)*(?:packages\/)?([\w-]+)\/?(?:README\.md)?$/i)?.[1]
      if (/^(https?:|mailto:|#)/.test(href)) return `<a href="${esc(href)}">${text}</a>`
      if (sibling && byName.has(sibling)) return `<a href="/modules/${sibling}/">${text}</a>`
      return text
    },
    image({ href, text }) { const src = picture(reading.dir, href); return src ? `<img src="${esc(src)}" alt="${esc(text)}" loading="lazy">` : '' }
  }
})
// (and its first paragraph, where it only says again what the package's description says, under its name already)
const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// A picture set in HTML found as one set in Markdown is; a picture standing alone a figure, numbered by the page, its
// words (alt) its caption; a plot of the package's own (an SVG from its repo, drawn on no ground in dark inks) set on the
// screen's dark as the playground's pictures are, its inks turned over to read there
const figure = img => `${/\ssrc="https:\/\/(?:cdn\.jsdelivr\.net\/gh|raw\.githubusercontent\.com)\/[^"]+\.svg[?"#]/.test(img) ? `<figure class="plot"><div class="plate">${img}</div>` : `<figure>${img}`}<figcaption>${img.match(/\salt="([^"]*)"/)?.[1] ?? ''}</figcaption></figure>`
const body = p => (ids = reserved(), reading = p, md).parse(p.readme.replace(/^#\s[^\n]*\n/, '').replace(/^```\w*\n\s*npm (?:i|install) [^\n]+\n```\n/m, '')
  .replace(/^\s*([^\n#`|<][^\n]*(?:\n[^\n#`|<\s][^\n]*)*)\n/, (all, para) => same(para.replace(/<br>/g, ''), p.description) ? '' : all))
  .replace(/<img\b[^>]*>/g, img => { const src = img.match(/\ssrc="([^"]+)"/)?.[1], to = src && picture(p.dir, src.replace(/&amp;/g, '&')); return to ? img.replace(/\ssrc="[^"]+"/, ` src="${esc(to)}"`).replace(/^<img\b(?![^>]*\sloading=)/, '<img loading="lazy"') : '' })
  .replace(/<p>((?:\s*<img\b[^>]*>)+)\s*<\/p>/g, (all, imgs) => imgs.match(/<img\b[^>]*>/g).map(figure).join('\n'))
  .replace(/^<img\b[^>]*>$/gm, figure)
// Its standing: deprecated; calibrated, a version 1 or later, its interface kept as semver keeps it; pending calibration,
// a version 0, its interface free to change. Each with what it means, for the reader who asks
const standing = p => p.deprecated ? ['deprecated', `Deprecated: ${p.deprecated}`] : +p.version.split('.')[0] >= 1 ? ['calibrated', 'Version 1 or later: its interface kept, as semver keeps it'] : ['pending calibration', 'Version 0: its interface may still change']
// the standards its README names, as their bodies number them (one named both with and without its part or revision,
// once, as named most closely), the first five
const STANDARD = /\b(?:ISO\/IEC ?\d{4,5}(?:-\d+)*|ITU-R ?(?:BS|BT)\. ?\d+(?:-\d+)?|ITU-R ?468|EBU ?R ?\d+|EBU ?Tech ?\d+|IEC ?\d{4,5}(?:-\d+)*|ISO ?\d{3,5}(?:-\d+)*|AES ?-?\d+(?:-\d+)?|ANSI ?S\d+(?:\.\d+)*|RFC ?\d{3,4}|IEEE ?\d{3,4}(?:\.\d+)?)\b/g
const standards = text => {
  const named = [...new Set([...text.matchAll(STANDARD)].map(([s]) => s.replace(/^(ISO\/IEC|ITU-R|EBU|IEC|ISO|ANSI|RFC|IEEE) ?/, '$1 ').replace(/^AES ?-?/, 'AES').replace(/\. /, '.').replace(/^EBU R ?/, 'EBU R ')))]
  return named.filter(s => !named.some(t => t.startsWith(`${s}-`))).slice(0, 5)
}

// The rails. The catalog's: its tags, how many packages each holds, the one shown marked (modules/index.js filters by
// it). A dossier's: every unit, the one it is in open to its packages, its own marked; a category to its place in the
// catalog
const tagged = t => all.filter(p => tagsOf.get(p).includes(t)).length
const tagRail = () => `<nav class="site-rail" aria-label="Tags">
      <h2>Tags</h2>
      <ul>
        <li><a href="/modules/" data-tag="" aria-current="true"><span class="ticked">all</span><small>${all.length}</small></a></li>${Object.keys(TAGS).map(t => `
        <li><a href="/modules/?tag=${slug(t)}" data-tag="${slug(t)}"><span class="ticked">${t}</span><small>${tagged(t)}</small></a></li>`).join('')}
      </ul>
    </nav>`
const link = (p, here) => `<a href="/modules/${p.short}/"${p === here ? ' aria-current="page"' : ''}><span class="ticked">${esc(p.label)}</span></a>`
const directory = p => `<nav class="site-rail directory" aria-label="Modules">
      <h2>Modules</h2>
      <ul>${units.map(u => `
        <li>${u.head ? link(u.head, p) : `<a href="/modules/#${u.id}"><span class="ticked">${u.id}</span></a>`}${unitOf.get(p) === u && u.kin.length ? `<ul>${u.kin.map(q => `<li>${link(q, p)}</li>`).join('')}</ul>` : ''}</li>`).join('')}
      </ul>
    </nav>`
const head = ({ path, name, description }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} – audiojs</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0d1014">
  <link rel="canonical" href="https://audio.js.org${path}">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://audio.js.org${path}">
  <meta property="og:title" content="${esc(name)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:site_name" content="audiojs">
  <meta property="og:image" content="https://audio.js.org/icon-512.png">
${chrome()}  <link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/modules/modules.css">
  <script type="module" src="/modules/index.js"></script>
</head>
<body>
  <!-- Generated by scripts/modules-page.mjs from the checkouts of audiojs/audio and the @audio families: edit the script, not this file -->
  ${bar('/modules/')}`

// A dossier, a page set as a technical file. Its head: where it is (a breadcrumb up to the catalog through its family),
// the packages before and after it in the catalog, its name; under the rule its standing, its npm version and licence;
// what it does. Its overview: how to install it, when it last changed, its family, its tags, the standards it names
// (down its edge too); beside them its README's picture when it has one alone. Then its README, its parts numbered;
// then the packages before and after it again
const dossier = p => {
  const u = unitOf.get(p), tags = tagsOf.get(p), at = all.indexOf(p), prev = all[at - 1], next = all[at + 1]
  const [state, meaning] = standing(p), cites = standards(p.readme), updated = git(p.dir, 'log', '-1', '--format=%cs', '--', '.')
  let text = body(p), lead = ''
  const figures = text.match(/<figure\b[\s\S]*?<\/figure>/g) ?? []
  if (figures.length === 1) text = text.replace(figures[0], ''), lead = figures[0]
  const facts = [
    ['Install', `<button class="copy" type="button" data-copy="npm i ${p.name}"><code>npm i ${p.name}</code></button>`],
    updated && ['Updated', `<time datetime="${updated}">${updated}</time>`],
    !u.head ? ['Category', `<a href="/modules/#${u.id}">${u.id}</a>, ${u.kin.length} libraries`] : p !== u.head ? ['Family', `<a href="/modules/${u.head.short}/">${esc(u.head.short)}</a>, ${u.kin.length} packages under it`] : u.kin.length && ['Family', `${u.kin.length} packages under it`],
    tags.length && ['Tags', tags.map(t => `<a href="/modules/?tag=${slug(t)}">${t}</a>`).join(', ')],
    cites.length && ['Standards', cites.join(', ')]
  ].filter(Boolean)
  const wbr = s => s.replace(/[/-]/g, '$&<wbr>'), scope = p.name.match(/^@[\w-]+\//)?.[0] ?? ''
  const step = (q, rel) => q ? `<a class="${rel}" href="/modules/${q.short}/" rel="${rel}"><small>${rel === 'prev' ? 'Previous' : 'Next'}</small><span class="ticked">${esc(q.short)}</span></a>` : '<span></span>'
  const pace = (q, rel) => q ? `<a href="/modules/${q.short}/" rel="${rel}" title="${rel === 'prev' ? 'Previous' : 'Next'}: ${esc(q.name)}">${rel === 'prev' ? '← ' : ''}<span class="ticked">${esc(q.short)}</span>${rel === 'next' ? ' →' : ''}</a>` : ''
  return `<article class="dossier" data-family="${p.family}">${cites.length ? `
        <p class="edge" aria-hidden="true">${cites.join(' // ')}</p>` : ''}
        <header class="file">
          <nav class="trail" aria-label="Breadcrumb"><a class="ticked" href="/modules/">modules</a> / ${!u.head ? `<a class="ticked" href="/modules/#${u.id}">${u.id}</a> / ` : p !== u.head ? `<a class="ticked" href="/modules/${u.head.short}/">${esc(u.head.short)}</a> / ` : ''}<span aria-current="page">${esc(p.label)}</span></nav>
          <nav class="pace" aria-label="Previous and next">${pace(prev, 'prev')}${pace(next, 'next')}</nav>
          <h1>${scope ? `<span class="scope">${wbr(scope)}</span>` : ''}${wbr(p.name.slice(scope.length))}</h1>
          <div class="marks">
            <p class="standing" title="${esc(meaning)}"><small>Status</small> ${state}</p>
            <p class="badges"><a href="https://www.npmjs.com/package/${p.name}"><span>npm</span><span>${esc(p.version)}</span></a>${p.license ? `<span><span>license</span><span>${esc(p.license)}</span></span>` : ''}</p>
          </div>
          <p class="lead">${esc(p.description)}</p>
        </header>
        <section class="overview${lead ? ' pictured' : ''}" aria-label="Overview">
          <div>
            <h2>Overview</h2>
            <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          </div>${lead}
        </section>
        <div class="readme">
${text}
        </div>
        <nav class="steps" aria-label="Modules">${step(prev, 'prev')}${step(next, 'next')}</nav>
      </article>`
}

// The catalog: a unit a row, its tags under what it does, a family's others folded under its own (their names in the
// fold; a find in the page, or a search, opens it); a category's libraries listed under it, each with its own tags; a
// dossier a press away. Each row carries its tags, for the rail's (modules/index.js)
const row = (p, shown = false) => `
          <li data-tags="${tagsOf.get(p).map(slug).join(' ')}"><a href="/modules/${p.short}/" data-search="${esc([p.name, p.description, ...p.keywords, ...tagsOf.get(p)].join(' ').toLowerCase())}"><span class="name"><span class="ticked">${esc(p.label)}</span></span><span class="desc">${esc(p.description)}</span>${shown && tagsOf.get(p).length ? `<span class="tags">${tagsOf.get(p).join(', ')}</span>` : ''}<span class="ver">${esc(p.version)}</span></a></li>`
const unit = u => !u.head ? `
      <section class="unit category" id="${u.id}" aria-labelledby="${u.id}-name">
        <p class="head"><span class="name" id="${u.id}-name">${u.id}</span><span class="desc">${esc(u.line)}</span><span class="ver">${u.kin.length} libraries</span></p>
        <ul>${u.kin.map(p => row(p, true)).join('')}
        </ul>
      </section>` : `
      <section class="unit" id="${u.id}" aria-label="${esc(u.head.name)}">
        <ul>${row(u.head, true)}
        </ul>${u.kin.length ? `
        <details class="kin">
          <summary><span class="count">${u.kin.length} ${u.kin.length > 1 ? 'packages' : 'package'}</span><span class="names">${u.kin.map(p => esc(p.label)).join(', ')}</span></summary>
          <ul>${u.kin.map(p => row(p)).join('')}
          </ul>
        </details>` : ''}
      </section>`
const count = all.length
const description = `Every package of audiojs, tagged by what it does: ${count} modules, from decoding and loudness to filters, time stretching and synthesis, each its own install, each with its dossier.`

// the dossiers made afresh: a package gone from the checkouts leaves no page behind (index.js and modules.css, written
// by hand, stay)
mkdirSync(`${ROOT}modules`, { recursive: true })
for (const d of readdirSync(`${ROOT}modules`, { withFileTypes: true })) if (d.isDirectory()) rmSync(`${ROOT}modules/${d.name}`, { recursive: true })
writeFileSync(`${ROOT}modules/index.html`, `${head({ path: '/modules/', name: 'Modules', description })}
  <div class="site-page">
    ${tagRail()}
    <main class="site-main catalog">
      <h1>Modules</h1>
      <p class="lead">${count} packages of audio work, each installed on its own: what decodes, measures, shapes, repairs, stretches and makes a sound. <a href="/modules/audio/">audio</a> loads them by name.</p>
      <div class="find">
        <input type="search" id="q" placeholder="Search by name or by what it does" aria-label="Search the modules" autocomplete="off" spellcheck="false">
        <output id="n" for="q" aria-live="polite">${count} modules</output>
      </div>
      <p class="none" id="none" hidden>No module by that name or for that. Try fewer words.</p>
      <div class="units">${units.map(unit).join('')}
      </div>
    </main>
  </div>
</body>
</html>
`)
for (const p of all) {
  mkdirSync(`${ROOT}modules/${p.short}`, { recursive: true })
  const page = `${head({ path: `/modules/${p.short}/`, name: p.name, description: p.description })}
  <div class="site-page">
    ${directory(p)}
    <main class="site-main">
      ${dossier(p)}
    </main>
  </div>
</body>
</html>
`
  const pageIds = [...page.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]), twice = pageIds.filter((id, i) => pageIds.indexOf(id) !== i)
  if (twice.length) throw Error(`modules/${p.short}: ids used twice: ${[...new Set(twice)].join(', ')}`)
  writeFileSync(`${ROOT}modules/${p.short}/index.html`, page)
}
console.log(`modules: ${count} packages in ${units.length} units, ${Object.keys(TAGS).length} tags`)
