import { $, dropzone, decodeFile } from '../util.js'
import { clamp, hzToNote, noteToHz, noteName, mapTime, retime, correct, shiftTo, restore, reference, centers, notesIn, pitchAt, validatePitch } from './model.js'
import { decodeWav } from './dsp.js'

// Pitch sliders act live on the selection: their value for correct(), and its
// label. Their markup defaults are neutral and change nothing.
const SLIDERS = { smooth: [v => v / 1000, v => `${v} ms`], straighten: [v => v / 100, v => `${v}%`], snap: [v => v / 100, v => `${v}%`], intonation: [v => v / 100, v => `${v}%`], rise: [v => v, v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} st`] }
// Plot geometry (SVG units): pitch area, waveform lane, time axis.
const LEFT = 55, TOP = 12, BOTTOM = 216, LANE = [224, 256], HEIGHT = 300

export function startEditor(version) {
  let worker, run = 0, track, samples, sampleRate, target, anchors, history = [], session, hover = -1, peak = 1, loudest = 1, detected, traced
  let duration = 0, view = [0, 1], pitchRange = [hzToNote(60), hzToNote(600)], busy = false, dirty = false, drag, pinch, selected = [0, 1], picked = false
  const pointers = new Map()
  let originalURL, editedURL, filename = 'speech', animation, gestureScale = 0
  const svg = $('curve'), ns = 'http://www.w3.org/2000/svg'
  const zone = dropzone($('drop'), $('file'), load)
  const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('err', error) }
  const selection = () => {
    const [a, b] = selected
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > duration + 1e-6 || b - a < Math.min(.02, duration) - 1e-8) throw Error('Select at least 0.02 seconds within the recording.')
    return [a, Math.min(duration, b)]
  }
  const snapshot = () => ({ target: target.slice(), anchors: anchors.map(p => p.slice()) })
  function remember(state = snapshot()) { history.push(state); if (history.length > 50) history.shift() }
  function lock(value) { busy = value; $('controls').disabled = value || !track; $('render').disabled = value || !dirty; $('undo').disabled = value || !history.length; $('reset').disabled = value || !track }
  // Slider values describe one correction of one selection; any other edit or
  // selection starts the next from neutral.
  function settle() {
    session = null
    for (const [id, [, label]] of Object.entries(SLIDERS)) { $(id).value = $(id).defaultValue; $(id + '-value').textContent = label(+$(id).value) }
  }
  function select(range, chosen = true) {
    if (range[0] !== selected[0] || range[1] !== selected[1]) settle()
    selected = range; picked = chosen
  }
  function edited() {
    dirty = true; $('render').disabled = false; $('undo').disabled = !history.length
    $('edited').pause(); $('edited').removeAttribute('src'); $('edited').load()
    $('save').removeAttribute('href'); $('save').setAttribute('aria-disabled', 'true')
    $('render-state').textContent = 'Edits changed · render to listen and save'
    if (editedURL && editedURL !== originalURL) URL.revokeObjectURL(editedURL)
    editedURL = null
  }
  function invalidate() { edited(); fitPitch(); update(); draw() }
  function fitPitch() {
    let low = Infinity, high = -Infinity
    for (const values of [detected.edit, trace().edit]) for (const n of values) if (n === n) { low = Math.min(low, n); high = Math.max(high, n) }
    if (!Number.isFinite(low)) { pitchRange = [hzToNote(60), hzToNote(600)]; return }
    const middle = (low + high) / 2, half = Math.max(6, (high - low) / 2 + 1.5)
    pitchRange = [middle - half, middle + half]
  }
  // Syllable notes as frame ranges; centres in semitones, null for noise.
  const notes = () => track.notes ?? []
  const noteCenters = contour => centers(track, notes(), contour)
  // The trusted contour of a curve, its note centres and a sampler, computed
  // once per curve: edits replace `target`, never mutate it.
  const traceOf = values => { const edit = reference(track, values); return { values, edit, centre: noteCenters(edit), pitch: sampler(edit) } }
  const trace = () => traced?.values === target ? traced : traced = traceOf(target)
  const span = k => {
    const [a, b] = notes()[k], pad = Math.max(track.hop / 2, (.02 - (track.times[b] - track.times[a])) / 2)
    return [Math.max(0, track.times[a] - pad), Math.min(duration, track.times[b] + pad)]
  }
  const inSelection = k => { const [a, b] = notes()[k], middle = (track.times[a] + track.times[b]) / 2; return picked && middle >= selected[0] && middle <= selected[1] }
  const describe = center => {
    const cents = Math.round((center - Math.round(center)) * 100)
    return `${noteName(center)}${cents ? ` ${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢` : ''} · ${noteToHz(center).toFixed(1)} Hz`
  }
  // The duration field follows the selection and timing, never a hover, so typing survives.
  let timed = ''
  function update() {
    const key = selected.join() + anchors.flat().join()
    if (key !== timed) try { const [a, b] = selection(); $('duration').value = (mapTime(anchors, b) - mapTime(anchors, a)).toFixed(3); timed = key } catch {}
    const selectedNotes = picked ? notes().map((_, k) => k).filter(inSelection) : []
    $('scope').textContent = !picked || (selected[0] <= 0 && selected[1] >= duration) ? '· all' : `· ${selectedNotes.length} ${selectedNotes.length === 1 ? 'note' : 'notes'}`
    const k = hover >= 0 ? hover : selectedNotes.length === 1 ? selectedNotes[0] : -1
    const now = k >= 0 ? trace().centre[k] : null, was = k >= 0 ? detected.centre[k] : null
    $('point-info').textContent = now != null ? describe(now) + (Math.abs(now - was) >= .005 ? ` · was ${describe(was).split(' · ')[0]}` : '')
      : picked ? `${selected[0].toFixed(2)}–${selected[1].toFixed(2)} s` : ''
  }
  function act(fn) {
    if (!track || busy) return
    try { fn(); status(dirty ? 'Edit ready. Render to compare with the original.' : 'Ready. Select notes or drag them.') } catch (e) { status(e.message, true) }
  }
  function change(fn) {
    const before = snapshot()
    settle()
    try { fn(); validatePitch(track, target, sampleRate) }
    catch (error) { ({ target, anchors } = before); throw error }
    if (target.every((v, i) => v === before.target[i]) && anchors.length === before.anchors.length && anchors.every((p, i) => p.every((v, j) => v === before.anchors[i][j]))) return
    remember(before); invalidate()
  }
  function release() {
    worker?.terminate(); worker = null; cancelAnimationFrame(animation)
    for (const id of ['original', 'edited']) { $(id).pause(); $(id).removeAttribute('src'); $(id).load() }
    for (const url of new Set([originalURL, editedURL])) if (url) URL.revokeObjectURL(url)
    originalURL = editedURL = null; track = samples = target = detected = traced = null; history = []; hover = -1; drag = pinch = null; pointers.clear(); gestureScale = 0; dirty = false; settle()
    $('save').removeAttribute('href'); $('save').setAttribute('aria-disabled', 'true')
  }
  function readyAudio(bytes, original = false) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    if (editedURL && editedURL !== originalURL) URL.revokeObjectURL(editedURL)
    if (original) { originalURL = url; $('original').src = url }
    editedURL = url; $('edited').src = url
    $('save').href = url; $('save').download = filename + '-prosody.wav'; $('save').setAttribute('aria-disabled', 'false')
    dirty = false; lock(false)
  }
  async function load(file) {
    const id = ++run
    release(); lock(true); $('editor').hidden = true; zone.show(); status('Reading recording…')
    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
      const isWav = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WAVE'
      const audio = isWav ? decodeWav(await file.arrayBuffer()) : await decodeFile(file)
      if (id !== run) return
      if (!audio.channelData.length || !audio.channelData[0].length) throw Error('This recording contains no decodable audio.')
      sampleRate = audio.sampleRate; duration = audio.channelData[0].length / sampleRate
      samples = new Float32Array(audio.channelData[0].length)
      for (const channel of audio.channelData) for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / audio.channelData.length
      peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0) || 1
      filename = file.name.replace(/\.[^.]+$/, '') || 'speech'
      $('filename').textContent = file.name + (audio.channelData.length > 1 ? ' · mixed to mono' : '')
      status('Detecting intonation…'); zone.hide(); $('editor').hidden = false
      worker = new Worker(new URL('./worker.bundle.js?v=' + version, import.meta.url), { type: 'module' })
      worker.onerror = () => { if (id === run) { lock(false); status('The audio worker could not run. Reload the page or choose another file.', true) } }
      worker.onmessage = ({ data }) => {
        if (id !== run) return
        if (data.type === 'error') { lock(false); status(data.message, true); return }
        if (data.type === 'loaded') {
          track = data.track; target = track.f0.slice(); anchors = [[0, 0], [duration, duration]]; view = [0, duration]; detected = traceOf(track.f0)
          // Blob thickness is relative to the loud end of the voice, not its one loudest frame.
          const voicedLevels = Array.from(track.level ?? [], (v, i) => track.f0[i] ? v : 0).filter(Boolean).sort((a, b) => a - b)
          loudest = voicedLevels[Math.floor(voicedLevels.length * .95)] || 1
          const voiced = track.f0.some(Boolean)
          fitPitch(); selected = [0, duration]; picked = false; settle()
          $('undo').disabled = true; readyAudio(data.bytes, true); update(); draw()
          $('render-state').textContent = 'Original audio · no edits'
          status(voiced ? 'Ready. Select notes or drag them.' : 'No reliable pitch detected. Try a longer voiced recording for intonation.')
        } else {
          readyAudio(data.bytes); $('render-state').textContent = `Rendered · ${data.duration.toFixed(2)} s`
          status(data.peak > 1 ? 'Rendered. Peaks exceed playback range; lower the level after export if you hear distortion.' : 'Rendered. Compare both versions or save the edited WAV.')
        }
      }
      worker.postMessage({ type: 'load', samples, sampleRate })
    } catch (e) { if (id === run) { lock(true); zone.show(); status(e.message || 'Could not read this recording.', true) } }
  }
  $('demo').onclick = async () => {
    const id = run
    $('demo').disabled = true
    try { const r = await fetch(new URL('./sample.wav', import.meta.url)); if (!r.ok) throw Error('Could not load the sample.'); const blob = await r.blob(); if (id === run) await load(new File([blob], 'speech-sample.wav', { type: 'audio/wav' })) }
    catch (e) { status(e.message, true) } finally { $('demo').disabled = false }
  }
  $('replace').onclick = () => { run++; release(); $('editor').hidden = true; zone.show(); status('Choose another recording.') }
  $('render').onclick = () => { if (!track || busy) return; lock(true); status('Rendering pitch and timing…'); worker.postMessage({ type: 'render', target, anchors, engine: $('engine').value }) }
  $('engine').onchange = () => { if (!track || busy) return; edited(); $('render-state').textContent = 'Engine changed · render to listen and save' }
  $('undo').onclick = () => act(() => { settle(); const last = history.pop(); if (last) { ({ target, anchors } = last); invalidate() } })
  $('reset').onclick = () => act(() => change(() => { target = track.f0.slice(); anchors = [[0, 0], [duration, duration]] }))
  $('pitch-reset').onclick = () => act(() => { const [a, b] = selection(); change(() => { target = restore(track, target, a, b) }) })
  for (const [id, [, label]] of Object.entries(SLIDERS)) {
    // Each move recomputes from the curve the correction started on, so the
    // sliders combine and return to it at neutral; Undo removes the correction.
    $(id).oninput = () => act(() => {
      $(id + '-value').textContent = label(+$(id).value)
      if (!session) session = { before: snapshot(), range: selection(), values: {} }
      const amounts = Object.fromEntries(Object.entries(SLIDERS).map(([key, [map]]) => [key, map(+$(key).value)]))
      let next
      try { next = correct(track, session.before.target, ...session.range, amounts); validatePitch(track, next, sampleRate) }
      catch (error) { $(id).value = session.values[id] ?? $(id).defaultValue; $(id + '-value').textContent = label(+$(id).value); throw error }
      session.values[id] = +$(id).value
      if (next.some((v, i) => v !== target[i])) {
        if (!session.stored) { remember(session.before); session.stored = true }
        target = next; edited()
      }
      update(); draw()
    })
    $(id).onchange = () => { if (session) { fitPitch(); draw() } }
  }
  // Consonant bursts keep their length; a burst spans about 30 ms from its onset.
  $('retime').onclick = () => act(() => { const [a, b] = selection(); const seconds = +$('duration').value; change(() => { anchors = retime(anchors, a, b, seconds, Array.from(track.onsets, t => [t - .005, t + .03])) }) })
  $('zoom').onclick = () => act(() => { view = selection(); draw() })
  $('zoom-out').onclick = () => { view = [0, duration]; draw() }
  function zoom(factor, center = picked ? clamp((selected[0] + selected[1]) / 2, view[0], view[1]) : (view[0] + view[1]) / 2) {
    const span = view[1] - view[0], width = clamp(span * factor, Math.min(.1, duration), duration)
    const start = clamp(center - (center - view[0]) / span * width, 0, duration - width)
    view = [start, start + width]; draw()
  }
  $('zoom-in').onclick = () => act(() => zoom(.5))
  $('zoom-less').onclick = () => act(() => zoom(2))
  const scroll = $('view-scroll')
  scroll.onscroll = () => {
    if (!track || busy) return
    const span = view[1] - view[0], scale = scroll.clientWidth / span
    if (Math.abs(scroll.scrollLeft - view[0] * scale) < 1) return
    const start = clamp(scroll.scrollLeft / scale, 0, duration - span)
    view = [start, start + span]; draw()
  }
  scroll.onkeydown = event => {
    if (!track || busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const span = view[1] - view[0]
    const start = event.key === 'Home' ? 0 : event.key === 'End' ? duration - span : clamp(view[0] + (event.key === 'ArrowLeft' ? -1 : 1) * span / 10, 0, duration - span)
    view = [start, start + span]; draw()
  }

  let plotWidth = 885
  const x = t => LEFT + (t - view[0]) / (view[1] - view[0]) * plotWidth
  const yNote = n => BOTTOM - (n - pitchRange[0]) / (pitchRange[1] - pitchRange[0]) * (BOTTOM - TOP)
  const perSemitone = () => (BOTTOM - TOP) / (pitchRange[1] - pitchRange[0])
  const node = (tag, attrs, parent = svg) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent.append(n); return n }
  // Pitch (semitones) and loudness between frames. At a run's edge frame,
  // rounding can land on the unvoiced side; the frame's own value holds there.
  const sampler = contour => {
    const hz = Float64Array.from(contour, (n, i) => track.f0[i] ? noteToHz(n) : 0)
    return t => { const value = pitchAt(track, hz, t); return value ? hzToNote(value) : contour[clamp(Math.round((t - track.times[0]) / track.hop), 0, contour.length - 1)] }
  }
  const levelAt = t => {
    const pos = clamp((t - track.times[0]) / track.hop, 0, track.f0.length - 1), i = Math.floor(pos), f = pos - i, level = track.level ?? []
    return (level[i] ?? 1) * (1 - f) + (level[Math.min(i + 1, level.length - 1)] ?? 1) * f
  }
  function draw() {
    if (!track) return
    plotWidth = Math.max(120, svg.clientWidth - 80)
    svg.setAttribute('viewBox', `0 0 ${plotWidth + 80} ${HEIGHT}`)
    const span = view[1] - view[0], full = span >= duration - 1e-8
    $('zoom-in').disabled = span <= Math.min(.1, duration) + 1e-8
    $('zoom-less').disabled = $('zoom-out').disabled = full
    scroll.setAttribute('aria-disabled', String(full)); scroll.tabIndex = full ? -1 : 0
    scroll.setAttribute('aria-valuemin', '0'); scroll.setAttribute('aria-valuemax', String(duration - span))
    scroll.setAttribute('aria-valuenow', String(view[0]))
    scroll.setAttribute('aria-valuetext', `${view[0].toFixed(2)} to ${view[1].toFixed(2)} seconds`)
    scroll.firstElementChild.style.width = `${scroll.clientWidth * duration / span}px`
    scroll.scrollLeft = view[0] / span * scroll.clientWidth
    svg.dataset.viewStart = view[0]; svg.dataset.viewEnd = view[1]
    for (const [i, id] of ['selection-start', 'selection-end'].entries()) {
      const handle = $(id)
      handle.hidden = !picked || selected[i] < view[0] || selected[i] > view[1]
      handle.style.left = `${x(selected[i])}px`
      handle.setAttribute('aria-valuemin', String(i ? selected[0] + Math.min(.02, duration) : 0))
      handle.setAttribute('aria-valuemax', String(i ? duration : selected[1] - Math.min(.02, duration)))
      handle.setAttribute('aria-valuenow', String(selected[i]))
      handle.setAttribute('aria-valuetext', `${selected[i].toFixed(2)} seconds`)
    }
    svg.replaceChildren()
    const right = LEFT + plotWidth, px = perSemitone()
    node('rect', { x: LEFT, y: TOP, width: plotWidth, height: BOTTOM - TOP }, node('clipPath', { id: 'pitch-clip' }))
    // Piano roll: black-key rows shaded, C lines ruled; names as far as they fit.
    const named = n => px >= 13 || (px * 5 >= 13 ? [0, 7].includes((n % 12 + 12) % 12) : n % 12 === 0)
    for (let n = Math.ceil(pitchRange[0]); n <= pitchRange[1]; n++) {
      if ([1, 3, 6, 8, 10].includes((n % 12 + 12) % 12)) node('rect', { x: LEFT, y: Math.max(TOP, yNote(n + .5)), width: plotWidth, height: Math.max(0, Math.min(BOTTOM, yNote(n - .5)) - Math.max(TOP, yNote(n + .5))), class: 'key' })
      if (n % 12 === 0) node('path', { d: `M${LEFT} ${yNote(n - .5)}H${right}`, class: 'grid' })
      if (named(n)) node('text', { x: LEFT - 6, y: yNote(n) + 4, 'text-anchor': 'end', class: n % 12 ? '' : 'octave' }).textContent = noteName(n)
    }
    const ticks = plotWidth < 300 ? 2 : plotWidth < 400 ? 3 : 5
    for (let i = 0; i <= ticks; i++) { const t = view[0] + span * i / ticks; node('text', { x: x(t), y: 276, 'text-anchor': i === ticks ? 'end' : 'start' }).textContent = t.toFixed(2) + ' s' }
    if (picked) {
      const a = clamp(selected[0], view[0], view[1]), b = clamp(selected[1], view[0], view[1])
      node('rect', { x: x(a), y: TOP, width: Math.max(0, x(b) - x(a)), height: LANE[1] - TOP, class: 'selection' })
      for (const t of selected) if (t >= view[0] && t <= view[1]) node('path', { d: `M${x(t)} ${TOP}V${LANE[1]}`, class: 'selection-edge' })
    }
    let wave = ''
    const columns = Math.ceil(plotWidth), middle = (LANE[0] + LANE[1]) / 2, scale = (LANE[1] - LANE[0]) / 2 / peak
    for (let i = 0; i < columns; i++) {
      const start = Math.floor((view[0] + span * i / columns) * sampleRate), end = Math.min(samples.length, Math.ceil((view[0] + span * (i + 1) / columns) * sampleRate))
      let min = 0, max = 0
      for (let j = start; j < end; j++) { min = Math.min(min, samples[j]); max = Math.max(max, samples[j]) }
      wave += `M${LEFT + i * plotWidth / columns} ${middle - max * scale}v${Math.max(0.5, (max - min) * scale)}h1v${-Math.max(0.5, (max - min) * scale)}z`
    }
    node('path', { d: wave, class: 'wave' })
    // Notes as blobs around the edited pitch, as thick as they are loud (30 dB
    // below the voice's 95th-percentile level is thinnest), tapering at their ends. The curves are drawn from the
    // trusted contour, as edits and rendering treat it.
    const plot = node('g', { 'clip-path': 'url(#pitch-clip)' }), { edit, pitch, centre } = trace(), half = clamp(px * .7, 5, 9), some = picked && (selected[0] > 0 || selected[1] < duration)
    for (const [k, [a, b]] of notes().entries()) {
      const t0 = track.times[a], t1 = track.times[b]
      if (t1 < view[0] || t0 > view[1]) continue
      const upper = [], lower = [], from = Math.max(t0, view[0]), to = Math.min(t1, view[1]), count = Math.max(1, Math.ceil((x(to) - x(from)) / 1.5))
      for (let j = 0; j <= count; j++) {
        const t = from + (to - from) * j / count, loud = clamp(1 + 20 * Math.log10(levelAt(t) / loudest + 1e-9) / 30, .15, 1)
        const h = half * loud * Math.sqrt(clamp(Math.min(t - t0 + track.hop / 2, t1 - t + track.hop / 2) / .015, 0, 1)), yy = yNote(pitch(t))
        upper.push(`${x(t).toFixed(1)} ${(yy - h).toFixed(1)}`); lower.push(`${x(t).toFixed(1)} ${(yy + h).toFixed(1)}`)
      }
      node('path', { d: `M${upper.join('L')}L${lower.reverse().join('L')}Z`, class: `note${inSelection(k) ? ' on' : some ? ' dim' : ''}${centre[k] == null ? ' noise' : ''}${k === hover ? ' hover' : ''}`, 'data-center': centre[k] ?? '' }, plot)
      if (centre[k] != null) node('path', { d: `M${x(from).toFixed(1)} ${yNote(centre[k]).toFixed(1)}H${x(to).toFixed(1)}`, class: 'center' }, plot)
    }
    for (const { edit: values, pitch: at } of [detected, trace()]) {
      const cls = values === edit ? 'target' : 'detected'
      let d = '', previous = false
      for (let i = 0; i < values.length; i++) {
        if (!track.f0[i] || track.times[i] < view[0] || track.times[i] > view[1]) { previous = false; continue }
        if (previous) for (let part = 1; part < 4; part++) {
          const time = track.times[i - 1] + (track.times[i] - track.times[i - 1]) * part / 4
          d += `L${x(time).toFixed(2)} ${yNote(at(time)).toFixed(2)}`
        }
        d += `${previous ? 'L' : 'M'}${x(track.times[i]).toFixed(2)} ${yNote(values[i]).toFixed(2)}`; previous = true
      }
      node('path', { d, class: cls, fill: 'none' }, plot)
    }
    node('path', { id: 'playhead', class: 'playhead', d: '' })
  }
  function position(event) {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    const q = p.matrixTransform(svg.getScreenCTM().inverse())
    return { time: clamp(view[0] + (q.x - LEFT) / plotWidth * (view[1] - view[0]), view[0], view[1]), yy: q.y }
  }
  // The note whose blob, centre or curve passes within reach of the pointer.
  function noteAt({ time, yy }) {
    if (yy < TOP - 8 || yy > BOTTOM + 8) return -1
    const { pitch, centre } = trace(), reach = Math.max(12, clamp(perSemitone() * .7, 5, 9) + 6)
    let best = -1, distance = reach
    for (const [k, [a, b]] of notes().entries()) {
      if (time < track.times[a] - track.hop / 2 || time > track.times[b] + track.hop / 2) continue
      const d = Math.min(Math.abs(yNote(pitch(clamp(time, track.times[a], track.times[b]))) - yy), centre[k] == null ? Infinity : Math.abs(yNote(centre[k]) - yy))
      if (d <= distance) { best = k; distance = d }
    }
    return best
  }
  function edge(index, time) {
    const min = Math.min(.02, duration), next = selected.slice()
    next[index] = index ? clamp(time, selected[0] + min, duration) : clamp(time, 0, selected[1] - min)
    select(next); update(); draw()
  }
  function down(event, boundary = -1) {
    if (!track || busy || event.button !== 0 || pointers.size >= 2) return
    document.querySelector('.plot-help').open = false
    event.preventDefault()
    const owner = event.currentTarget
    owner.focus(); owner.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (pointers.size === 2) {
      if (drag) { target = drag.before.target; selected = drag.selected; picked = drag.picked }
      drag = null
      const [a, b] = [...pointers.values()], middle = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }
      pinch = { distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), view: view.slice(), time: position(middle).time }
      update(); draw(); return
    }
    const point = position(event), note = boundary < 0 ? noteAt(point) : -1
    drag = { id: event.pointerId, ...point, before: snapshot(), selected: selected.slice(), picked, boundary, note, moved: false }
    if (note >= 0) {
      // A note inside the selection carries the selection; any other note is
      // selected (Shift adds it) and moves alone. It snaps by its own centre.
      const range = span(note), [first, last] = notes()[note]
      drag.carry = inSelection(note) && !event.shiftKey
      if (event.shiftKey && picked) select([Math.min(selected[0], range[0]), Math.max(selected[1], range[1])])
      else if (!drag.carry) select(range)
      const pieces = notesIn(track, ...selected)
      drag.middle = (track.times[first] + track.times[last]) / 2
      drag.center = centers(track, pieces, trace().edit)[pieces.findIndex(([a, b]) => a <= last && b >= first)]
      settle()
    }
    update(); draw()
  }
  function move(event) {
    if (!pointers.has(event.pointerId)) {
      if (!track || busy || event.pointerType === 'touch') return
      const note = noteAt(position(event))
      svg.style.cursor = note >= 0 ? 'grab' : ''
      if (note !== hover) { hover = note; update(); draw() }
      return
    }
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], middle = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }
      const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))
      const span = clamp((pinch.view[1] - pinch.view[0]) * pinch.distance / distance, Math.min(.1, duration), duration)
      const fraction = (position(middle).time - view[0]) / (view[1] - view[0])
      const start = clamp(pinch.time - fraction * span, 0, duration - span)
      view = [start, start + span]; draw(); return
    }
    if (!drag || event.pointerId !== drag.id) return
    const { time, yy } = position(event)
    if (!drag.moved && Math.abs(yy - drag.yy) < 2 && Math.abs(time - drag.time) / (view[1] - view[0]) < .002) return
    drag.moved = true
    if (drag.boundary >= 0) edge(drag.boundary, time)
    else if (drag.note >= 0) {
      svg.style.cursor = 'grabbing'
      const raw = (drag.yy - yy) / perSemitone(), free = event.altKey || drag.center == null, goal = free ? null : Math.round(drag.center + raw)
      if (free || goal !== drag.goal) try {
        const [a, b] = selection(), next = free ? correct(track, drag.before.target, a, b, { shift: raw }) : shiftTo(track, drag.before.target, a, b, drag.middle, goal)
        validatePitch(track, next, sampleRate); target = next; drag.goal = goal
      } catch (error) { status(error.message, true) }
    }
    else {
      const start = clamp(Math.min(time, drag.time), 0, Math.max(0, duration - .02))
      select([start, Math.min(duration, Math.max(start + .02, time, drag.time))])
    }
    update(); draw()
  }
  function up(event) {
    if (!pointers.has(event.pointerId)) return
    if (event.type === 'pointercancel' && drag) { target = drag.before.target; selected = drag.selected; picked = drag.picked; update(); draw() }
    else if (drag?.moved && drag.note >= 0 && target.some((v, i) => v !== drag.before.target[i])) { remember(drag.before); invalidate(); status('Edit ready. Render to compare with the original.') }
    // A click on a selected note selects it alone; on empty plot, nothing.
    else if (drag && !drag.moved && drag.boundary < 0 && (drag.note < 0 || drag.carry)) { select(drag.note < 0 ? [0, duration] : span(drag.note), drag.note >= 0); update(); draw() }
    pointers.delete(event.pointerId); drag = null; pinch = null; svg.style.cursor = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  for (const [i, element] of [svg, $('selection-start'), $('selection-end')].entries()) {
    element.onpointerdown = event => down(event, i - 1)
    element.onpointermove = move; element.onpointerup = element.onpointercancel = up
    element.onlostpointercapture = event => { if (pointers.has(event.pointerId)) up({ ...event, pointerId: event.pointerId, currentTarget: element, type: 'pointercancel' }) }
  }
  svg.onpointerleave = () => { if (track && hover >= 0 && !drag) { hover = -1; update(); draw() } }
  for (const [i, id] of ['selection-start', 'selection-end'].entries()) $(id).onkeydown = event => {
    if (!track || busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    edge(i, event.key === 'Home' ? 0 : event.key === 'End' ? duration : selected[i] + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01))
  }
  document.querySelector('.plot-help').onkeydown = event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus() } }
  // Double-click a note to snap its selection to semitones; the background to select all.
  svg.ondblclick = event => act(() => {
    if (noteAt(position(event)) < 0) { select([0, duration]); update(); draw(); return }
    const [a, b] = selection(); change(() => { target = correct(track, target, a, b, { snap: 1 }) })
  })
  // Safari trackpads also expose cumulative GestureEvent scales. Touch pointer
  // pinches own the gesture when present, so the two paths never apply it twice.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) svg.addEventListener(type, event => {
    if (!track || busy) return
    event.preventDefault()
    if (type === 'gestureend' || pointers.size >= 2) { gestureScale = 0; return }
    if (type === 'gesturestart') { gestureScale = 1; return }
    if (!gestureScale || !Number.isFinite(event.scale) || event.scale <= 0) return
    zoom(gestureScale / event.scale, Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ? position(event).time : (view[0] + view[1]) / 2)
    gestureScale = event.scale
  }, { passive: false })
  svg.addEventListener('wheel', event => {
    if (!track || busy) return
    if (gestureScale && event.ctrlKey) { event.preventDefault(); return }
    if (event.ctrlKey || event.altKey) { event.preventDefault(); zoom(Math.exp(clamp(event.deltaY, -100, 100) * .005), position(event).time) }
    else if (event.deltaX || event.shiftKey) {
      event.preventDefault()
      const span = view[1] - view[0], start = clamp(view[0] + (event.deltaX || event.deltaY) / plotWidth * span, 0, duration - span)
      view = [start, start + span]; draw()
    }
  }, { passive: false })
  svg.onkeydown = event => {
    if (!track || busy) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); select([0, duration]); update(); draw(); return }
    if (event.key === 'Escape') { select([0, duration], false); update(); draw(); return }
    if (['+', '=', '-', '0', 'f', 'F'].includes(event.key)) {
      event.preventDefault()
      if (event.key === '0') { view = [0, duration]; draw() }
      else if (event.key.toLowerCase() === 'f') act(() => { view = selection(); draw() })
      else zoom(event.key === '-' ? 2 : .5)
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    act(() => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const [a, b] = selection()
        change(() => { target = correct(track, target, a, b, { shift: (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 1 : .1) }) })
        return
      }
      // Step to the previous or next note and keep it in view.
      const all = notes(), whole = selected[0] <= 0 && selected[1] >= duration
      const from = picked && !whole ? (selected[0] + selected[1]) / 2 : event.key === 'ArrowRight' ? -Infinity : Infinity
      const middle = ([a, b]) => (track.times[a] + track.times[b]) / 2
      const k = event.key === 'ArrowRight' ? all.findIndex(n => middle(n) > from + 1e-9) : all.findLastIndex(n => middle(n) < from - 1e-9)
      if (k < 0) return
      select(span(k))
      if (selected[0] < view[0] || selected[1] > view[1]) { const width = view[1] - view[0], start = clamp((selected[0] + selected[1] - width) / 2, 0, duration - width); view = [start, start + width] }
      update(); draw()
    })
  }
  for (const id of ['original', 'edited']) $(id).onplay = () => {
    $(id === 'original' ? 'edited' : 'original').pause(); cancelAnimationFrame(animation)
    const tick = () => {
      if (!track) return
      const player = $(id), time = id === 'original' ? player.currentTime : mapTime(anchors.map(([a, b]) => [b, a]), player.currentTime)
      $('playhead')?.setAttribute('d', time >= view[0] && time <= view[1] ? `M${x(time)} ${TOP}V${LANE[1]}` : '')
      if (!player.paused) animation = requestAnimationFrame(tick)
    }
    tick()
  }
  window.addEventListener('pagehide', release)
  new ResizeObserver(draw).observe(svg)
}
