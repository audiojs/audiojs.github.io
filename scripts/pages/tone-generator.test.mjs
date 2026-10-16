// Tests for /util/tone-generator/: the page's pure functions in node, then the page itself in a browser
// (server + ok() pattern as in the other page tests). Usage: node scripts/pages/tone-generator.test.mjs [chromium firefox webkit]
//
// Reference values:
// - 12-TET with A4 = 440 Hz (ISO 16:1975) and A4 = MIDI note 69, middle C = 60 (MIDI Tuning Standard):
//   f = 440 · 2^((n − 69)/12). Table values from B. H. Suits, "Frequencies for equal-tempered scale, A4 = 440 Hz",
//   Michigan Technological University (the live page is gone; archived copy:
//   https://web.archive.org/web/20240102172450/https://pages.mtu.edu/~suits/notefreqs.html): C4 261.63, A0 27.50, E2 82.41, C8 4186.01.
//   The MIDI Association, "The MIDI Tuning Standard": middle C = 60, A440 = 69.
// - Noise slopes are power spectral density per octave: white 0 dB, pink −3 dB (1/f), brown −6 dB (1/f²).
// - Fourier series (sine form): square = Σ odd sin(kωt)/k, sawtooth = Σ sin(kωt)/k, triangle = Σ odd (−1)^((k−1)/2) sin(kωt)/k².
// - WAV: Microsoft RIFF WAVE, canonical 44-byte header (RIFF, WAVE, 'fmt ' chunk of 16 bytes, 'data').
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, normalize, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import * as pw from 'playwright'
import { midiOf, hzOf, noteOf, parseNote, hzOfSlider, sliderOf, binaural, sweepHz, preset, coeffs, waveform, noise, loop, fileName } from './tone-generator.mjs'

let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log((cond ? '  √ ' : '  × ') + msg) }
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ── helpers: FFT, Welch PSD, slope per octave, WAV reader ──
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
}
function psd(x, size = 8192) {
  const p = new Float64Array(size / 2), re = new Float64Array(size), im = new Float64Array(size)
  let count = 0
  for (let o = 0; o + size <= x.length; o += size / 2, count++) {
    for (let i = 0; i < size; i++) { re[i] = x[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)); im[i] = 0 }
    fft(re, im)
    for (let k = 0; k < size / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k]
  }
  return p.map(v => v / count)
}
// least-squares slope of mean PSD (dB) over octave bands centred 125 Hz…8 kHz, and the worst band's distance from the line
function slope(x, fs) {
  const p = psd(x), size = p.length * 2, pts = []
  for (let j = 0; j < 7; j++) {
    const fc = 125 * 2 ** j, lo = Math.ceil(fc / Math.SQRT2 / fs * size), hi = Math.floor(fc * Math.SQRT2 / fs * size)
    let s = 0; for (let k = lo; k <= hi; k++) s += p[k]
    pts.push([j, 10 * Math.log10(s / (hi - lo + 1))])
  }
  const mx = 3, my = pts.reduce((a, [, y]) => a + y, 0) / pts.length
  const b = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / pts.reduce((a, [x]) => a + (x - mx) ** 2, 0)
  return { slope: b, dev: Math.max(...pts.map(([x, y]) => Math.abs(y - (my + b * (x - mx))))) }
}
function wav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = o => String.fromCharCode(...bytes.subarray(o, o + 4))
  const w = { riff: tag(0), riffSize: dv.getUint32(4, true), wave: tag(8), length: bytes.length }
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o), len = dv.getUint32(o + 4, true)
    if (id === 'fmt ') Object.assign(w, { fmtAt: o, fmtSize: len, format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), rate: dv.getUint32(o + 12, true), byteRate: dv.getUint32(o + 16, true), align: dv.getUint16(o + 20, true), bits: dv.getUint16(o + 22, true) })
    if (id === 'data') { w.dataAt = o + 8; w.dataSize = len; break }
    o += 8 + len + (len & 1)
  }
  const bps = w.bits / 8, frames = w.dataSize / (w.channels * bps)
  w.frames = frames
  w.ch = Array.from({ length: w.channels }, (_, c) => {
    const y = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
      const o = w.dataAt + (i * w.channels + c) * bps
      y[i] = bps === 2 ? dv.getInt16(o, true) / 32768 : ((dv.getUint8(o) | dv.getUint8(o + 1) << 8 | dv.getInt8(o + 2) << 16)) / 8388608
    }
    return y
  })
  return w
}
const peakDb = y => { let p = 0; for (const v of y) p = Math.max(p, Math.abs(v)); return 20 * Math.log10(p) }
// frequency from rising zero crossings between samples a and b (linear interpolation at each crossing)
function zcHz(y, fs, a = 0, b = y.length) {
  let first = -1, last = -1, n = 0
  for (let i = a + 1; i < b; i++) if (y[i - 1] < 0 && y[i] >= 0) { const t = i - 1 + y[i - 1] / (y[i - 1] - y[i]); if (first < 0) first = t; else n++; last = t }
  return n / ((last - first) / fs)
}

