// An AudioBuffer as a WAV file: a 44-byte header, then the samples as 16-bit integers
export function wav(buffer) {
  const { numberOfChannels: k, sampleRate: rate, length: n } = buffer
  const bytes = n * k * 2, view = new DataView(new ArrayBuffer(44 + bytes))
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt()))
  const u32 = (at, v) => view.setUint32(at, v, true)
  const u16 = (at, v) => view.setUint16(at, v, true)
  text(0, 'RIFF'); u32(4, 36 + bytes); text(8, 'WAVE')
  text(12, 'fmt '); u32(16, 16); u16(20, 1)         // 16 bytes of format; 1: integer PCM
  u16(22, k); u32(24, rate); u32(28, rate * k * 2)  // channels, rate, bytes a second
  u16(32, k * 2); u16(34, 16)                       // bytes a frame, bits a sample
  text(36, 'data'); u32(40, bytes)
  const channels = Array.from({ length: k }, (_, c) => buffer.getChannelData(c))
  for (let i = 0, at = 44; i < n; i++) for (const x of channels) {   // interleaved
    view.setInt16(at, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true)
    at += 2
  }
  return new Uint8Array(view.buffer)
}
