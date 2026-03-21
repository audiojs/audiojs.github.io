# audiojs — todo

## Clean house

- [ ] Archive `docs` repo
- [ ] Archive `awesome-audiojs` repo
- [ ] Close all issues in `contributing`, archive repo
- [ ] Archive `audio-extensions`
- [ ] Archive `audio-shader`, `audio-through`, `audio-source`, `audio-pcm-format`, `audio-buffer-remix`
- [ ] Deprecate `is-audio-buffer` — point to `instanceof AudioBuffer`
- [x] Deprecate? `audio-play` — point to `audio` package
- [x] Deprecate? `audio-loader` — point to `audio-decode`
- [x] Deprecate `audio-context` — point to `web-audio-api`
- [ ] `@audio/speaker`: publish under scope (already revived as `audio-speaker`)

## Seal core pipeline

- [ ] `audio-buffer`: absorb `audio-buffer-utils` operations (trim, normalize, fade, mix, concat, reverse, split, pad)
- [ ] `audio-buffer`: absorb `audio-buffer-from` creation patterns
- [ ] `audio-buffer`: absorb `ChannelMixing` from WAA (W3C speaker mix, 138 lines)
- [ ] `audio`: create new package — high-level API (decode, encode, play, trim, etc.)
- [ ] `web-codecs`: portable WebCodecs API — WASM-based polyfill for cross-runtime codec access
- [ ] `@audio/mic`: cross-platform microphone input stream (mirror of `@audio/speaker`, native bindings)
- [ ] `pcm-convert`: absorb `audio-format` (format string parsing)
- [ ] `pcm-convert`: absorb `pcm-encode` from WAA (DataView PCM encoding, ~40 lines)
- [ ] `pcm-convert`: absorb `sample-rate` constants
- [ ] `pcm-convert`: deprecate old packages with pointers

## Extract WAA modules

- [ ] `biquad-coefficients`: extract `BiquadFilterNode._coefficients` (~110 lines) into standalone package
- [ ] `biquad-coefficients`: create repo at `~/projects/biquad-coefficients`, publish to npm
- [ ] `digital-filter`: transfer from scrapjs/digital-filter to audiojs, rewrite with WAA DSP cores (IIR DFII-T + biquad DFI)
- [ ] `digital-filter`: add FIR support, frequency response, per-channel state management
- [ ] `digital-filter`: publish to npm
- [ ] `periodic-function`: extend with wavetable synthesis from WAA `PeriodicWave.buildTable` + `getBuiltIn` (~70 lines)
- [ ] `spatial-audio`: extract FloatPoint3D + DistanceEffect + ConeEffect (~235 lines) into standalone package
- [ ] `spatial-audio`: create repo at `~/projects/spatial-audio`, publish to npm
- [ ] `web-audio-api`: replace inline code with imports from extracted packages

## Refresh existing primitives

- [ ] `window-function`: add Kaiser, Flat-top, Tukey windows
- [ ] `a-weighting`: add C-weighting, K-weighting curves
- [ ] `fourier-transform`: verify optimal, add IFFT if missing

## Reserve npm names

- [ ] Create stub repos + publish placeholders for: `colors-of-noise`, `parametric-eq`, `dynamics-processor`, `reverbs`, `pitch-detection`, `beat-detection`, `loudness-meter`, `time-stretch`, `noise-reduction`, `signal-generator`

## Website

- [ ] Design: postmodern audio standard (light gray, monochrome, Dieter Rams, Audiotechnica)
- [ ] Build with Jekyll + sprae, static, under 50kb
- [ ] Package catalog with status, downloads, runtime support
- [ ] Interactive demo per package (doubles as useful tool)
- [ ] Pipeline diagram showing how packages compose
- [ ] Getting started: "decode an MP3 in 3 lines"

- [ ] audio-buffer demo
  - [ ] load any-waveform into buffer like wavearea, edit/trim/crom (no history, direct buffer), play/save
- [ ] web-audio-api demo
  - [ ] write any code (repl), play, open examples
  - [ ] graph view
- [ ] digital filters demo
  - [ ] collection of filters with shown characteristics
- [ ] audio demo
  - [ ] real waveform editing expirience?
- [ ] concept packages demos
  - [ ] as audio plugins: open or stream audio/mic

## Build concept packages (priority order)

- [ ] `colors-of-noise` — white, pink, brown, blue, violet, gray, velvet
- [ ] `loudness-meter` — LUFS (EBU R128), true peak, RMS, LRA
- [ ] `parametric-eq` — multi-band EQ, graphic EQ, crossover
- [ ] `dynamics-processor` — compressor, limiter, gate, expander
- [ ] `pitch-detection` — YIN, MPM, autocorrelation
- [ ] `signal-generator` — sweep, impulse, DTMF, test tones
- [ ] `beat-detection` — tempo/BPM, onset detection
- [ ] `spatial-audio` — expand with panning laws, stereo width, mid-side
- [ ] `reverbs` — Freeverb, Dattorro, Schroeder, convolution
- [ ] `time-stretch` — phase vocoder, WSOLA, pitch shift
- [ ] `noise-reduction` — spectral subtraction, gating, dehum, declick

## Industry recognition

- [ ] Write "State of Audio in JS" article
- [ ] Get listed: awesome-nodejs, awesome-web-audio, MDN resources
- [ ] GitHub Sponsors / Open Collective
- [ ] Engage W3C Audio WG
- [ ] Corporate outreach (Spotify, SoundCloud, Descript, Adobe)
