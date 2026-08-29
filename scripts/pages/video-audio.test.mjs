// Browser test for /util/video-audio/ — remove or replace a video's audio track without re-encoding.
// Fixtures:
//   scripts/fixtures/video-aac.mp4       ffmpeg -f lavfi -i testsrc=size=64x64:rate=10:duration=2 -f lavfi -i sine=440:duration=2
//                                           -c:v libx264 -preset ultrafast -crf 40 -pix_fmt yuv420p -c:a aac -shortest video-aac.mp4
//                                         (2s, 20 video frames @10fps H.264, mono AAC audio, ~24 KB)
//   scripts/fixtures/plain.wav           existing fixture: 0.5s, 48 kHz stereo PCM, 440 Hz tone on the left channel
//   scripts/fixtures/video-fragmented.mp4  ffmpeg -f lavfi -i testsrc=size=64x64:rate=10:duration=1 -c:v libx264 -preset ultrafast
//                                           -movflags frag_keyframe+empty_moov video-fragmented.mp4  (moof-based, ~11 KB)
// Run: node scripts/pages/video-audio.test.mjs  (needs ffprobe on PATH)
import { createServer } from 'http'
import { readFile, writeFile, mkdtemp, rm } from 'fs/promises'
import { extname, normalize, resolve, sep, join } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import * as pw from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const F = {
  video: join(root, 'scripts/fixtures/video-aac.mp4'),
  audio: join(root, 'scripts/fixtures/plain.wav'),
  fragmented: join(root, 'scripts/fixtures/video-fragmented.mp4'),
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(root, rel)
  if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end('404') }
})
await new Promise(r => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }

const tmp = await mkdtemp(join(tmpdir(), 'video-audio-test-'))
const ffprobe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', file]).toString())
const srcProbe = ffprobe(F.video)
const srcVideo = srcProbe.streams.find(s => s.codec_type === 'video')

const browser = await pw.chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // phone viewport: overflow is a failure
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/error loading dynamically imported module|^Error$/.test(m.text().trim())) errors.push(m.text()) })

const waitResult = () => page.waitForFunction(() => {
  const err = document.querySelector('.status.err'), out = document.querySelector('.panel .row.out'), report = document.querySelector('.panel .report')
  return err || (out && !out.hidden && report && !report.hidden)
}, { timeout: 30000 })
const readState = () => page.evaluate(() => {
  const err = document.querySelector('.status.err')
  const rep = document.querySelector('.panel .report')
  const out = document.querySelector('.panel .out')
  return {
    err: err ? err.textContent : null,
    report: rep && !rep.hidden ? [...rep.querySelectorAll(':scope > div')].map(d => ({ k: d.querySelector('.k')?.textContent, v: d.querySelector('.v')?.textContent, note: d.querySelector('.note')?.textContent || null })) : null,
    save: out && !out.hidden ? out.querySelector('a').download : null,
  }
})
const saveTo = async (localPath) => {
  const href = await page.evaluate(() => document.querySelector('.panel .out a').href)
  const bytes = await page.evaluate(async (href) => [...new Uint8Array(await (await fetch(href)).arrayBuffer())], href)
  await writeFile(localPath, Uint8Array.from(bytes))
}
const decodeInPage = () => page.evaluate(async () => {
  const { decodeLib } = await import('/util/util.js')
  const decode = await decodeLib()
  const bytes = new Uint8Array(await (await fetch(document.querySelector('.panel .out a').href)).arrayBuffer())
  const d = await decode(bytes)
  return { channelData: d.channelData.map(ch => [...ch]), sampleRate: d.sampleRate }
})
// Goertzel bin energy — same technique as util-e2e.mjs's recorder check
const goertzel = (d, fs, f) => { const w = 2 * Math.PI * f / fs, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (const x of d) { const s0 = x + c * s1 - s2; s2 = s1; s1 = s0 } return s1 * s1 + s2 * s2 - c * s1 * s2 }
const dominantFreq = (d, fs, candidates) => candidates.map(f => [f, goertzel(d, fs, f)]).sort((a, b) => b[1] - a[1])[0][0]
const rms = d => Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length)

