// A voiced excitation with moving F0 through a fixed vocal-tract filter.
// Unlike a constant sine, flattening it exercises continuous pitch correction
// while the vowel's resonances must remain independent of the pitch contour.
export function vowel(sampleRate = 22050, seconds = 3) {
  const samples = new Float32Array(Math.round(sampleRate * seconds))
  const f0 = t => 155 * 2 ** (.25 * Math.sin(2 * Math.PI * 1.5 * t))
  let phase = 0
  const harmonics = Math.min(40, Math.floor(sampleRate / (2 * 185)))
  for (let i = 0; i < samples.length; i++) {
    phase += f0(i / sampleRate) / sampleRate
    for (let h = 1; h < harmonics; h++) samples[i] += Math.sin(2 * Math.PI * h * phase) / h
  }
  for (const [frequency, bandwidth] of [[700, 110], [1220, 120], [2600, 160]]) {
    const r = Math.exp(-Math.PI * bandwidth / sampleRate), c = 2 * r * Math.cos(2 * Math.PI * frequency / sampleRate)
    let y1 = 0, y2 = 0
    for (let i = 0; i < samples.length; i++) {
      const y = (1 - r) * samples[i] + c * y1 - r * r * y2
      y2 = y1; y1 = y; samples[i] = y
    }
  }
  const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
  for (let i = 0; i < samples.length; i++) samples[i] *= .5 / peak
  const times = Float32Array.from({ length: Math.ceil(seconds / .005) + 1 }, (_, i) => i * .005)
  return { samples, track: { times, f0: Float32Array.from(times, f0), hop: .005 } }
}
