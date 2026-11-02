// Renders modules/index.html: every module audio has, by name. Built in, from the API tables of its README; plugins,
// from its registry (audio.js), each described by its own package on npm. At the version npm installs (npm i audio).
// Needs the network: unpkg for the README, audio.js and each plugin's package.json (whose description npm's registry
// cuts at 255 characters).
// Run: node scripts/modules-page.mjs
import { writeFileSync, mkdirSync } from 'fs'
import { ROOT, esc } from './page-helpers.mjs'
import { bar, css } from './bar.mjs'

const REPO = 'https://github.com/audiojs/audio'
const get = async url => { const r = await fetch(url); if (!r.ok) throw Error(`${url}: ${r.status}`); return r }
const { version: VERSION } = await (await get('https://registry.npmjs.org/audio/latest')).json()
const [readme, lib] = await Promise.all(['README.md', 'audio.js'].map(f => get(`https://unpkg.com/audio@${VERSION}/${f}`).then(r => r.text())))

// README markdown, inline: code, bold, links (made absolute), and the <br> and <sub> it writes as HTML
const abs = u => /^https?:/.test(u) ? u : u.startsWith('#') ? REPO + u : `${REPO}/blob/master/${u}`
const md = s => esc(s).replace(/&lt;br>/g, '<br>').replace(/&lt;(\/?)sub>/g, '<$1sub>')
  .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${abs(u)}">${t}</a>`)
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// a call's name: what comes before its parentheses, after its dot
const named = sig => sig.match(/([A-Za-z]\w*)\s*\(/)?.[1]

// Built in: the rows of the API's tables that name a call (a method, a call, a stat; a property only if it is called)
const CALLED = new Set(['Method', 'Call', 'Stat']), RENAME = { Plugins: 'Extending' }
const builtin = []
for (const block of readme.slice(readme.indexOf('\n## API'), readme.indexOf('\n## CLI')).split('\n### ').slice(1)) {
  // id: the section's own; anchor: the README's, for a group renamed here too
  const [title, ...lines] = block.split('\n'), name = RENAME[title.trim()] ?? title.trim(), group = { title: name, id: slug(name), anchor: slug(title), items: [] }
  let kind
  lines.forEach((line, i) => {
    if (!line.startsWith('|')) return kind = undefined
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|'))
    if (/^\|\s*:?-/.test(lines[i + 1] ?? '')) return kind = cells[0]
    if (/^:?-/.test(cells[0])) return
    const sigs = [...cells[0].matchAll(/`([^`]+)`/g)].map(m => m[1])
    if (!sigs.length || !(CALLED.has(kind) || kind === 'Property' && sigs.some(named))) return
    const calls = kind === 'Stat' ? sigs.map(s => `.stat(${s})`) : sigs
    group.items.push({ calls, names: kind === 'Stat' ? sigs.map(s => s.replace(/'/g, '')) : sigs.map(named).filter(Boolean), html: md(cells[1] ?? '') })
  })
  if (group.items.length) builtin.push(group)
}

// Plugins: the registry's ops and stats, each its package, its description from npm; a plugin the README already
// documents stays there, its package named
const table = name => [...lib.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\}`))[1].matchAll(/^\s+'?([\w-]+)'?:\s*'([^']+)'/gm)]
const pkgOf = spec => spec.replace(/\/audio$/, '').replace(/^(@audio\/[^/]+)\/(.+)$/, (_, a, b) => `${a}-${b.replace(/\//g, '-')}`)
const registry = [...table('OPS').map(([, n, s]) => ({ n, pkg: pkgOf(s), stat: false })), ...table('STATS').map(([, n, s]) => ({ n, pkg: pkgOf(s), stat: true }))]
let next = 0
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < registry.length) { const p = registry[next++]; p.desc = (await (await get(`https://unpkg.com/${p.pkg}/package.json`)).json()).description ?? '' }
}))
const documented = new Map(builtin.flatMap(g => g.items.flatMap(it => it.names.map(n => [n, it]))))
const FAMILIES = [
  ['Dynamics', ['dynamics']], ['Repair and denoise', ['denoise', 'neural', 'chain', 'defeedback']], ['Effects', ['effect']],
  ['Reverb', ['reverb']], ['Filters', ['filter']], ['EQ', ['eq']], ['Spatial', ['spatial']],
  ['Pitch and time', ['shift', 'stretch', 'tune']], ['Saturation and amps', ['saturate', 'amp']], ['Synthesis', ['synth']],
  ['Separation', ['vocals']], ['Loudness', ['loudness']], ['Spectral', ['spectral']], ['Music', ['mir']]]
