// The site as audio.js.org serves it, to work on: this repo at /, and audiojs/audio's own Pages at /audio/ (the
// playground, the logo, the design system's tokens the home's CSS is made of), from a checkout of it beside this one
// (or AUDIO=path), else from the live site. A folder is its index.html, at a path ending in /, as on GitHub Pages;
// nothing cached, so a reload shows the files as they are. scripts/home-test.mjs serves the same way.
// Run: npm run dev, or node scripts/serve.mjs [port]
import { createServer } from 'http'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { extname, join, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
export const AUDIO = resolve(process.env.AUDIO || resolve(ROOT, '../audio'))
const LIVE = 'https://audio.js.org'
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.txt': 'text/plain', '.xml': 'application/xml', '.md': 'text/markdown'
}

// /audio/… with no checkout to read it from: the live site's, as it answers
async function live(url, res) {
  try {
    const r = await fetch(LIVE + url)
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(Buffer.from(await r.arrayBuffer()))
  } catch (e) { res.writeHead(502, { 'content-type': 'text/plain' }).end(`${LIVE}${url}: ${e.message}`) }
}

export async function site(req, res) {
  const { pathname, search } = new URL(req.url, 'http://localhost'), at = decodeURIComponent(pathname)
  const audio = at === '/audio' || at.startsWith('/audio/')
  if (audio && !existsSync(AUDIO)) return live(req.url, res)
  const root = audio ? AUDIO : ROOT
  let path = normalize(join(root, audio ? at.slice('/audio'.length) : at))
  if (path !== root && !path.startsWith(root + sep)) return res.writeHead(403).end()
  try {
    if ((await stat(path)).isDirectory()) {
      if (!pathname.endsWith('/')) return res.writeHead(301, { location: pathname + '/' + search }).end()
      path = join(path, 'index.html')
    }
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body)
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${pathname}`) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || process.env.PORT || 8080)
  createServer(site)
    .on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is taken: npm run dev -- <port>` : e.message); process.exit(1) })
    .listen(port, () => console.log(`http://localhost:${port}/\n/audio/ from ${existsSync(AUDIO) ? AUDIO : LIVE + '/audio/ (no checkout at ' + AUDIO + ')'}`))
}
