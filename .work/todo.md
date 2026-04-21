
## Priority

- [x] `audio`: finish, publish, integrate with filters: on par with SOX: compress, reverb, denoise, pitch-correct, denoise, declick, stretch
- [ ] `floabeat`: collection of fixtures for testing algorithms
  * [ ] integrate into beat-detection, audio, pitch-detection, pitch-shift, time-stretch etc
- [ ] `signal-generator` — sweep, impulse, DTMF, test tones
  - [ ] `audio-input?` – unified audio source: files, gens, urls, records, TTS, noises?

## [ ] Website

* [ ] `npm i audio`
* [ ] live demos
  * File converter (with sample rate / meta / etc choice) - with packages used info etc
  * A BPM detector you can drop a track into.
  * A filter lab you can hear in real time.
  * A spectrogram you bookmark.
  - [ ] audio-buffer demo
    - [ ] load any-waveform into buffer like wavearea, edit/trim/crom (no history, direct buffer), play/save
  - [ ] web-audio-api demo
    - [ ] write any code (repl), play, open examples
    - [ ] graph view
  - [ ] digital-filters demo
    - [ ] collection of filters with shown characteristics
  - [ ] audio demo
    - [ ] real waveform editing expirience?
  - [ ] concept packages demos
    - [ ] as audio plugins: open or stream audio/mic
* [ ] Catalog with module dossiers (need architecture beforehead)
  - [ ] status, downloads, runtime support, pro version (wasm) - compile to VST/AU/etc
  - [ ] Interactive demo per package (doubles as useful tool)
* [ ] Github stars
* [ ] Sponsorship strip
* [ ] Roadmap


## [ ] WASM

- [ ] `jz`: integrate into filters, window function, waa?
- [ ] web-audio-api
- [ ] stat packages, edit packages

## Ideas

- [ ] Icecast/internet radio adapter? To stream eg. audio
- [ ] Voice generator tool (via natural tract gen)
- [ ] Speed up processing by engaging GPU (where?)
- [ ] Essentia tone analysis: reproduce flute

## Polyfills

- [ ] AudioBuffer
- [ ] WebAudioAPI
- [ ] WebCodecs
- [ ] AudioWorklet
- [ ] Audio


## Backlog

- [ ] `audio-effect` - add tests, make illustrative plots: seems to be broken
- [ ] Close all issues in `contributing`, archive repo
- [ ] `web-codecs`: portable WebCodecs API — WASM-based polyfill for cross-runtime codec access
- [ ] `a-weighting`: add C-weighting, K-weighting curves
- [ ] `noise-reduction` — spectral subtraction, gating, dehum, declick
- [ ] `audio-module` - cross-compiling audio-files, audio-shaders etc
- [ ] Sponsiring: FUNDING.yml, open collective, NLnet NGI Zero
- [ ] `colors-of-noise` — white, pink, brown, blue, violet, gray, velvet
- [ ] `dynamics-processor` — compressor, limiter, gate, expander -> covered by audio-effect?
- [ ] `reverbs` — Freeverb, Dattorro, Schroeder, convolution
- [ ] `defeedback` — adaptive feedback suppression (analyzer + tracker + notch bank)
  - [ ] Node.js audio capture/output from Dante VSC (appears as standard OS audio device)
  - [ ] `defeedback/analyzer.js` — FFT (via fourier-transform) + spectral peak detection
  - [ ] `defeedback/tracker.js` — peak tracking across frames, growth rate detection, feedback/music discrimination
  - [ ] `defeedback/notch-bank.js` — dynamic pool of notch filters (digital-filter biquad.notch), smooth add/remove with coefficient interpolation
  - [ ] `defeedback/index.js` — main loop: analyze → track → deploy notches (max 12, Q=30-50, -6 to -12dB)
  - [ ] Click-free parameter updates — coefficient interpolation or crossfade when notch added/removed/moved
  - [ ] WASM build of filter cascade (hot path) for guaranteed real-time performance
  - [ ] End-to-end test: mic → Dante → defeedback → Dante → speakers, measure latency budget

  - [ ] COnsistency of all packages API across the org

## Funding

### Now (zero-cost setup)
- [ ] Enable GitHub Sponsors on audiojs org
- [ ] Create Open Collective for audiojs
- [ ] Add FUNDING.yml to all active repos (audio-decode, audio-buffer, audio-type, web-audio-api, etc.)
- [ ] Add "Sponsor" section to org README + each package readme

