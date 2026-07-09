#!/usr/bin/env node
// Org release sweep — detects registry drift and publishes what's behind.
//
// The failure mode this kills (bit us 2026-07-09, broke shift+stretch CI):
// a fix lands in the repo (or worse, hand-patched into node_modules) but never
// reaches npm — local runs green on the fixed code, CI installs the stale
// registry version and fails. Raw-source publishing across ~37 repos /
// ~330 packages makes hand-tracking this impossible.
//
// Usage:
//   node scripts/release.mjs                 # check: report drift, exit 1 if any
//   node scripts/release.mjs --publish       # bump patch + publish + push drifted packages
//   node scripts/release.mjs --repo denoise  # limit to one repo
//
// Drift classes reported:
//   AHEAD    local version > npm       → needs publish (bump already done)
//   DIRTY    local version == npm, content differs → needs bump + publish
//   UNPUB    package never published (private:true skipped silently)
//   BEHIND   local version < npm       → repo is stale, pull needed (never auto-acted)
//
// Content comparison: registry tarball (cached in .work/release-cache) diffed
// against the local files npm would pack, ignoring package.json (version field).

import { execSync, spawnSync } from 'child_process'
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'

const ROOT = resolve(process.env.AUDIO_ROOT || join(process.env.HOME, 'projects/@audio'))
// Non-@audio repos that belong to the same release discipline
const EXTRA = ['fourier-transform', 'periodic-function', 'pcm-convert'].map(r => join(process.env.HOME, 'projects', r))
const CACHE = join(tmpdir(), 'audiojs-release-cache')

const argv = process.argv.slice(2)
const DO_PUBLISH = argv.includes('--publish')
const REPO_FILTER = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : null

const sh = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const tryd = fn => { try { return fn() } catch { return null } }

// Every publishable package dir: repo roots + packages/*
function packageDirs() {
  let dirs = []
  let repos = readdirSync(ROOT).map(d => join(ROOT, d)).filter(d => existsSync(join(d, 'package.json')))
  for (let extra of EXTRA) if (existsSync(join(extra, 'package.json'))) repos.push(extra)
  for (let repo of repos) {
    if (REPO_FILTER && !repo.endsWith('/' + REPO_FILTER)) continue
    dirs.push(repo)
    let pk = join(repo, 'packages')
    if (existsSync(pk)) for (let p of readdirSync(pk)) {
      if (existsSync(join(pk, p, 'package.json'))) dirs.push(join(pk, p))
    }
  }
  return dirs
}

// Files npm would pack, hashed — package.json excluded (version differs by design).
// --ignore-scripts: prepack builders must not run (or print) during a check sweep.
function localDigest(dir) {
  let out = tryd(() => sh('npm pack --dry-run --json --ignore-scripts 2>/dev/null', dir))
  if (!out) return null
  out = out.slice(out.indexOf('['))                       // strip any pre-JSON noise
  let files = tryd(() => JSON.parse(out)[0].files.map(f => f.path).filter(f => f !== 'package.json'))
  if (!files) return null
  let h = createHash('sha256')
  for (let f of files.sort()) {
    h.update(f + '\0')
    tryd(() => h.update(readFileSync(join(dir, f))))
  }
  return h.digest('hex')
}

function registryDigest(name, version) {
  let key = name.replace('/', '__') + '@' + version
  let dir = join(CACHE, key)
  if (!existsSync(join(dir, 'package'))) {
    mkdirSync(dir, { recursive: true })
    let r = spawnSync('npm', ['pack', `${name}@${version}`, '--pack-destination', dir], { encoding: 'utf8' })
    if (r.status !== 0) return null
    let tgz = readdirSync(dir).find(f => f.endsWith('.tgz'))
    spawnSync('tar', ['xzf', join(dir, tgz)], { cwd: dir })
  }
  let pkg = join(dir, 'package')
  let files = []
  ;(function walk(d, base) {
    for (let f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(d, f.name), base ? base + '/' + f.name : f.name)
      else files.push(base ? base + '/' + f.name : f.name)
    }
  })(pkg, '')
  let h = createHash('sha256')
  for (let f of files.filter(f => f !== 'package.json').sort()) {
    h.update(f + '\0')
    h.update(readFileSync(join(pkg, f)))
  }
  return h.digest('hex')
}

const semverGt = (a, b) => {
  let pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) { if (pa[i] > pb[i]) return true; if (pa[i] < pb[i]) return false }
  return false
}

let findings = { AHEAD: [], DIRTY: [], UNPUB: [], BEHIND: [] }
let dirs = packageDirs()
console.log(`sweeping ${dirs.length} packages…`)

for (let dir of dirs) {
  let pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (pj.private || !pj.name || !pj.version) continue
  let pub = tryd(() => sh(`npm view ${pj.name} version 2>/dev/null`))
  let rel = dir.replace(ROOT + '/', '').replace(process.env.HOME + '/projects/', '')
  if (!pub) { findings.UNPUB.push({ name: pj.name, dir: rel }); continue }
  if (semverGt(pj.version, pub)) { findings.AHEAD.push({ name: pj.name, dir, rel, local: pj.version, npm: pub }); continue }
  if (semverGt(pub, pj.version)) { findings.BEHIND.push({ name: pj.name, dir: rel, local: pj.version, npm: pub }); continue }
  // same version — compare content
  let ld = localDigest(dir)
  if (!ld) continue
  let rd = registryDigest(pj.name, pub)
  if (rd && ld !== rd) findings.DIRTY.push({ name: pj.name, dir, rel, version: pj.version })
}

let total = findings.AHEAD.length + findings.DIRTY.length + findings.BEHIND.length
console.log(`\nAHEAD (bumped, unpublished): ${findings.AHEAD.length}`)
for (let f of findings.AHEAD) console.log(`  ${f.name} local ${f.local} > npm ${f.npm}  [${f.rel}]`)
console.log(`DIRTY (same version, content drifted): ${findings.DIRTY.length}`)
for (let f of findings.DIRTY) console.log(`  ${f.name}@${f.version}  [${f.rel}]`)
console.log(`BEHIND (npm newer than repo — pull!): ${findings.BEHIND.length}`)
for (let f of findings.BEHIND) console.log(`  ${f.name} local ${f.local} < npm ${f.npm}  [${f.dir}]`)
console.log(`UNPUB (never published, not private): ${findings.UNPUB.length}`)
for (let f of findings.UNPUB) console.log(`  ${f.name}  [${f.dir}]`)

if (!DO_PUBLISH) {
  if (total) { console.log('\ndrift found — run with --publish to resolve AHEAD+DIRTY'); process.exit(1) }
  console.log('\nregistry ≡ repos ✓')
  process.exit(0)
}

// ── publish mode ──
for (let f of findings.DIRTY) {
  console.log(`\nbump+publish ${f.name}…`)
  sh('npm version patch --no-git-tag-version', f.dir)
  console.log(sh('npm publish 2>&1 | tail -1', f.dir))
}
for (let f of findings.AHEAD) {
  console.log(`\npublish ${f.name}@${f.local}…`)
  console.log(sh('npm publish 2>&1 | tail -1', f.dir))
}
if (findings.DIRTY.length) console.log('\nNOTE: version bumps are uncommitted — review `git status` per repo, commit and push.')
