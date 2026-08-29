// Bundles audiojs packages that are not on npm yet into util/vendor/<name>.js, so a utility page can use them
// today. Published dependencies stay external and load from esm.sh; unpublished ones are bundled in. Once a
// package is published, delete its bundle here and scripts/util-pages.mjs's src() resolves to esm.sh instead.
// Run: node scripts/vendor.mjs [name…]   (no names = every entry)
import { build } from 'esbuild'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUDIO = join(homedir(), 'projects/@audio')
const OUT = join(ROOT, 'util/vendor')

// name → local entry. Umbrellas bundle with code splitting so codecs still load on demand.
export const entries = {
  '@audio/decode': { entry: join(AUDIO, 'decode/audio-decode.js'), split: true },
  '@audio/denoise-desilence': { entry: join(AUDIO, 'denoise/packages/denoise-desilence/desilence.js') },
  '@audio/denoise-dewow': { entry: join(AUDIO, 'denoise/packages/denoise-dewow/dewow.js') },
  '@audio/measure-lossy': { entry: join(AUDIO, 'measure/packages/measure-lossy/lossy.js') },
  '@audio/midi-render': { entry: join(AUDIO, 'midi/packages/midi-render/render.js') },
  '@audio/musicxml': { entry: join(AUDIO, 'midi/packages/musicxml/musicxml.js') },
  '@audio/subtitle': { entry: join(AUDIO, 'midi/packages/subtitle/subtitle.js') },
  '@audio/neural-asr': { entry: join(AUDIO, 'neural/packages/neural-asr/asr.js') },
  '@audio/eq-fit': { entry: join(AUDIO, 'eq/packages/eq-fit/fit.js') },
  'audio-type': { entry: join(homedir(), 'projects/audio-type/audio-type.js') },
}
export const file = name => name.replace(/^@audio\//, '') + '.js'

// package name → published version (npm), memoized in .vendor-cache.json so a rebuild is offline-safe
const cachePath = join(ROOT, 'scripts/.vendor-cache.json')
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
const published = name => {
  if (name in cache) return cache[name]
  try { cache[name] = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null }
  catch { cache[name] = null }
  return cache[name]
}

// bare specifiers: published → external esm.sh URL (pinned to the version the local package.json range allows,
// i.e. the published one); unpublished local @audio package → bundled from its repo dir; node builtins never happen
// in these entries (browser code only).
const localDirs = (() => {
  const dirs = {}
  for (const repo of readdirSync(AUDIO)) {
    const pk = join(AUDIO, repo, 'packages')
    if (existsSync(join(AUDIO, repo, 'package.json'))) dirs[JSON.parse(readFileSync(join(AUDIO, repo, 'package.json'), 'utf8')).name] = join(AUDIO, repo)
    if (existsSync(pk)) for (const p of readdirSync(pk)) if (existsSync(join(pk, p, 'package.json'))) dirs[JSON.parse(readFileSync(join(pk, p, 'package.json'), 'utf8')).name] = join(pk, p)
  }
  dirs['audio-type'] = join(homedir(), 'projects/audio-type')
  return dirs
})()
const localVersion = name => localDirs[name] ? JSON.parse(readFileSync(join(localDirs[name], 'package.json'), 'utf8')).version : null
const newer = (a, b) => { if (!a || !b) return false; const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (pa[i] > pb[i]) return true; if (pa[i] < pb[i]) return false } return false }
const resolveLocal = (name, sub) => {
  const dir = localDirs[name]; if (!dir) return null
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const exp = pj.exports?.[sub ? './' + sub : '.']
  const rel = typeof exp === 'string' ? exp : exp?.default ?? exp?.import ?? (sub ? null : pj.main)
  return rel ? join(dir, rel) : null
}
const bare = /^(@[^/]+\/[^/]+|[^./][^/]*)(\/.*)?$/
const esmsh = {
  name: 'esm.sh-externals',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, args => {
      const m = args.path.match(bare); if (!m) return
      const name = m[1], sub = m[2]?.slice(1) || ''
      if (name.startsWith('node:')) return { external: true }
      const v = published(name), local = resolveLocal(name, sub)
      // published and not outrun by the local checkout → esm.sh; otherwise bundle the local source
      if (v && !(local && newer(localVersion(name), v))) return { path: `https://esm.sh/${name}@${v}${sub ? '/' + sub : ''}`, external: true }
      if (!local) throw Error(`${args.path} is neither published nor a local audiojs package (imported by ${args.importer})`)
      return { path: local }
    })
  },
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(entries)
mkdirSync(OUT, { recursive: true })
for (const name of names) {
  const e = entries[name]; if (!e) throw Error('unknown entry ' + name)
  if (e.split) {
    const dir = join(OUT, file(name).replace(/\.js$/, ''))
    rmSync(dir, { recursive: true, force: true })
    await build({ entryPoints: { index: e.entry }, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', outdir: dir, chunkNames: '[name]-[hash]', minify: true, legalComments: 'none', plugins: [esmsh] })
    const total = readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0)
    console.log(`${name} → util/vendor/${file(name).replace(/\.js$/, '')}/ (${readdirSync(dir).length} files, ${(total / 1024).toFixed(0)} KB)`)
  } else {
    const out = join(OUT, file(name))
    await build({ entryPoints: [e.entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: out, minify: true, legalComments: 'none', plugins: [esmsh] })
    console.log(`${name} → util/vendor/${file(name)} (${(statSync(out).size / 1024).toFixed(0)} KB)`)
  }
}
import('fs').then(({ writeFileSync }) => writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n'))
