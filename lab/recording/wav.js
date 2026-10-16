// A WAV file: a RIFF header, then the samples, little-endian, channels interleaved (Microsoft & IBM 1991). The header
// is a list of fields, the one list both the file and the article's table are made from. Integer PCM (format 1) at
// 16 or 24 bits takes 44 bytes; 32-bit float (format 3) is not PCM, so its fmt chunk carries cbSize, and a fact chunk
// follows with the length in frames, as Kabal advises: 58 bytes. Names as Kabal's WAVE page gives them.
export function fields({ rate, channels = 1, depth = 16, frames = 0 }) {
  const float = depth === 32, bytes = depth / 8, data = frames * channels * bytes, fmt = float ? 18 : 16
  const size = 4 + (8 + fmt) + (float ? 12 : 0) + (8 + data)
  return [
    ['text', 'ckID', 'RIFF', 'the file is a RIFF chunk'],
    ['u32', 'cksize', size, 'bytes after these 8'],
    ['text', 'WAVEID', 'WAVE', 'of the WAVE form'],
    ['text', 'ckID', 'fmt ', 'the format chunk'],
    ['u32', 'cksize', fmt, 'its bytes'],
    ['u16', 'wFormatTag', float ? 3 : 1, float ? 'IEEE float' : 'integer PCM'],
    ['u16', 'nChannels', channels, channels === 1 ? 'mono' : 'channels'],
    ['u32', 'nSamplesPerSec', rate, 'frames a second'],
    ['u32', 'nAvgBytesPerSec', rate * channels * bytes, 'bytes a second'],
    ['u16', 'nBlockAlign', channels * bytes, 'bytes a frame'],
    ['u16', 'wBitsPerSample', depth, 'bits a sample'],
    ...float ? [
      ['u16', 'cbSize', 0, 'no extension'],
      ['text', 'ckID', 'fact', 'the fact chunk'],
      ['u32', 'cksize', 4, 'its bytes'],
      ['u32', 'dwSampleLength', frames, 'frames in the file']
    ] : [],
    ['text', 'ckID', 'data', 'the samples'],
    ['u32', 'cksize', data, 'their bytes']
  ].map(([type, name, value, note]) => ({ type, name, value, note, size: type === 'u16' ? 2 : 4 }))
}

// the header's bytes, each field at its offset
export function header(spec) {
  const list = fields(spec), out = new Uint8Array(list.reduce((n, f) => n + f.size, 0)), view = new DataView(out.buffer)
  let at = 0
  for (const f of list) {
    f.at = at
    if (f.type === 'text') for (let i = 0; i < 4; i++) out[at + i] = f.value.charCodeAt(i)
    else if (f.type === 'u16') view.setUint16(at, f.value, true)
    else view.setUint32(at, f.value, true)
    at += f.size
  }
  return { bytes: out, fields: list }
}

// Mono samples, −1..1, to a WAV file's bytes. Integers round to the nearest step, out-of-range samples clip.
export function wav(x, rate, depth = 16) {
  const { bytes: head } = header({ rate, depth, frames: x.length }), out = new Uint8Array(head.length + x.length * depth / 8), view = new DataView(out.buffer)
  out.set(head)
  let at = head.length
  const clip = v => v < -1 ? -1 : v > 1 ? 1 : v
  if (depth === 32) for (let i = 0; i < x.length; i++, at += 4) view.setFloat32(at, x[i], true)
  else if (depth === 16) for (let i = 0; i < x.length; i++, at += 2) view.setInt16(at, Math.round(clip(x[i]) * 32767), true)
  else for (let i = 0; i < x.length; i++, at += 3) { const v = Math.round(clip(x[i]) * 8388607); out[at] = v & 255; out[at + 1] = v >> 8 & 255; out[at + 2] = v >> 16 & 255 }
  return out
}
