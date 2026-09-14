#!/usr/bin/env node
// Local package/documentation baseline. Platform build outputs and type gaps are
// reported separately; this does not replace npm artifact, runtime or DSP tests.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'

const root = resolve(process.env.AUDIO_ROOT || join(homedir(), 'projects/@audio'))
const json = process.argv.includes('--json')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const dirs = path => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(path, d.name)) : []
const values = obj => typeof obj === 'string' ? [obj] : obj && typeof obj === 'object' ? Object.values(obj).flatMap(values) : []
const issues = [], packages = []
const manifests = dirs(root).flatMap(repo => [join(repo, 'package.json'), ...dirs(join(repo, 'packages')).map(p => join(p, 'package.json'))]).filter(existsSync)
if (!manifests.length) throw new Error(`No package manifests found in ${root}; set AUDIO_ROOT to the audiojs checkout directory.`)

for (const manifest of manifests) {
  const pkg = read(manifest), dir = dirname(manifest)
  if (pkg.private) continue
  const issue = (kind, detail, severity = 'error') => issues.push({ package: pkg.name || relative(root, dir), kind, detail, severity })
  if (!pkg.name) issue('name', 'publishable manifest has no package name')
  const readme = readdirSync(dir).find(f => /^readme\.md$/i.test(f))
  const entries = [...values(pkg.exports), ...['main', 'module', 'types', 'typings', 'audio'].map(k => pkg[k]).filter(v => typeof v === 'string')]
  for (const target of values(pkg.exports))
    if (!target.startsWith('./')) issue('export-target', `${target} must start with ./`)
  const mainExport = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.']
  if (pkg.types && typeof mainExport === 'string' && /\.[cm]?js$/.test(mainExport)
    && !existsSync(resolve(dir, mainExport.replace(/\.([cm]?)js$/, '.d.$1ts'))))
    issue('types-export', `${pkg.types} needs an explicit types condition in exports`)
  // TypeScript can resolve adjacent declarations without a manifest types field.
  // Presence is useful inventory data, not a strict type-check or coverage claim.
  const typed = !!pkg.types || !!pkg.typings || entries.some(v => /\.d\.[cm]?ts$/.test(v) || (
    /\.[cm]?js$/.test(v) && existsSync(resolve(dir, v.replace(/\.([cm]?)js$/, '.d.$1ts')))
  ))
  const platform = !!pkg.os && !!pkg.cpu
  const family = basename(dirname(dir)) === 'packages' ? dirname(dirname(dir)) : dir
  const parent = read(join(family, 'package.json'))
  const ownTest = !!pkg.scripts?.test
  const familyTest = !!parent.scripts?.test
  packages.push({ name: pkg.name, repo: basename(family), path: relative(root, dir), typed, platform, ownTest, familyTest })

  for (const target of new Set(entries)) {
    if (target.includes('*')) {
      // Wildcard targets cannot name one file; ensure the containing directory exists.
      if (!existsSync(resolve(dir, dirname(target)))) issue('entry-directory', target)
      continue
    }
    if (!existsSync(resolve(dir, target)))
      issue('entry', target, platform && target.endsWith('.node') ? 'platform-build' : 'error')
  }
  if (!readme) { issue('readme', 'README.md is missing'); continue }
  const text = readFileSync(join(dir, readme), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  // Fenced code is not Markdown navigation. Ignore its illustrative paths.
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')
  for (const [, url] of prose.matchAll(/\]\(([^\s)]+)/g)) {
    if (/^(?:[a-z]+:|#|\/)/i.test(url)) continue
    const path = url.split(/[?#]/)[0]
    if (path && !existsSync(resolve(dir, path))) issue('readme-link', `${readme} → ${path}`)
  }
  if (text.includes('generated from the umbrella docs') && pkg.name !== parent.name) {
    for (const [, names, source] of text.matchAll(/import\s+(\{[^}]*\}|[^\n]+?)\s+from\s+['"]([^'"]+)['"]/g))
      if (source === parent.name && !pkg.dependencies?.[source] && !pkg.peerDependencies?.[source])
        issue('example-dependency', `${readme} imports ${names} from ${source}, but installing ${pkg.name} does not install it`)
  }
}

const result = {
  root,
  scope: 'Local source entries, declaration presence and visible README links/examples; wildcard entries check directories only. No registry, runtime, strict type-check or DSP verification.',
  manifests: manifests.length,
  public: packages.length,
  private: manifests.length - packages.length,
  packages,
  issues,
}
if (json) console.log(JSON.stringify(result, null, 2))
else {
  console.log(`${result.public} publishable packages; ${result.private} private manifests\n${result.scope}\n`)
  for (const i of issues) console.log(`${i.severity}: ${i.package}: ${i.kind}: ${i.detail}`)
  const untyped = packages.filter(p => !p.typed && !p.platform)
  console.log(`\nNo type declarations detected (${untyped.length} non-platform packages): ${untyped.map(p => p.name).join(', ')}`)
  console.log(`\n${packages.filter(p => p.ownTest).length} packages declare their own test; ${packages.filter(p => !p.ownTest && p.familyTest).length} rely on a family test entry point (coverage not inferred).`)
}
if (issues.some(i => i.severity === 'error')) process.exitCode = 1
