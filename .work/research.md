# audiojs — Research

## Current State

46 repos. Most dormant since 2016-2018.

**What's real:** audio-decode, audio-buffer, audio-type (350k+ npm/wk each). web-audio-api (859 stars, 100% WPT, recently rewritten). fourier-transform, pcm-convert (active). audio-encode + 6 format-specific encoders (new). 4 new decoders (aac, aiff, caf, wma). audio-speaker (revived).

**What's stale but downloaded:** audio-context (8k/wk, archived), audio-format (7k/wk, 6yr stale), audio-buffer-from (4k/wk, 5yr), audio-buffer-utils (4k/wk, 5 issues), audio-loader (5k/wk, 8 issues).

**What's abandoned:** audio (237★, 27 issues, "NOT MAINTAINED"), audio-play (59★, 14 issues).

**What's dead:** awesome-audiojs, docs (broken 2017 SPA), contributing (27 issues as forum), audio-extensions, audio-shader, audio-through, audio-source, audio-pcm-format, audio-buffer-remix.

**Website:** 404. Empty repo. No content, no catalog, no identity.

**Impression:** Abandoned, half-done, unclear quality. Yet 350k+ weekly downloads underneath. Invisible infrastructure that works, buried under the appearance of neglect.

## Ecosystem Fit

