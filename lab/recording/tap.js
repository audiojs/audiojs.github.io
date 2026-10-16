// Every block the microphone gives, kept. An AudioWorklet's process() runs once per render quantum of 128 frames;
// posting each would be 375 messages a second at 48 kHz, so they are gathered 4,096 frames at a time and the buffer
// handed over, not copied. Channels arrive mixed to one (the node's channelCount). 'flush' posts what is gathered.
const SIZE = 4096

registerProcessor('tap', class extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(SIZE)
    this.n = 0
    this.blocks = 0
    this.port.onmessage = ({ data }) => { if (data === 'flush') this.post(true) }
  }
  post(last = false) {
    const x = this.buf.subarray(0, this.n)
    this.port.postMessage({ x, blocks: this.blocks, last }, [this.buf.buffer])
    this.buf = new Float32Array(SIZE)
    this.n = 0
  }
  process([input]) {
    const x = input[0]
    if (!x) return true
    this.blocks++
    for (let i = 0; i < x.length; i++) {
      this.buf[this.n++] = x[i]
      if (this.n === SIZE) this.post()
    }
    return true
  }
})
