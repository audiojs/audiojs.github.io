// Runs every scripts/pages/<slug>.test.mjs (one Playwright check per page module) and sums the results.
// Usage: node scripts/pages-test.mjs [slug…]
import { readdirSync } from 'fs'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const dir = fileURLToPath(new URL('./pages/', import.meta.url))
const only = process.argv.slice(2)
// render first: the pages under test must be the current modules, and a build that dies on a stray module is a failure here
if (spawnSync(process.execPath, [fileURLToPath(new URL('./util-pages.mjs', import.meta.url))], { stdio: 'inherit' }).status !== 0) { console.log('build failed'); process.exit(1) }
const tests = readdirSync(dir).filter(f => f.endsWith('.test.mjs') && (!only.length || only.includes(f.replace('.test.mjs', '')))).sort()
let failed = 0
for (const f of tests) {
  console.log(`\n▶ ${f.replace('.test.mjs', '')}`)
  const r = spawnSync(process.execPath, [dir + f], { stdio: 'inherit' })
  if (r.status !== 0) failed++
}
console.log(`\n# pages ${tests.length}  failed ${failed}`)
process.exit(failed ? 1 : 0)
