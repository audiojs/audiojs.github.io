// Audio latency test. Round trip: ten chirps play through the speaker; one AudioContext records what it sends out and
// what the microphone hears side by side in an AudioWorklet (one sample clock), and the cross-correlation peak between
// them is the delay. Tap test: clicks on the audio clock, taps timed against the moment each click left the page.
// The DSP below is exported for scripts/pages/latency.test.mjs and written into the page by its source text, so the
// page runs exactly what the test checks.
import { src } from '../page-helpers.mjs'

const CHIRP = src('@audio/synth-chirp', '1.1.3')

// a linear sweep 500 Hz → 10 kHz of 100 ms, played at the times in `at` (s): 0.81 to 0.97 s apart, unevenly and off any
// round number, so a sound that repeats on its own cannot line up with every chirp. Delays up to `max` s are searched.
export const SWEEP = { f0: 500, f1: 10000, duration: 0.1, max: 0.6, at: [0, 0.9731, 1.8017, 2.7139, 3.5693, 4.5127, 5.3211, 6.2089, 7.1633, 8.0017] }
// twenty clicks at 100 BPM; taps on the first four (the count-in) are not counted
export const BEAT = { count: 20, countIn: 4, period: 0.6 }

// In-place radix-2 complex FFT; `inverse` flips the exponent's sign and does not scale (only ratios are read here).
export function fft(re, im, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, ang = (inverse ? 2 : -2) * Math.PI / len
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
      for (let a = k; a < n; a += len) {
        const b = a + half, tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
      }
    }
  }
}

// Where `ref` sits inside `rec`, in samples, between lags `from` and `to`: the peak of the envelope of the analytic
// cross-correlation (so the speaker's polarity and phase do not move it), placed between samples by a parabola through
// its top three points. `ratio` is that peak over the highest one more than `guard` samples away: how clearly one
// arrival stands out from noise and echoes. `env` is the envelope from `from` on.
export function locate(rec, ref, { from = 0, to = rec.length - 1, guard = 48 } = {}) {
  let n = 2
  while (n < rec.length + ref.length) n *= 2
  const xr = new Float64Array(n), xi = new Float64Array(n), yr = new Float64Array(n), yi = new Float64Array(n)
  xr.set(rec); yr.set(ref)
  fft(xr, xi); fft(yr, yi)
  // rec · conj(ref), negative frequencies dropped and positive ones doubled: its inverse is the analytic correlation
  for (let k = 0, h = n / 2; k < n; k++) {
    const w = k === 0 || k === h ? 1 : k < h ? 2 : 0, r = xr[k] * yr[k] + xi[k] * yi[k], i = xi[k] * yr[k] - xr[k] * yi[k]
    xr[k] = r * w; xi[k] = i * w
  }
  fft(xr, xi, true)
  from = Math.max(from, 1 - ref.length); to = Math.min(to, rec.length - 1)
  const at = l => Math.hypot(xr[(l + n) % n], xi[(l + n) % n]), env = new Float32Array(to - from + 1)
  let top = from, peak = 0, next = 0
  for (let l = from; l <= to; l++) { const v = env[l - from] = at(l); if (v > peak) { peak = v; top = l } }
  for (let l = from; l <= to; l++) if (Math.abs(l - top) > guard && env[l - from] > next) next = env[l - from]
  if (!peak) return { lag: NaN, ratio: 0, env, from }
  const a = at(top - 1), b = at(top), c = at(top + 1), d = a - 2 * b + c
  return { lag: top + (d < 0 ? (a - c) / (2 * d) : 0), ratio: next ? peak / next : Infinity, env, from }
}

// p-quantile of a list, linear between ranks
export function quantile(xs, p) {
  const s = Float64Array.from(xs).sort(), i = (s.length - 1) * p, lo = Math.floor(i)
  return s.length ? s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) : NaN
}

