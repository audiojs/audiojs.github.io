
## Priority

- [x] `audio`: finish, publish, integrate with filters: on par with SOX: compress, reverb, denoise, pitch-correct, denoise, declick, stretch
- [ ] `floabeat`: collection of fixtures for testing algorithms
  * [ ] integrate into beat-detection, audio, pitch-detection, pitch-shift, time-stretch etc
- [ ] `signal-generator` — sweep, impulse, DTMF, test tones
  - [ ] `audio-input?` – unified audio source: files, gens, urls, records, TTS, noises?

## [ ] Website

### Strategy

Goal: prepare for **grants** (NLnet, Sovereign Tech Fund, Sloan, Google Web Fund) + **OSS corporate sponsors** (videojs/babel model) + **freemium hosted product** (cleanvoice/auphonic model). Three audiences, one site.

* **Skip oversaturated commodity tools** (converter, trimmer, joiner) — flooded by ad-driven SEO farms; race-to-the-bottom; doesn't differentiate audiojs.
* **Win where ML+DSP meets browser**: enhancer-class tools no one ships purely client-side, privately.
* **Killing feature: auto-chain analyser** — user picks content type (Speech / Music / Voice-over-Music), the system measures (LUFS, noise floor, peaks, spectral balance, hum, sibilance, clipping), then **picks and configures a processing chain** from existing modules (denoise → declick → de-hum → de-ess → adaptive EQ → multiband comp → limiter). Output is *both* the processed file *and* the visible chain (so the user learns what was done and which packages did it). Dolby.io does this server-side and paid; we do it open and client-side.
* **Privacy moat**: "Files never leave your device. No upload, no signup, no watermark." Top-3 ranking signal in this category.
* **Each tool page = proof of one module cluster.** Tool brings traffic; "powered by" links push devs into the catalog; catalog converts into stars, sponsors, grant evidence.

* Audio recorder, audio editor, audio cutter, audio enhancer, free sound effects, zfx sound, audio extractor, audio converter, audio mixer, audio to text,

### Flagship tools (the wedge — build first)

In order of impact × feasibility today:

* [ ] **Speech Enhancer** — voice recordings: denoise + declick + de-hum + de-ess + loudness normalize (-16 LUFS speech target). Audience: podcasters, journalists, course creators. Direct competitors: cleanvoice.ai ($10/mo), adobe podcast enhance, krisp. Modules: `noise-reduction`, `audio-effect`, `a-weighting`, `audio-buffer/util.normalize`.
* [ ] **Music Enhancer** — music tracks: denoise (gentler), spectral repair, stereo-image fix, mastering chain (multiband comp + limiter + LUFS target -14). Audience: bedroom producers, archivists. Competitors: landr ($10-25/mo), bandlab mastering, eMastered. Modules: `noise-reduction`, `audio-filter`, `dynamics-processor` (todo), `a-weighting`.
* [ ] **Mix Analyser** — drop a track, get a *report*: LUFS-I, true peak, dynamic range (PLR/PSR), spectral balance vs reference genre, mono compatibility, clipping detection, recommendations. Audience: mixing engineers. Competitors: youlean, izotope insight ($199), masteringthemix levels ($79). Modules: `a-weighting`, `fourier-transform`, `audio-buffer`. (No processing — pure measurement; smallest scope, fastest ship.)
* [ ] **Auto-Chain** (umbrella product, after the three above) — drop file → pick content type → analyse → pick chain → process → render. Visible chain. Editable. Exports as audiojs JS pipeline (recipe). This is the grant story and the freemium upsell.

### Auto-Chain engineering map

Reverse-engineered from Dolby.io Media Enhance (classical DSP, no ML in the hot path). All achievable with existing or near-term modules.

**Pipeline:**

```
input → user picks content type → analysis pass (no processing) →
  adaptive chain (parameters set from analysis) → loudness target → output
  + visible chain JSON (audiojs recipe)
```

