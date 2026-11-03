// Metronome: a click on the audio clock, 20 to 300 BPM, tap tempo, a mark for each beat of the bar (accent, plain,
// muted), subdivisions, and the nine sounds of web-audio-api's metronome instrument (its examples/graphs/metronome.js,
// played by the browser's own Web Audio). The pure functions below are exported for scripts/pages/metronome.test.mjs and
// serialized into the page script, one source for both.

// ── pure functions (self-contained: each is copied into the page with String(fn)) ──

// a tempo as the metronome keeps it: whole beats a minute, lo to hi; NaN where it is no number
export function clampBpm(v, lo = 20, hi = 300) {
  const n = typeof v === 'string' && !v.trim() ? NaN : Math.round(+v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : NaN
}
// the tempo taps keep: the median gap of the last eight since a pause of more than `gap` ms; null under two taps
export function tapTempo(taps, gap = 2000) {
  let from = 0
  for (let i = 1; i < taps.length; i++) if (taps[i] - taps[i - 1] > gap) from = i
  const t = taps.slice(Math.max(from, taps.length - 8)), d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  if (!d.length) return null
  return clampBpm(60000 / (d.length % 2 ? d[d.length >> 1] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2))
}
// a beat's mark pressed: accent, plain, muted, round again
export function nextMark(m) { return { X: 'x', x: '-', '-': 'X' }[m] ?? 'x' }
// the marks of a bar of n beats: those it had kept, a beat added plain; with none before, the first an accent
export function resize(marks, n) { return Array.from({ length: n }, (_, i) => marks[i] ?? (i ? 'x' : 'X')) }
// where the count goes after a click: the beat's next part, else the next beat's first, the bar's first after its last
export function advance(beat, part, sub, n) { return ++part < sub ? [beat % n, part] : [(beat + 1) % n, 0] }
// what sounds: on a beat, its mark at full level; between, a plain click at `soft`
export function strike(marks, beat, part, soft = .45) { return part ? ['x', soft] : [marks[beat % marks.length], 1] }

const PURE = [clampBpm, tapTempo, nextMark, resize, advance, strike].map(String).join('\n')
const ref = n => `<sup><a href="#r${n}">${n}</a></sup>`
const LIB = 'https://esm.sh/web-audio-api@1.6.0/examples/graphs/metronome.js'

export default {
  slug: 'metronome', order: 80,
  name: 'Metronome', short: 'A click from 20 to 300 BPM: tap tempo, accents and muted beats, subdivisions, nine sounds',
  title: 'Online metronome: tap tempo, accents, subdivisions',
  description: 'Free online metronome with sound, 20 to 300 BPM: tap tempo, 1 to 12 beats a bar, accent or mute any beat, eighths, triplets and sixteenths, nine click sounds. Timed by the audio clock. Nothing to install.',
  lead: 'Set the tempo and press start. Tap it in, accent or mute any beat, add subdivisions.',
  powered: ['web-audio-api'], repo: 'https://github.com/audiojs/audiojs.github.io/blob/main/scripts/pages/metronome.mjs',
  body: `
    <style>
      #mt { padding: 28px 20px; }
      #mt :focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
      #mt .tempo { display: flex; align-items: center; justify-content: center; gap: clamp(10px, 3vw, 24px); }
      #mt .read { display: inline-flex; align-items: baseline; gap: 6px; }
      #mt .read input { width: 3.1ch; padding: 0; border: 0; border-bottom: 2px dashed var(--c-rule); border-radius: 0; background: transparent; color: var(--c-ink); font: inherit; font-size: clamp(64px, 15vw, 112px); font-weight: 600; letter-spacing: -.04em; line-height: 1.05; text-align: center; font-variant-numeric: tabular-nums; -moz-appearance: textfield; appearance: textfield; }
      #mt .read input::-webkit-inner-spin-button, #mt .read input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      #mt .read input:focus { border-bottom-color: var(--c-accent); outline: none; }
      #mt .read span { font-size: var(--fs-lg); font-weight: 600; color: var(--c-mute); }
      #mt [aria-invalid=true] { border-bottom-color: var(--c-err) !important; color: var(--c-err); }
      #mt .nudge { flex: none; width: 44px; height: 44px; padding: 0; border: 1px solid var(--c-rule); border-radius: 50%; background: var(--c-paper); color: var(--c-ink); font: inherit; font-size: 22px; line-height: 1; cursor: pointer; }
      #mt .nudge:hover { border-color: var(--c-ink); }
      #mt #slider { display: block; width: 100%; max-width: 520px; margin: 18px auto 0; accent-color: var(--c-ink); }
      #mt .beats { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 520px; margin: 26px auto 0; }
      #mt .beats button { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; }
      #mt .beats i { display: block; width: 14px; height: 14px; border: 1.5px solid var(--c-ink); border-radius: 50%; transition: background .05s; }
      #mt .beats [data-mark=X] i { width: 24px; height: 24px; border-width: 2px; }
      #mt .beats [data-mark="-"] i { border-style: dashed; border-color: var(--c-mute); }
      #mt .beats .on i { background: var(--c-ink); }
      #mt .beats [data-mark="-"].on i { background: var(--c-rule); }
      #mt .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 26px; }
      #mt .actions .btn { min-width: 8.5em; justify-content: center; }
      #mt .line { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; justify-content: center; margin-top: 22px; font-size: var(--fs-sm); font-weight: 500; }
      #mt .line label { display: inline-flex; align-items: center; gap: 6px; }
      #mt select { padding: 6px 8px; border: 1px solid var(--c-rule); border-radius: 6px; background: var(--c-paper); color: var(--c-ink); font: inherit; font-size: var(--fs-sm); }
      #mt .seg { display: inline-flex; border: 1px solid var(--c-rule); border-radius: 6px; overflow: hidden; background: var(--c-paper); }
      #mt .seg button { padding: 7px 10px; border: 0; background: transparent; color: var(--c-ink); font: inherit; font-weight: 600; cursor: pointer; }
      #mt .seg button + button { border-left: 1px solid var(--c-rule); }
      #mt .seg button[aria-pressed=true] { background: var(--c-ink); color: var(--c-paper); }
      #mt #vol { width: 110px; accent-color: var(--c-ink); }
      #mt .msg { margin: 16px 0 0; color: var(--c-err); font-size: var(--fs-sm); }
      #mt .keys { margin: 18px 0 0; font-size: var(--fs-xs); color: var(--c-mute); }
      #mt kbd { font: inherit; padding: 0 .35em; border: 1px solid var(--c-rule); border-radius: 3px; }
    </style>
    <div class="live" id="mt">
      <div class="tempo">
        <button class="nudge" type="button" data-step="-1" aria-label="Slower by 1 BPM">−</button>
        <label class="read"><input id="bpm" type="number" inputmode="numeric" min="20" max="300" step="1" value="120" aria-label="Tempo, beats a minute"><span>BPM</span></label>
        <button class="nudge" type="button" data-step="1" aria-label="Faster by 1 BPM">+</button>
      </div>
      <input id="slider" type="range" min="20" max="300" step="1" value="120" aria-label="Tempo">
      <div class="beats" id="beats" role="group" aria-label="The bar's beats: press one to accent it, play it plain or mute it"></div>
      <div class="actions">
        <button class="btn" id="play" type="button" aria-pressed="false">Start</button>
        <button class="btn ghost" id="tap" type="button">Tap tempo</button>
      </div>
      <div class="line">
        <label>Beats <select id="count">${Array.from({ length: 12 }, (_, i) => `<option${i === 3 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <span class="seg" id="sub" role="group" aria-label="Subdivision">${[[1, 'None'], [2, 'Eighths'], [3, 'Triplets'], [4, 'Sixteenths']].map(([v, l]) => `<button type="button" data-sub="${v}" aria-pressed="${v === 1}">${l}</button>`).join('')}</span>
        <label>Sound <select id="sound"><option value="classic">Classic</option></select></label>
        <label>Volume <input id="vol" type="range" min="0" max="100" value="80" aria-label="Volume"></label>
      </div>
      <p class="msg" id="msg" role="status" hidden></p>
      <p class="keys"><kbd>Space</kbd> starts and stops, <kbd>T</kbd> taps the tempo; in the number, <kbd>↑</kbd> <kbd>↓</kbd> step 1, with <kbd>Shift</kbd> 10</p>
    </div>`,
  script: `
    ${PURE}
    // clicks go AHEAD seconds ahead on the audio clock, laid every TICK ms; a hidden tab's timers are slowed, so there
    // they go HIDDEN seconds ahead; a subdivision at SOFT of a beat's level
    const AHEAD = 0.1, TICK = 25, HIDDEN = 2, SOFT = 0.45, KEY = 'metronome'
    const lib = import('${LIB}')
    const bpmEl = $('bpm'), slider = $('slider'), beatsEl = $('beats'), play = $('play'), tapEl = $('tap'), countEl = $('count'), subEl = $('sub'), soundEl = $('sound'), volEl = $('vol'), msg = $('msg')
    const NAMES = { X: 'accent', x: 'plain', '-': 'muted' }
    let S = { bpm: 120, marks: ['X', 'x', 'x', 'x'], sub: 1, sound: 'classic', vol: 0.8 }
    try { const k = JSON.parse(localStorage.getItem(KEY) || '{}'); S = { bpm: clampBpm(k.bpm) || S.bpm, marks: Array.isArray(k.marks) && k.marks.length && k.marks.length <= 12 && k.marks.every(m => m in NAMES) ? k.marks : S.marks, sub: [1, 2, 3, 4].includes(k.sub) ? k.sub : S.sub, sound: typeof k.sound === 'string' ? k.sound : S.sound, vol: k.vol >= 0 && k.vol <= 1 ? k.vol : S.vol } } catch {}
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch {} }
    let ctx = null, out = null, inst = null, timer = 0, raf = 0, next = 0, beat = 0, part = 0, queue = [], taps = []

    // ── the bar's beats, each a button: its mark, and lit while it sounds ──
    function drawBeats() {
      beatsEl.innerHTML = S.marks.map((m, i) => '<button type="button" data-i="' + i + '" data-mark="' + m + '" aria-label="Beat ' + (i + 1) + ', ' + NAMES[m] + '"><i></i></button>').join('')
    }
    function light(i) { for (const b of beatsEl.children) b.classList.toggle('on', +b.dataset.i === i) }
    beatsEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return
      const m = S.marks[b.dataset.i] = nextMark(S.marks[b.dataset.i])
      b.dataset.mark = m; b.ariaLabel = 'Beat ' + (+b.dataset.i + 1) + ', ' + NAMES[m]; keep()
    })

    // ── the tempo: the number, the slider, −/+, taps ──
    function setBpm(v, typed = false) {
      const n = clampBpm(v); if (!n) return
      S.bpm = n; slider.value = n; bpmEl.removeAttribute('aria-invalid')
      if (!typed) bpmEl.value = n
      keep()
    }
    bpmEl.addEventListener('input', () => { const n = +bpmEl.value; n >= 20 && n <= 300 && Number.isInteger(n) ? setBpm(n, true) : bpmEl.setAttribute('aria-invalid', 'true') })
    bpmEl.addEventListener('change', () => setBpm(clampBpm(bpmEl.value) || S.bpm))
    bpmEl.addEventListener('keydown', e => { if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); setBpm(S.bpm + (e.key === 'ArrowUp' ? 10 : -10)) } })
    slider.addEventListener('input', () => setBpm(slider.value))
    for (const b of document.querySelectorAll('#mt .nudge')) b.addEventListener('click', () => setBpm(S.bpm + +b.dataset.step))
    function tap() {
      const now = performance.now()
      taps = [...taps, now].slice(-16)
      const t = tapTempo(taps); if (t) setBpm(t)
    }
    tapEl.addEventListener('click', tap)

    // ── the bar: beats, subdivision, sound, volume ──
    countEl.addEventListener('change', () => { S.marks = resize(S.marks, +countEl.value); beat %= S.marks.length; drawBeats(); keep() })
    subEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return
      S.sub = +b.dataset.sub; part = 0; keep()
      for (const o of subEl.children) o.setAttribute('aria-pressed', String(o === b))
    })
    soundEl.addEventListener('change', async () => { S.sound = soundEl.value; keep(); if (ctx && out) inst = (await lib).createInstrument(ctx, { sound: S.sound, destination: out }) })
    volEl.addEventListener('input', () => { S.vol = volEl.value / 100; keep(); if (out) out.gain.setTargetAtTime(S.vol, ctx.currentTime, 0.01) })
    lib.then(({ soundNames }) => {
      soundEl.innerHTML = soundNames.map(n => '<option value="' + n + '">' + n[0].toUpperCase() + n.slice(1) + '</option>').join('')
      soundEl.value = soundNames.includes(S.sound) ? S.sound : (S.sound = soundNames[0])
    }, () => {})

    // ── sound: each click laid ahead on the audio clock, from where the count is; what plays lit as it is heard ──
    function schedule() {
      const ahead = document.hidden ? HIDDEN : AHEAD
      while (next < ctx.currentTime + ahead) {
        const [mark, level] = strike(S.marks, beat, part, SOFT)
        inst.hit(next, mark, level)
        if (!part) queue.push([next, beat % S.marks.length])
        next += 60 / S.bpm / S.sub;
        [beat, part] = advance(beat, part, S.sub, S.marks.length)
      }
    }
    // the clock as the speakers have reached it, where the browser tells (getOutputTimestamp), else the context's
    function heard() {
      const ts = ctx.getOutputTimestamp?.()
      return ts?.contextTime > 0 ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000 : ctx.currentTime
    }
    function frame() {
      const now = heard()
      let lit = null
      while (queue.length && queue[0][0] <= now) lit = queue.shift()
      if (lit) light(lit[1])
      raf = requestAnimationFrame(frame)
    }
    async function start() {
      // (made and resumed in the press itself: Safari lets a page's sound start only there)
      if (!ctx) { if (navigator.audioSession) navigator.audioSession.type = 'playback'; ctx = new AudioContext({ latencyHint: 'interactive' }) }
      const resumed = ctx.resume()
      play.disabled = true
      try {
        const { createInstrument } = await lib
        await resumed
        // a gain of its own each start: what was laid ahead before the last stop goes with the one let go
        out = ctx.createGain(); out.gain.value = S.vol; out.connect(ctx.destination)
        inst = createInstrument(ctx, { sound: S.sound, destination: out })
        next = ctx.currentTime + 0.05; beat = 0; part = 0; queue = []
        schedule(); timer = setInterval(schedule, TICK); raf = requestAnimationFrame(frame)
        play.textContent = 'Stop'; play.setAttribute('aria-pressed', 'true')
      } catch (e) { msg.textContent = 'The metronome could not start: ' + e.message; msg.hidden = false }
      play.disabled = false
    }
    function stop() {
      clearInterval(timer); cancelAnimationFrame(raf); timer = 0
      out?.disconnect(); out = null; queue = []; light(-1)
      ctx?.suspend()
      play.textContent = 'Start'; play.setAttribute('aria-pressed', 'false')
    }
    const toggle = () => timer ? stop() : start()
    play.addEventListener('click', toggle)
    // Space and T anywhere but in a field (a focused button takes Space itself), Escape stops
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape' && timer) return stop()
      if (e.target.closest('input, select, textarea')) return
      if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); toggle() }
      else if (e.key === 't' || e.key === 'T') tap()
    })

    countEl.value = S.marks.length; volEl.value = Math.round(S.vol * 100)
    for (const o of subEl.children) o.setAttribute('aria-pressed', String(+o.dataset.sub === S.sub))
    setBpm(S.bpm); drawBeats()`,
  faq: [
    ['How accurate is the beat?', 'Each click is laid on the audio clock a tenth of a second before it sounds, the way the Web Audio API is meant to keep time: the sound card places it, not the page\'s timers, so a busy tab does not push it late. The beat dots light when the click reaches the speakers.'],
    ['How do I set the tempo by tapping?', 'Press Tap tempo, or T, on the beat four times or more. The tempo is the median gap of your last eight taps, so one early or late tap does not throw it off. A pause of two seconds starts over.'],
    ['How do I play 3/4, 6/8 or 7/8?', 'Beats sets how many beats a bar has. For 3/4 choose 3. For 6/8 either choose 6 at the eighth-note tempo and accent beats 1 and 4, or choose 2 with Triplets at the dotted-quarter tempo. For 7/8 grouped 2 + 2 + 3, choose 7 and accent beats 1, 3 and 5.'],
    ['Can I accent or mute beats?', 'Press a beat to cycle it: accent (large), plain, muted (dashed). Muting beats is a way to practise keeping time yourself: mute all but the first, and the click only checks you once a bar.'],
    ['Does it keep playing in another tab?', 'Yes. A browser runs a hidden tab\'s timers as seldom as once a second, so there the clicks are laid two seconds ahead instead of a tenth, and the beat goes on as set.'],
    ['Is anything recorded or sent?', 'No. The page makes the clicks itself and keeps your settings in this browser only.'],
  ],
  seo: `
    <h2>A metronome timed by the audio clock</h2>
    <p>A metronome is only as good as its timing. Timers in a web page can fire late by tens of milliseconds while the page is busy, which you would hear as a wobble. So this metronome never plays a click from a timer: every 25 ms it lays the clicks due in the next tenth of a second on the audio context's own clock, and the audio hardware plays them at those times${ref(1)}${ref(2)}. A change of tempo, beats or sound takes effect from the next click laid.</p>
    <h3>Accents, subdivisions and odd meters</h3>
    <p>Each beat of the bar has a mark: an accent, a plain click or silence. Subdivisions add softer clicks between the beats: two (eighths), three (triplets) or four (sixteenths). Together they make any meter: 6/8 as six eighth-note beats with accents on 1 and 4, or as two beats of triplets; 5/4 as 3 + 2 by accenting beats 1 and 4.</p>
    <h3>The sounds</h3>
    <p>The nine sounds are the metronome instrument of <code>web-audio-api</code>${ref(3)}, most of them a small model of a struck body: a mechanical metronome's wooden case, a pendulum's escapement, a quartz beeper, a woodblock, claves, a small bell, an electronic beep, a broadcast pip and karatala, small hand cymbals. An accent is struck harder and, on most, higher. The same instrument runs in Node: <code>npx web-audio-api metronome 120 X-x-X-x-</code> plays a click pattern in a terminal.</p>
    <h3>References</h3>
    <ol class="refs">
      <li id="r1">C. Wilson, <a href="https://web.dev/articles/audio-scheduling">A tale of two clocks</a>, web.dev (2013): scheduling Web Audio with a lookahead, a timer laying events ahead on the audio clock.</li>
      <li id="r2">W3C, <a href="https://www.w3.org/TR/webaudio/">Web Audio API</a>: <code>AudioScheduledSourceNode.start(when)</code> on the context's time coordinate system; <code>AudioContext.getOutputTimestamp()</code>.</li>
      <li id="r3">audiojs, <a href="https://github.com/audiojs/web-audio-api/blob/main/examples/graphs/metronome.js">web-audio-api: examples/graphs/metronome.js</a>, the instrument and its nine presets.</li>
    </ol>`,
}
