// A short synthetic song for the separation pages' tests (scripts/pages/stem-splitter.test.mjs, vocal-remover.test.mjs):
// 6 s of stereo at 44.1 kHz, 16-bit: a sung-like tone in the center (220 Hz, vibrato, syllables), a bass line, a kick and
// hats, a chord panned apart, and a DC offset of 0.01 the model hands to no stem
export const FS = 44100, N = 6 * FS
export function song() {
  let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5
  const L = new Float64Array(N), R = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const t = i / FS, beat = t % 0.5, hat = t % 0.25, syl = t % 0.5 < 0.4 ? Math.sin(Math.PI * (t % 0.5) / 0.4) : 0
    let voice = 0, f0 = 220 * (1 + 0.02 * Math.sin(2 * Math.PI * 5.5 * t))
    for (let h = 1; h <= 12; h++) voice += Math.sin(2 * Math.PI * h * f0 * t) / h * (h * f0 > 500 && h * f0 < 1200 ? 1.5 : 0.6)
    let bass = 0, fb = t % 2 < 1 ? 55 : 73.42
    for (let h = 1; h <= 6; h++) bass += Math.sin(2 * Math.PI * h * fb * t) / h
    const kick = beat < 0.15 ? Math.sin(2 * Math.PI * (50 * beat + 70 * 0.03 * (1 - Math.exp(-beat / 0.03)))) * Math.exp(-beat / 0.05) : 0
    const hats = hat < 0.03 ? rand() * Math.exp(-hat / 0.008) : 0
    const pad = [220, 261.63, 329.63].map(f => Math.sin(2 * Math.PI * f * t))
    L[i] = 0.22 * voice * syl + 0.25 * bass + 0.5 * kick + 0.25 * hats + 0.12 * (pad[0] + pad[1])
    R[i] = 0.22 * voice * syl + 0.25 * bass + 0.5 * kick + 0.15 * hats + 0.12 * (pad[0] + pad[2])
  }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const q = x => Math.max(-32768, Math.min(32767, Math.round((0.7 * x / peak + 0.01) * 32768)))
  const codes = [Int16Array.from(L, q), Int16Array.from(R, q)]
  return { codes, wav: wav(codes) }
}
// channels of 16-bit codes → a WAV file
export function wav(chs, fs = FS) {
  const C = chs.length, n = chs[0].length, buf = Buffer.alloc(44 + n * 2 * C)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2 * C, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(C, 22)
  buf.writeUInt32LE(fs, 24); buf.writeUInt32LE(fs * 2 * C, 28); buf.writeUInt16LE(2 * C, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2 * C, 40)
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) buf.writeInt16LE(chs[c][i], 44 + (i * C + c) * 2)
  return buf
}
// 16-bit PCM WAV → channels of codes (the encoder rounds x·32768: these are exact)
export function codesOf(buf) {
  let pos = 12, ch = 0, data = null
  while (pos + 8 <= buf.length) { const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4); if (id === 'fmt ') ch = buf.readUInt16LE(pos + 10); if (id === 'data') data = [pos + 8, size]; pos += 8 + size + (size % 2) }
  const n = data[1] / 2 / ch
  return Array.from({ length: ch }, (_, c) => Int16Array.from({ length: n }, (_, i) => buf.readInt16LE(data[0] + (i * ch + c) * 2)))
}
