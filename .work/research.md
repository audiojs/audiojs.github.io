## Motivation

Sound is the first element and medium of communication.

## How can auiojs serve and to whom?

* AI: MCP server
* AI: audio skill
* CLI for headless processing and previewing audio
  * Audacity/DAW in your command line
  * Batch-processing and cleaning up files
* Reference implementation of key audio algorhythms: correct, cross-runtime, performant, open, consistent & composable
* Wavearea and other audio editors data layer.
* Online tools for audio-related operations:
  * metronome, tuner, eq, drone, spectrogram/analysis, editor etc.
* Run VST plugin via CLI (no DAW needed)
* Polyfills for platform features.
* Converting formats, sample rates, normalizing/editing
* DSP education (filters etc)
* AI agents: TTS pipeline (how?)
* AI: Info base about your audio collection

## Insights

* Audio plugins ~~marketplace~~ curated collection: with preview, tags, UI snippet; like unheap.com; similar to producthunt, devhunt.
* All main audio manipulation needs covered
  * preparing kirtans - from cropping, normalizing to mastering; audio-books – shrinking into a limited set.
* Wavearea: complete waveform editing experience
* Audio-lab: interactive audio graphs editor like reaktor, maxdsp/msp (can import nodes) etc.
* Neural-plugin: learns behavior of any vst (combination of filters - possible?)
* Neural-synth: learns any sound into synth
* Defeedback: realtime feedback reducer audio-module/plugin
* Any sort of vst/plugin chain processing in dante network

## Key Result Areas

1. **Core Reliability** — zero bugs in the decode → buffer → transform → encode path
2. **DSP Completeness** — developer never needs to leave audiojs for common DSP tasks
3. **Developer Experience** — frontend dev productive in 2 min; DSP dev productive in 10
4. **Cross-Runtime Portability** — browser + Node + Deno + Edge, identical behavior
5. **Professional Integration** — JS effects deployable as DAW plugins; plugins hostable from JS
6. **Ecosystem & Sustainability** — recognized as the standard, funded, community-maintained

## Monetization

IDEA: make openly available JS packages have classified analogs compiled with JZ to VST/AU etc - for paying pro users. And "tax" for ecosystem boundary - if anyone needs them in VST should pay the tax, each target env - extra tier to pay for.

| Source | Who | Hook |
|--------|-----|------|
| **Public grants** | STF (€150-300k, rolling), NLnet/NGI Zero (€5-50k), Google Web Fund ($5-50k), Sloan ($50-200k), NumFOCUS ($1-5k) | Infrastructure at risk — 350k/wk downloads, one maintainer, zero funding |
| **Corporate sponsors** | Spotify, SoundCloud, Descript, Adobe, Dolby, Izotope, BandLab, Splice, Riverside.fm, Vercel | You already depend on this — $2k/mo vs $200k/yr to build internally |
| **Individual devs** | Frontend devs, DSP hobbyists, music tech builders, podcasting tool makers | GitHub Sponsors + Open Collective; sponsor wall; "fund the next package" campaigns |
| **Pro audio** | Ableton, Steinberg, PreSonus, Dolby, BBC R&D | Consulting contracts — "we build the open-source primitive, you fund the work" |
| **Academic/research** | Stanford CCRMA, MIT Media Lab, IRCAM | Interactive demos as teaching tools; algorithm paper citations; research partnerships |

## Goal

prepare for **grants** (NLnet, Sovereign Tech Fund, Sloan, Google Web Fund) + **OSS corporate sponsors** (videojs/babel model) + **freemium hosted product** (cleanvoice/auphonic model). Three audiences, one site.


## Refs

* https://github.com/webprofusion/OpenAudio
* https://g-meh.com/

---

## `@audio` Package Ecosystem

### Design Principles

1. **audiojs = audio production & music DSP** — DAW/plugin language, not generic signal processing.
2. **scijs = generic DSP primitives** — filters, transforms, windows, math.
3. **audiojs depends on scijs** — wrappers and re-exports, not duplication.
4. **umbrellas re-export atoms** — `@audio/pitch` → `@audio/pitch-yin`, `@audio/pitch-mcleod` etc.
5. **atoms are installable standalone** — `@audio/pitch-yin` works without `@audio/pitch`.

### `@audio` Atoms & Umbrellas

