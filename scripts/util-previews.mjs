// The home's featured utilities' previews: one figure each, 200 × 72 px, line and dot only, in the stroke and the type
// the page gives them (home/index.css .fig). Each draws what its tool does to a sound, as the icons do (util-icons.mjs),
// at the size of a figure: the columns of a waveform a 4 px apart, a dot where a column is silent. Drawn from a seed, so
// a build draws the same figures.
const W = 200, H = 72
const r1 = n => Math.round(n * 10) / 10
// a seeded generator in [0, 1) (Park–Miller)
const seeded = seed => () => (seed = seed * 16807 % 2147483647) / 2147483647
// a sound's envelope over n columns: bursts [centre, width, height] in columns, each column jittered by `rough`
const envelope = (n, bursts, rough, rnd) => Array.from({ length: n }, (_, i) =>
  bursts.reduce((a, [c, w, h]) => a + h * Math.exp(-(((i - c) / w) ** 2)), 0) * (1 - rough + rough * rnd()))
// the columns of a waveform about y, from x0 a `step` apart: a line from -a to a, a dot under half a px
const columns = (amps, { x0 = 2, step = 4, y = H / 2 } = {}) => amps.map((a, i) => {
  const x = x0 + i * step
  return a < .5 ? `M${x} ${y}h.01` : `M${x} ${r1(y - a)}V${r1(y + a)}`
}).join('')
const label = (x, y, text, anchor = 'start') => `<text x="${x}" y="${y}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${text}</text>`

const figures = {
  // two bars of four at 120 BPM, the first beat of each accented, eighths between
  metronome() {
    const beats = [], subs = []
    for (let k = 0; k < 8; k++) { const x = 8 + k * 24; beats.push(k % 4 ? `M${x} 40V24` : `M${x} 46V12`); subs.push(`M${x + 12} 32h.01`) }
    return `<path class="faint" d="M0 32H${W}"/><path class="lit" d="${beats.filter((_, k) => !(k % 4)).join('')}"/><path d="${beats.filter((_, k) => k % 4).join('')}${subs.join('')}"/>`
      + label(0, 66, '120 BPM') + label(W, 66, '4/4', 'end')
  },
  // a needle over a scale of cents, a hair sharp of the note
  tuner() {
    const at = c => 100 + c * 1.76, ticks = []
    for (let c = -50; c <= 50; c += 5) { const h = c === 0 ? 22 : c % 25 ? 6 : 12; ticks.push(`M${r1(at(c))} 50V${50 - h}`) }
    return `<path d="${ticks.join('')}"/><path class="lit" d="M${r1(at(4))} 54V12"/><circle class="fill" cx="${r1(at(4))}" cy="54" r="2.5"/>`
      + label(0, 10, 'A4') + label(W, 10, '+4 cents', 'end') + label(r1(at(-50)), 68, '−50', 'middle') + label(100, 68, '0', 'middle') + label(r1(at(50)), 68, '+50', 'middle')
  },
  // a voice's melody, its syllables moved onto notes
  prosody() {
    const lines = [12, 24, 36, 48, 60], rnd = seeded(7), curve = []
    for (let x = 4; x <= 196; x += 4) curve.push([x, 40 - 16 * Math.sin(x / 34) - 6 * Math.sin(x / 11) + 3 * (rnd() - .5)])
    const syllables = [28, 64, 100, 136, 172].map(x => { const [, y] = curve.find(([cx]) => cx >= x); return [x, y, lines.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a)] })
    return `<path class="faint" d="${lines.map(y => `M0 ${y}H${W}`).join('')}"/><path d="${curve.map(([x, y]) => `M${x} ${r1(y)}h.01`).join('')}"/>`
      + syllables.map(([x, y, to]) => `<path class="lit" d="M${x} ${r1(y)}V${to}"/><circle class="fill" cx="${x}" cy="${to}" r="3"/>`).join('')
  },
  // a take as it records: the sound so far, the head, the time still empty
  recorder() {
    const rnd = seeded(3), n = 35, amps = envelope(n, [[4, 3, 22], [12, 4, 28], [21, 3, 18], [29, 4, 26]], .55, rnd)
    const head = 2 + n * 4 + 4, from = head + 12, rest = Array.from({ length: Math.floor((W - 2 - from) / 4) + 1 }, () => 0)
    return `<path d="${columns(amps)}"/><circle class="fill" cx="${head}" cy="${H / 2}" r="5"/><path class="faint" d="${columns(rest, { x0: from })}"/>`
  },
  // the same sound, its noise floor taken away
  denoise() {
    const rnd = seeded(11), n = 24, bursts = [[5, 2, 24], [14, 3, 30], [20, 1.5, 16]], clean = envelope(n, bursts, .4, rnd)
    const noisy = clean.map(a => a + 2 + 5 * rnd())
    return `<path d="${columns(noisy)}"/><path class="faint" d="M100 4V68" stroke-dasharray="1 3"/><path d="${columns(clean, { x0: 104 })}"/>`
  },
  // one sound into any format
  'convert-audio'() {
    const rnd = seeded(5), amps = envelope(50, [[8, 6, 14], [24, 5, 18], [40, 7, 12]], .5, rnd)
    const formats = ['WAV', 'FLAC', 'MP3', 'OGG', 'OPUS', 'M4A']
    return `<path d="${columns(amps, { y: 24 })}"/>` + formats.map((f, i) => label(r1(16 + i * 33.6), 68, f, 'middle')).join('')
  },
  // speech, and its words under it
  transcribe() {
    const rnd = seeded(13), words = [['every', 4.5, 3.5], ['word', 14.5, 3], ['under', 24.5, 3.5], ['its', 34.5, 2.5], ['sound', 44.5, 3.5]]
    const amps = envelope(50, words.map(([, c, w]) => [c, w, 18]), .6, rnd)
    return `<path d="${columns(amps, { y: 26 })}"/>` + words.map(([w, c]) => label(r1(2 + c * 4), 68, w, 'middle')).join('')
  },
  // a song in four: its voice, drums, bass and the rest
  'stem-splitter'() {
    const rnd = seeded(17), n = 38, x0 = 48, lanes = [
      ['vocals', i => 6 * Math.exp(-((((i % 19) - 9) / 4) ** 2)) * (.5 + .5 * rnd())],
      ['drums', i => i % 4 ? .3 * rnd() : 6],
      ['bass', i => 3.5 + 1.5 * Math.sin(i / 2.2)],
      ['other', () => 1 + 3 * rnd()]
    ]
    return lanes.map(([name, f], k) => { const y = 9 + k * 18; return label(0, y + 3.5, name) + `<path d="${columns(Array.from({ length: n }, (_, i) => f(i)), { x0, y })}"/>` }).join('')
  },
}

export const preview = slug => figures[slug] && `<svg class="fig" viewBox="0 0 ${W} ${H}" aria-hidden="true">${figures[slug]()}</svg>`
