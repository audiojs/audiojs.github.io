import { $, dropzone, decodeFile } from '../util.js'
import { clamp, hzToNote, noteToHz, mapTime, retime, transform, movePoint } from './model.js'
import { decodeWav } from './dsp.js'

export function startEditor(version) {
  let worker, run = 0, track, samples, sampleRate, target, anchors, history = [], point = -1
  let duration = 0, view = [0, 1], pitchRange = [hzToNote(60), hzToNote(600)], busy = false, dirty = false, drag
  let originalURL, editedURL, filename = 'speech', animation
  const svg = $('curve'), ns = 'http://www.w3.org/2000/svg'
  const zone = dropzone($('drop'), $('file'), load)
  const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('err', error) }
  const selection = () => {
    const a = +$('start').value, b = +$('end').value
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > duration + 1e-6 || b - a < 0.02) throw Error('Select at least 0.02 seconds within the recording.')
    return [a, Math.min(duration, b)]
  }
  const snapshot = () => ({ target: target.slice(), anchors: anchors.map(p => p.slice()) })
  function remember(state = snapshot()) { history.push(state); if (history.length > 50) history.shift() }
  function lock(value) { busy = value; $('controls').disabled = value || !track; $('render').disabled = value || !dirty }
  function invalidate() {
    dirty = true; $('render').disabled = false; $('undo').disabled = !history.length
    $('edited').pause(); $('edited').removeAttribute('src'); $('edited').load()
    $('save').removeAttribute('href'); $('save').setAttribute('aria-disabled', 'true')
    $('render-state').textContent = 'Edits changed · render to listen and save'
    if (editedURL && editedURL !== originalURL) URL.revokeObjectURL(editedURL)
    editedURL = null
    update(); draw()
  }
  function update() {
    $('length').textContent = `${duration.toFixed(2)} s original → ${anchors.at(-1)[1].toFixed(2)} s edited`
    try { const [a, b] = selection(); const seconds = mapTime(anchors, b) - mapTime(anchors, a); $('duration').value = seconds.toFixed(3); $('timing').textContent = `Selection: ${(b - a).toFixed(2)} s original → ${seconds.toFixed(2)} s edited` } catch {}
    const valid = point >= 0 && !!track.f0[point]
    $('point-hz').disabled = $('set-point').disabled = !valid
    $('point-info').textContent = valid ? `${track.times[point].toFixed(2)} s · ${target[point].toFixed(1)} Hz · confidence ${Math.round(track.confidence[point] * 100)}%` : 'No point selected'
    $('point-hz').value = valid ? target[point].toFixed(1) : ''
  }
  function act(fn) {
    if (!track || busy) return
    try { fn(); status(dirty ? 'Edit ready. Render to compare with the original.' : 'Ready. Select a phrase or drag its pitch curve.') } catch (e) { status(e.message, true) }
  }
  function change(fn) { const before = snapshot(); fn(); remember(before); invalidate() }
  function release() {
    worker?.terminate(); worker = null; cancelAnimationFrame(animation)
    for (const id of ['original', 'edited']) { $(id).pause(); $(id).removeAttribute('src'); $(id).load() }
    for (const url of new Set([originalURL, editedURL])) if (url) URL.revokeObjectURL(url)
    originalURL = editedURL = null; track = samples = target = null; history = []; point = -1; drag = null; dirty = false
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
      filename = file.name.replace(/\.[^.]+$/, '') || 'speech'
      $('filename').textContent = file.name + (audio.channelData.length > 1 ? ' · mixed to mono' : '')
      status('Detecting intonation…'); zone.hide(); $('editor').hidden = false
      worker = new Worker(new URL('./worker.bundle.js?v=' + version, import.meta.url), { type: 'module' })
      worker.onerror = () => { if (id === run) { lock(false); status('The audio worker could not run. Reload the page or choose another file.', true) } }
      worker.onmessage = ({ data }) => {
        if (id !== run) return
        if (data.type === 'error') { lock(false); status(data.message, true); return }
        if (data.type === 'loaded') {
          track = data.track; target = track.f0.slice(); anchors = [[0, 0], [duration, duration]]; view = [0, duration]
          let low = Infinity, high = -Infinity
          for (const hz of track.f0) if (hz) { const note = hzToNote(hz); low = Math.min(low, note); high = Math.max(high, note) }
          const voiced = Number.isFinite(low)
          pitchRange = voiced ? [low - 13, high + 13] : [hzToNote(60), hzToNote(600)]
          $('start').value = 0; $('end').value = duration; $('start').max = $('end').max = duration
          $('undo').disabled = true; readyAudio(data.bytes, true); update(); draw()
          $('render-state').textContent = 'Original audio · no edits'
          status(voiced ? 'Ready. Select a phrase or drag its pitch curve.' : 'No reliable pitch detected. Try a longer voiced recording for intonation.')
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
  $('render').onclick = () => { if (!track || busy) return; lock(true); status('Rendering pitch and timing…'); worker.postMessage({ type: 'render', target, anchors }) }
  $('undo').onclick = () => act(() => { const last = history.pop(); if (last) { ({ target, anchors } = last); invalidate() } })
  $('reset').onclick = () => act(() => change(() => { target = track.f0.slice(); anchors = [[0, 0], [duration, duration]] }))
  for (const [id, kind, amount] of [['shift', 'shift', () => +$('semitones').value], ['flatten', 'flatten', () => 0.5], ['rise', 'ramp', () => 2], ['fall', 'ramp', () => -2], ['pitch-reset', 'reset', () => 0]])
    $(id).onclick = () => act(() => { const value = amount(); if (!Number.isFinite(value) || Math.abs(value) > 12) throw Error('Use a pitch change between −12 and +12 semitones.'); const [a, b] = selection(); change(() => { target = transform(track, target, a, b, kind, value) }) })
  $('set-point').onclick = () => act(() => change(() => { target = movePoint(track, target, point, +$('point-hz').value) }))
  $('retime').onclick = () => act(() => { const [a, b] = selection(); const seconds = +$('duration').value; change(() => { anchors = retime(anchors, a, b, seconds) }) })
  for (const id of ['start', 'end']) $(id).onchange = () => act(() => { selection(); update(); draw() })
  $('select-all').onclick = () => { $('start').value = 0; $('end').value = duration; update(); draw() }
  $('zoom').onclick = () => act(() => { view = selection(); draw() })
  $('zoom-out').onclick = () => { view = [0, duration]; draw() }

  let plotWidth = 885
  const x = t => 55 + (t - view[0]) / (view[1] - view[0]) * plotWidth
  const y = hz => 270 - (hzToNote(hz) - pitchRange[0]) / (pitchRange[1] - pitchRange[0]) * 250
  const node = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); return n }
  function draw() {
    if (!track) return
    plotWidth = Math.max(120, svg.clientWidth - 75)
    svg.setAttribute('viewBox', `0 0 ${plotWidth + 75} 300`)
    svg.replaceChildren()
    for (let n = Math.ceil(pitchRange[0] / 6) * 6; n <= pitchRange[1]; n += 6) { const yy = y(noteToHz(n)); node('path', { d: `M55 ${yy}H${55 + plotWidth}`, class: 'grid' }); node('text', { x: 4, y: yy + 4 }).textContent = Math.round(noteToHz(n)) + ' Hz' }
    const ticks = plotWidth < 400 ? 3 : 5
    for (let i = 0; i <= ticks; i++) { const t = view[0] + (view[1] - view[0]) * i / ticks; node('text', { x: x(t), y: 293, 'text-anchor': i === ticks ? 'end' : 'start' }).textContent = t.toFixed(2) + ' s' }
    const a = clamp(+$('start').value, view[0], view[1]), b = clamp(+$('end').value, view[0], view[1])
    node('rect', { x: x(a), y: 0, width: Math.max(0, x(b) - x(a)), height: 275, class: 'selection' })
    let wave = ''
    for (let i = 0; i < 600; i++) {
      const start = Math.floor((view[0] + (view[1] - view[0]) * i / 600) * sampleRate), end = Math.min(samples.length, Math.ceil((view[0] + (view[1] - view[0]) * (i + 1) / 600) * sampleRate))
      let min = 0, max = 0
      for (let j = start; j < end; j++) { min = Math.min(min, samples[j]); max = Math.max(max, samples[j]) }
      wave += `M${55 + i * plotWidth / 600} ${145 - max * 110}v${Math.max(0.5, (max - min) * 110)}h1v${-Math.max(0.5, (max - min) * 110)}z`
    }
    node('path', { d: wave, class: 'wave' })
    for (const [values, cls] of [[track.f0, 'detected'], [target, 'target']]) {
      let d = '', previous = false
      for (let i = 0; i < values.length; i++) {
        if (!values[i] || track.times[i] < view[0] || track.times[i] > view[1]) { previous = false; continue }
        d += `${previous ? 'L' : 'M'}${x(track.times[i]).toFixed(2)} ${y(values[i]).toFixed(2)}`; previous = true
      }
      node('path', { d, class: cls, fill: 'none' })
    }
    if (point >= 0 && track.times[point] >= view[0] && track.times[point] <= view[1]) node('circle', { cx: x(track.times[point]), cy: y(target[point]), r: 6, class: 'point' })
    node('path', { id: 'playhead', class: 'playhead', d: '' })
  }
  function position(event) {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    const q = p.matrixTransform(svg.getScreenCTM().inverse())
    return { time: clamp(view[0] + (q.x - 55) / plotWidth * (view[1] - view[0]), view[0], view[1]), yy: q.y }
  }
  svg.onpointerdown = event => {
    if (!track || busy || event.button !== 0) return
    svg.focus(); const { time, yy } = position(event)
    let nearest = -1, distance = Infinity
    for (let i = 0; i < target.length; i++) if (target[i] && Math.abs(track.times[i] - time) < distance) { nearest = i; distance = Math.abs(track.times[i] - time) }
    const onCurve = nearest >= 0 && distance / (view[1] - view[0]) < 0.025 && Math.abs(y(target[nearest]) - yy) < 40
    drag = { id: event.pointerId, time, yy, before: snapshot(), index: onCurve ? nearest : -1, moved: false }
    point = onCurve ? nearest : -1; svg.setPointerCapture(event.pointerId); update(); draw()
  }
  svg.onpointermove = event => {
    if (!drag || event.pointerId !== drag.id) return
    const { time, yy } = position(event)
    if (Math.abs(yy - drag.yy) < 2 && Math.abs(time - drag.time) / (view[1] - view[0]) < 0.002) return
    drag.moved = true
    if (drag.index >= 0) target = movePoint(track, drag.before.target, drag.index, noteToHz(hzToNote(drag.before.target[drag.index]) + (drag.yy - yy) / 250 * (pitchRange[1] - pitchRange[0])))
    else { $('start').value = Math.min(duration, +Math.min(time, drag.time).toFixed(3)); $('end').value = Math.min(duration, +Math.max(time, drag.time).toFixed(3)) }
    update(); draw()
  }
  svg.onpointerup = event => {
    if (!drag || event.pointerId !== drag.id) return
    if (drag.moved && drag.index >= 0) { remember(drag.before); invalidate() }
    svg.releasePointerCapture(event.pointerId); drag = null
  }
  svg.onpointercancel = () => { if (drag) { target = drag.before.target; drag = null; update(); draw() } }
  svg.onkeydown = event => {
    if (!track || busy || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    act(() => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || point < 0) {
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        let i = point < 0 ? (direction > 0 ? 0 : target.length - 1) : point + direction
        for (; i >= 0 && i < target.length; i += direction) if (target[i] && track.times[i] >= view[0] && track.times[i] <= view[1]) { point = i; break }
        update(); draw()
      } else change(() => { target = movePoint(track, target, point, noteToHz(hzToNote(target[point]) + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 1 : 0.1))) })
    })
  }
  for (const id of ['original', 'edited']) $(id).onplay = () => {
    $(id === 'original' ? 'edited' : 'original').pause(); cancelAnimationFrame(animation)
    const tick = () => {
      if (!track) return
      const player = $(id), time = id === 'original' ? player.currentTime : mapTime(anchors.map(([a, b]) => [b, a]), player.currentTime)
      $('playhead')?.setAttribute('d', time >= view[0] && time <= view[1] ? `M${x(time)} 0V275` : '')
      if (!player.paused) animation = requestAnimationFrame(tick)
    }
    tick()
  }
  window.addEventListener('pagehide', release)
  new ResizeObserver(draw).observe(svg)
}