#### `@audio/pitch` — Pitch Detection
| Atom | Source |
|------|--------|
| `@audio/pitch-yin` | `pitch-detection/yin.js` |
| `@audio/pitch-mcleod` | `pitch-detection/mcleod.js` |
| `@audio/pitch-pyin` | `pitch-detection/pyin.js` |
| `@audio/pitch-hps` | `pitch-detection/hps.js` |
| `@audio/pitch-cepstrum` | `pitch-detection/cepstrum.js` |
| `@audio/pitch-swipe` | `pitch-detection/swipe.js` |
| `@audio/pitch-autocorrelation` | `pitch-detection/autocorrelation.js` |
| `@audio/pitch-amdf` | `pitch-detection/amdf.js` |

#### `@audio/beat` — Beat Detection
| Atom | Source |
|------|--------|
| `@audio/beat-detect` | `beat-detection/detect.js` |
| `@audio/beat-onset` | `beat-detection/onset/` |
| `@audio/beat-tempo` | `beat-detection/tempo/` |
| `@audio/beat-track` | `beat-detection/track.js` |

#### `@audio/shift` — Pitch Shifting
| Atom | Source |
|------|--------|
| `@audio/shift-ola` | `pitch-shift/ola.js` |
| `@audio/shift-wsola` | `pitch-shift/wsola.js` |
| `@audio/shift-pvoc` | `pitch-shift/phase-lock.js` |
| `@audio/shift-pvlock` | `pitch-shift/phase-lock.js` (phase-locked variant) |
| `@audio/shift-transient` | `pitch-shift/transient.js` |
| `@audio/shift-psola` | `pitch-shift/psola.js` |
| `@audio/shift-granular` | `pitch-shift/granular.js` |
| `@audio/shift-paulstretch` | `pitch-shift/paulstretch.js` |
| `@audio/shift-sms` | `pitch-shift/sms.js` |
| `@audio/shift-hpss` | `pitch-shift/hpss.js` |
| `@audio/shift-formant` | `pitch-shift/formant-shift.js` |
| `@audio/shift-sample` | `pitch-shift/sample.js` |
| `@audio/shift-hybrid` | `pitch-shift/hybrid.js` |

#### `@audio/stretch` — Time Stretching
| Atom | Source |
|------|--------|
| `@audio/stretch-wsola` | `time-stretch/wsola.js` |
| `@audio/stretch-pvoc` | `time-stretch/vocoder.js` |
| `@audio/stretch-pvlock` | `time-stretch/` (phase-locked variant) |
| `@audio/stretch-transient` | `time-stretch/` (transient-aware variant) |
| `@audio/stretch-paulstretch` | `time-stretch/paulstretch.js` |
| `@audio/stretch-psola` | `time-stretch/psola.js` |
| `@audio/stretch-sms` | `time-stretch/sms.js` |

#### `@audio/filter` — Audio Filters (DAW/plugin language)
Re-exports curated `digital-filter` primitives with audio-friendly parameter names (Hz, Q, dB, type).

| Export | Source | Audio Concept |
|--------|--------|---------------|
| `highpass` | `digital-filter/iir/biquad.js` | High-pass filter |
| `lowpass` | `digital-filter/iir/biquad.js` | Low-pass filter |
| `bandpass` | `digital-filter/iir/biquad.js` | Band-pass filter |
| `notch` | `digital-filter/iir/biquad.js` | Notch filter |
| `allpass` | `digital-filter/iir/biquad.js` | All-pass filter |
| `resonator` | `audio-filter/effect/resonator.js` | Resonant filter |
| `comb` | `audio-filter/effect/comb.js` | Comb filter |
| `dcBlocker` | `audio-filter/effect/dc-blocker.js` | DC offset removal |
| `variableBandwidth` | `audio-filter/effect/variable-bandwidth.js` | Variable bandwidth filter |

**Note**: Generic filter design (Butterworth, Chebyshev, FIR design, etc.) stays in `digital-filter` (scijs).

#### `@audio/eq` — Equalization & Tone Shaping
| Atom | Source |
|------|--------|
| `@audio/eq-highshelf` | `audio-filter/eq/highshelf.js` |
| `@audio/eq-lowshelf` | `audio-filter/eq/lowshelf.js` |
| `@audio/eq-parametric` | `audio-filter/eq/parametric-eq.js` |
| `@audio/eq-graphic` | `audio-filter/eq/graphic-eq.js` |
| `@audio/eq-baxandall` | `audio-filter/eq/baxandall.js` |
| `@audio/eq-tilt` | `audio-filter/eq/tilt.js` |
| `@audio/eq-crossover` | `audio-filter/eq/crossover.js` |

