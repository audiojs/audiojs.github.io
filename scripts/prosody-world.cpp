#include <vector>
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
// necessarily uniform) with the source F0 there, then synthesize the frames on
// a uniform grid at the target F0. Non-uniform positions time-warp the voice.
extern "C" void world_render(const double* x, int n, int fs, const double* times, const double* f0,
    const double* target, int count, double step, double* y, int length) {
  CheapTrickOption opt; InitializeCheapTrickOption(fs, &opt);
  opt.f0_floor = 50; opt.fft_size = GetFFTSizeForCheapTrick(fs, &opt);
  int bins = opt.fft_size / 2 + 1;
  std::vector<double> sp(count * bins), ap(count * bins);
  std::vector<double*> spec(count), noise(count);
  for (int i = 0; i < count; i++) { spec[i] = sp.data() + i * bins; noise[i] = ap.data() + i * bins; }
  CheapTrick(x, n, fs, times, f0, count, &opt, spec.data());
  D4COption d4c; InitializeD4COption(&d4c);
  D4C(x, n, fs, times, f0, count, opt.fft_size, &d4c, noise.data());
  Synthesis(target, count, spec.data(), noise.data(), opt.fft_size, step * 1000, fs, length, y);
}
