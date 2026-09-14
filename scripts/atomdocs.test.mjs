import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('generated leaf examples use the installed leaf; hand-written docs and other imports survive', t => {
  const root = mkdtempSync(join(tmpdir(), 'audiojs-atomdocs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'effect')
  const put = (file, text) => {
    const path = join(repo, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  put('package.json', JSON.stringify({ name: '@audio/effect' }))
  put('index.js', `export { default as delay } from '@audio/effect-delay'
export { envelope } from '@audio/effect-envelope'`)
  put('README.md', `# Effects
### Delay
\`\`\`js
import { delay } from '@audio/effect'
import { delay as echo } from "@audio/effect"
import {
  delay as feedback,
} from '@audio/effect'
import { reverb } from '@audio/effect'
import { delay, gain } from '@audio/effect'
\`\`\`
### Gain
Hand-written gain docs win.
### envelope
\`\`\`js
import { envelope } from '@audio/effect'
import { envelope as follower } from '@audio/effect'
\`\`\`
`)
  for (const name of ['delay', 'gain', 'envelope'])
    put(`packages/effect-${name}/package.json`, JSON.stringify({ name: `@audio/effect-${name}`, description: name }))
  put('packages/effect-gain/README.md', '# Keep this hand-written README\n')
  const run = (...args) => execFileSync(process.execPath, [fileURLToPath(new URL('./atomdocs.mjs', import.meta.url)), 'effect', ...args],
    { env: { ...process.env, AUDIO_ROOT: root }, encoding: 'utf8' })
  assert.match(run('--write'), /wrote: 2 /)
  const file = join(repo, 'packages/effect-delay/README.md')
  const content = readFileSync(file, 'utf8')
  assert.match(content, /npm install @audio\/effect-delay/)
  assert.match(content, /import delay from '@audio\/effect-delay'/)
  assert.match(content, /import echo from '@audio\/effect-delay'/)
  assert.match(content, /import feedback from '@audio\/effect-delay'/)
  assert.doesNotMatch(content, /import \{ delay(?: as echo)? \} from/)
  assert.match(content, /import \{ reverb \} from '@audio\/effect'/)
  assert.match(content, /import \{ delay, gain \} from '@audio\/effect'/)
  assert.equal(readFileSync(join(repo, 'packages/effect-gain/README.md'), 'utf8'), '# Keep this hand-written README\n')
  const envelope = readFileSync(join(repo, 'packages/effect-envelope/README.md'), 'utf8')
  assert.match(envelope, /import \{ envelope \} from '@audio\/effect-envelope'/)
  assert.match(envelope, /import \{ envelope as follower \} from '@audio\/effect-envelope'/)
  assert.doesNotMatch(envelope, /import envelope from/)
  assert.match(run('--write'), /wrote: 0 /)
  assert.match(run(), /pending: 0 /)
  assert.equal(readFileSync(file, 'utf8'), content, 'regeneration is idempotent')
  put('README.md', readFileSync(join(repo, 'README.md'), 'utf8').replace('### Delay', '### Delay\nchanged source'))
  run()
  assert.equal(readFileSync(file, 'utf8'), content, 'default mode is read-only')
  assert.match(run('--write'), /wrote: 1 /)
  assert.match(readFileSync(file, 'utf8'), /changed source/, 'A → B updates generated content')
})

test('empty docs and sections ending at EOF or the next heading preserve exact section boundaries', t => {
  const root = mkdtempSync(join(tmpdir(), 'audiojs-atomdocs-boundary-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'sample'), leaf = join(repo, 'packages/sample-one')
  mkdirSync(leaf, { recursive: true })
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: '@audio/sample' }))
  writeFileSync(join(leaf, 'package.json'), JSON.stringify({ name: '@audio/sample-one', description: 'One processor.' }))
  writeFileSync(join(repo, 'index.js'), "export { process as one } from '@audio/sample-one'")
  const source = join(repo, 'README.md'), output = join(leaf, 'README.md')
  const run = () => execFileSync(process.execPath, [fileURLToPath(new URL('./atomdocs.mjs', import.meta.url)), 'sample', '--write'],
    { env: { ...process.env, AUDIO_ROOT: root }, encoding: 'utf8' })
  writeFileSync(source, '')
  assert.match(run(), /wrote: 0 /)
  assert.equal(existsSync(output), false, 'no section means no invented README')
  writeFileSync(source, '### one')
  assert.match(run(), /wrote: 1 /)
  assert.match(readFileSync(output, 'utf8'), /import \{ process as one \} from '@audio\/sample-one'/)
  const section = "### one\n```js\nimport { one as apply } from '@audio/sample'\n```"
  writeFileSync(source, section)
  run()
  const expected = readFileSync(output, 'utf8')
  assert.match(expected, /import \{ process as apply \} from '@audio\/sample-one'/)
  for (const suffix of ['', '\n', '\n## Other\nDo not include this section.']) {
    writeFileSync(source, section + suffix)
    assert.match(run(), /wrote: 0 /)
    assert.equal(readFileSync(output, 'utf8'), expected, 'EOF, final newline and following heading give the same content')
  }
})