#### `@audio/weighting` — Frequency Weighting Curves
| Atom | Source |
|------|--------|
| `@audio/weighting-a` | `audio-filter/weighting/a-weighting.js` |
| `@audio/weighting-c` | `audio-filter/weighting/c-weighting.js` |
| `@audio/weighting-k` | `audio-filter/weighting/k-weighting.js` |
| `@audio/weighting-itu468` | `audio-filter/weighting/itu468.js` |
| `@audio/weighting-riaa` | `audio-filter/weighting/riaa.js` |

#### `@audio/auditory` — Auditory Filterbanks
| Atom | Source |
|------|--------|
| `@audio/auditory-bark` | `audio-filter/auditory/bark-bank.js` |
| `@audio/auditory-erb` | `audio-filter/auditory/erb-bank.js` |
| `@audio/auditory-mel` | `audio-filter/auditory/mel-bank.js` |
| `@audio/auditory-gammatone` | `audio-filter/auditory/gammatone.js` |

#### `@audio/effect` — Audio Effects
| Atom | Source |
|------|--------|
| `@audio/effect-phaser` | `audio-effect/modulation/phaser.js` |
| `@audio/effect-flanger` | `audio-effect/modulation/flanger.js` |
| `@audio/effect-chorus` | `audio-effect/modulation/chorus.js` |
| `@audio/effect-wah` | `audio-effect/modulation/wah.js` |
| `@audio/effect-autowah` | `audio-effect/modulation/auto-wah.js` |
| `@audio/effect-tremolo` | `audio-effect/modulation/tremolo.js` |
| `@audio/effect-vibrato` | `audio-effect/modulation/vibrato.js` |
| `@audio/effect-ringmod` | `audio-effect/modulation/ring-mod.js` |
| `@audio/effect-freqshift` | `audio-effect/modulation/frequency-shifter.js` |
| `@audio/effect-delay` | `audio-effect/delay/delay.js` |
| `@audio/effect-multitap` | `audio-effect/delay/multitap.js` |
| `@audio/effect-pingpong` | `audio-effect/delay/ping-pong.js` |
| `@audio/effect-reverb` | `audio-effect/delay/reverb.js` |
| `@audio/effect-distortion` | `audio-effect/distortion/distortion.js` |
| `@audio/effect-bitcrusher` | `audio-effect/distortion/bitcrusher.js` |
| `@audio/effect-exciter` | `audio-effect/distortion/exciter.js` |
| `@audio/effect-gain` | `audio-effect/utility/gain.js` |
| `@audio/effect-mixer` | `audio-effect/utility/mixer.js` |
| `@audio/effect-slew` | `audio-effect/utility/slew-limiter.js` |
| `@audio/effect-nshaper` | `audio-effect/utility/noise-shaping.js` |

#### `@audio/speech` — Speech Processing
| Atom | Source |
|------|--------|
| `@audio/speech-formant` | `audio-filter/speech/formant.js` |
| `@audio/speech-lpc` | `audio-filter/speech/lpc.js` |
| `@audio/speech-vocoder` | `audio-filter/speech/vocoder.js` |

#### `@audio/denoise` — Noise Reduction & Restoration
| Atom | Source |
|------|--------|
| `@audio/denoise-gate` | `noise-reduction/gate.js` |
| `@audio/denoise-spectral` | `noise-reduction/specsub.js` |
| `@audio/denoise-wiener` | `noise-reduction/wiener.js` |
| `@audio/denoise-omlsa` | `noise-reduction/omlsa.js` |
| `@audio/denoise-dehum` | `noise-reduction/dehum.js` |
| `@audio/denoise-declick` | `noise-reduction/declick.js` |
| `@audio/denoise-decrackle` | `noise-reduction/decrackle.js` |
| `@audio/denoise-declip` | `noise-reduction/declip.js` |
| `@audio/denoise-dewind` | `noise-reduction/dewind.js` |
| `@audio/denoise-deplosive` | `noise-reduction/deplosive.js` |
| `@audio/denoise-deesser` | `noise-reduction/deesser.js` |
| `@audio/denoise-debreath` | `noise-reduction/debreath.js` |
| `@audio/denoise-dereverb` | `noise-reduction/dereverb.js` |
| `@audio/denoise-detect` | `noise-reduction/denoise.js` (noise-type classifier) |