// One round-trip run. `out` is what the page sent to the speaker, `mic` what the microphone heard, sample-aligned.
// Each chirp is found in `out` (it starts after `gap` s of silence), then up to `max` s later in `mic`; the difference
// is that chirp's round trip. Chirps within ±2 ms of the median agree. Agreement is the proof of a loopback, since
// noise lands anywhere; the peak ratio is the echo check. `quality`: 'none' when fewer than 60 % agree, or when their
// peak does not stand out at all (ratio under 1.1: a sound repeating as often as every few ms agrees with itself),
// 'weak' when an echo or noise comes close to the direct sound (ratio under 1.4), 'clear' otherwise.
export function roundTrip(out, mic, ref, fs, { max = 0.6, gap = 0.1 } = {}) {
  const guard = Math.round(fs / 1000), pad = 64, span = Math.round(max * fs), lags = [], ratios = [], curve = new Float64Array(span + 1)
  for (let i = 0, quiet = Infinity; i < out.length; i++) {
    if (Math.abs(out[i]) < 1e-6) { quiet++; continue }
    if (quiet >= gap * fs && i + ref.length <= out.length) {
      const a = Math.max(0, i - pad), o = locate(out.subarray(a, i + ref.length + pad), ref, { to: 2 * pad, guard })
      const m = locate(mic.subarray(a, Math.min(mic.length, i + ref.length + pad + span)), ref, { from: Math.floor(o.lag), to: Math.floor(o.lag) + span, guard })
      lags.push((m.lag - o.lag) / fs * 1000); ratios.push(m.ratio)
      for (let k = 0; k < m.env.length && k <= span; k++) curve[k] += m.env[k]
    }
    quiet = 0
  }
  const mid = quantile(lags, 0.5), near = lags.map((x, i) => i).filter(i => Math.abs(lags[i] - mid) <= 2), hit = near.map(i => lags[i])
  const peak = quantile(near.map(i => ratios[i]), 0.5)
  const quality = !lags.length || near.length < Math.max(3, 0.6 * lags.length) || !(peak >= 1.1) ? 'none' : peak < 1.4 ? 'weak' : 'clear'
  return {
    quality, count: lags.length, agree: quality === 'none' ? 0 : near.length, lags, ratios,
    delay: quality === 'none' ? NaN : quantile(hit, 0.5), spread: quality === 'none' ? NaN : Math.max(...hit) - Math.min(...hit),
    ratio: quantile(quality === 'none' ? ratios : near.map(i => ratios[i]), 0.5), curve,
  }
}

// Offsets of taps from the clicks they answer, in ms. Clicks fall every `beat` ms from `first`; a tap answers the next
// click when it comes up to `early` ms ahead of it, else the one before, so offsets lie in [-early, beat - early).
// Only clicks `from` … `to - 1` count, and only the first tap on each.
export function tapOffsets(taps, first, beat, { from = 0, to = Infinity, early = 150 } = {}) {
  const seen = new Set(), out = []
  for (const t of taps) {
    const j = Math.floor((t - first + early) / beat)
    if (!(j >= from && j < to) || seen.has(j)) continue
    seen.add(j); out.push(t - first - j * beat)
  }
  return out
}

// The recorder, run in the AudioWorklet from its source text. Its one input has two channels, merged in front of it:
// 0 is what the page sends to the speaker, 1 the microphone. Frames go to the page 4096 at a time.
export function recorder() {
  registerProcessor('latency-rec', class extends AudioWorkletProcessor {
    constructor() {
      super()
      this.n = 0; this.a = new Float32Array(4096); this.b = new Float32Array(4096); this.on = true
      this.port.onmessage = () => { this.post(true); this.on = false }
    }
    post(last) {
      this.port.postMessage([this.a.slice(0, this.n), this.b.slice(0, this.n), last])
      this.n = 0
    }
    process([input]) {
      if (!this.on) return false
      const x = input[0], y = input[1], m = x ? x.length : 128
      for (let i = 0; i < m; i++) {
        this.a[this.n] = x ? x[i] : 0; this.b[this.n] = y ? y[i] : 0
        if (++this.n === 4096) this.post(false)
      }
      return true
    }
  })
}

