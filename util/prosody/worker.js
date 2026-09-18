import { analyze, render, encode } from './process.js'
let samples, sampleRate, track
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      samples = data.samples; sampleRate = data.sampleRate
      track = analyze(samples, sampleRate)
      const bytes = await encode(samples, sampleRate)
      self.postMessage({ type: 'loaded', track, bytes }, [bytes.buffer])
    } else {
      const result = render(samples, sampleRate, track, data.target, data.anchors, data.engine)
      const bytes = await encode(result, sampleRate)
      let peak = 0
      for (const x of result) peak = Math.max(peak, Math.abs(x))
      self.postMessage({ type: 'rendered', bytes, duration: result.length / sampleRate, peak }, [bytes.buffer])
    }
  } catch (e) { self.postMessage({ type: 'error', message: e.message }) }
}