#### `@audio/synth` — Synthesis
| Atom | Source |
|------|--------|
| `@audio/synth-osc` | `periodic-function/*` — sine, sawtooth, square, triangle, trapezoid, pulse, clausen, noise, wavetable |
| `@audio/synth-pluck` | Karplus-Strong plucked string synthesis |
| `@audio/synth-rhythm` | Tempo-based rhythm generation with patterns |
| `@audio/synth-chirp` | Linear/log frequency sweep generator |
| `@audio/synth-dtmf` | Telephone dial tone generator |
| `@audio/synth-risset` | Inharmonic drum synthesis |

#### Existing `@audio` Umbrellas
| Package | Atoms |
|---------|-------|
| `@audio/speaker` | `@audio/speaker-darwin-arm64`, `@audio/speaker-darwin-x64`, `@audio/speaker-linux-arm64`, `@audio/speaker-linux-x64`, `@audio/speaker-win32-x64` |
| `@audio/decode` | `@audio/decode-aac`, `@audio/decode-aiff`, `@audio/decode-amr`, `@audio/decode-caf`, `@audio/decode-flac`, `@audio/decode-mp3`, `@audio/decode-opus`, `@audio/decode-qoa`, `@audio/decode-vorbis`, `@audio/decode-wav`, `@audio/decode-webm`, `@audio/decode-wma` |
| `@audio/encode` | `@audio/encode-aiff`, `@audio/encode-flac`, `@audio/encode-mp3`, `@audio/encode-ogg`, `@audio/encode-opus`, `@audio/encode-wav` |
| `@audio/mic` | `@audio/mic-darwin-arm64`, `@audio/mic-darwin-x64`, `@audio/mic-linux-arm64`, `@audio/mic-linux-x64`, `@audio/mic-win32-x64` |

#### `@audio/dynamics` — Dynamics Processing
| Atom | Source |
|------|--------|
| `@audio/dynamics-compressor` | `audio-effect/dynamics/compressor.js` |
| `@audio/dynamics-limiter` | `audio-effect/dynamics/limiter.js` |
| `@audio/dynamics-expander` | `audio-effect/dynamics/expander.js` |
| `@audio/dynamics-gate` | `audio-effect/dynamics/gate.js` |
| `@audio/dynamics-transient` | `audio-effect/dynamics/transient-shaper.js` |
| `@audio/dynamics-envelope` | `audio-effect/dynamics/envelope.js` |

#### `@audio/vocals` — Vocal Isolation
| Atom | Source |
|------|--------|
| `@audio/vocals-isolate` | `audio/fn/vocals.js` (center isolate) |
| `@audio/vocals-remove` | `audio/fn/vocals.js` (center remove) |

#### `@audio/spatial` — Spatial / Channel Utilities
| Atom | Source |
|------|--------|
| `@audio/spatial-midside` | Mid/Side encode/decode |
| `@audio/spatial-channelsplit` | Channel split/combine |
| `@audio/spatial-delay` | Per-channel delay |
| `@audio/spatial-crossfeed` | Headphone crossfeed (`audio/fn/crossfeed.js`) |
| `@audio/spatial-panner` | Panner (`audio-effect/spatial/panner.js`) |
| `@audio/spatial-widen` | Stereo widener (`audio-effect/spatial/stereo-widener.js`) |
| `@audio/spatial-haas` | Haas effect (`audio-effect/spatial/haas.js`) |

#### `@audio/spectral` — Spectral Features
| Atom | Source |
|------|--------|
| `@audio/spectral-centroid` | Spectral centroid |
| `@audio/spectral-flatness` | Spectral flatness |
| `@audio/spectral-crest` | Spectral crest factor |
| `@audio/spectral-rolloff` | Spectral rolloff |
| `@audio/spectral-flux` | Spectral flux |
| `@audio/spectral-slope` | Spectral slope |
| `@audio/spectral-spread` | Spectral spread |