export default {
  slug: 'latency', order: 115,
  name: 'Audio latency test', short: 'Round-trip delay from speaker to microphone, and the Bluetooth delay you hear',
  title: 'Audio latency test: measure your speaker-to-mic and Bluetooth delay in the browser',
  description: 'Measure round-trip audio latency from your speakers to your microphone, and the delay of Bluetooth headphones with a tap test, next to what the browser reports. Runs in your browser; nothing is uploaded.',
  lead: 'Measure the delay from your speakers to your microphone, and the delay you hear through Bluetooth headphones, beside what the browser reports.',
  powered: ['@audio/synth-chirp'], repo: 'https://github.com/audiojs/audiojs.github.io/blob/main/scripts/pages/latency.mjs',
  body: `
    <style>
      .lt h2 { font-weight: 800; font-size: var(--fs-md); letter-spacing: -.01em; }
      .lt .sub { font-size: var(--fs-sm); line-height: 1.45; max-width: 34em; margin-left: auto; margin-right: auto; }
      .lt .lvl { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-sm); }
      .lt + .lt, .panel + .lt { margin-top: 24px; }
      .pad { display: grid; place-items: center; width: 100%; max-width: 420px; height: 128px; margin: 20px auto 0; padding: 0 16px; border: 2px solid var(--c-rule); border-radius: 8px; background: #fff; color: var(--c-mute); font: inherit; font-size: var(--fs-sm); font-weight: 700; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; transition: background .08s, border-color .15s; }
      .pad:not(:disabled) { border-color: var(--c-accent); color: var(--c-ink); cursor: pointer; }
      .pad.hit { background: #e6ede9; }
      .pad:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 3px; }
      .brh { font-weight: 700; font-size: var(--fs-sm); }
      #rtReport, #tpReport, #brReport { align-items: start; }
      #tpRuns { list-style: none; margin: 0; padding: 0; font-size: var(--fs-sm); font-weight: 500; line-height: 1.6; font-variant-numeric: tabular-nums; }
      .seo ol.refs { margin: 10px 0 0; padding-left: 1.4em; font-size: var(--fs-xs); line-height: 1.55; color: var(--c-mute); }
      .seo ol.refs li { margin-top: 4px; }
      .seo sup { font-size: .7em; line-height: 0; }
      @media (prefers-reduced-motion: reduce) { .pad { transition: none; } }
    </style>
    <section class="live lt" aria-labelledby="rtH">
      <h2 id="rtH">Round trip: speaker to microphone</h2>
      <div class="sub" id="rtMsg" role="status" aria-live="polite">Unplug headphones and turn the volume up, so the microphone hears the speaker. Ten short chirps play at the level below, about 10 seconds in all.</div>
      <div class="meter" style="max-width:420px" aria-hidden="true"><i id="rtPeak" style="left:0"></i></div>
      <div class="actions">
        <button class="btn" id="rtStart" type="button">Start round-trip test</button>
        <label class="lvl">Level <select id="rtLevel"><option value="0.063">-24 dBFS</option><option value="0.125">-18 dBFS</option><option value="0.25" selected>-12 dBFS</option><option value="0.5">-6 dBFS</option></select></label>
      </div>
    </section>
    <section class="panel" id="rtPanel" hidden aria-label="Round-trip result">
      <div class="row report" id="rtReport"></div>
      <div class="row viz" id="rtViz"></div>
    </section>
    <section class="live lt" aria-labelledby="tpH">
      <h2 id="tpH">Tap test: the delay you hear</h2>
      <div class="sub" id="tpMsg" role="status" aria-live="polite">Put on the headphones you want to test, volume low at first. Twenty clicks play at 100 BPM: count four, then tap along with the rest.</div>
      <button class="pad" id="pad" type="button" disabled>Tap here, or press Space</button>
      <div class="actions">
        <button class="btn" id="tpStart" type="button">Start tap test</button>
        <label class="lvl">Level <select id="tpLevel"><option value="0.063">-24 dBFS</option><option value="0.125">-18 dBFS</option><option value="0.25" selected>-12 dBFS</option><option value="0.5">-6 dBFS</option></select></label>
      </div>
    </section>
    <section class="panel" id="tpPanel" hidden aria-label="Tap test result">
      <div class="row report" id="tpReport"></div>
      <div class="row"><ol id="tpRuns"></ol></div>
    </section>
    <section class="panel" id="brPanel" hidden aria-labelledby="brH">
      <div class="row"><h2 class="brh" id="brH">What the browser reports</h2></div>
      <div class="row report" id="brReport"></div>
    </section>`,
  script: `
    const SWEEP = ${JSON.stringify(SWEEP)}, BEAT = ${JSON.stringify(BEAT)}
    ${fft}
    ${locate}
    ${quantile}
    ${roundTrip}
    ${tapOffsets}
    ${recorder}
    const chirpLib = import('${CHIRP}').then(m => m.default)
    const rtStart = $('rtStart'), rtMsg = $('rtMsg'), rtPeak = $('rtPeak'), rtLevel = $('rtLevel'), rtPanel = $('rtPanel'), rtReport = $('rtReport'), rtViz = $('rtViz')
    const tpStart = $('tpStart'), tpMsg = $('tpMsg'), tpLevel = $('tpLevel'), tpPanel = $('tpPanel'), tpReport = $('tpReport'), tpRuns = $('tpRuns'), pad = $('pad')
    const brPanel = $('brPanel'), brH = $('brH'), brReport = $('brReport')
    const runs = []
    const num = x => typeof x === 'number' && isFinite(x)
    const ms = (s, d = 1) => (s * 1000).toFixed(d) + '<small>ms</small>'
    const row = (k, v, note, cls) => el('div', {}, el('div', { class: 'k' }, k), el('div', { class: 'v' + (cls ? ' ' + cls : ''), html: v }), ...(note ? [el('div', { class: 'note' }, note)] : []))
    // wait for the audio clock to reach t; give up if it stalls (no output device)
    const until = (ctx, t, stop) => new Promise((res, rej) => { const by = performance.now() + (t - ctx.currentTime + 5) * 1000; const f = () => stop() || ctx.currentTime >= t ? res() : performance.now() > by ? rej(Error('the audio clock stopped')) : setTimeout(f, 50); f() })

    // ── what the browser says about the path ──
    async function outName(ctx) {
      try {
        const id = typeof ctx.sinkId === 'string' && ctx.sinkId ? ctx.sinkId : 'default'
        const d = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind === 'audiooutput' && d.deviceId === id && d.label)
        return d ? d.label.replace(/^Default - /, '') : ''
      } catch { return '' }
    }
    function inLatency(track) {
      const s = track && track.stats, l = track && track.getSettings && track.getSettings().latency
      return s && num(s.averageLatency) && s.averageLatency > 0 ? s.averageLatency / 1000 : num(l) ? l : undefined
    }
    // the browser's own sum for this path: base + output (+ input when there is a microphone)
    function figures(ctx, track) {
      const parts = [['base', ctx.baseLatency], ['output', ctx.outputLatency], ...(track ? [['input', inLatency(track)]] : [])].filter(([, v]) => num(v))
      return { sum: parts.reduce((s, [, v]) => s + v, 0), text: parts.map(([k, v]) => k + ' ' + (v * 1000).toFixed(1)).join(' + ') + ' ms', parts }
    }
    async function browserReport(ctx, track, what) {
      const rows = [
        row('Sample rate', (ctx.sampleRate / 1000) + '<small>kHz</small>'),
        row('Base latency', num(ctx.baseLatency) ? ms(ctx.baseLatency) : 'not reported', 'AudioContext.baseLatency: from the end of the audio graph into the system\\'s audio stack.'),
        row('Output latency', num(ctx.outputLatency) ? ms(ctx.outputLatency) : 'not reported', 'AudioContext.outputLatency: from the system\\'s audio stack to the output device. 0 can mean not measured.'),
      ]
      if (track) {
        const l = inLatency(track), s = track.getSettings ? track.getSettings() : {}
        const on = [['echoCancellation', 'echo cancellation'], ['noiseSuppression', 'noise suppression'], ['autoGainControl', 'auto gain']].filter(([k]) => s[k] !== undefined && s[k] !== false).map(([, n]) => n)
        rows.push(
          row('Input latency', num(l) ? ms(l) : 'not reported', 'From the microphone to the page, as the track reports it (Chrome 125+).'),
          row('Mic processing', on.length ? on.join(', ') + ' on' : 'off', on.length ? 'The browser kept this on although the page asked for it off; the result may be off too.' : 'Echo cancellation, noise suppression and auto gain, all off as asked.', on.length ? 'warn list' : 'ok list'),
          row('Microphone', track.label || 'unnamed', '', 'list'))
      }
      rows.push(row('Output', (await outName(ctx)) || 'system default', '', 'list'))
      brH.textContent = 'What the browser reports, ' + what
      brReport.replaceChildren(...rows); brPanel.hidden = false
    }

    // ── round trip ──
    let rtStop = null
    rtStart.addEventListener('click', async () => {
      if (rtStop) return rtStop('Stopped.')
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      let stream = null, done = false, timer = 0
      const finish = msg => {
        if (done) return; done = true; clearInterval(timer)
        if (stream) stream.getTracks().forEach(t => t.stop())
        ctx.close(); rtStop = null; rtStart.textContent = 'Start round-trip test'; tpStart.disabled = false; rtPeak.style.left = '0'; rtPeak.classList.remove('ok')
        if (msg) rtMsg.textContent = msg
      }
      rtStop = finish; rtStart.textContent = 'Stop'; tpStart.disabled = true; rtPanel.hidden = true
      try {
        rtMsg.textContent = 'Asking for the microphone…'
        // the browser's echo canceller exists to remove the speaker's sound from the microphone: the very signal measured here
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        if (done) return
        await ctx.resume()
        const track = stream.getAudioTracks()[0], fs = ctx.sampleRate
        const url = URL.createObjectURL(new Blob(['(' + recorder + ')()'], { type: 'text/javascript' }))
        await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url)
        const ref = (await chirpLib)({ f0: SWEEP.f0, f1: SWEEP.f1, duration: SWEEP.duration, fs, method: 'lin', amp: 1 })
        if (done) return
        let input
        try { input = ctx.createMediaStreamSource(stream) } catch (e) { throw Error('this browser cannot connect the microphone at ' + fs + ' Hz (' + e.message + ')') }
        const level = ctx.createGain(), merge = ctx.createChannelMerger(2)
        const rec = new AudioWorkletNode(ctx, 'latency-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' })
        level.gain.value = +rtLevel.value
        level.connect(ctx.destination); level.connect(merge, 0, 0); input.connect(merge, 0, 1); merge.connect(rec); rec.connect(ctx.destination)
        const outs = [], mics = []
        let last
        const flushed = new Promise(r => last = r)
        rec.port.onmessage = ({ data: [a, b, end] }) => {
          outs.push(a); mics.push(b)
          let p = 0; for (const x of b) p = Math.max(p, Math.abs(x))
          rtPeak.style.left = Math.min(100, p * 100) + '%'; rtPeak.classList.toggle('ok', p > 0.02 && p < 0.9)
          if (end) last()
        }
        const buf = ctx.createBuffer(1, ref.length, fs); buf.getChannelData(0).set(ref)
        const t0 = ctx.currentTime + 0.4
        for (const at of SWEEP.at) { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(level); s.start(t0 + at) }
        timer = setInterval(() => { const k = SWEEP.at.filter(at => at <= ctx.currentTime - t0).length; rtMsg.textContent = k ? 'Chirp ' + k + ' of ' + SWEEP.at.length + '…' : 'Listening to the room…' }, 100)
        await until(ctx, t0 + SWEEP.at[SWEEP.at.length - 1] + SWEEP.duration + SWEEP.max + 0.1, () => done)
        if (done) return
        clearInterval(timer); rec.port.postMessage('stop')
        await Promise.race([flushed, new Promise((_, no) => setTimeout(() => no(Error('the recorder stopped answering')), 3000))])
        rtMsg.textContent = 'Computing…'
        await new Promise(r => setTimeout(r, 30))
        const join = parts => { const x = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { x.set(p, o); o += p.length } return x }
        const out = join(outs), mic = join(mics)
        let pk = 0; for (const x of mic) pk = Math.max(pk, Math.abs(x))
        const r = roundTrip(out, mic, ref, fs, { max: SWEEP.max }), f = figures(ctx, track)
        rtReport.replaceChildren(
          row('Round trip', r.quality === 'none' ? '–' : r.delay.toFixed(1) + '<small>ms</small>', r.quality === 'none' ? 'No one delay stands out across the chirps.' : 'Median of the ' + r.agree + ' of ' + r.count + ' chirps that agree within 2 ms.', r.quality === 'clear' ? 'ok' : r.quality === 'weak' ? 'warn' : ''),
          row('Spread', r.quality === 'none' ? '–' : r.spread.toFixed(2) + '<small>ms</small>', 'Largest minus smallest of those chirps.'),
          row('Peak ratio', num(r.ratio) ? r.ratio.toFixed(1) + '<small>×</small>' : '–', 'Correlation peak over the next-highest one more than 1 ms away, usually an echo. Near 1×, an echo or noise rivals the direct sound.', r.ratio >= 1.4 ? '' : 'warn'),
          row('Browser\\'s figures', f.parts.length ? (f.sum * 1000).toFixed(1) + '<small>ms</small>' : 'not reported', f.parts.length ? f.text + ', as reported. The air and any unreported delay are not in it.' : ''))
        rtViz.replaceChildren(plot(r, fs)); rtPanel.hidden = false
        await browserReport(ctx, track, 'round trip')
        finish(!r.count ? 'The page could not record its own output, so there is nothing to compare. Try another browser.'
          : pk < 1e-4 ? 'The microphone delivered silence: check that it is not muted and that the right input is selected.'
          : r.quality === 'clear' ? 'Done: ' + r.agree + ' of ' + r.count + ' chirps agree.'
          : r.quality === 'weak' ? 'Weak loopback: an echo or noise is nearly as strong as the direct sound, so the delay may belong to an echo. Point the speaker at the microphone or bring them closer, and run it again.'
          : 'No loopback: the microphone did not hear the chirps. Unplug headphones so the sound comes from the speakers, turn the volume up, and check the input device.')
      } catch (e) {
        finish(e && e.name === 'NotAllowedError' ? 'The round trip needs the microphone. The tap test below works without it.' : 'The test stopped: ' + (e && e.message || e))
      }
    })

    // the averaged correlation envelope over the delays searched, with the median marked
    function plot(r, fs) {
      const W = innerWidth < 600 ? 700 : 1200, H = 240, c = el('canvas'), g = c.getContext('2d') // narrower on phones, so it scales up
      c.width = W; c.height = H; c.setAttribute('role', 'img')
      c.setAttribute('aria-label', r.quality === 'none' ? 'Correlation envelope with no peak standing out' : 'Correlation envelope peaking at ' + r.delay.toFixed(1) + ' ms')
      const span = r.quality === 'none' ? SWEEP.max * 1000 : Math.min(SWEEP.max * 1000, [10, 20, 50, 100, 200, 300, 600].find(v => v >= r.delay * 1.6) || 600)
      const n = Math.min(r.curve.length, Math.round(span / 1000 * fs) + 1)
      let top = 0; for (let i = 0; i < n; i++) top = Math.max(top, r.curve[i])
      const x = t => 8 + (W - 16) * t / span, y = v => H - 30 - (H - 48) * v
      g.fillStyle = '#0d1014'; g.fillRect(0, 0, W, H)
      g.strokeStyle = 'rgba(237,235,228,.25)'; g.fillStyle = 'rgba(237,235,228,.8)'; g.font = '600 20px Manrope, sans-serif'; g.lineWidth = 1
      const step = span / 5
      for (let t = 0; t <= span + 1e-9; t += step) { g.beginPath(); g.moveTo(x(t), 10); g.lineTo(x(t), H - 30); g.stroke(); g.fillText(+t.toFixed(1) + ' ms', Math.min(x(t) + 6, W - 84), H - 6) }
      g.strokeStyle = '#00a4b8'; g.lineWidth = 2; g.beginPath()
      for (let px = 0; px < W - 16; px++) {
        const i0 = Math.floor(px / (W - 16) * (n - 1)), i1 = Math.max(i0 + 1, Math.floor((px + 1) / (W - 16) * (n - 1)))
        let v = 0; for (let i = i0; i < i1 && i < n; i++) v = Math.max(v, r.curve[i])
        px ? g.lineTo(8 + px, y(top ? v / top : 0)) : g.moveTo(8, y(top ? v / top : 0))
      }
      g.stroke()
      if (r.quality !== 'none') {
        g.strokeStyle = '#edebe4'; g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x(r.delay), 10); g.lineTo(x(r.delay), H - 30); g.stroke(); g.setLineDash([])
        g.fillStyle = '#edebe4'; g.fillText(r.delay.toFixed(1) + ' ms', Math.min(x(r.delay) + 8, W - 100), 30)
      }
      return c
    }

    // ── tap test ──
    let tpStop = null
    tpStart.addEventListener('click', async () => {
      if (tpStop) return tpStop('Stopped.')
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      const taps = [], clock = []
      let done = false, frame = 0, poll = 0, t0 = Infinity
      // the audio clock against performance.now(): the smallest gap seen is the moment the graph rendered (a low quantile, against stray bursts)
      const sample = () => { if (ctx.currentTime > t0 - 0.3) clock.push(performance.now() - ctx.currentTime * 1000) }
      const hit = e => { taps.push(e.timeStamp); sample(); pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 90); tpMsg.textContent = taps.length + (taps.length === 1 ? ' tap' : ' taps') }
      const key = e => { if (e.code !== 'Space' && e.key !== ' ') return; e.preventDefault(); if (e.type === 'keydown' && !e.repeat) hit(e) }
      const finish = msg => {
        if (done) return; done = true
        cancelAnimationFrame(frame); clearInterval(poll)
        document.removeEventListener('keydown', key); document.removeEventListener('keyup', key); pad.removeEventListener('pointerdown', hit)
        ctx.close(); tpStop = null; pad.disabled = true; tpStart.textContent = 'Start tap test'; rtStart.disabled = false
        if (msg) tpMsg.textContent = msg
      }
      tpStop = finish; tpStart.textContent = 'Stop'; rtStart.disabled = true
      try {
        await ctx.resume()
        const fs = ctx.sampleRate, len = Math.round(0.03 * fs), click = ctx.createBuffer(1, len, fs), d = click.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = Math.sin(2 * Math.PI * 1500 * i / fs) * Math.exp(-i / (0.004 * fs))
        const level = ctx.createGain(); level.gain.value = +tpLevel.value; level.connect(ctx.destination)
        t0 = ctx.currentTime + 0.8
        for (let j = 0; j < BEAT.count; j++) { const s = ctx.createBufferSource(); s.buffer = click; s.connect(level); s.start(t0 + j * BEAT.period) }
        const loop = () => { sample(); frame = requestAnimationFrame(loop) }
        loop(); poll = setInterval(sample, 4)
        document.addEventListener('keydown', key); document.addEventListener('keyup', key); pad.addEventListener('pointerdown', hit)
        pad.disabled = false; pad.focus()
        tpMsg.textContent = 'Count four clicks, then tap along with the rest.'
        await until(ctx, t0 + BEAT.count * BEAT.period + 0.2, () => done)
        if (done) return
        const first = t0 * 1000 + quantile(clock, 0.02)
        const offs = tapOffsets(taps, first, BEAT.period * 1000, { from: BEAT.countIn, to: BEAT.count })
        const want = BEAT.count - BEAT.countIn
        if (offs.length < want / 2) return finish('Only ' + offs.length + ' of ' + want + ' taps landed near a click. Tap once per click from the fifth one, and try again.')
        const med = quantile(offs, 0.5), half = (quantile(offs, 0.75) - quantile(offs, 0.25)) / 2, f = figures(ctx, null), name = await outName(ctx)
        runs.push({ med, half, name })
        tpReport.replaceChildren(
          row('Delay you hear', med.toFixed(0) + '<small>ms</small>', 'Median of ' + offs.length + ' of ' + want + ' taps, from the moment the page sent each click to your tap. It includes your own timing.'),
          row('Spread', '±' + half.toFixed(0) + '<small>ms</small>', 'Half the range of your middle half of taps.', half > 50 ? 'warn' : ''),
          row('Browser\\'s figures', f.parts.length ? (f.sum * 1000).toFixed(1) + '<small>ms</small>' : 'not reported', f.parts.length ? f.text + ', as reported for this output.' : ''))
        tpRuns.replaceChildren(...runs.map((r, i) => el('li', {}, 'Run ' + (i + 1) + ' · ' + (r.name || 'default output') + ': ' + r.med.toFixed(0) + ' ms ±' + r.half.toFixed(0) + (i ? ' · ' + (r.med >= runs[0].med ? '+' : '−') + Math.abs(r.med - runs[0].med).toFixed(0) + ' ms against run 1' : ''))))
        tpPanel.hidden = false
        await browserReport(ctx, null, 'tap test')
        finish(half > 50 ? 'Your taps scatter by ±' + half.toFixed(0) + ' ms, so this median is rough. Run it again and tap with each click you hear.'
          : runs.length === 1 ? 'Done. Switch to another output (wired, speaker, Bluetooth) and run it again: the difference between runs is what the output adds.' : 'Done: run ' + runs.length + ' is ' + Math.abs(med - runs[0].med).toFixed(0) + ' ms ' + (med >= runs[0].med ? 'later' : 'earlier') + ' than run 1.')
      } catch (e) {
        finish('The test stopped: ' + (e && e.message || e))
      }
    })`,
  faq: [
    ['What is round-trip latency?', 'The time from the moment a page sends a sound until the microphone brings it back: the output buffers, the converter, the speaker, the air, the microphone and the input buffers. A recording app shifts each new take by this much to line it up with the backing track.'],
    ['Why does the test say no loopback?', 'The microphone did not hear the chirps. Usually headphones are plugged in, so no sound reaches the room; or the volume is too low; or the browser is using a different microphone than you think. A processing step in the operating system or a headset that removes the speaker\'s sound has the same effect.'],
    ['How do I measure my Bluetooth headphones\' delay?', 'Run the tap test twice: once on wired headphones or the built-in speaker, once on the Bluetooth headphones. The difference between the two runs is what Bluetooth adds; your own timing cancels for the most part. For the round trip, hold the computer\'s microphone against an ear cup at a high volume, and keep the computer\'s microphone selected rather than the headset\'s.'],
    ['Why are echo cancellation, noise suppression and auto gain turned off?', 'Echo cancellation exists to remove the sound being played from what the microphone records, which is exactly the signal this test listens for. Noise suppression and automatic gain change the signal as well. The page asks for all three off and reports back if the browser kept one on.'],
    ['Why is the browser\'s figure different from the measured one?', 'The browser adds up only the buffers it knows about: AudioContext.baseLatency, outputLatency and, in Chrome 125 and later, the microphone\'s input latency. The measured round trip also holds the air (about 2.9 ms per metre) and any delay the operating system or the device does not report. Safari reports outputLatency only since version 18.4.'],
    ['Is my microphone recorded or uploaded?', 'The recording lives in the tab\'s memory for the few seconds the analysis takes and is then dropped. Nothing is stored or sent.'],
  ],
  seo: `
      <h2>Two delays, measured two ways</h2>
      <p><strong>Round-trip latency</strong> is the time from the moment a page sends a sound until the microphone brings it back: the output buffers, the converter, the speaker, the air, the microphone and the input buffers. A recording app has to shift each new take by this much to line it up with the backing track. <strong>Output delay</strong> is the part you hear, from the page to your ears. Bluetooth headphones add to it, and a microphone often cannot hear headphones, so the tap test measures it with your ears instead.</p>
      <h3>How the round trip is measured</h3>
      <p>The page plays ten chirps, each a 100 ms sweep from 500 Hz to 10 kHz made with <code>@audio/synth-chirp</code>, 0.81 to 0.97 s apart. One AudioContext records what it sends to the speaker and what the microphone hears side by side in an AudioWorklet, so both share one sample clock and no timer has to guess when a chirp left. For each chirp the recording is cross-correlated with the chirp through an FFT, and the lag of the highest peak is the delay.<sup><a href="#r10">10</a></sup> The page takes the envelope of the correlation, so the speaker's polarity does not move the peak, and a parabola through its top three points places it between samples. A result counts only when most chirps come back at the same delay, within 2 ms: noise lands anywhere, and the uneven spacing keeps a sound that repeats on its own from lining up with every chirp. The page reports the median of the chirps that agree, their spread, and the peak ratio: the peak over the next-highest one more than 1 ms away, usually an echo. Near 1×, an echo nearly as loud as the direct sound could have been taken for it. Delays up to 600 ms are searched.</p>
      <h3>Why the microphone's processing is off</h3>
      <p>Echo cancellation exists "to remove sound being played from the input signals recorded by the microphones",<sup><a href="#r3">3</a></sup> which is the very sound this test listens for. Noise suppression and automatic gain alter the signal too. So the page asks for <code>echoCancellation</code>, <code>noiseSuppression</code> and <code>autoGainControl</code> all <code>false</code>, reads the track's settings back, and says so if the browser kept any of them on. These switches cover the browser's own processing; a voice filter in the operating system or in a headset is outside them.</p>
      <h3>What the browser reports</h3>
      <p><code>AudioContext.baseLatency</code> is the delay from the end of the audio graph into the system's audio stack; <code>outputLatency</code> runs from there to the output device.<sup><a href="#r1">1</a></sup> Chrome reports base latency since version 58 and output latency since 102, Firefox both since 70, Safari base latency since 14.1 and output latency since 18.4.<sup><a href="#r2">2</a></sup> Chrome 125 and later also report the microphone's input latency, in milliseconds, through the track's <code>stats</code>.<sup><a href="#r2">2</a>,<a href="#r4">4</a></sup> The sum leaves out the air and whatever the operating system does not tell the browser; the measured round trip includes all of it.</p>
      <h3>The tap test, honestly</h3>
      <p>The page schedules twenty clicks at 100 BPM on the audio clock and times your taps (Space, or a touch on the pad) against the moment each click left the page. Nothing on screen moves with the beat, so you follow your ears. The result includes you: most people tap slightly ahead of a steady beat, the negative mean asynchrony,<sup><a href="#r8">8</a></sup> and a keyboard or touchscreen adds its own delay before the page sees the press. So the absolute number carries a personal offset. Run it once on wired headphones or the built-in speaker and once on Bluetooth: the difference between the two runs is the delay Bluetooth adds, and your own offset largely cancels.</p>
      <h3>Reading the numbers</h3>
      <ul>
        <li><strong>Phones.</strong> Android 16 requires a handheld with a speaker and a microphone to keep its round trip within 200 ms, 50 ms if it declares low-latency audio and 25 ms (20 ms through the analog jack) if it declares professional audio, measured natively with AAudio.<sup><a href="#r5">5</a></sup> A browser adds its own buffers on top.</li>
        <li><strong>Bluetooth.</strong> Classic Bluetooth music streaming (A2DP) adds retransmissions and buffering against dropouts, so it "typically has a latency of 100 – 200 ms".<sup><a href="#r6">6</a></sup> Its delay reporting lets the playing device, a phone or a TV, ask the headphones for that delay and hold the picture back. Whether the figure reaches this page as <code>outputLatency</code> depends on the system and the browser: the tap test shows both numbers side by side.</li>
        <li><strong>Lip sync.</strong> On average, viewers notice sound lagging the picture from about 125 ms and stop accepting it at about 185 ms; sound ahead of the picture is noticed from about 45 ms.<sup><a href="#r7">7</a></sup></li>
        <li><strong>Distance.</strong> Sound travels about 343 m/s in air at 20 °C, so each metre between speaker and microphone adds 2.9 ms.<sup><a href="#r9">9</a></sup></li>
      </ul>
      <h3>Bluetooth headphones and the round trip</h3>
      <p>A computer's microphone hears closed headphones only when pressed against an ear cup at a high volume; the peak ratio tells you whether it did. Keep the computer's microphone selected, not the headset's: A2DP, the classic music link, has no return audio path,<sup><a href="#r6">6</a></sup> so a classic headset's microphone works over the hands-free profile (HFP), a separate voice link, and the round trip would measure that link instead of the one you listen through.</p>
      <p>For the frequency response and reverberation time of your speakers and room, use the <a href="/util/measure/">room and speaker measurement</a>.</p>
      <h3>References</h3>
      <ol class="refs">
        <li id="r1">MDN, <a href="https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency">AudioContext.baseLatency</a> and <a href="https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency">AudioContext.outputLatency</a>.</li>
        <li id="r2">MDN, <a href="https://github.com/mdn/browser-compat-data">browser-compat-data</a>, api/AudioContext.json and api/MediaStreamTrackAudioStats.json (October 2026).</li>
        <li id="r3">W3C, <a href="https://w3c.github.io/mediacapture-main/">Media Capture and Streams</a>: the echoCancellation, noiseSuppression and autoGainControl constrainable properties.</li>
        <li id="r4">W3C, <a href="https://w3c.github.io/mediacapture-extensions/">Media Capture and Streams Extensions</a>: MediaStreamTrackAudioStats, input latency in milliseconds.</li>
        <li id="r5">Android, <a href="https://source.android.com/docs/compatibility/16/android-16-cdd">Android 16 Compatibility Definition</a>, §5.6 Audio Latency: round-trip latency per device class.</li>
        <li id="r6">N. Hunn, <a href="https://www.bluetooth.com/wp-content/uploads/2025/01/Introduction-to-LE-Audio-2.0.pdf"><i>Introducing Bluetooth LE Audio</i></a>, 2nd ed. (2024), published by the Bluetooth SIG: §1, HFP and A2DP; §5.3, A2DP latency and delay reporting.</li>
        <li id="r7">ITU-R <a href="https://www.itu.int/rec/R-REC-BT.1359/en">BT.1359-1</a> (1998), Relative timing of sound and vision for broadcasting: detectability about +45 to −125 ms, acceptability about +90 to −185 ms.</li>
        <li id="r8">B. H. Repp, “<a href="https://doi.org/10.3758/BF03206433">Sensorimotor synchronization: A review of the tapping literature</a>,” <i>Psychonomic Bulletin &amp; Review</i> 12 (2005): the negative mean asynchrony.</li>
        <li id="r9">R. Nave, HyperPhysics, <a href="http://hyperphysics.phy-astr.gsu.edu/hbase/Sound/souspe.html">Speed of sound</a>: about 331.4 + 0.6·T m/s for air at T °C.</li>
        <li id="r10">C. H. Knapp &amp; G. C. Carter, “The generalized correlation method for estimation of time delay,” <i>IEEE Trans. Acoustics, Speech, and Signal Processing</i> 24 (1976).</li>
      </ol>`,
}
