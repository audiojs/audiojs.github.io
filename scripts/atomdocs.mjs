#!/usr/bin/env node
// Per-atom README generator — extracts each atom's section from the family
// umbrella README (the single maintained source) and emits a standalone
// packages/<atom>/README.md. npm package pages stop being empty without
// forking documentation: umbrella README stays canonical, atom READMEs are
// derived, regenerate on change.
//
// Usage:
//   node scripts/atomdocs.mjs <repo>            # report what would be written
//   node scripts/atomdocs.mjs <repo> --write    # write packages/*/README.md
//
// Mapping: atom `@audio/family-x` ← umbrella section `### \`x\`` (or `## \`x\``).
// Atoms with no matching section are reported for hand-writing.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(process.env.HOME, 'projects/@audio')
const repo = process.argv[2]
const WRITE = process.argv.includes('--write')
if (!repo) { console.error('usage: atomdocs.mjs <repo> [--write]'); process.exit(1) }

const repoDir = join(ROOT, repo)
const umbrella = ['README.md', 'readme.md'].map(f => join(repoDir, f)).find(existsSync)
const md = readFileSync(umbrella, 'utf8')
const umbrellaName = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf8')).name

// Split umbrella into sections keyed by heading token
let sections = {}
for (let m of md.matchAll(/^(##+) [`*]*([\w-]+)[`*]*.*$/gm)) {
  let start = m.index
  let level = m[1]
  let rest = md.slice(start + m[0].length)
  // section ends at next heading of same-or-higher level
  let end = rest.search(new RegExp(`^#{1,${level.length}} `, 'm'))
  sections[m[2]] = m[0].replace(/^#+ /, '') + '\n' + (end === -1 ? rest : rest.slice(0, end))
}

// Package → umbrella-section aliases where names diverge
const ALIAS = {
  'denoise-detect': 'denoise',          // the auto-selector documents itself as `denoise`
  'denoise-spectral': 'specsub',        // package named by category, section by function
  'shift-pvoc': 'vocoder',              // package named by algorithm family, section by name
  'shift-pvoc-lock': 'phaseLock',       // package named by algorithm family, section by name
}

// Package → umbrella-section heading token, for repos whose headings are prose
// ("### Ping-pong") rather than code ("### `pingpong`") — the heading regex only
// captures the first word-run, and casing differs from the package short name.
// Section lookup only; does not affect the derived fnName below.
const SECTION_ALIAS = {
  'effect-autowah': 'Auto-wah',
  'effect-bitcrusher': 'Bitcrusher',
  'effect-chorus': 'Chorus',
  'effect-delay': 'Delay',
  'effect-distortion': 'Distortion',
  'effect-exciter': 'Exciter',
  'effect-flanger': 'Flanger',
  'effect-freqshift': 'Frequency',
  'effect-gain': 'Gain',
  'effect-mixer': 'Mixer',
  'effect-multitap': 'Multitap',
  'effect-noiseshaper': 'Noise',
  'effect-phaser': 'Phaser',
  'effect-pingpong': 'Ping-pong',
  'effect-ringmod': 'Ring',
  'effect-rotary': 'Rotary',
  'effect-slew': 'Slew',
  'effect-tapestop': 'Tape',
  'effect-tremolo': 'Tremolo',
  'effect-vibrato': 'Vibrato',
  'effect-wah': 'Wah-wah',
}

// Package → real exported identifier (the umbrella index.js is the source of truth),
// for atoms where camelCase(short) doesn't match — e.g. 'pingpong' → 'pingPong'.
const FN_NAME = {
  'effect-autowah': 'autoWah',
  'effect-freqshift': 'frequencyShifter',
  'effect-graindelay': 'grainDelay',
  'effect-noiseshaper': 'noiseShaping',
  'effect-pingpong': 'pingPong',
  'effect-ringmod': 'ringMod',
  'effect-slew': 'slewLimiter',
  'effect-tapestop': 'tapeStop',
}

const pkgs = readdirSync(join(repoDir, 'packages')).filter(p => existsSync(join(repoDir, 'packages', p, 'package.json')))
let written = 0, missing = [], skipped = []

for (let p of pkgs) {
  let pj = JSON.parse(readFileSync(join(repoDir, 'packages', p, 'package.json'), 'utf8'))
  if (pj.private) continue
  // hand-written READMEs win: only derive where none exists or a prior derived one does
  let existing = join(repoDir, 'packages', p, 'README.md')
  if (existsSync(existing) && !readFileSync(existing, 'utf8').includes('generated from the umbrella docs')) { skipped.push(p); continue }
  // section key: alias → strip family prefix (denoise-dehum → dehum) → full name
  let short = p.replace(new RegExp(`^${repo}-`), '')
  let section = sections[SECTION_ALIAS[p]] || sections[ALIAS[p]] || sections[short] || sections[p]
  if (!section) { missing.push(p); continue }

  let fnName = FN_NAME[p] || (ALIAS[p] || short).replace(/-(\w)/g, (_, c) => c.toUpperCase())
  let body = `# ${pj.name} [![npm](https://img.shields.io/npm/v/${pj.name})](https://www.npmjs.com/package/${pj.name}) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

${pj.description}

\`\`\`
npm install ${pj.name}
\`\`\`

\`\`\`js
import ${fnName} from '${pj.name}'
\`\`\`

${section.replace(/^.*\n/, '').trim()}

---

Part of [${umbrellaName}](https://github.com/audiojs/${repo}) — the ${repo} family umbrella. This README is generated from the umbrella docs.

MIT © [audiojs](https://github.com/audiojs)
`
  let out = join(repoDir, 'packages', p, 'README.md')
  let prev = existsSync(out) ? readFileSync(out, 'utf8') : null
  if (prev === body) continue
  if (WRITE) { writeFileSync(out, body); written++ }
  else console.log(`would write ${p}/README.md (${body.length} bytes, section '${short}')`)
}

console.log(`\n${WRITE ? 'wrote' : 'pending'}: ${WRITE ? written : pkgs.length - missing.length - skipped.length} · hand-written kept: ${skipped.join(', ') || 'none'} · no umbrella section: ${missing.join(', ') || 'none'}`)