#### `@audio/mir` — Music Information Retrieval
| Atom | Source |
|------|--------|
| `@audio/mir-structure` | Structural segmentation (verse/chorus/bridge) |
| `@audio/mir-transcribe` | Polyphonic transcription (audio → MIDI) |
| `@audio/mir-downbeat` | Downbeat estimation |
| `@audio/mir-coversong` | Cover song identification |
| `@audio/mir-melody` | Continuous melody F0 contour |
| `@audio/mir-multif0` | Multiple simultaneous pitch estimation |
| `@audio/mir-chroma` | `pitch-detection/chroma.js` |
| `@audio/mir-chord` | `pitch-detection/chord.js` |
| `@audio/mir-key` | `pitch-detection/key.js` |
| `@audio/mir-genre` | Genre classification |
| `@audio/mir-mood` | Mood/emotion classification |
| `@audio/mir-tags` | Semantic audio tagging |
| `@audio/mir-fingerprint` | Audio fingerprinting |
| `@audio/mir-similarity` | Audio similarity metric |
| `@audio/mir-drums` | Drum transcription |
| `@audio/mir-lyrics` | Lyrics-to-audio alignment |
| `@audio/mir-separate` | Stem separation (vocals/drums/bass/other) |
| `@audio/mir-tonnetz` | Tonal centroid features |
| `@audio/mir-tempogram` | Tempo over time |

### What Stays in `audio` Core

These are structural, page-based, or tightly coupled to the `audio` engine. Not atomized.

**Structural ops:** crop, trim, split, insert, remove, repeat, pad, reverse, mix, remix, loop, crossfade, speed
**Basic stats:** peak, rms, loudness (LUFS), silence, clipping, DC offset, duration, sampleRate, channels
**Utilities:** gain, fade, normalize, pan, write, save, encode, decode, play, stream, record

### Naming Policy

| Namespace | Meaning |
|-----------|---------|
| `@audio/pitch-*` | Pitch detection algorithms (F0 estimation) |
| `@audio/beat-*` | Beat/onset/tempo detection |
| `@audio/shift-*` | Pitch-shifting algorithms |
| `@audio/stretch-*` | Time-stretching algorithms |
| `@audio/filter` | Audio-facing filter blocks — **exception**: facade package, not atom re-exports |
| `@audio/eq-*` | Equalization & tone shaping (shelves, parametric, graphic) |
| `@audio/weighting-*` | Frequency weighting curves (A, C, K, ITU468, RIAA) |
| `@audio/auditory-*` | Auditory filterbanks (bark, ERB, mel, gammatone) |
| `@audio/effect-*` | Audio effects (modulation, delay, distortion, utility) |
| `@audio/dynamics-*` | Dynamics processing (compressor, limiter, gate, expander, transient, envelope) |
| `@audio/spatial-*` | Spatial/channel utilities (midside, channelsplit, delay, crossfeed, panner, widen, haas) |
| `@audio/speech-*` | Speech processing (formant, LPC, vocoder) |
| `@audio/denoise-*` | Noise reduction & restoration |
| `@audio/synth-*` | Synthesis (oscillator, pluck, rhythm, chirp, DTMF, risset) |
| `@audio/spectral-*` | Spectral features (centroid, flatness, crest, rolloff, flux, slope, spread) |
| `@audio/mir-*` | Music information retrieval (structure, transcribe, downbeat, chroma, chord, key, genre, mood, tags, fingerprint, similarity, drums, lyrics, separate, tonnetz, tempogram) |
| `@audio/vocals-*` | Vocal isolation (isolate, remove) |

### What Stays in scijs

| Package | Why |
|---------|-----|
| `fourier-transform` | Generic FFT — used by radar, image processing, finance |
| `window-function` | Generic window functions — spectral analysis primitive |
| `digital-filter` | Generic filter design — electrical engineering, comms, control systems |
| `periodic-function` | Generic waveform math — graphics, simulation, synthesis |

### Migration Path

1. **Phase 1**: Publish `@audio/*` atoms from current umbrella packages (no breaking changes to existing packages).
2. **Phase 2**: Create `@audio/pitch`, `@audio/beat`, `@audio/shift`, `@audio/stretch`, `@audio/effect`, `@audio/denoise`, `@audio/dynamics`, `@audio/spatial`, `@audio/synth` umbrellas that re-export atoms.
3. **Phase 3**: Create `@audio/filter` as audio-facing facade over `digital-filter`.
4. **Phase 4**: Create `@audio/eq`, `@audio/weighting`, `@audio/auditory` umbrellas re-exporting their atoms.
5. **Phase 5**: Optionally transfer `fourier-transform`, `window-function`, `digital-filter`, `periodic-function` to `scijs` org with deprecation notices in `audiojs`.