console.log('\n▶ pure functions')
// note ↔ Hz, cited reference values
ok(midiOf(440) === 69 && hzOf(69) === 440, 'A4 = 440 Hz = MIDI 69')
ok(near(hzOf(60), 261.6256, 5e-5), `C4 = ${hzOf(60).toFixed(4)} Hz (12-TET: 440 · 2^(−9/12) = 261.6256)`)
const suits = [[21, 27.50], [40, 82.41], [60, 261.63], [108, 4186.01]]
ok(suits.every(([m, f]) => hzOf(m).toFixed(2) === f.toFixed(2)), 'A0, E2, C4, C8 match the Suits table to 0.01 Hz')
ok(noteOf(261.6256).name === 'C4' && near(noteOf(261.6256).cents, 0, 0.01), 'noteOf(261.6256) = C4, 0 cents')
ok(noteOf(1000).name === 'B5' && Math.round(noteOf(1000).cents) === 21, `1000 Hz = B5 ${noteOf(1000).cents.toFixed(2)} cents (69 + 12·log2(1000/440) = 83.21)`)
ok(near(noteOf(440 * 2 ** (10 / 1200)).cents, 10, 1e-9) && near(noteOf(440 * 2 ** (-49 / 1200)).cents, -49, 1e-9), '+10 and −49 cents read back exactly')
ok(noteOf(hzOf(0)).name === 'C-1' && noteOf(27.5).name === 'A0' && noteOf(hzOf(61)).name === 'C♯4', 'C-1 (MIDI 0), A0, C♯4 names')
ok(noteOf(432, 432).name === 'A4' && hzOf(69, 432) === 432 && hzOf(60, 415) === 415 * 2 ** (-9 / 12), 'A4 reference 432 and 415 Hz follow')
ok(parseNote('A4') === 69 && parseNote('C4') === 60 && parseNote('c#3') === 49 && parseNote('D♭5') === 73 && parseNote('Bb2') === 46 && parseNote('B#3') === 60 && parseNote('C-1') === 0 && parseNote(' e 2 ') === 40, 'parseNote: A4, C4, c#3, D♭5, Bb2, B#3, C-1, " e 2 "')
ok([parseNote('H4'), parseNote(''), parseNote('4A'), parseNote('A'), parseNote('A4x')].every(Number.isNaN), 'parseNote rejects H4, "", 4A, A, A4x')
ok(Array.from({ length: 128 }, (_, m) => parseNote(noteOf(hzOf(m)).name) === m).every(Boolean), 'name → note → name round-trips for MIDI 0–127')
// slider: one cent per step from 20 Hz
ok(sliderOf(20) === 0 && hzOfSlider(0) === 20 && sliderOf(440) === 5351 && sliderOf(20000) === 11959 && hzOfSlider(11959) === 20000, 'slider: 0 = 20 Hz, 5351 = 440 Hz, 11959 = 20 kHz')
ok(near(hzOfSlider(5352) / hzOfSlider(5351), 2 ** (1 / 1200), 1e-12), 'slider step = 1 cent')
// binaural, sweep
ok(binaural(250, 10).join() === '245,255' && binaural(200, 4).join() === '198,202', 'binaural: 250 Hz ± 5 → 245 / 255 Hz')
ok(near(sweepHz(20, 20000, 10, 5), Math.sqrt(20 * 20000), 1e-9) && near(sweepHz(20, 20000, 10, 5, 'linear'), 10010, 1e-9), 'sweep midpoint: log √(20·20000) = 632.46 Hz, linear 10010 Hz')
ok(sweepHz(20, 20000, 10, -1) === 20 && near(sweepHz(20, 20000, 10, 99), 20000, 1e-9) && near(sweepHz(20, 20000, 10, 10 / 3), 200, 1e-9), 'sweep clamps to its ends; log passes 200 Hz at a third')
// additive presets
const sq = preset('square'), sw = preset('sawtooth'), tr = preset('triangle'), og = preset('organ'), sn = preset('sine')
ok(sq.amp.every((a, i) => near(a, (i + 1) % 2 ? 1 / (i + 1) : 0, 1e-12)) && sq.ph.every(p => p === 0), 'square: odd harmonics 1, 1/3, 1/5 … 1/15, even 0')
ok(sw.amp.every((a, i) => near(a, 1 / (i + 1), 1e-12)), 'sawtooth: every harmonic 1/k')
ok(tr.amp.every((a, i) => near(a, (i + 1) % 2 ? 1 / (i + 1) ** 2 : 0, 1e-12)) && tr.ph.join() === '0,0,180,0,0,0,180,0,0,0,180,0,0,0,180,0', 'triangle: odd 1/k², sign alternating (180° on 3, 7, 11, 15)')
ok(og.amp.map((a, i) => a ? i + 1 : 0).filter(Boolean).join() === '1,2,3,4,6,8,10,12,16', 'organ: harmonics 1, 2, 3, 4, 6, 8, 10, 12, 16 (nine drawbars)')
ok(sn.amp.join() === '1' + ',0'.repeat(15) && sq.amp.length === 16, 'sine: harmonic 1 only; 16 harmonics')
const c90 = coeffs([1, 0.5], [0, 90])
ok(c90.real[0] === 0 && c90.imag[0] === 0 && near(c90.imag[1], 1, 1e-7) && near(c90.real[1], 0, 1e-7) && near(c90.real[2], 0.5, 1e-7) && near(c90.imag[2], 0, 1e-7), 'coeffs: phase 0 → sine (imag), 90° → cosine (real)')
const tri = waveform(tr.amp, tr.ph, 256), ideal = Array.from({ length: 256 }, (_, i) => { const x = i / 256; return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4 })
// the series stops at harmonic 15, so the corners round off (Σ odd k ≥ 17 of 8/(π²k²) ≈ 2.5% of the peak); the shape is compared by correlation
const corr = (a, b) => { const m = x => x.reduce((s, v) => s + v, 0) / x.length, ma = m(a), mb = m(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2 } return sab / Math.sqrt(saa * sbb) }
ok(corr([...tri], ideal) > 0.9999, `triangle preset draws a triangle (correlation ${corr([...tri], ideal).toFixed(6)} with the ideal)`)
ok(near(Math.max(...waveform(sq.amp, sq.ph).map(Math.abs)), 1, 1e-6) && waveform([0, 0], [0, 0]).every(v => v === 0), 'waveform peaks at 1; all-zero stays silent')
const sawZero = waveform(sw.amp, sw.ph.map(() => 0)), sawRand = waveform(sw.amp, sw.ph.map((_, i) => (i * 97) % 360 - 180))
ok(Math.max(...sawZero.map((v, i) => Math.abs(v - sawRand[i]))) > 0.3, 'changing phases changes the drawn shape')
// noise: seeded, peak 1, slope per octave measured on 2^20 samples (21.8 s at 48 kHz)
const N = 2 ** 20
for (const [color, want] of [['white', 0], ['pink', -3], ['brown', -6]]) {
  const x = noise(color, N, 48000), s = slope(x, 48000)
  ok(near(s.slope, want, 0.2) && s.dev < 0.5, `${color} noise: ${s.slope.toFixed(2)} dB/octave 125 Hz–8 kHz (expect ${want} ± 0.2), worst band ${s.dev.toFixed(2)} dB off the line`)
}
ok(near(slope(noise('pink', N, 44100), 44100).slope, -3, 0.2), 'pink noise holds −3 dB/octave at 44.1 kHz too')
const n1 = noise('pink', 4800, 48000, 7), n2 = noise('pink', 4800, 48000, 7), n3 = noise('pink', 4800, 48000, 8)
ok(n1.every((v, i) => v === n2[i]) && n1.some((v, i) => v !== n3[i]) && Math.max(...n1.map(Math.abs)) === 1, 'noise: same seed same samples, peak exactly 1')
// loop: the end runs on into the start, at an even level
const M = 4800, src = noise('white', 48000 + M, 48000, 3), lp = loop(src, M), k = lp[10000] / src[10000]
ok(lp.length === 48000 && near(lp[0], src[48000] * k, 1e-6) && near(lp[47999], src[47999] * k, 1e-6), 'loop: last sample is followed by the next sample of the source')
const rms = (y, a, b) => { let s = 0; for (let i = a; i < b; i++) s += y[i] * y[i]; return Math.sqrt(s / (b - a)) }
ok(near(20 * Math.log10(rms(lp, 0, M) / rms(lp, M, lp.length)), 0, 0.3), `loop crossfade keeps the level (${(20 * Math.log10(rms(lp, 0, M) / rms(lp, M, lp.length))).toFixed(2)} dB)`)
// file names
const base = { mode: 'tone', wave: 'sine', hz: 440, ch: 'both', carrier: 250, beat: 10, color: 'pink', f0: 20, f1: 20000, scale: 'log' }
ok(fileName(base, 10, 'wav') === 'sine-440hz-10s.wav' && fileName({ ...base, mode: 'add', hz: 261.6256 }, 2.5, 'flac') === 'harmonics-261.63hz-2.5s.flac', 'file names: sine-440hz-10s.wav, harmonics-261.63hz-2.5s.flac')
ok(fileName({ ...base, mode: 'bin', ch: 'left' }, 600, 'mp3') === 'binaural-250hz-beat-10hz-600s.mp3' && fileName({ ...base, mode: 'noise', ch: 'right' }, 5, 'wav') === 'pink-noise-right-5s.wav' && fileName({ ...base, mode: 'sweep' }, 10, 'wav') === 'log-sweep-20-20000hz-10s.wav', 'file names: binaural, noise with channel, sweep')