await page.goto(`${base}/util/video-audio/`)
ok(await page.title() === 'Remove or replace video audio: free, in your browser · audiojs', 'title matches')

// ── 1. remove mode (default) ──────────────────────────────────────────────────────────────
await page.setInputFiles('#file', F.video)
await waitResult()
let r = await readState()
ok(!r.err, 'remove: processed without error' + (r.err ? ' — ' + r.err : ''))
ok(r.report?.find(x => x.k === 'Audio')?.v === 'Removed', `remove: report says Audio Removed (${JSON.stringify(r.report)})`)
ok(/-noaudio\.mp4$/.test(r.save || ''), `remove: saved ${r.save}`)

const removedPath = join(tmp, 'removed.mp4')
await saveTo(removedPath)
const removedProbe = ffprobe(removedPath)
ok(removedProbe.streams.length === 1 && removedProbe.streams[0].codec_type === 'video', `remove: only a video stream survives (${removedProbe.streams.map(s => s.codec_type).join(',')})`)
ok(removedProbe.streams[0].codec_name === srcVideo.codec_name, `remove: video codec unchanged (${removedProbe.streams[0].codec_name})`)
ok(removedProbe.streams[0].nb_frames === srcVideo.nb_frames, `remove: video frame count unchanged (${removedProbe.streams[0].nb_frames} vs ${srcVideo.nb_frames})`)

// ── 2. replace mode, AAC (default codec — headless Chromium has AudioEncoder for AAC) ──────
await page.click('#opts [name=mode][value=replace]')
await page.setInputFiles('#file', F.video)
await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('Drop the replacement audio'), { timeout: 15000 })
await page.setInputFiles('#file2', F.audio)
await waitResult()
r = await readState()
ok(!r.err, 'replace/aac: processed without error' + (r.err ? ' — ' + r.err : ''))
const aacAudioRow = r.report?.find(x => x.k === 'Audio')
ok(/^AAC/.test(aacAudioRow?.v || ''), `replace/aac: report says AAC (${aacAudioRow?.v})`)
ok(/plain\.mp4$/.test(r.save || ''), `replace/aac: saved as <video base>-<audio base>.mp4 (${r.save})`)

const aacPath = join(tmp, 'aac.mp4')
await saveTo(aacPath)
const aacProbe = ffprobe(aacPath)
const aacVideoStream = aacProbe.streams.find(s => s.codec_type === 'video')
ok(aacVideoStream?.codec_name === srcVideo.codec_name && aacVideoStream?.nb_frames === srcVideo.nb_frames, `replace/aac: video stream unchanged (${aacVideoStream?.codec_name}, ${aacVideoStream?.nb_frames} frames)`)
ok(!!aacProbe.streams.find(s => s.codec_type === 'audio' && s.codec_name === 'aac'), `replace/aac: audio stream is AAC (${JSON.stringify(aacProbe.streams.map(s => s.codec_name))})`)

const aacDecoded = await decodeInPage()
const aacL = aacDecoded.channelData[0], aacFs = aacDecoded.sampleRate
const aacSec = aacL.length / aacFs
ok(aacSec > 1.9 && aacSec < 2.2, `replace/aac: decodes to ≈2s of video length (${aacSec.toFixed(3)}s)`)
ok(dominantFreq(aacL.slice(0, Math.floor(0.4 * aacFs)), aacFs, [220, 330, 392, 440, 494, 523, 587]) === 440, 'replace/aac: dominant tone on the left channel is 440 Hz')
ok(rms(aacL.slice(Math.floor(0.7 * aacFs), Math.floor(0.9 * aacFs))) < 0.01, `replace/aac: tail after the 0.5s source is silence-padded (rms ${rms(aacL.slice(Math.floor(0.7 * aacFs), Math.floor(0.9 * aacFs))).toFixed(4)})`)