**Well-served (don't compete):** Howler.js (playback, 25k★), Tone.js (synthesis/scheduling, 15k★), wavesurfer.js (visualization, 10k★), standardized-audio-context (browser consistency, 400k/wk).

**Fragmented (consolidate):** Audio encoding (lamejs stale), effects (Pizzicato deprecated), recording (MediaRecorder inconsistent), metadata (ID3 scattered).

**Wide open:** Cross-runtime primitives (nothing works across browser+Node+Deno+Bun). Unified codec layer. AudioWorklet DX. Streaming audio processing. AI audio infrastructure (STT/TTS need primitives). Audio testing. Portable real-time DSP.

**Timing:** Howler.js winding down. Pizzicato deprecated. WebCodecs maturing. Cross-runtime JS is real. AI audio exploding. AudioWorklet underused due to DX pain.

**Conclusion:** audiojs = the standard library for audio in JavaScript. Not a framework (Tone.js), not a player (wavesurfer.js), not experiments (audio-lab). The infrastructure layer — like `sharp` for images, `date-fns` for dates.

## Naming Strategy

**Problem with `audio-*` everywhere:** Dilutes the `audio` core package. Public namespace — anyone can publish audio-*. Feels like bureaucracy, not design. `audio-speaker` looks like a knockoff of the existing `speaker` package.

**Problem with `@audio/*` initially:** Scoped packages can feel internal. `@babel/parser` feels like Babel internals; `recast` feels like a thing.

**`@audio/*` scope — where it makes sense:**
- `@audio/encode` — forced (npm rejected `audio-encode`)
- `@audio/speaker` — avoids confusion with TooTallNate's `speaker` package
- `@audio/*` sub-packages — platform binaries (`@audio/speaker-darwin-x64`), format codecs (`@audio/aac-decode`)
- The scope works for internal/low-level plumbing that users don't import directly

**`@audio/*` scope — where it doesn't:**
- `audio-decode` (350k/wk), `audio-buffer` (350k/wk), `audio-type` (350k/wk) — established, trusted, zero reason to migrate
- Migration churn for marginal benefit. `@audio/buffer` is confusing — AudioBuffer is a WAA class being enriched with subpath exports, not an org namespace thing
- `@babel/parser` feels like Babel internals; `audio-decode` feels like a thing you use

**Solution — three tiers:**

**Tier 1: Core pipeline** — established names, `@audio/` only where needed:
`audio` (entry point), `audio-decode`, `@audio/encode`, `audio-buffer`, `audio-type`, `@audio/speaker`, `web-audio-api`, `pcm-convert`

**Tier 2: Concept packages** — industry terms, top-level (standalone tools):
`colors-of-noise`, `parametric-eq`, `dynamics-processor`, `reverbs`, `spatial-audio`, `pitch-detection`, `beat-detection`, `loudness-meter`, `time-stretch`, `noise-reduction`, `signal-generator`

**Tier 3: DSP primitives** — general math, top-level (not audio-specific):
`fourier-transform`, `biquad-coefficients`, `digital-filter`, `periodic-function`, `window-function`, `a-weighting`

**The rule:** keep established names. Use `@audio/` only when forced (npm conflict) or to avoid confusion (speaker). Concept packages and DSP primitives use top-level industry/math names.

`digital-filter` replaces `iir-filter` — covers IIR + FIR + biquad, user owns it (scrapjs). `periodic-function` absorbs `periodic-wave` wavetable synthesis (a wavetable is just a precomputed periodic function).

**Conclusion:** 24 packages. Core pipeline keeps established names. `@audio/` reserved for encode, speaker, and internal sub-packages. Concept packages own their names. DSP primitives are general-purpose.

## Architecture

```
                        ┌───────────────────────────────────────┐
                        │              audio                     │  entry point
                        │  .decode() .encode() .trim() .play()  │
                        └─────────────────┬─────────────────────┘
                                          │
           ┌──────────┬─────────┬─────────┼───────┬──────────┬───────────┬───────────┐
           ▼          ▼         ▼         ▼       ▼          ▼           ▼           ▼
      audio-      @audio/   audio-    audio-  @audio/   web-audio-  pcm-convert  web-codecs
      decode      encode    buffer    type    speaker   api
           │          │        │                          │
      ┌────┴───┐  ┌───┴──┐    │                   ┌──────┼──────┐
      ▼        ▼  ▼      ▼    ▼                   ▼      ▼      ▼
  wav mp3 ogg  wav mp3  channel-mix          biquad-  digital-  periodic-
  aac flac ..  ogg opus                      coeffs   filter    function
               flac aiff
                                                    DSP primitives
```

**Concept packages depend on DSP primitives:**
```
parametric-eq      → biquad-coefficients + digital-filter
loudness-meter     → fourier-transform + a-weighting
colors-of-noise    → periodic-function
pitch-detection    → fourier-transform
beat-detection     → fourier-transform
time-stretch       → fourier-transform + window-function
noise-reduction    → fourier-transform + window-function
signal-generator   → periodic-function
dynamics-processor → standalone (envelope follower)
spatial-audio      → standalone (3D geometry + distance/cone)
reverbs            → standalone (delay networks + feedback)
```

## WAA Modularization

web-audio-api at 100% WPT. Extract standalone DSP modules as deps. Graph infrastructure stays in WAA.

**Extract as standalone packages:**

| Module | Lines | Target package | Rationale |
|--------|-------|---------------|-----------|
| `BiquadFilterNode._coefficients` | ~110 | `biquad-coefficients` | Pure math (RBJ EQ Cookbook). Useful outside audio — control systems, signal processing |
| `IIRFilterNode._tick` + `BiquadFilterNode._tick` DSP cores | ~45 | `digital-filter` | Filter processing engine. IIR/FIR/biquad. General DSP, not audio-specific. Extends beyond WAA with FIR, cascades, etc. |
| `PeriodicWave.buildTable` + `getBuiltIn` | ~70 | `periodic-function` | Wavetable synthesis. Merge into existing periodic-function (wavetable = precomputed periodic function) |
| `FloatPoint3D` + `DistanceEffect` + `ConeEffect` | ~235 | `spatial-audio` | 3D audio geometry. Standard models (inverse/linear/exponential distance, cone attenuation). Grows into full concept package |

**Absorb into existing packages:**

| Module | Lines | Target | Rationale |
|--------|-------|--------|-----------|
| `ChannelMixing` (W3C speaker mix) | ~138 | `audio-buffer` | Channel up/downmix is buffer operation. 13 speaker mix strategies |
| `pcm-encode` (DataView PCM) | ~40 | `pcm-convert` | Same domain — PCM format conversion |
| `dynamics-compressor` (envelope + knee) | ~40 | stays in WAA | Seeds `dynamics-processor` later when that package is built |

**After extraction:** WAA imports biquad-coefficients, digital-filter, periodic-function, spatial-audio as deps. WPT must stay 100% (4300/4300). No behavior change.

## Package Directory

### Core pipeline (10)

| Package | Status | What it does |
|---------|--------|--------------|
| `audio` | Reviving | Entry point. `.decode()` `.encode()` `.trim()` `.play()` |
| `audio-decode` | Active, 350k/wk | Decode any format → AudioBuffer. WASM codecs, lazy-loaded |
| `@audio/encode` | In progress | Encode AudioBuffer → any format |
| `audio-buffer` | Active, 350k/wk | AudioBuffer polyfill + buffer ops. Absorbs buffer-utils, buffer-from, channel-mixing |
| `audio-type` | Active, 350k/wk | Detect format from bytes |
| `web-audio-api` | Active, 859★ | Portable Web Audio API, 100% WPT |
| `@audio/speaker` | Revived | Cross-platform speaker output |
| `@audio/mic` | Planned | Cross-platform microphone input stream (mirror of speaker) |
| `web-codecs` | Planned | Portable WebCodecs API — WASM-based polyfill for cross-runtime codec access |
| `pcm-convert` | Active, 7k/wk | PCM format conversion. Absorbs audio-format, pcm-encode, sample-rate |

### DSP primitives (6)

| Package | Status | What it computes |
|---------|--------|------------------|
| `fourier-transform` | Active, 169★ | Split-radix FFT/IFFT |
| `biquad-coefficients` | Extract from WAA | RBJ EQ Cookbook. `coefficients(type, freq, sr, Q, gain) → {b0,b1,b2,a1,a2}` |
| `digital-filter` | Owned (scrapjs), rewrite | IIR/FIR/biquad filter processing. Seeded from WAA, extends beyond |
| `periodic-function` | Existing 55★, extend | Periodic functions + wavetable synthesis (absorbs periodic-wave from WAA) |
| `window-function` | Existing 60★, refresh | Hann, Hamming, Blackman, Kaiser, Flat-top, Tukey |
| `a-weighting` | Existing 44★, refresh | A/C/K frequency weighting curves |

### Concept packages (10)

| Package | Depends on | What it does |
|---------|------------|--------------|
| `colors-of-noise` | periodic-function | White, pink, brown, blue, violet, gray, velvet noise |
| `parametric-eq` | biquad-coefficients, digital-filter | Multi-band parametric + graphic EQ, crossover |
| `dynamics-processor` | — | Compressor, limiter, gate, expander, AGC |
| `reverbs` | — | Freeverb, Dattorro, Schroeder, convolution |
| `spatial-audio` | — | 3D positioning, distance, cone, panning, stereo width, mid-side |
| `pitch-detection` | fourier-transform | YIN, MPM, autocorrelation, HPS |
| `beat-detection` | fourier-transform | Tempo/BPM, onset detection, beat grid |
| `loudness-meter` | fourier-transform, a-weighting | LUFS (EBU R128), true peak, RMS, LRA |
| `time-stretch` | fourier-transform, window-function | Phase vocoder, WSOLA, pitch shift |
| `noise-reduction` | fourier-transform, window-function | Spectral subtraction, gating, dehum, declick |
| `signal-generator` | periodic-function | Sweep, impulse, DTMF, test tones, silence |

## Absorb & Deprecate

| Package | → Into | Reason |
|---------|--------|--------|
| `audio-buffer-utils` (4k/wk) | `audio-buffer` | Same domain (subpath exports) |
| `audio-buffer-from` (4k/wk) | `audio-buffer` | Same domain (subpath exports) |
| `audio-format` (7k/wk) | `pcm-convert` | Format string parsing |
| `audio-context` (8k/wk) | `web-audio-api` | Redundant |
| `audio-loader` (5k/wk) | `audio-decode` | fetch + decode |
| `audio-play` (2k/wk) | `audio` | One-liner |
| `audio-noise` (owned) | `colors-of-noise` | Better name |
| `audio-oscillator` (owned) | `periodic-function` / `audio` | Waveform generation |
| `audio-spectrum` (owned) | `loudness-meter` or keep | TBD |
| `decibels` | `loudness-meter` | Two formulas |
| `sample-rate` | `pcm-convert` | Just an enum |
| `is-audio-buffer` | Delete | `instanceof AudioBuffer` |

## Archive

`docs`, `awesome-audiojs`, `contributing`, `audio-extensions`, `audio-shader`, `audio-through`, `audio-source`, `audio-pcm-format`, `audio-buffer-remix`

## Deferred (audio-lab)

Modulation effects (chorus, flanger, phaser, tremolo, vibrato, ring-mod), distortion (waveshaper, bitcrush, saturator), granular synthesis, physical modeling, source separation, ambisonics.

## Website

**Design:** Postmodern audio standard. W3C-for-audio. Light/dark, monochrome, Dieter Rams. Audiotechnica aesthetics. Jekyll + sprae. Under 50kb. No JS required for reading.

**Content:** Each package = mini-article + interactive demo. Demos double as tools (audio-decode demo decodes your file into waveform with "edit"/"save as" buttons). Reduce cognitive load.

**Inspiration:** colors-of-noise spectral visualization, BASE news listing pattern, waveform-player component.

## Sustainability

**Grant-worthy because:** 350k+ weekly downloads, cross-runtime portability, pure JS/WASM, WPT-compliant.

**Sources:** GitHub Sponsors, Open Collective, Sovereign Tech Fund, Google Web Fund, NLnet, Sloan Foundation, corporate (Spotify, SoundCloud, Descript, Adobe).

**Pitch:** "Audio in JS is fragmented. audiojs provides the missing standard library — pure JS/WASM codecs, cross-runtime AudioBuffer, the only portable Web Audio API with 100% spec conformance. Used by 350k+ projects weekly."

## The Soul

The secret is not technology. The secret is *care*. Most audio libraries in JS are weekend projects that grew. audiojs treats audio as a discipline. Every sample matters. Every format works. Every platform works. Every edge case handled. Not because it's profitable — because it's *right*.

The flair: **invisible perfection**. You never notice audiojs working. You only notice when you use something else and it breaks.
