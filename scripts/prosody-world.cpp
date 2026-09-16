#include <vector>
#include "world/cheaptrick.h"
#include "world/d4c.h"
#include "world/synthesis.h"
extern "C" void world_render(const double* x, int n, int fs, const double* f0,
    const double* target, int count, double step, double* y) {
  CheapTrickOption opt; InitializeCheapTrickOption(fs, &opt);
  opt.f0_floor = 50; opt.fft_size = GetFFTSizeForCheapTrick(fs, &opt);
  int bins = opt.fft_size / 2 + 1;
  std::vector<double> times(count), sp(count * bins), ap(count * bins);
  std::vector<double*> spec(count), noise(count);
  for (int i = 0; i < count; i++) { times[i] = i * step; spec[i] = sp.data() + i * bins; noise[i] = ap.data() + i * bins; }
  CheapTrick(x, n, fs, times.data(), f0, count, &opt, spec.data());
  D4COption d4c; InitializeD4COption(&d4c);
  D4C(x, n, fs, times.data(), f0, count, opt.fft_size, &d4c, noise.data());
  Synthesis(target, count, spec.data(), noise.data(), opt.fft_size, step * 1000, fs, n, y);
}
