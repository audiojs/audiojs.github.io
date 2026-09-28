// The scrub voice: while the caret is pressed or held, the chosen method plays at it. It fades in and out over 10 ms,
// crossfades over 30 ms when the method or its settings change, and reports where it reads every 8 blocks (23 ms).
// Messages in: { x } a new sound, { method, opts }, { caret } in samples, { on }.
import { methods } from './methods.js'

class Scrub extends AudioWorkletProcessor {
  constructor() {
    super()
    this.x = null
    this.method = 'hybrid'
    this.opts = {}
    this.caret = 0
    this.on = false
    this.now = this.old = null
    this.gain = 0
    this.mix = 1
    this.blocks = 0
    this.a = new Float32Array(128)
    this.b = new Float32Array(128)
    this.port.onmessage = ({ data }) => this.receive(data)
  }
  make() { return methods[this.method].make(this.x, sampleRate, this.caret, this.opts) }
  receive({ x, method, opts, caret, on }) {
    if (x) { this.x = x; this.now = this.old = null; this.gain = 0 }
    if (caret != null) this.caret = caret
    if (method || opts) {
      if (method) this.method = method
      if (opts) this.opts = opts
      if (this.now) { this.old = this.now; this.now = this.make(); this.mix = 0 }
    }
    if (on != null) this.on = on
  }
  process(inputs, outputs) {
    const out = outputs[0][0]
    if (this.on && !this.now && this.x) { this.now = this.make(); this.gain = 0 }
    if (!this.now) return true
    const { a, b, old } = this, fade = 1 / (.01 * sampleRate), cross = 1 / (.03 * sampleRate), target = this.on ? 1 : 0
    this.now.render(a, this.caret)
    if (old) old.render(b, this.caret)
    let g = this.gain, m = this.mix
    for (let i = 0; i < out.length; i++) {
      g = target ? Math.min(1, g + fade) : Math.max(0, g - fade)
      let v = a[i]
      // two methods are uncorrelated: equal power
      if (old) { m = Math.min(1, m + cross); v = v * Math.sin(m * Math.PI / 2) + b[i] * Math.cos(m * Math.PI / 2) }
      out[i] = v * g
    }
    this.gain = g
    this.mix = m
    if (m >= 1) this.old = null
    if (++this.blocks % 8 === 0) this.port.postMessage(this.now.at)
    if (!g && !this.on) this.now = this.old = null
    return true
  }
}
registerProcessor('scrub', Scrub)