### With website (Q3 2026)
- [ ] Sponsor tiers page on website (Backer → Patron, see research.md)
- [ ] Corporate logo wall on homepage
- [ ] Apply NLnet NGI Zero — scope: "complete DSP primitives for the open web"
- [ ] Apply Google Web Fund — scope: "cross-runtime WebCodecs polyfill + Web Audio conformance"
- [ ] "Fund the next package" campaign widget (progress bar, target amount)

### With traction (Q4 2026)
- [ ] Apply Sovereign Tech Fund — scope: "audiojs as critical JS audio infrastructure"
  - [ ] Prepare governance docs (GOVERNANCE.md, contributor guidelines, release process)
  - [ ] Document dependents count, download stats, ecosystem impact
- [ ] Corporate outreach: identify companies using audiojs via npm/GitHub dependency graph
- [ ] Direct pitch to Descript, Riverside.fm, BandLab (browser audio editors → obvious dependents)
- [ ] Sloan Foundation — scientific computing / open-source angle

### With audio-module (Q1 2027)
- [ ] Pro audio industry outreach: consulting for "JS → VST/CLAP" pipeline
- [ ] Approach Steinberg, Native Instruments, Ableton re: web plugin deployment
- [ ] Paid workshop: "Audio DSP in JavaScript" — target conference workshops (Web Audio Conf, JSConf)

## Recognition

- [x] recover x.com/audio_js, start publishing humanized releases
- [ ] Write "State of Audio in JS" article
- [ ] Get listed: awesome-nodejs, awesome-web-audio, MDN resources
- [ ] Engage W3C Audio WG


## Archive

- [x] Archive `docs` repo
- [x] `time-stretch` — phase vocoder, WSOLA, pitch shift
- [x] `beat-detection` — tempo/BPM, onset detection
- [x] `pitch-detection` — YIN, MPM, autocorrelation, chord detection
- [x] `web-audio-api` automation-events few fixes
- [x] Archive `awesome-audiojs` repo
- [x] Archive `audio-shader`, `audio-through`, `audio-source`, `audio-pcm-format`, `audio-buffer-remix`
- [x] Deprecate `is-audio-buffer` — point to `instanceof AudioBuffer`
- [x] Deprecate? `audio-play` — point to `audio` package
- [x] Deprecate? `audio-loader` — point to `audio-decode`
- [x] Deprecate `audio-context` — point to `web-audio-api`
- [x] `audio-buffer`: absorb `audio-buffer-utils` operations → `audio-buffer/util` (trim, normalize, fill, mix, concat, reverse, slice, pad, rotate, repeat, resize, removeDC)
- [x] `audio-buffer`: absorb `audio-buffer-from` creation patterns → `from()` in `audio-buffer/util`
- [x] `audio-buffer`: absorb `ChannelMixing` → `remix()` in `audio-buffer/util` (W3C speaker mix coefficients)
- [x] `web-audio-api`: upgrade to `audio-buffer` ^7 (298/298 tests, 322k assertions)
- [x] `audio`: create new package — high-level API (decode, encode, play, trim, etc.)
- [x] `audio-mic`: cross-platform microphone input stream
- [x] `pcm-convert`: absorb `audio-format` (format string parsing) → `pcm-convert/format`
- [x] `pcm-convert`: absorb `pcm-encode` from WAA (DataView PCM encoding) → `convert([...channels], format)`
- [x] `pcm-convert`: absorb `sample-rate` constants → `pcm-convert/rates`
- [x] `pcm-convert`: deprecate old packages with pointers
- [x] `audio-filter`, `digital-filter`: complete set of modules, proven by tests, all questions that see from audio-filter - covered, all gh-issues. ToC. _Offerable_
- [x] `audio-filter`, `digital-filter`: integrate into WAA
- [x] `window-function`: fix plots dimensions
- [~] `biquad-coefficients`: extract `BiquadFilterNode._coefficients` (~110 lines) into standalone package
- [~] `biquad-coefficients`: create repo at `~/projects/biquad-coefficients`, publish to npm
- [x] `digital-filter`: transfer from scrapjs/digital-filter to audiojs, rewrite with WAA DSP cores (IIR DFII-T + biquad DFI)
- [x] `digital-filter`: add FIR support, frequency response, per-channel state management
- [x] `digital-filter`: publish to npm
- [x] `periodic-function`: extend with wavetable synthesis from WAA `PeriodicWave.buildTable` + `getBuiltIn` (~70 lines)
- [~] `spatial-audio`: extract FloatPoint3D + DistanceEffect + ConeEffect (~235 lines) into standalone package
- [~] `spatial-audio`: create repo at `~/projects/spatial-audio`, publish to npm
- [x] `web-audio-api`: replace inline code with imports from extracted packages
- [x] `window-function`: add Kaiser, Flat-top, Tukey windows
