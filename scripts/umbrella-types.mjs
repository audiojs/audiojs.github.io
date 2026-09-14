// Verify the public umbrella APIs from npm tarballs, never workspace links.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = resolve(process.env.AUDIO_ROOT || join(homedir(), 'projects/@audio'))
const fixtures = new URL('./types/', import.meta.url)
const sources = Object.fromEntries(['umbrellas', 'node', 'browser'].map(name => [name, readFileSync(new URL(name + '.ts', fixtures), 'utf8')]))
const dependencies = text => ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest).statements
  .filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.text)
const packageName = name => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/')
const names = [...new Set(Object.values(sources).flatMap(dependencies).map(packageName))]
const dirs = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(dir, d.name)) : []
const packages = new Map()
for (const dir of [...dirs(root).flatMap(repo => [repo, ...dirs(join(repo, 'packages'))]), join(root, '..', 'window-function')]) {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) continue
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (!pkg.private) packages.set(pkg.name, { dir, pkg })
}
const selected = new Set()
function visit(name) {
  if (selected.has(name) || !packages.has(name)) return
  selected.add(name)
  for (const dep of Object.keys(packages.get(name).pkg.dependencies || {})) visit(dep)
}
for (const name of names) { assert.ok(packages.has(name), `Missing checkout: ${name}`); visit(name) }
const work = mkdtempSync(join(tmpdir(), 'audiojs-types-consumer-'))
console.log(`Packed type consumer: ${work}`)
const consumer = join(work, 'consumer')
const env = { ...process.env, npm_config_cache: join(work, 'cache'), npm_config_update_notifier: 'false' }
delete env.NODE_PATH
delete env.NODE_OPTIONS
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (bin, args, cwd = consumer) => {
  try { return execFileSync(bin, args, { cwd, env, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 }) }
  catch (error) { throw new Error(`${bin} ${args[0]} failed\n${error.stdout || ''}${error.stderr || ''}`) }
}
const entry = (value, mode) => typeof value === 'string' ? value
  : entry(value[mode] || value.default, mode)
try {
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const archives = []
  for (const name of selected) {
    const { dir } = packages.get(name)
    const [pack] = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', work], dir))
    archives.push(join(work, pack.filename))
  }
  console.log(`Packed ${archives.length} local packages (umbrellas and their local dependencies).`)
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives])
  writeFileSync(join(consumer, 'umbrellas.ts'), sources.umbrellas)
  const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  for (const mode of ['node', 'browser']) {
    const expected = []
    for (const [i, name] of names.entries()) {
      const pkg = JSON.parse(readFileSync(join(consumer, 'node_modules', name, 'package.json'), 'utf8'))
      const source = entry(pkg.exports?.['.'] || pkg.exports || pkg.main, mode)
      const keys = Object.keys(await import(pathToFileURL(join(consumer, 'node_modules', name, source))))
      expected.push(`import * as api${i} from '${name}'`)
      for (const key of keys) expected.push(`type Export${i}_${key} = Check<NotAny<typeof api${i}.${key}>>`)
      if (name === 'window-function') {
        for (const [subpath, target] of Object.entries(pkg.exports)) {
          if (subpath === '.' || !existsSync(join(consumer, 'node_modules', name, target.replace(/\.js$/, '.d.ts')))) continue
          const id = subpath.slice(2)
          expected.push(`import ${id}Default from '${name}/${id}'; const ${id}Value: number = ${id}Default(0, 128)`)
        }
      }
    }
    writeFileSync(join(consumer, 'exports.ts'), 'type NotAny<T> = 0 extends (1 & T) ? false : true\ntype Check<T extends true> = T\n' + expected.join('\n'))
    writeFileSync(join(consumer, 'target.ts'), sources[mode])
    run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable',
      '--module', mode === 'node' ? 'NodeNext' : 'ESNext', '--moduleResolution', mode === 'node' ? 'NodeNext' : 'Bundler',
      'umbrellas.ts', 'target.ts', 'exports.ts'])
    console.log(`${mode}: strict installed examples, rejected invalid calls, and every runtime export passed`)
  }
  writeFileSync(join(consumer, 'native-only.ts'), sources.node.replace("from '@audio/compile'", "from '@audio/compile-vst'"))
  run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--lib', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'native-only.ts'])
  console.log('native adapter declarations: passed without DOM libraries or a native build')
  // Inspect the Node SDK's packed declarations without installing or loading its
  // native/device dependencies. The normal compiler suite tests the host runtime.
  const sdk = join(root, '..', 'web-audio-api')
  const [sdkPack] = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', work], sdk))
  const sdkDir = join(consumer, 'node_modules', 'web-audio-api')
  mkdirSync(sdkDir)
  run('tar', ['-xzf', join(work, sdkPack.filename), '-C', sdkDir, '--strip-components=1'])
  writeFileSync(join(consumer, 'sdk.ts'), readFileSync(new URL('sdk.ts', fixtures), 'utf8'))
  run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable,ESNext.Disposable', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'sdk.ts'])
  console.log('Node Web Audio SDK: packed declarations and bidirectional worklet connections passed')
} finally {
  if (process.argv.includes('--keep')) console.log(`Kept consumer for inspection: ${work}`)
  else rmSync(work, { recursive: true, force: true })
}
