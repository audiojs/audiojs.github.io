// Exercise real DSP leaves (and their relative imports) from installed tarballs.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'

export default async function verifyWorklets(consumer) {
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html>') }
    const file = resolve(consumer, '.' + pathname)
    if (!file.startsWith(consumer + sep)) { res.writeHead(403); return res.end() }
    try {
      res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream')
      res.end(await readFile(file))
    } catch { res.writeHead(404); res.end() }
  })
  try {
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
    const base = `http://127.0.0.1:${server.address().port}`
    for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
      const browser = await engine.launch()
      try {
        const page = await browser.newPage(), errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(base)
        const results = await page.evaluate(async () => {
          const { toWam } = await import('/node_modules/@audio/compile-wam/wam.js')
          const results = []
          for (const name of ['delay', 'pingpong']) {
            const url = new URL(`/node_modules/@audio/effect-${name}/audio.js`, location.href).href
            const factory = (await import(url))[name]
            for (const fs of [44100, 48000, 96000]) {
              const time = Math.fround(0.01), delay = Math.floor(time * fs), length = 5 * delay + 5
              const ctx = new OfflineAudioContext(2, length, fs)
              const plugin = toWam(factory, { url, export: name })
              await plugin.register(ctx)
              const options = { outputChannelCount: [2], parameterData: { time, feedback: 0.5, mix: 1 } }
              const node = plugin.create(ctx, options), empty = plugin.create(ctx, options)
              let processorError = false
              node.onprocessorerror = empty.onprocessorerror = () => { processorError = true }
              const input = ctx.createBuffer(2, 128, fs)
              input.getChannelData(0)[0] = 1
              input.getChannelData(1)[3] = -0.25
              const source = ctx.createBufferSource(); source.buffer = input
              source.connect(node).connect(ctx.destination)
              empty.connect(ctx.destination) // A second, silent instance must remain independent.
              source.start() // Ends after 128 frames; all echoes arrive after input disconnection.
              try {
                const rendered = await ctx.startRendering()
                const expected = [new Float32Array(length), new Float32Array(length)]
                for (let repeat = 1; repeat <= 5; repeat++) {
                  const channel = name === 'pingpong' ? (repeat - 1) % 2 : 0
                  expected[channel][repeat * delay] = 0.5 ** (repeat - 1)
                  expected[1 - channel][repeat * delay + 3] = -0.25 * 0.5 ** (repeat - 1)
                }
                let error = 0
                for (let c = 0; c < 2; c++) for (let i = 0; i < length; i++)
                  error = Math.max(error, Math.abs(rendered.getChannelData(c)[i] - expected[c][i]))
                results.push({ name, fs, error, processorError })
              } finally { node.disconnect(); empty.disconnect(); node.dispose(); empty.dispose() }
            }
          }
          return results
        })
        assert.equal(results.length, 6)
        for (const result of results)
          assert.ok(!result.processorError && Number.isFinite(result.error) && result.error < 1e-7, `${name}: ${JSON.stringify(result)}`)
        assert.deepEqual(errors, [])
        console.log(`${name}: installed delay/ping-pong worklets, disconnected tails and independent stereo instances passed at 44.1/48/96 kHz`)
      } finally { await browser.close() }
    }
  } finally { await new Promise(done => server.close(done)) }
}
