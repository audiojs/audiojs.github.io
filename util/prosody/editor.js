import { $, dropzone, decodeFile } from '../util.js'
import { clamp, hzToNote, noteToHz, mapTime, retime, transform, movePoint, pitchAt, validatePitch } from './model.js'
import { decodeWav } from './dsp.js'

export function startEditor(version) {
  let worker, run = 0, track, samples, sampleRate, target, anchors, history = [], point = -1
  let duration = 0, view = [0, 1], pitchRange = [hzToNote(60), hzToNote(600)], busy = false, dirty = false, drag, pinch, selected = [0, 1]
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
  function invalidate() {
    dirty = true; $('render').disabled = false; $('undo').disabled = !history.length
    $('edited').pause(); $('edited').removeAttribute('src'); $('edited').load()
    $('save').removeAttribute('href'); $('save').setAttribute('aria-disabled', 'true')
    $('render-state').textContent = 'Edits changed · render to listen and save'
    if (editedURL && editedURL !== originalURL) URL.revokeObjectURL(editedURL)
    editedURL = null
    fitPitch(); update(); draw()
  }
  function fitPitch() {
    let low = Infinity, high = -Infinity
    for (let i = 0; i < target.length; i++) if (track.f0[i]) {
      low = Math.min(low, hzToNote(track.f0[i]) - 13, hzToNote(target[i]) - 3)
      high = Math.max(high, hzToNote(track.f0[i]) + 13, hzToNote(target[i]) + 3)
    }
    pitchRange = Number.isFinite(low) ? [low, high] : [hzToNote(60), hzToNote(600)]
  }
  function update() {
    try { const [a, b] = selection(); const seconds = mapTime(anchors, b) - mapTime(anchors, a); $('duration').value = seconds.toFixed(3) } catch {}
    const valid = point >= 0 && !!track.f0[point]
    $('point-info').textContent = valid ? `${track.times[point].toFixed(2)} s · ${target[point].toFixed(1)} Hz` : selected[0] > 0 || selected[1] < duration ? `${selected[0].toFixed(2)}–${selected[1].toFixed(2)} s` : ''
  }
  function act(fn) {
    if (!track || busy) return
    try { fn(); status(dirty ? 'Edit ready. Render to compare with the original.' : 'Ready. Select a phrase or drag its pitch curve.') } catch (e) { status(e.message, true) }
  }
  function change(fn) {
    const before = snapshot()
    try { fn(); validatePitch(track, target, sampleRate) }
    catch (error) { ({ target, anchors } = before); throw error }
    if (target.every((v, i) => v === before.target[i]) && anchors.length === before.anchors.length && anchors.every((p, i) => p.every((v, j) => v === before.anchors[i][j]))) return
    remember(before); invalidate()
  }
  function release() {
    worker?.terminate(); worker = null; cancelAnimationFrame(animation)
    for (const id of ['original', 'edited']) { $(id).pause(); $(id).removeAttribute('src'); $(id).load() }
    for (const url of new Set([originalURL, editedURL])) if (url) URL.revokeObjectURL(url)
    originalURL = editedURL = null; track = samples = target = null; history = []; point = -1; drag = pinch = null; pointers.clear(); gestureScale = 0; dirty = false
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
          const voiced = track.f0.some(Boolean)
          fitPitch()
          selected = [0, duration]; $('variation').value = 100; $('variation-value').textContent = '100%'; $('semitones').value = 0; $('smoothing').value = 60
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
  for (const [id, kind, amount] of [['shift', 'shift', () => +$('semitones').value], ['vary', 'variation', () => +$('variation').value / 100], ['rise', 'ramp', () => 2], ['fall', 'ramp', () => -2], ['pitch-reset', 'reset', () => 0]])
    $(id).onclick = () => act(() => { const value = amount(); const [a, b] = selection(); change(() => { target = transform(track, target, a, b, kind, value, kind === 'variation' ? +$('smoothing').value / 1000 : 0) }) })
  $('variation').oninput = () => { $('variation-value').textContent = $('variation').value + '%' }
  $('retime').onclick = () => act(() => { const [a, b] = selection(); const seconds = +$('duration').value; change(() => { anchors = retime(anchors, a, b, seconds) }) })
  $('zoom').onclick = () => act(() => { view = selection(); draw() })
  $('zoom-out').onclick = () => { view = [0, duration]; draw() }
  function zoom(factor, center = point >= 0 && track.times[point] >= view[0] && track.times[point] <= view[1] ? track.times[point] : (view[0] + view[1]) / 2) {
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
  const x = t => 55 + (t - view[0]) / (view[1] - view[0]) * plotWidth
  const y = hz => 270 - (hzToNote(hz) - pitchRange[0]) / (pitchRange[1] - pitchRange[0]) * 205
  const node = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); return n }
  function draw() {
    if (!track) return
    plotWidth = Math.max(120, svg.clientWidth - 80)
    svg.setAttribute('viewBox', `0 0 ${plotWidth + 80} 320`)
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
      handle.hidden = selected[i] < view[0] || selected[i] > view[1]
      handle.style.left = `${x(selected[i])}px`
      handle.setAttribute('aria-valuemin', String(i ? selected[0] + Math.min(.02, duration) : 0))
      handle.setAttribute('aria-valuemax', String(i ? duration : selected[1] - Math.min(.02, duration)))
      handle.setAttribute('aria-valuenow', String(selected[i]))
      handle.setAttribute('aria-valuetext', `${selected[i].toFixed(2)} seconds`)
    }
    svg.replaceChildren()
    for (let n = Math.ceil(pitchRange[0] / 6) * 6; n <= pitchRange[1]; n += 6) { const yy = y(noteToHz(n)); node('path', { d: `M55 ${yy}H${55 + plotWidth}`, class: 'grid' }); node('text', { x: 4, y: yy + 4 }).textContent = Math.round(noteToHz(n)) + ' Hz' }
    const ticks = plotWidth < 400 ? 3 : 5
    for (let i = 0; i <= ticks; i++) { const t = view[0] + (view[1] - view[0]) * i / ticks; node('text', { x: x(t), y: 313, 'text-anchor': i === ticks ? 'end' : 'start' }).textContent = t.toFixed(2) + ' s' }
    const a = clamp(selected[0], view[0], view[1]), b = clamp(selected[1], view[0], view[1])
    node('rect', { x: x(a), y: 58, width: Math.max(0, x(b) - x(a)), height: 220, class: 'selection' })
    let wave = ''
    const columns = Math.ceil(plotWidth)
    for (let i = 0; i < columns; i++) {
      const start = Math.floor((view[0] + span * i / columns) * sampleRate), end = Math.min(samples.length, Math.ceil((view[0] + span * (i + 1) / columns) * sampleRate))
      let min = 0, max = 0
      for (let j = start; j < end; j++) { min = Math.min(min, samples[j]); max = Math.max(max, samples[j]) }
      wave += `M${55 + i * plotWidth / columns} ${170 - max * 90}v${Math.max(0.5, (max - min) * 90)}h1v${-Math.max(0.5, (max - min) * 90)}z`
    }
    node('path', { d: wave, class: 'wave' })
    for (const [values, cls] of [[track.f0, 'detected'], [target, 'target']]) {
      let d = '', previous = false
      for (let i = 0; i < values.length; i++) {
        if (!values[i] || track.times[i] < view[0] || track.times[i] > view[1]) { previous = false; continue }
        if (previous) for (let part = 1; part < 4; part++) {
          const time = track.times[i - 1] + (track.times[i] - track.times[i - 1]) * part / 4
          d += `L${x(time).toFixed(2)} ${y(pitchAt(track, values, time)).toFixed(2)}`
        }
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
  function edge(index, time) {
    const min = Math.min(.02, duration)
    selected[index] = index ? clamp(time, selected[0] + min, duration) : clamp(time, 0, selected[1] - min)
    update(); draw()
  }
  function down(event, boundary = -1) {
    if (!track || busy || event.button !== 0 || pointers.size >= 2) return
    document.querySelector('.plot-help').open = false
    event.preventDefault()
    const owner = event.currentTarget
    owner.focus(); owner.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (pointers.size === 2) {
      if (drag) { target = drag.before.target; selected = drag.selected }
      drag = null
      const [a, b] = [...pointers.values()], middle = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }
      pinch = { distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), view: view.slice(), time: position(middle).time }
      update(); draw(); return
    }
    const { time, yy } = position(event)
    let nearest = -1, distance = Infinity
    for (let i = 0; i < target.length; i++) if (target[i] && track.times[i] >= view[0] && track.times[i] <= view[1] && Math.abs(track.times[i] - time) < distance) { nearest = i; distance = Math.abs(track.times[i] - time) }
    const onCurve = boundary < 0 && nearest >= 0 && distance / (view[1] - view[0]) < .025 && Math.abs(y(target[nearest]) - yy) < 22
    drag = { id: event.pointerId, time, yy, before: snapshot(), selected: selected.slice(), boundary, index: onCurve ? nearest : -1, moved: false }
    point = onCurve ? nearest : -1; update(); draw()
  }
  function move(event) {
    if (!pointers.has(event.pointerId)) return
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
    else if (drag.index >= 0) {
      try {
        const next = movePoint(track, drag.before.target, drag.index, noteToHz(hzToNote(drag.before.target[drag.index]) + (drag.yy - yy) / 205 * (pitchRange[1] - pitchRange[0])))
        validatePitch(track, next, sampleRate); target = next
      } catch (error) { status(error.message, true) }
    }
    else {
      const start = clamp(Math.min(time, drag.time), 0, Math.max(0, duration - .02))
      selected = [start, Math.min(duration, Math.max(start + .02, time, drag.time))]
    }
    update(); draw()
  }
  function up(event) {
    if (!pointers.has(event.pointerId)) return
    if (event.type === 'pointercancel' && drag) { target = drag.before.target; selected = drag.selected; update(); draw() }
    else if (drag?.moved && drag.index >= 0) { remember(drag.before); invalidate() }
    pointers.delete(event.pointerId); drag = null; pinch = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  for (const [i, element] of [svg, $('selection-start'), $('selection-end')].entries()) {
    element.onpointerdown = event => down(event, i - 1)
    element.onpointermove = move; element.onpointerup = element.onpointercancel = up
    element.onlostpointercapture = event => { if (pointers.has(event.pointerId)) up({ ...event, pointerId: event.pointerId, currentTarget: element, type: 'pointercancel' }) }
  }
  for (const [i, id] of ['selection-start', 'selection-end'].entries()) $(id).onkeydown = event => {
    if (!track || busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    edge(i, event.key === 'Home' ? 0 : event.key === 'End' ? duration : selected[i] + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01))
  }
  document.querySelector('.plot-help').onkeydown = event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus() } }
  svg.ondblclick = () => act(() => { selected = [0, duration]; point = -1; update(); draw() })
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
    if (track && !busy && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault(); selected = [0, duration]; point = -1; update(); draw(); return
    }
    if (track && !busy && ['+', '=', '-', '0', 'f', 'F'].includes(event.key)) {
      event.preventDefault()
      if (event.key === '0') { view = [0, duration]; draw() }
      else if (event.key.toLowerCase() === 'f') act(() => { view = selection(); draw() })
      else zoom(event.key === '-' ? 2 : .5)
      return
    }
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
      $('playhead')?.setAttribute('d', time >= view[0] && time <= view[1] ? `M${x(time)} 58V278` : '')
      if (!player.paused) animation = requestAnimationFrame(tick)
    }
    tick()
  }
  window.addEventListener('pagehide', release)
  new ResizeObserver(draw).observe(svg)
}
