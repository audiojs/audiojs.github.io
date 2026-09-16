#include <vector>
#include "world/cheaptrick.h"
#include "world/d4c.h"
#include "world/synthesis.h"
#include "world/dio.h"
#include "world/stonemask.h"
extern "C" void world_analyze(const double* x, int n, int fs, double step, double* f0) {
  DioOption opt; InitializeDioOption(&opt);
  opt.f0_floor = 60; opt.f0_ceil = 600; opt.frame_period = step * 1000;
  int count = GetSamplesForDIO(fs, n, opt.frame_period);
  std::vector<double> times(count), initial(count);
  Dio(x, n, fs, &opt, times.data(), initial.data());
  StoneMask(x, n, fs, times.data(), initial.data(), count, f0);
}
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
