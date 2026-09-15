// Rebuild the editor's self-contained DSP bundle from the local audiojs checkouts.
// Committed output lets the static site deploy without sibling repos or a CDN.
import { build } from 'esbuild'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const root = join(homedir(), 'projects/@audio')
const packages = {
  yin: 'pitch/packages/pitch-yin/yin.js',
  shift: 'shift/packages/shift-formant/index.js',
  stretch: 'stretch/packages/stretch-wsola/wsola.js',
  wav: 'encode/packages/encode-wav/wav-encode.js',
  decodeWav: 'decode/packages/decode-wav/decode-wav.js',
}
const result = await build({
  stdin: { contents: Object.entries(packages).map(([name, path]) => `export { default as ${name} } from ${JSON.stringify(join(root, path))}`).join('\n'), resolveDir: root },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  outfile: 'util/prosody/dsp.js', legalComments: 'eof', metafile: true,
})
const versions = Object.values(packages).map(path => {
  const dir = join(root, path.slice(0, path.lastIndexOf('/')))
  const p = JSON.parse(readFileSync(join(dir, 'package.json')))
  return `${p.name}@${p.version}`
})
writeFileSync('util/prosody/dsp.js', `// Built by scripts/prosody-vendor.mjs from ${versions.join(', ')}.\n` + readFileSync('util/prosody/dsp.js'))
const notices = new Map()
for (const path of Object.keys(result.metafile.inputs)) {
  if (path === '<stdin>') continue
  let dir = dirname(resolve(path))
  while (!existsSync(join(dir, 'package.json')) && dirname(dir) !== dir) dir = dirname(dir)
  const p = JSON.parse(readFileSync(join(dir, 'package.json')))
  let licenseDir = dir
  while (!['LICENSE', 'LICENSE.md', 'license'].some(f => existsSync(join(licenseDir, f))) && dirname(licenseDir) !== licenseDir) licenseDir = dirname(licenseDir)
  const file = ['LICENSE', 'LICENSE.md', 'license'].find(f => existsSync(join(licenseDir, f)))
  if (!file) throw Error('Missing license for ' + p.name)
  notices.set(p.name, `${p.name}@${p.version}\n${readFileSync(join(licenseDir, file), 'utf8')}`)
}
writeFileSync('util/prosody/THIRD_PARTY.txt', [...notices.values()].join('\n\n---\n\n'))
