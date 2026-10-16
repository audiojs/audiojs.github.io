// The page's one microphone. Opened on a press, from the device and with the processing the reader chose; every
// figure records from it, so one prompt serves the page. Settings wait while a recording runs: a new stream would end
// the take. Listeners hear each change: opened, reopened, let go, failed.
export const mic = {
  stream: null, track: null, source: null, context: null, error: null,
  // what getUserMedia is asked for besides the device: {} at first, the browser's own defaults
  ask: {}, device: '', busy: 0,
  get live() { return this.track?.readyState === 'live' }
}
const listeners = new Set()
export const watch = fn => (listeners.add(fn), fn(mic))
const tell = () => listeners.forEach(fn => fn(mic))

// The page's AudioContext, made in the first press so it may run
export function context() {
  mic.context ||= new AudioContext()
  if (mic.context.state === 'suspended') mic.context.resume()
  return mic.context
}

export const constraints = () => ({ audio: mic.device || Object.keys(mic.ask).length ? { ...mic.device && { deviceId: { exact: mic.device } }, ...mic.ask } : true })

// Open (or reopen, with new settings) the microphone. Resolves to the stream, or throws what getUserMedia threw.
let opening = null
export function open() {
  return opening ||= (async () => {
    context()
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('navigator.mediaDevices is undefined: not a secure context'), { name: 'TypeError' })
      // the old track stopped first: a browser may give a new track on the same device the processing of one still open
      stop()
      const stream = await navigator.mediaDevices.getUserMedia(constraints())
      mic.stream = stream
      mic.track = stream.getAudioTracks()[0]
      mic.error = null
      mic.track.addEventListener('ended', () => { if (mic.stream === stream) tell() })
      for (const type of ['mute', 'unmute']) mic.track.addEventListener(type, () => mic.stream === stream && tell())
      wire()
      tell()
      return stream
    } catch (e) {
      mic.error = e
      tell()
      throw e
    } finally { opening = null }
  })()
}
// The stream into the page's context, which converts it to the context's rate
function wire() {
  mic.source?.disconnect()
  mic.source = mic.context.createMediaStreamSource(mic.stream)
}
// Let the microphone go: every track stopped, which is what turns the browser's indicator off
export function stop() {
  mic.source?.disconnect()
  mic.stream?.getTracks().forEach(t => t.stop())
  mic.stream = mic.track = mic.source = null
}
export function release() { stop(); tell() }

// New settings: reopened at once if the microphone is live, else kept for the next open
export async function set(changes) {
  Object.assign(mic, changes)
  if (mic.live && !mic.busy) return open()
  tell()
}
// A recording holds the settings still while it runs
export async function hold(run) {
  mic.busy++
  tell()
  try { return await run() } finally { mic.busy--; tell() }
}
