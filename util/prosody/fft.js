// In-place radix-2 complex FFT on Float32Arrays of a power-of-two length.
export function fft(re, im, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = 2 * Math.PI / size * (inverse ? 1 : -1), wr = Math.cos(angle), wi = Math.sin(angle)
    for (let block = 0; block < n; block += size) {
      let cr = 1, ci = 0
      for (let k = 0; k < size / 2; k++) {
        const a = block + k, b = a + size / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}