// ── 3. replace mode, Opus ───────────────────────────────────────────────────────────────────
await page.selectOption('#opts [name=codec]', 'opus')
await page.waitForFunction(() => document.querySelector('.panel .report')?.textContent?.includes('Opus'), { timeout: 20000 })
r = await readState()
ok(!r.err, 'replace/opus: processed without error' + (r.err ? ' — ' + r.err : ''))
const opusDecoded = await decodeInPage()
const opusL = opusDecoded.channelData[0], opusFs = opusDecoded.sampleRate
ok(dominantFreq(opusL.slice(0, Math.floor(0.4 * opusFs)), opusFs, [220, 330, 392, 440, 494, 523, 587]) === 440, 'replace/opus: dominant tone on the left channel is 440 Hz')
ok(opusL.length / opusFs > 1.9 && opusL.length / opusFs < 2.3, `replace/opus: decodes to ≈2s of video length (${(opusL.length / opusFs).toFixed(3)}s)`)

// ── 4. loop checkbox: the replacement audio should continue past its own 0.5s length ───────
await page.check('#opts [name=loop]')
await page.waitForFunction(() => document.querySelector('.panel .report')?.textContent?.includes('Looped'), { timeout: 20000 })
r = await readState()
ok(/Looped/.test(r.report?.find(x => x.k === 'Audio')?.note || ''), `loop: report note mentions looping (${r.report?.find(x => x.k === 'Audio')?.note})`)
const loopDecoded = await decodeInPage()
const loopL = loopDecoded.channelData[0], loopFs = loopDecoded.sampleRate
ok(rms(loopL.slice(Math.floor(0.7 * loopFs), Math.floor(0.9 * loopFs))) > 0.05, `loop: audio still present past the source 0.5s length (rms ${rms(loopL.slice(Math.floor(0.7 * loopFs), Math.floor(0.9 * loopFs))).toFixed(4)})`)

// ── 5. reset restores initial state ─────────────────────────────────────────────────────────
await page.click('#reset')
const afterReset = await page.evaluate(() => ({
  panelHidden: document.getElementById('panel').hidden,
  mode: document.querySelector('#opts [name=mode]:checked').value,
  codec: document.querySelector('#opts [name=codec]').value,
  loop: document.querySelector('#opts [name=loop]').checked,
  replaceOnlyHidden: [...document.querySelectorAll('.replace-only')].every(x => x.hidden),
}))
ok(afterReset.panelHidden && afterReset.mode === 'remove' && afterReset.codec === 'aac' && !afterReset.loop && afterReset.replaceOnlyHidden, `reset: state cleared (${JSON.stringify(afterReset)})`)

// ── 6. unsupported container (MKV) — clear error, no attempt to remux ──────────────────────
await page.evaluate(() => {
  const dt = new DataTransfer()
  dt.items.add(new File([new Uint8Array(64)], 'movie.mkv', { type: 'video/x-matroska' }))
  document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
})
await page.waitForFunction(() => document.querySelector('.status.err'), { timeout: 10000 })
const mkvMsg = await page.evaluate(() => document.querySelector('.status.err').textContent)
ok(/MKV/.test(mkvMsg) && /not remuxable/.test(mkvMsg), `mkv: clear rejection message (${mkvMsg})`)
await page.click('#reset')

// ── 7. fragmented MP4 — clear error ─────────────────────────────────────────────────────────
await page.setInputFiles('#file', F.fragmented)
await page.waitForFunction(() => document.querySelector('.status.err'), { timeout: 15000 })
const fragMsg = await page.evaluate(() => document.querySelector('.status.err').textContent)
ok(/fragmented/i.test(fragMsg), `fragmented mp4: clear rejection message (${fragMsg})`)

// ── 8. layout ────────────────────────────────────────────────────────────────────────────
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok(overflow <= 0, `no horizontal overflow at 390 px (${overflow})`)
ok(errors.length === 0, 'no page errors' + (errors.length ? ' — ' + errors.slice(0, 5).join(' | ') : ''))

await browser.close()
server.close()
await rm(tmp, { recursive: true, force: true })
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