**Stage 1 — Analysis pass** (read-only):

* [ ] Loudness: ITU-R BS.1770-4 integrated LUFS, LRA, true peak (`loudness` module, new)
* [ ] Noise PSD estimation: minimum-statistics on quiet frames (Martin 2001) → builds noise profile (`noise-reduction`)
* [ ] LTAS (long-term average spectrum) → drives adaptive EQ (`spectral-stats`, new)
* [ ] Sibilance band energy (5–9 kHz) → de-ess threshold (`spectral-stats`)
* [ ] Hum detection: spectral peaks at 50/60/100/120 Hz (`spectral-stats` + `fourier-transform`)
* [ ] Clipping detection: consecutive samples at ±1 (`audio-buffer/util`)
* [ ] Voiced/unvoiced ratio, F0 range (informs presets, also surfaces "is this really speech?" if user picked wrong)

**Stage 2 — Adaptive chain** (parameters from Stage 1):

* [ ] DC remove + low-cut HPF 20–80 Hz (`digital-filter`)
* [ ] Hum notch comb at detected mains frequency + harmonics (`digital-filter`)
* [ ] Spectral noise reduction — Wiener / MMSE-LSA (Ephraim-Malah) using estimated noise PSD (`noise-reduction`)
* [ ] Declick / decrackle — transient detection in HF + interpolation across short bursts (`noise-reduction`, planned)
* [ ] De-ess — dynamic high-shelf or band compressor at 5–9 kHz, sidechain on sibilance (`audio-effect`)
* [ ] Adaptive EQ — match measured LTAS toward content-type target curve, smoothed in critical bands (`digital-filter` + target curve library)
* [ ] Multiband compressor — light, content-type-specific (`dynamics-processor`, todo)
* [ ] True-peak limiter, ceiling -1 dBTP (`dynamics-processor`)
* [ ] Loudness normalize to target: speech -16 LUFS, music -14 LUFS, voice-over-music -16 LUFS (`loudness`)

**Stage 3 — Output:**

* [ ] Render processed audio
* [ ] Render visible chain (graph + parameters + module names + paper citations)
* [ ] Export chain as audiojs JS recipe (copy-paste runnable)

**New modules needed (not in current org):**

* [ ] `loudness` — BS.1770-4 integrated LUFS + LRA + true-peak meter. Small, well-specified, citable.
* [ ] `spectral-stats` — LTAS, spectral centroid, voiced/unvoiced ratio, sibilance/hum band energy. Foundation for adaptive EQ + analyser.
* [ ] `dynamics-processor` (already in backlog) — promote: needed for both flagship Music Enhancer and Auto-Chain.
* [ ] **Target curve library** — small JSON: per content type (speech / music genres / voice-over-music), the LTAS target. Drives adaptive EQ. This is the secret-sauce data layer; build it iteratively from public references (EBU R128 speech profile, mastering reference curves).
* [ ] **Chain scheduler** — meta-module: takes analysis output + content-type preset → emits configured chain. The orchestrator. Lives in `audio` package or new `audio-chain`.

**Why no classifier:** user prompt is faster, more honest, and avoids ML weights in the hot path. If the user's pick disagrees with our voiced/unvoiced measurement, surface a soft hint ("This sounds like music — use Music preset?") but never override.

**Why this works as the wedge:** every box maps to an existing or planned audiojs module. No ML weights to host, train, or version. Deterministic and re-runnable. The visible chain is something Dolby will *never* show — because that's their moat. Showing it is *our* moat.

### Match-by-Reference (Matchering-style mastering)