// ── the page ──
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = createServer(async (req, res) => {
  let rel = normalize(req.url.split('?')[0]).replace(/^\//, '')
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const path = resolve(root, rel)
  if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end() }
  try { res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(await readFile(path)) }
  catch { res.writeHead(404); res.end('404') }
})
await new Promise(r => server.listen(0, r))
const url = `http://127.0.0.1:${server.address().port}/util/tone-generator/`
// every AudioContext the page makes, so its state can be read
const SPY = `{ const A = window.AudioContext; window.__ctx = []; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__ctx.push(this) } } }`

for (const engine of process.argv.length > 2 ? process.argv.slice(2) : ['chromium']) {
  console.log(`\n▶ ${engine}`)
  const browser = await pw[engine].launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  await context.addInitScript(SPY)
  await context.route('https://audio.js.org/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' })) // the embed is the playground's; tested there
  const page = await context.newPage(), errors = []
  page.setDefaultTimeout(60000)
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url)
  const tag = s => `${engine}: ${s}`
  const state = () => page.evaluate(() => window.__ctx[0]?.state)
  const tab = m => page.click('#t-' + m)
  const fill = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input') }
  const save = async (fmt, rate = 48000) => {
    await page.selectOption('#fmt', fmt); await page.selectOption('#rate', String(rate))
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')])
    return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile(await dl.path())) }
  }

  // layout: no horizontal scroll on any tab, phone and desktop
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h })
    const over = []
    for (const m of ['tone', 'bin', 'add', 'noise', 'sweep']) { await tab(m); const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) over.push(m + ' ' + o) }
    ok(!over.length, tag(`no horizontal overflow at ${w} px` + (over.length ? ': ' + over.join(', ') : '')))
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await tab('tone')

  // frequency entry: typing, keys, slider, note names, A4
  await fill('#hz', '1000')
  ok(await page.inputValue('#note') === 'B5' && (await page.textContent('#cents')).trim() === '+21 ¢', tag('1000 Hz reads B5 +21 ¢'))
  await page.focus('#hz'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowUp')
  ok(await page.inputValue('#hz') === '1011', tag(`↑ then Shift+↑: 1000 → 1011 Hz (${await page.inputValue('#hz')})`))
  await page.fill('#note', 'C4'); await page.press('#note', 'Enter')
  ok(await page.inputValue('#hz') === '261.63', tag(`note C4 → ${await page.inputValue('#hz')} Hz`))
  const sv = +await page.inputValue('#slider'); await page.focus('#slider'); await page.keyboard.press('ArrowRight')
  ok(await page.inputValue('#hz') === '261.78' && (await page.textContent('#cents')).trim() === '+1 ¢' && +await page.inputValue('#slider') === sv + 1, tag(`slider → moves 1 cent: 261.63 → ${await page.inputValue('#hz')} Hz`))
  await page.click('[data-nudge="oct+"]'); await page.click('[data-nudge="hz-"]')
  ok(await page.inputValue('#hz') === '522.56', tag(`×2 then −1 Hz: 261.78 → ${await page.inputValue('#hz')} Hz`))
  await fill('#a4', '432'); await fill('#hz', '432')
  ok(await page.inputValue('#note') === 'A4' && (await page.textContent('#cents')).trim() === '±0 ¢', tag('A4 = 432: 432 Hz reads A4 ±0 ¢'))
  await fill('#a4', '440'); await fill('#hz', '30000')
  ok(await page.getAttribute('#hz', 'aria-invalid') === 'true', tag('30000 Hz is flagged out of range'))
  await fill('#hz', '1000')

  // play / stop: the AudioContext runs while playing, and is suspended after
  ok(await state() === undefined, tag('no AudioContext before a gesture'))
  await page.click('#play'); await page.waitForTimeout(300)
  ok(await state() === 'running' && await page.getAttribute('#play', 'aria-pressed') === 'true', tag(`Play: context ${await state()}, button pressed`))
  const t0 = await page.evaluate(() => window.__ctx[0].currentTime); await page.waitForTimeout(300)
  ok(await page.evaluate(() => window.__ctx[0].currentTime) > t0, tag('audio clock advances while playing'))
  for (const m of ['bin', 'add', 'noise', 'sweep', 'tone']) await tab(m) // switching tabs while playing rebuilds the sound without an error
  await page.click('[data-value="square"]'); await fill('#level', -30)
  await page.click('#play'); await page.waitForTimeout(500)
  ok(await state() === 'suspended' && await page.getAttribute('#play', 'aria-pressed') === 'false' && (await page.textContent('#play')).includes('Play'), tag(`Stop: context ${await state()}`))
  await page.click('#play'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  ok(await state() === 'suspended', tag('Escape stops'))
  await page.click('[data-value="sine"]'); await fill('#level', -18)

  // save: a valid WAV of the right length, level and frequency
  await fill('#len', 2)
  let f = await save('wav16'), w = wav(f.bytes)
  ok(f.name === 'sine-1000hz-2s.wav', tag(`file name ${f.name}`))
  ok(w.riff === 'RIFF' && w.wave === 'WAVE' && w.riffSize === f.bytes.length - 8 && w.fmtAt === 12 && w.fmtSize === 16 && w.dataAt === 44, tag('WAV header: RIFF size, WAVE, fmt at 12 (16 bytes), data at 44'))
  ok(w.format === 1 && w.channels === 1 && w.rate === 48000 && w.bits === 16 && w.byteRate === 96000 && w.align === 2, tag(`WAV fmt: PCM, ${w.channels} ch, ${w.rate} Hz, ${w.bits}-bit, byte rate ${w.byteRate}, align ${w.align}`))
  ok(w.dataSize === 2 * 48000 * 2 && w.frames === 96000, tag(`2 s = ${w.frames} frames (expect 96000)`))
  ok(near(peakDb(w.ch[0]), -18, 0.05), tag(`sine peak ${peakDb(w.ch[0]).toFixed(3)} dBFS (level −18)`))
  ok(near(zcHz(w.ch[0], 48000, 4800, 91200), 1000, 0.01), tag(`frequency ${zcHz(w.ch[0], 48000, 4800, 91200).toFixed(4)} Hz (expect 1000)`))
  ok(Math.abs(w.ch[0][0]) < 1e-4 && Math.abs(w.ch[0][95999]) < 2e-3, tag('fades in from 0 and out to 0'))

  await page.click('[data-value="left"]'); await fill('#hz', '375')
  f = await save('wav24'); w = wav(f.bytes)
  ok(w.channels === 2 && w.bits === 24 && w.align === 6 && w.frames === 96000 && f.name === 'sine-375hz-left-2s.wav', tag(`left channel: stereo 24-bit, ${w.frames} frames, ${f.name}`))
  ok(near(peakDb(w.ch[0]), -18, 0.05) && w.ch[1].every(v => v === 0), tag('left has the tone, right is silent'))
  await page.click('[data-value="both"]')

  // additive: the browser's PeriodicWave against waveform(), sample for sample (375 Hz = 128 samples a cycle at 48 kHz)
  await tab('add'); await page.click('[data-preset="triangle"]')
  f = await save('wav24'); w = wav(f.bytes)
  const want = waveform(preset('triangle').amp, preset('triangle').ph, 128), g = 10 ** (-18 / 20)
  let err = 0; for (let i = 48000; i < 48000 + 128; i++) err = Math.max(err, Math.abs(w.ch[0][i] / g - want[i % 128]))
  ok(err < 0.005, tag(`additive triangle matches waveform() within ${err.toFixed(4)} of full scale`))
  // a bar dragged to the top: harmonic 2 becomes full scale
  await page.locator('#bars').scrollIntoViewIfNeeded()
  const box = await page.locator('#bars').boundingBox()
  await page.mouse.move(box.x + box.width * 1.5 / 16, box.y + box.height - 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 1.5 / 16, box.y + 1); await page.mouse.up()
  ok(+(await page.getAttribute('#bars .harm:nth-child(2)', 'aria-valuenow')) >= 0.99, tag('dragging bar 2 up sets harmonic 2 to 1'))
  await page.focus('#bars .harm:nth-child(2)'); await page.keyboard.press('End'); await page.keyboard.press('ArrowDown')
  ok(+(await page.getAttribute('#bars .harm:nth-child(2)', 'aria-valuenow')) === 0.95, tag('End then ↓ on a bar: 1 → 0.95'))
  await page.click('[data-value="ph"]'); await page.click('#phRand')
  ok(await page.evaluate(() => [...document.querySelectorAll('#bars .harm')].some(b => b.getAttribute('aria-valuenow') !== '0' && b.getAttribute('aria-valuetext').includes('phase'))), tag('Random phases sets phases'))
  await page.click('[data-value="amp"]')

  // binaural: 245 Hz left, 255 Hz right
  await tab('bin'); await fill('#carrier', 250); await fill('#beat', 10)
  ok((await page.textContent('#binLR')).includes('245') && (await page.textContent('#binLR')).includes('255'), tag('binaural readout: left 245, right 255'))
  f = await save('wav16'); w = wav(f.bytes)
  ok(w.channels === 2 && f.name === 'binaural-250hz-beat-10hz-2s.wav', tag(`binaural file: ${w.channels} ch, ${f.name}`))
  ok(near(zcHz(w.ch[0], 48000, 4800, 91200), 245, 0.01) && near(zcHz(w.ch[1], 48000, 4800, 91200), 255, 0.01), tag(`binaural: left ${zcHz(w.ch[0], 48000, 4800, 91200).toFixed(3)} Hz, right ${zcHz(w.ch[1], 48000, 4800, 91200).toFixed(3)} Hz`))
  await page.click('#check'); await page.waitForTimeout(350)
  const l1 = await page.evaluate(() => [document.getElementById('earL').className, document.getElementById('earR').className])
  await page.waitForTimeout(800)
  const l2 = await page.evaluate(() => [document.getElementById('earL').className, document.getElementById('earR').className])
  ok(l1.join() === 'on,' && l2.join() === ',on', tag(`stereo check lights left, then right (${l1} → ${l2})`))
  await page.waitForTimeout(800)

  // noise: the saved pink noise measured on a 10 s render
  await tab('noise'); await fill('#len', 10)
  f = await save('wav24'); w = wav(f.bytes)
  const ns = slope(w.ch[0], 48000)
  ok(w.frames === 480000 && f.name === 'pink-noise-10s.wav' && near(ns.slope, -3, 0.25), tag(`saved pink noise: ${ns.slope.toFixed(2)} dB/octave over 10 s (${f.name})`))
  ok(near(peakDb(w.ch[0]), -18, 0.05), tag(`noise peak ${peakDb(w.ch[0]).toFixed(3)} dBFS`))
  await page.click('[data-value="brown"]'); await fill('#len', 2)
  f = await save('flac')
  ok(String.fromCharCode(...f.bytes.subarray(0, 4)) === 'fLaC' && f.name === 'brown-noise-2s.flac', tag(`FLAC: magic fLaC, ${f.name}, ${f.bytes.length} bytes`))

  // sweep: file length is the sweep's, frequency follows the log law; live playback stops by itself
  await tab('sweep'); await fill('#f0', 100); await fill('#f1', 1600); await fill('#dur', 2)
  f = await save('wav16'); w = wav(f.bytes)
  ok(w.frames === 96000 && f.name === 'log-sweep-100-1600hz-2s.wav', tag(`sweep file: ${w.frames} frames, ${f.name}`))
  const mid = zcHz(w.ch[0], 48000, 48000 - 2400, 48000 + 2400)
  ok(near(mid, 400, 400 * 0.02), tag(`log sweep at 1 s: ${mid.toFixed(1)} Hz (expect 400 = √(100·1600))`))
  await page.click('[data-value="linear"]')
  f = await save('mp3'); const mp3 = f.bytes
  ok(f.name === 'linear-sweep-100-1600hz-2s.mp3' && (String.fromCharCode(...mp3.subarray(0, 3)) === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)), tag(`MP3: ${f.name}, frame sync or ID3 at the start`))
  await fill('#dur', 1); await page.click('#play'); await page.waitForTimeout(500)
  const during = await page.textContent('#sweepBig')
  await page.waitForTimeout(1200)
  ok(await page.getAttribute('#play', 'aria-pressed') === 'false' && await state() === 'suspended', tag(`a 1 s sweep stops by itself (read ${during.trim()} mid-way)`))

  // keyboard tabs
  await page.focus('#t-sweep'); await page.keyboard.press('ArrowRight')
  ok(await page.getAttribute('#t-tone', 'aria-selected') === 'true' && await page.evaluate(() => document.activeElement.id) === 't-tone', tag('→ on the last tab wraps to the first'))

  ok(errors.length === 0, tag('no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '')))
  await browser.close()
}
server.close()
console.log(`\n# pass ${pass}  fail ${fail}`)
process.exit(fail ? 1 : 0)