const familyOf = pkg => FAMILIES.find(([, fs]) => fs.includes(pkg.replace('@audio/', '').split('-')[0]))?.[0] ?? 'More'
const plugins = []
for (const p of registry) {
  const doc = documented.get(p.n)
  if (doc) { doc.pkg ??= p.pkg; continue }
  const title = familyOf(p.pkg)
  let group = plugins.find(g => g.title === title)
  if (!group) plugins.push(group = { title, id: slug(title), items: [] })
  group.items.push({ calls: [p.stat ? `.stat('${p.n}')` : `.${p.n}()`], pkg: p.pkg, html: esc(p.desc.trim()) })
}
plugins.sort((a, b) => [...FAMILIES.map(([t]) => t), 'More'].indexOf(a.title) - [...FAMILIES.map(([t]) => t), 'More'].indexOf(b.title))

const count = groups => groups.reduce((n, g) => n + g.items.length, 0)
const npm = pkg => `https://www.npmjs.com/package/${pkg}`
const item = (it, href) => `
        <li><a href="${href(it)}">${it.calls.map(c => `<code>${esc(c)}</code>`).join(' ')}</a><p>${it.html}</p>${it.pkg ? `<span class="pkg">${it.pkg}</span>` : ''}</li>`
const section = (g, href) => `
    <section class="group" id="${g.id}" aria-labelledby="${g.id}-h">
      <h3 id="${g.id}-h">${g.title} <small>${g.items.length}</small></h3>
      <ul>${g.items.map(it => item(it, href)).join('')}
      </ul>
    </section>`
const toc = groups => groups.map(g => `<a href="#${g.id}">${g.title}</a>`).join('')
const total = count(builtin) + count(plugins)
const description = `Every module of audio, the JavaScript audio library, searchable: ${count(builtin)} calls built in and ${count(plugins)} plugins it loads by name, each with what it does.`

mkdirSync(`${ROOT}modules`, { recursive: true })
writeFileSync(`${ROOT}modules/index.html`, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Modules: every call and plugin of audio · audiojs</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#0d1014">
  <link rel="canonical" href="https://audio.js.org/modules/">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://audio.js.org/modules/">
  <meta property="og:title" content="Modules: every call and plugin of audio">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:site_name" content="audiojs">
  <meta property="og:image" content="https://audio.js.org/icon-512.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${css()}">
  <link rel="stylesheet" href="/audio/assets/tokens.css">
  <link rel="stylesheet" href="/modules/modules.css">
  <script type="module" src="/modules/index.js"></script>
</head>
<body>
  <!-- Generated by scripts/modules-page.mjs from audio ${VERSION}: edit the script, not this file -->
  ${bar('/modules/')}
<main>
  <h1>Modules</h1>
  <p class="lead">Everything <a href="${REPO}"><code>audio</code></a> ${VERSION} does to a sound, by name: <b>${count(builtin)}</b> calls built in, and <b>${count(plugins)}</b> plugins it loads the first time one is called. Each plugin is a package of its own, usable without audio.</p>
  <div class="find">
    <input type="search" id="q" placeholder="Search by name or by what it does" aria-label="Search the modules" autocomplete="off" spellcheck="false">
    <output id="n" for="q" aria-live="polite">${total} modules</output>
  </div>
  <p class="none" id="none" hidden>Nothing by that name or description. <a href="${REPO}/issues/new">Ask for it</a>.</p>
  <div class="part" id="built-in">
    <h2>Built in</h2>
    <nav class="toc" aria-label="Built in">${toc(builtin)}</nav>${builtin.map(g => section(g, () => `${REPO}#${g.anchor}`)).join('')}
  </div>
  <div class="part" id="plugins">
    <h2>Plugins</h2>
    <nav class="toc" aria-label="Plugins">${toc(plugins)}</nav>${plugins.map(g => section(g, it => npm(it.pkg))).join('')}
  </div>
</main>
</body>
</html>
`)
console.log(`modules: ${count(builtin)} built in in ${builtin.length} groups, ${count(plugins)} plugins in ${plugins.length} families, audio ${VERSION}`)