Second mode of Auto-Chain. Same engine, target curve comes from a user-supplied reference instead of a preset. Reproduces the algorithm of [Matchering 2.0](https://github.com/sergree/matchering) (GPL Python, ~2000 lines, fully classical DSP) and the commercial behaviour of iZotope Ozone Match EQ + Master Assistant ($249) and Mastering The Mix REFERENCE ($99).

**Selling line:** "Make my podcast sound like Joe Rogan's." / "Master my track like this Daft Punk reference."

**Algorithm** (no ML, all classical):

* [ ] Load reference + target into `audio-buffer`
* [ ] Compute LTAS of both via `fourier-transform` + `spectral-stats` (Welch / averaged FFT, smoothed in critical bands or 1/3-octave)
* [ ] Derive matching EQ curve = `ref_LTAS - target_LTAS`, smoothed, with safety clamps (max ±12 dB to avoid catastrophic boosts)
* [ ] Apply as **linear-phase FIR** (no phase smear on transients) via `digital-filter` FIR mode
* [ ] Match RMS / integrated loudness via `loudness` (BS.1770) → gain trim
* [ ] Match stereo width via mid/side decomposition + side-band gain (new utility in `audio-buffer/util` or `spatial-audio`)
* [ ] Match true peak via `dynamics-processor` limiter, ceiling -1 dBTP

**New / extended modules needed:**

* [ ] `audio-buffer/util.ms()` + `.sm()` — mid/side encode/decode (small, ~20 lines, very useful standalone)
* [ ] `digital-filter` — confirm linear-phase FIR design from arbitrary frequency response (frequency-sampling method or windowed inverse FFT)
* [ ] `spectral-stats.ltas()` — already needed for adaptive EQ; same primitive
* [ ] `audio-chain` — extend orchestrator to accept `{mode: 'reference', reference: AudioBuffer}` in addition to `{mode: 'preset', type: 'speech'|'music'|...}`

**Output:**

* [ ] Processed audio
* [ ] Visible chain (same format as preset mode) — EQ curve plotted against reference + target LTAS
* [ ] Exported audiojs JS recipe — captures the derived EQ as an FIR coefficients array, fully reproducible without the reference file

**Tool page:** `/enhance/match` — drop **target** + **reference**, get matched master + visible analysis. Direct competitor positioning: "Matchering, in your browser, with the chain shown."

**Why this is strategically big:**

* Bypasses the target-curve-tuning problem entirely (user provides the answer)
* One-line value prop everyone understands
* Matchering proved the algorithm; iZotope proved the price ceiling ($249); we ship it free + open + client-side
* Strongest grant story: "open-source reference mastering, no upload, on-device, exported as a reproducible recipe"

### De-Slop (remediation of generative-AI audio artefacts)

Fourth flagship. Novel category — nobody ships this today. Suno / Udio / MusicGen / ElevenLabs music produce voices with recognizable codec-induced artefacts (Encodec / SoundStream / DAC tokenization). Classical DSP can suppress (not recover) most of them. Privacy story is huge: people are embarrassed they used Suno; "fix my AI track without uploading it" is a real desire.

**Selling line:** "Clean up the AI artefacts. No re-generation, no upload, your track stays yours."

**Tool page:** `/enhance/deslop` — drop AI-generated track → choose preset (Vocal / Instrumental / Mixed) → see detected artefacts → render cleaned + visible chain.

**Honest scope statement on the page:** "Reduces AI-codec artefacts (ringing, spectral holes, pitch jitter, formant wobble, bandwidth ceiling). Cannot recover information the original generation lost."

**Artefact taxonomy (what we detect / fix):**

| Artefact | Cause | Fix |
|---|---|---|
| Codec ringing / pre-echo | Token-domain transient smear | Transient-aware short-time spectral subtraction |
| Spectral holes | Dropped/quantized tokens | Spectral interpolation across short gaps |
| Pitch micro-jitter on sustained vowels | Token quantization in pitch dimension | YIN F0 track → smooth → PSOLA / phase-vocoder resynth |
| Formant wobble | Source-filter incoherence | LPC pole tracking → smooth pole trajectories → re-synthesize |
| Aperiodicity in voiced segments | Glottal source noise | Source-filter decomposition + clean glottal pulse re-excitation |
| Bandwidth ceiling (~12-14 kHz) | Codec sample rate | Spectral band replication (SBR) — extend HF from midband harmonics |
| Transient softness | Token quantization | Transient sharpening (HF emphasis on attack frames) |

**Algorithm — conservative MVP** (3 months realistic, all classical DSP):

```
input → STFT analysis →
  detect voiced segments (F0 confidence + zero-crossing rate) →
  spectral repair (interpolate holes) →
  on voiced frames only:
    YIN pitch track → low-pass smooth F0 → PSOLA pitch correction
    LPC formant track → smooth pole trajectories → re-filter
  passthrough unvoiced/transients (don't touch consonants)
  spectral band replication (HF synthesis from midband harmonics)
  loudness normalize
inverse STFT → output + visible chain
```

**Algorithm — ambitious version** (6-12 months, "gaussian splats for sound"):

Sinusoidal + Noise + Transients model (SMS / SMS+T, Serra-Smith 1990). Each sinusoid is a "splat" in (time × frequency × amplitude × phase) — wobble removal = smoothing trajectories.

```
input → STFT →
  peak-pick → sinusoidal track formation (McAulay-Quatieri 1986) →
  smooth frequency / amplitude / phase trajectories per partial →
  separate residual = input - resynth(sinusoids) →
  smooth residual envelope (the "noise" layer) →
  detect & passthrough transients (don't smooth attacks) →
  resynthesize: sinusoids (smoothed) + noise (smoothed) + transients (raw)
output
```

**New modules needed:**

* [ ] `lpc` — Linear predictive coding: autocorrelation method (Levinson-Durbin), pole/formant extraction, LPC synthesis filter. Foundation for vocoders. ~200 lines, well-cited (Markel & Gray 1976).
* [ ] `psola` — Pitch-Synchronous Overlap-Add for pitch correction without time stretch. Could live inside `pitch-shift` as a method.
* [ ] `sinusoidal-model` — McAulay-Quatieri analysis/synthesis. Peak picking, partial tracking, parameter smoothing, additive resynthesis. The big new module. ~600 lines.
* [ ] `voice-vocoder` (ambitious) — WORLD-style source-filter decomposition (F0 + spectral envelope + aperiodicity). Reproducible from open Morise 2016 paper, ~5000 lines C → JS port. Phase 2.
* [ ] `spectral-repair` — extend `noise-reduction` with gap interpolation across short spectral holes
* [ ] `sbr` (spectral band replication) — fold midband harmonics up to fill HF; could live in `audio-effect` (aural exciter family already there)

**Output (visible chain):**

* [ ] Processed audio
* [ ] Per-artefact severity readout (ringing: low / spectral holes: 14 detected / pitch jitter: ±18 cents / formant wobble: moderate / bandwidth: 13.2 kHz → extended to 18 kHz)
* [ ] F0 track plot: original vs smoothed
* [ ] Formant track plot: F1/F2/F3 original vs smoothed
* [ ] Exported audiojs JS recipe

**Why this fits audiojs strategy:**

* All classical DSP, "no ML in the hot path" stance preserved
* Defensible long-term: nobody else does this; iZotope RX has the closest tools (spectral repair, mouth de-click) but no AI-deslop preset
* Strongest grant pitch in the space: "open-source remediation of generative-AI audio artefacts" is exactly what NLnet / Sloan / Sovereign Tech Fund are calling for in 2026
* Builds vocoder infrastructure (`lpc`, `sinusoidal-model`, `voice-vocoder`) that unlocks future tools: voice morphing, cross-synthesis, time-stretch quality bump, formant-preserving pitch shift — all reusable
* Demonstrates audiojs is at the *research* tier, not just utility tier

**Hard limits, stated honestly on the page:**

* Cannot recover info the codec discarded
* Cannot fix lyric / diction errors (content vs carrier)
* Cannot make Suno voice sound like a *specific* clean singer (that's voice cloning, separate problem with ethical baggage — explicitly out of scope)
* Sweet spot is *suppress*, not *replace* — over-aggressive cleanup creates a new uncanny voice

**Build order within Auto-Chain track:**

1. Speech Enhancer (paying market exists)
2. Music Enhancer (paying market exists)
3. Match-by-Reference (paying market exists, we underprice)
4. **De-Slop MVP** (no paying market yet — we *create* it; strongest grant pitch)
5. De-Slop ambitious (sinusoidal model + voice-vocoder)

### Supporting tool pages (Tier-2, lower priority)

* [ ] BPM detector (`beat-detection`)
* [ ] Pitch / key detector (`pitch-detection`)
* [ ] Spectrogram viewer (`fourier-transform`)
* [ ] Filter lab (`audio-filter`, `digital-filter`)
* [ ] Loudness meter (`a-weighting`) — real-time LUFS

### Tool page template (one URL = one job)

* [ ] H1 = exact query phrasing ("Enhance speech recording")
* [ ] Tool above the fold — drop file → instant result → one-click download
* [ ] "Files never leave your browser" line
* [ ] **Visible chain** — show the processing graph, parameters, packages used (each links to module dossier)
* [ ] "How it works" section (~2 paragraphs, paper citations) — the SEO body
* [ ] FAQ block with `FAQPage` JSON-LD
* [ ] Related tools strip
* [ ] Server-rendered HTML (static), client-side hydration only for the tool

### Freemium ladder (parallel track, after free tools land traction)

* [ ] Free: client-side, all features, file size cap (~50MB), no batch.
* [ ] Pro (~$10-15/mo): batch, larger files, hosted API access, premium chains (better ML denoise weights), no cap.
* [ ] Team / API (~$50-200/mo): API endpoints, webhook callbacks, SLA. Same engine, hosted.
* [ ] OSS modules stay MIT forever. Pro = hosted convenience + curated weights, not paywalled algorithms.

### Funder/sponsor evidence the site must surface

* [ ] Ecosystem reach: total weekly downloads across org (live counter)
* [ ] Dependents count via npm/GitHub
* [ ] Used-by logo strip
* [ ] WPT conformance % (live link to CI)
* [ ] Roadmap with dated stamps (videojs pattern)
* [ ] Maintainer + contributors strip (bus-factor answer)
* [ ] Open Collective / GH Sponsors live ledger
* [ ] Standards engagement (W3C Audio WG, AES, IETF) — small badges

### Site sections

* [ ] `/` — cover + CTA + module catalog teaser + roadmap strip + sponsor strip
* [ ] `/enhance/speech` — flagship tool
* [ ] `/enhance/music` — flagship tool
* [ ] `/analyse/mix` — flagship tool
* [ ] `/auto` — auto-chain umbrella (later)
* [ ] `/tools` — index of all tools
* [ ] `/modules` — package catalog (dossier cards)
* [ ] `/dsp` — DSP primitives + briefs (paper-cited)
* [ ] `/platform` — polyfill compliance dashboard
* [ ] `/sponsor` — tiers, ledger, current backers

### Build order (smallest first, traction-gated)

1. [ ] Cover page polish + module catalog stub + sponsor/roadmap strips (the grant pitch is functional at this point)
2. [ ] **Mix Analyser** ships first — measurement only, no ML, fastest path to a real working tool
3. [ ] FUNDING.yml + Open Collective + GH Sponsors live (do during step 2, not after)
4. [ ] **Speech Enhancer** ships second — proves the chain idea
5. [ ] Apply NLnet NGI Zero with: working tools + ecosystem stats + roadmap
6. [ ] **Music Enhancer** + Auto-Chain umbrella
7. [ ] Apply Sovereign Tech Fund with traction numbers
8. [ ] Freemium hosted layer

### Original demos (keep, lower priority)

* [ ] before/after demos for algos
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
