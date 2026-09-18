#include <vector>
#include <algorithm>
#include <cmath>
#include "world/cheaptrick.h"
#include "world/d4c.h"
#include "world/synthesis.h"
#include "world/harvest.h"
// Harvest tracks F0 with continuous voicing across a phrase. StoneMask
// refinement after Harvest introduces octave jumps on low voices, so it is
// not applied.
extern "C" void world_analyze(const double* x, int n, int fs, double step, double* f0) {
  HarvestOption opt; InitializeHarvestOption(&opt);
  opt.f0_floor = 60; opt.f0_ceil = 600; opt.frame_period = step * 1000;
  int count = GetSamplesForHarvest(fs, n, opt.frame_period);
  std::vector<double> times(count);
  Harvest(x, n, fs, &opt, times.data(), f0);
}
// Analyze the source at arbitrary positions (seconds into x, monotonic but not
// necessarily uniform) with the source F0 there, then synthesize at the target
// F0 given on a finer uniform grid (frame_step / pitch_step). Non-uniform
// positions time-warp the voice; each synthesis frame reuses the nearest
// spectral frame, so a 1 ms pitch grid costs no extra analysis or memory.
// `extra` (count × bins, or null) adds noise power per bin to D4C's
// aperiodicity: D4C works in 3 kHz bands, where the strong low harmonics hide
// the noise between the higher ones, so the caller supplies the noise the
// rebuilt voice still lacks against the source.
extern "C" int world_render(const double* x, int n, int fs, const double* times, const double* f0, int count, double step,
    const double* target, int target_count, double target_step, const double* extra, int extra_bins, double* y, int length) {
  CheapTrickOption opt; InitializeCheapTrickOption(fs, &opt);
  opt.f0_floor = 50; opt.fft_size = GetFFTSizeForCheapTrick(fs, &opt);
  int bins = opt.fft_size / 2 + 1;
  if (extra && extra_bins != bins) return -1;
  std::vector<double> sp(count * bins), ap(count * bins);
  std::vector<double*> spec(count), noise(count);
  for (int i = 0; i < count; i++) { spec[i] = sp.data() + i * bins; noise[i] = ap.data() + i * bins; }
  CheapTrick(x, n, fs, times, f0, count, &opt, spec.data());
  D4COption d4c; InitializeD4COption(&d4c);
  D4C(x, n, fs, times, f0, count, opt.fft_size, &d4c, noise.data());
  if (extra) for (int i = 0; i < count * bins; i++) ap[i] = std::min(1.0, std::sqrt(ap[i] * ap[i] + extra[i] * extra[i]));
  std::vector<double*> spec_fine(target_count), noise_fine(target_count);
  for (int i = 0; i < target_count; i++) {
    int frame = std::min(count - 1, static_cast<int>(i * target_step / step + 0.5));
    spec_fine[i] = spec[frame]; noise_fine[i] = noise[frame];
  }
  Synthesis(target, target_count, spec_fine.data(), noise_fine.data(), opt.fft_size, target_step * 1000, fs, length, y);
  return opt.fft_size;
}
// Spectral envelope (CheapTrick power spectrum, fft_size / 2 + 1 bins per
// frame) at arbitrary positions with the source F0 there, for formant
// correction after resampling the recording's own cycles.
extern "C" int world_envelope(const double* x, int n, int fs, const double* times, const double* f0, int count, double* out) {
  CheapTrickOption opt; InitializeCheapTrickOption(fs, &opt);
  opt.f0_floor = 50; opt.fft_size = GetFFTSizeForCheapTrick(fs, &opt);
  int bins = opt.fft_size / 2 + 1;
  std::vector<double*> spec(count);
  for (int i = 0; i < count; i++) spec[i] = out + i * bins;
  CheapTrick(x, n, fs, times, f0, count, &opt, spec.data());
  return opt.fft_size;
}
