import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('baseline reports actionable source gaps without mistaking build artifacts or comments for broken docs', t => {
  const root = mkdtempSync(join(tmpdir(), 'audiojs-baseline-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (file, text) => {
    const path = join(root, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./package-baseline.mjs', import.meta.url)), '--json'],
    { env: { ...process.env, AUDIO_ROOT: root }, encoding: 'utf8' })
  assert.notEqual(run().status, 0, 'an empty checkout must not pass')
  put('effect/package.json', JSON.stringify({ name: '@audio/effect', exports: './index.js', scripts: { test: 'node test.js' } }))
  put('effect/index.js', '')
  put('effect/index.d.ts', '')
  put('effect/README.md', '# Effects\n<!-- [unpublished plot](missing.svg) -->\n```js\n// [illustration](missing.js)\n```\n')
  put('effect/packages/effect-delay/package.json', JSON.stringify({ name: '@audio/effect-delay', exports: { '.': { types: './index.d.ts', default: './delay.js' } }, types: './index.d.ts' }))
  put('effect/packages/effect-delay/index.d.ts', '')
  put('effect/packages/effect-delay/README.md', "generated from the umbrella docs\nimport { delay } from '@audio/effect'\n[details](missing.md)\n")
  put('mic/package.json', JSON.stringify({ name: '@audio/mic-linux-arm64', main: 'mic.node', os: ['linux'], cpu: ['arm64'] }))
  put('mic/README.md', '# Mic\n')
  put('internal/package.json', JSON.stringify({ private: true }))
  const first = run(), report = JSON.parse(first.stdout)
  assert.equal(first.status, 1)
  assert.equal(report.public, 3)
  assert.equal(report.private, 1)
  assert.deepEqual(report.issues.map(i => [i.package, i.kind, i.severity]), [
    ['@audio/effect-delay', 'entry', 'error'],
    ['@audio/effect-delay', 'readme-link', 'error'],
    ['@audio/effect-delay', 'example-dependency', 'error'],
    ['@audio/mic-linux-arm64', 'entry', 'platform-build'],
  ])
  assert.equal(report.packages.find(p => p.name === '@audio/effect-delay').familyTest, true)
  assert.equal(report.packages.find(p => p.name === '@audio/effect').typed, true, 'adjacent declarations need no manifest types field')
  put('effect/packages/effect-delay/README.md', "generated from the umbrella docs\nimport {\n  delay,\n} from '@audio/effect'\n[details](missing.md)\n")
  assert.deepEqual(JSON.parse(run().stdout).issues.map(i => i.kind), report.issues.map(i => i.kind), 'multiline imports retain the dependency error')
  put('effect/packages/effect-delay/delay.js', '')
  put('effect/packages/effect-delay/README.md', "generated from the umbrella docs\nimport delay from '@audio/effect-delay'\n")
  const fixed = run()
  assert.equal(fixed.status, 0, fixed.stderr)
  assert.equal(JSON.parse(fixed.stdout).issues.length, 1, 'the platform build remains explicitly unverified')
  assert.deepEqual(JSON.parse(run().stdout), JSON.parse(fixed.stdout), 'repeated audits are identical')

  put('minimal/package.json', '{}')
  const missing = run()
  assert.equal(missing.status, 1)
  assert.deepEqual(JSON.parse(missing.stdout).issues.filter(i => i.package === 'minimal').map(i => i.kind), ['name', 'readme'])
  put('minimal/package.json', JSON.stringify({ name: 'minimal', exports: { '.': { import: './index.mjs', require: './index.cjs' }, './private': null, './examples/*': './examples/*.js' } }))
  put('minimal/README.md', '')
  put('minimal/index.mjs', '')
  put('minimal/index.cjs', '')
  put('minimal/index.d.mts', '')
  const wildcard = JSON.parse(run().stdout)
  assert.deepEqual(wildcard.issues.filter(i => i.package === 'minimal').map(i => [i.kind, i.detail]), [['entry-directory', './examples/*.js']])
  assert.equal(wildcard.packages.find(p => p.name === 'minimal').typed, true, 'ESM adjacent declarations are detected')
  rmSync(join(root, 'minimal/index.d.mts'))
  put('minimal/index.d.cts', '')
  mkdirSync(join(root, 'minimal/examples'))
  const complete = run()
  assert.equal(complete.status, 0, complete.stderr)
  assert.equal(JSON.parse(complete.stdout).packages.find(p => p.name === 'minimal').typed, true, 'CommonJS adjacent declarations are detected')
})

test('types fields must be reachable through package-relative export targets', t => {
  const root = mkdtempSync(join(tmpdir(), 'audiojs-types-exports-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'leaf')
  mkdirSync(dir)
  for (const file of ['README.md', 'main.js', 'index.d.ts']) writeFileSync(join(dir, file), '')
  const pkg = { name: 'leaf', types: './index.d.ts', exports: { '.': './main.js' } }
  const run = () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./package-baseline.mjs', import.meta.url)), '--json'],
      { env: { ...process.env, AUDIO_ROOT: root }, encoding: 'utf8' })
    return { status: result.status, issues: JSON.parse(result.stdout).issues.map(i => i.kind) }
  }
  assert.deepEqual(run(), { status: 1, issues: ['types-export'] })
  pkg.exports['.'] = { types: 'index.d.ts', default: './main.js' }
  assert.deepEqual(run(), { status: 1, issues: ['export-target'] })
  pkg.exports['.'].types = './index.d.ts'
  assert.deepEqual(run(), { status: 0, issues: [] })
})
