## Motivation

Sound is the first element and medium of communication.

## How can audiojs serve and to whom?

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
* Defeedback: realtime feedback reducer atom/plugin
* Any sort of vst/plugin chain processing in dante network
* Apply VST to native audio (mac) Free/DIY: BlackHole → DAW/plugin host → speakers

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
| **Public grants** | NLnet Open Internet Stack (€5-50k, reopens post-summer 2026), STF Fellowship (maintainer stipend, ~Q1 2027 window, ~8% acceptance, Montreal precedent), STF Resilience (in-kind audit, rolling, apply now), NumFOCUS ($1-5k, scijs layer only) | Infrastructure at risk — 350k/wk downloads, one maintainer, zero funding. (2026-07: NGI Zero closed; "Google Web Fund" doesn't exist; Sloan = scientific framing only) |
| **Security funds** | GitHub Secure Open Source Fund ($10k/project, rolling, no residency/entity bar — best near-term shot) | audio-decode parses untrusted WAV/MP3/FLAC/OGG binaries — hardening a real attack surface |
| **Corporate sponsors** | Spotify, SoundCloud, Descript, Adobe, Dolby, Izotope, BandLab, Splice, Riverside.fm, Vercel | You already depend on this — $2k/mo vs $200k/yr to build internally |
| **Individual devs** | Frontend devs, DSP hobbyists, music tech builders, podcasting tool makers | GitHub Sponsors + Open Collective; sponsor wall; "fund the next package" campaigns |
| **Pro audio** | Ableton, Steinberg, PreSonus, Dolby, BBC R&D | Consulting contracts — "we build the open-source primitive, you fund the work" |
| **Academic/research** | Stanford CCRMA, MIT Media Lab, IRCAM; Montreal: Mitacs via CIRMMT (McGill) / BRAMS (UdeM) — $15k CAD/cycle, needs professor + entity | Interactive demos as teaching tools; algorithm paper citations; research partnerships |

**Funding verdict (deep-verified 2026-07)**: OSS money is redistributed, not gone — away from application-shaped micro-grants toward gates (criticality flags, internal nominations, public profile). Honest 12-month expectation ~$8-15k, optimistic-modal, dominated by one GitHub-fund win. In every surveyed audio-OSS comparable, donations never reached a living wage (Zrythm <$50/mo organic; LMMS/Surge/Dexed = hosting costs); durable income came only from a commercial derivative product (Ardour >$100k/yr subscriptions, JUCE, VCV) or employment. **Grants = episodic bridge; the freemium/pro tier is the income line** — which also validates the jz→VST/pro-tier direction as the long-term monetization, gated on the DSP integration proof.

## Goal

**corporate outreach/consulting first** (fastest to cash; npm stats already exist, no website needed) + **grants** (NLnet Open Internet Stack, STF Fellowship 2027, NumFOCUS for scijs) + **freemium hosted product** (cleanvoice/auphonic model). Three audiences, one site. Passive sponsor buttons ≈ 0 (ffmpeg $10k lifetime, ffmpeg.wasm $163, wavesurfer 3 sponsors) — hygiene, not revenue.


## Refs / integrations

* https://github.com/webprofusion/OpenAudio
* https://g-meh.com/
* https://github.com/blechdom/webgpuaudio/tree/main
* https://www.soundcn.xyz/

**Algorithm sources** (implementation references for stubs): [musicdsp](https://github.com/bdejong/musicdsp/tree/master/source) · [sndkit](https://github.com/paulbatchelor/sndkit) · [essentia reference](http://essentia.upf.edu/algorithms_reference.html) · [JSFX](https://github.com/JoepVanlier/JSFX) + [renzol2/fx](https://github.com/renzol2/fx) (effect recipes) · [klangfreund LUFSMeter](https://github.com/klangfreund/LUFSMeter/blob/master/Ebu128LoudnessMeter.cpp) + [x42 meters.lv2](https://github.com/x42/meters.lv2) (loudness differential-test targets) · viznut/pelulamu/erlehmann bytebeat collections · Farina 2000 (ESS) · Waterschoot & Moonen 2011 (feedback control) · Pink Trombone / gmoe-voder (voice) · [sonic](https://github.com/waywardgeek/sonic) (speech-rate WSOLA tuning) · livecoding engines as integration targets, not atoms: strudel, kabelsalat, genish.js, glitch, noisecraft, Teasynth.

## Landscape (verified 2026-07)

* **hyperframes** (HeyGen, 33k★ in 4 months): NOT audio — HTML→video renderer for AI agents. Three signals: (1) agent tools win on formats agents already know — plain JS/JSON, never a new DSL; (2) MCP server + packaged skills is the proven distribution unit; (3) its audio layer is volume-only `<audio>`+FFmpeg mixing — agent-authored media pipelines have **no DSP/loudness layer**. That's our adjacent lane, not a competitor.
* **Voice agents** (OpenAI Realtime, LiveKit, Pipecat v1.0): durable client-side demand for 48↔16/24kHz resample / VAD / buffering plumbing — model-agnostic, under-tooled in browser.
* **ML vs classical split**: ML wins raw denoise ceiling (DeepFilterNet), separation, transcription; classical keeps decode/encode, resample, loudness/LUFS, spectral repair of known artefacts, deterministic re-runnable chains. Sell chain transparency + privacy, not denoise quality.
* **Open niches**: MIR (essentia.js: no npm release in 5 yrs; Meyda: dead 2 yrs, still 14.6k dl/wk); Node PCM I/O (speaker/naudiodon 2+ yrs stale; prism-media 2.08M dl/wk = latent demand); per-codec decode atoms vs ffmpeg.wasm's multi-MB blob (420 open issues); audio-DSP MCP server (none exists); BPM/key agent tools (zero competitors).
* **Threats**: IRCAM node-web-audio-api (Rust, v2.0 2026-05, ~6× our web-audio-api downloads); sapphi-red/web-noise-suppressor (free ML AudioWorklets); soundtouchjs (active but WSOLA-only — beat with algorithm breadth, PSOLA/pvoc/paulstretch).
* **De-slop**: real + monetized for speech (Cleanvoice, Auphonic); AI-music **watermark** stripping = adversarial dead end (SynthID engineered to survive processing) — stays out of scope, artefact suppression stays in.
* **Determinism as feature**: agent pipelines (CI, regression tests) require bit-exact same-input→same-output rendering — foreground it.

---

## `@audio` Package Ecosystem

**Status (2026-07, post-restructure)**: 36 repos at `~/projects/@audio/<sub>`, one shape everywhere — root = thin umbrella, every algorithm an atom in `packages/*`. 847 tests green across 29 suites; every pre-restructure test preserved (pitch-detection 62 = pitch 46 + mir 16; audio-filter 187 = filter 98 + weighting 30 + auditory 28 + eq 25 + spatial-crossfeed 4 + synth-noise 2; audio-effect 58 = effect 39 + spatial 7 + dynamics 1 ported + 11 superseded). Published on npm today: decode 12 + encode 10 + speaker 5 atoms (mic placeholders at 0.0.0) — everything else awaits Phase-1 publish. Baseline coverage matrix vs FFmpeg/SoX/librosa/Pedalboard/MIREX (with test evidence): `~/projects/audio/.work/baseline.md`. Local cross-repo atom deps use `file:` links (loudness-lufs→weighting-k, dynamics-multiband→eq-crossover, mir-melody→pitch-yin, mir-tempogram→beat-core) — swap to semver at publish. GitHub repos keep historical names; unscoped npm packages stay live until scoped publish + deprecation. Cite the published ~27 in pitches. Paths below relative to `~/projects/@audio/`.

### Design Principles

1. **audiojs = audio production & music DSP** — DAW/plugin language, not generic signal processing.
2. **scijs = generic DSP primitives** — filters, transforms, windows, math.
3. **audiojs depends on scijs** — wrappers and re-exports, not duplication.
4. **umbrellas re-export atoms** — `@audio/pitch` → `@audio/pitch-yin`, `@audio/pitch-mcleod` etc.
5. **atoms are installable standalone** — `@audio/pitch-yin` works without `@audio/pitch`.
6. **stack = units, not apps** — `@audio` holds processing/analysis/synthesis units and infrastructure; applications (bytebeat machine, livecoding, site tools, wavearea) live outside and compose units. (bytebeat moved out to `~/projects/bytebeat` accordingly.)

### `@audio` Atoms & Umbrellas

One repo shape everywhere: root = thin umbrella (index.js re-exports atoms + tests), every algorithm = an installable atom in `packages/*`. Status: ✔ implemented+tested, ◌ stub (package.json + README, `private: true`).

#### `@audio/pitch` — pitch detection (F0)
✔ `pitch-{yin, mcleod, pyin, hps, cepstrum, swipe, autocorrelation, amdf}` — 46 tests. Chroma/chord/key moved to `@audio/mir`.

#### `@audio/beat` — beat detection
✔ `beat-{core, onset, tempo, detect, track}` — 70 tests. `beat/synth.js` + `beat/floatbeats.js` stay as root test fixtures (future `floatbeats` package).

#### `@audio/shift` — pitch shifting
✔ 16 atoms `shift/packages/shift-*` — core, ola, wsola, pvoc, pvoc-lock, transient, psola, granular, paulstretch, sms, hpss, formant, sample, hybrid, delay, lpc. Source-complete, unpublished. audio-effect's granular pitch-shifter deduped into these.

#### `@audio/stretch` — time stretching
✔ 10 atoms `stretch/packages/stretch-*` — core, wsola, pvoc, pvoc-lock, pghi, transient, paulstretch, psola, sms, hybrid.

#### `@audio/filter` — audio-facing filters
✔ `filter-biquad` (highpass, lowpass, bandpass, notch, allpass), `filter-{comb, dcblocker, resonator, variable, preemphasis, spectral-tilt}`, analog models `filter-{moog-ladder, diode-ladder, korg35, oberheim}` — 98 tests (incl. speech + integration). Generic filter design stays in `digital-filter` (scijs).

#### `@audio/speech-*` — speech processing (atoms live in the `filter` repo)
✔ `speech-{formant, lpc, vocoder}` — co-located with `@audio/filter-resonator` (formant depends on it); extract to own repo after publish. ◌ `speech-world` (WORLD vocoder — F0 + spectral envelope + aperiodicity, Morise 2016).

#### `@audio/eq` — equalization & tone shaping
✔ `eq-{highshelf, lowshelf, parametric, graphic, baxandall, tilt, crossover, fir, dynamic}` — 30 tests. FIR: exact-identity/linear-phase; dynamic = band-energy-driven peaking (Pro-Q3/soothe class): hot band −3 dB+, other bands ±0.7 dB, transparent below threshold. Crossfeed moved to `@audio/spatial-crossfeed`.

#### `@audio/weighting` — frequency weighting filters
✔ `weighting-{a, c, k, itu468, riaa}` — 30 tests; K is exact BS.1770-4 at any fs (the `@audio/loudness` prerequisite). Magnitude-response *functions* remain in the root `a-weighting` package (different kind — absorb later as `.response(f)` per atom).

#### `@audio/auditory` — auditory filterbanks
✔ `auditory-{bark, erb, mel, gammatone, octave}` — 28 tests.

#### `@audio/effect` — audio effects
✔ 19 atoms — modulation `effect-{phaser, flanger, chorus, wah, autowah, tremolo, vibrato, ringmod, freqshift}`, delay `effect-{delay, multitap, pingpong}`, distortion `effect-{distortion, bitcrusher, exciter}`, utility `effect-{gain, mixer, slew, noiseshaper}` — 36 tests. ◌ `effect-{sbr, stutter, graindelay, subbass, lofi}`. dynamics/ dissolved into `@audio/dynamics`; spatial/ → `@audio/spatial`; reverb promoted to `@audio/reverb`; pitch-shifter superseded by `@audio/shift` (git history keeps all).

#### `@audio/dynamics` — dynamics processing
✔ `dynamics-{core, envelope, compressor, limiter, gate, expander, deesser, ducker, softclip, compand, transient-shaper, multiband, opto, fet, vca, varimu, leveler}` — 32 tests. Character models verified behaviorally: opto's T4 program-dependent release (long reduction → slower recovery), fet ≫ varimu attack speed, varimu drive-dependent ratio; leveler = dynaudnorm-class framewise riding, peak-guarded. Canonical home for all dynamics per the `audio` plan ("compressor/limiter/gate/… → dynamics-processor"); audio-effect's parallel variants deleted.

#### `@audio/denoise` — noise reduction & restoration
✔ `denoise-{core, spectral, wiener, omlsa, dehum, declick, decrackle, declip, dewind, deplosive, deesser, debreath, dereverb, detect, gate}` — 42 tests. ◌ `denoise-repair` (time×frequency gap interpolation — De-Slop / RX class). core = STFT (batch/stream/analyse) + noise estimation (min-stats, IMCRA) + VAD + AR + quality metrics.

**Gate/de-esser qualification** (deliberate near-dupes): `dynamics-gate` = musical hold-based gate; `denoise-gate` = look-ahead + hysteresis restoration gate. `dynamics-deesser` = broadband sidechain-compressor; `denoise-deesser` = dynamic peaking-EQ. Merge candidates at the atom migration, behind differential tests.

#### `@audio/spatial` — spatial & channel tools
✔ family complete: `spatial-{panner, widener, haas, autopan, crossfeed, midside, channelsplit, delay, microshift, surround}` — 11 tests (M/S roundtrip identity, sample-exact delay, microshift ±cents verified, 5.1 matrix content checks). FFmpeg + H3000 parity closed.

#### `@audio/mir` — music information retrieval
✔ `mir-{chroma, chord, key, tonnetz, melody, tempogram, structure, fingerprint}` — 21 tests (+ Foote novelty: texture seams found ±0.35 s; Wang landmark fingerprint: self/snippet-offset/noise-robust/junk-rejected). ◌ `mir-{downbeat, multif0, similarity, transcribe, drums, coversong}`. ML-tier (genre/mood/tags/separate) deferred — needs hosted weights, conflicts with no-ML-in-hot-path.

#### `@audio/synth` — synthesis & generators
✔ family (near-)complete: noise colors, chirp, osc, dtmf (Q.23 pairs), pluck (Karplus-Strong), risset, rhythm (grid-timed), adsr, lfo, wavetable (morph verified), drum (membrane/metal/noise), voice — 11 tests. ◌ `synth-{sfx, poly}` (ZZFX-class + voice allocator).

#### `@audio/spectral` — spectral features
✔ `spectral-{centroid, spread, flatness, rolloff, flux, slope, crest, mfcc, ltas, edit}` — 12 tests, analytic identities (Peeters 2004 / aspectralstats; MFCC gain-invariance per DCT property; LTAS Welch; edit = COLA STFT region gains with reconstruction + band-kill verified). ✔ family complete: + `spectral-{freeze, contrast, harmonics, cqt}` — 16 tests total (freeze sustains, contrast tone≫noise, harmonics matches analytic saw T1=0.645, CQT exact octave spacing).

#### `@audio/loudness` — loudness metering
✔ family complete: `loudness-{lufs, truepeak, lra, replaygain, dr}` — 10 tests. lufs = EBU 3341 cases 1–3 ±0.1 LU; truepeak = 4× sinc inter-sample (fs/4@45° reads 0 dBTP where sample peak is −3 dBFS); lra = EBU 3342 (−20/−30 alternation → 10 ±1 LU); replaygain = RG2 −18 LUFS reference; dr = TT crest method.

#### `@audio/vocals` — vocal isolation
✔ `vocals-{isolate, remove}` (extracted from `audio` core) — 4 tests: mid/side identities, center cancellation, mono passthrough. `audio` keeps its op until publish wiring.

#### `@audio/primitives` — shared DSP primitives
◌ `@audio/{stft, window, biquad}` (unprefixed names per the audio plan) — dedupe targets: `denoise-core/stft` (canonical), `dynamics-core/biquad`, `window-function`/`digital-filter` (scijs, stay). Family cores keep local copies until these publish; swap behind differential tests.

#### `@audio/reverb` — reverberation
✔ family complete: `reverb-{schroeder, freeverb, dattorro, convolution, fdn, spring, shimmer}` — 13 tests. Convolution runs direct or uniform-partitioned FFT (differential-tested to 1e-6); fdn = Householder O(N) + canonical Jot per-line T60 gains, Schroeder-EDC-verified ±30%; spring = dispersive allpass loop (Parker-Välimäki class); shimmer = octave-up feedback (Goertzel-verified 880 in the tail of a 440 input).

#### `@audio/saturate` — saturation
✔ `saturate-{core, waveshaper, tube, transistor, tape, multiband}` — 5 tests. core = sinc-oversampled transfer application (upsample → shape → anti-aliased decimate via `resample-sinc`); alias-suppression differential test (4× vs naive on 10 kHz drive); tube even-dominant vs transistor odd-dominant verified by harmonic ratios; tape adds playback HF loss; multiband = Saturn class. Distinct from `effect-distortion` (hard clip).

#### `@audio/tune` — pitch correction
✔ `tune-snap` — 4 tests: 47¢-sharp A4 → 440 ±3 Hz in A major, two-note melody corrected per note, in-tune gate leaves audio bit-identical, silence passthrough. Per-note v1 (no intra-note glide). ◌ `tune-midi` (Melodyne class, needs midi-parse).

#### `@audio/amp` — amplification
✔ `amp-{tube, cabinet}` — 3 tests: tube = HP → oversampled `saturate-tube` → tone stack (even harmonics + tone shaping verified); cabinet = measured-IR convolution (delta-identity verified) or classical speaker-sim fallback (−12 dB+ at 8 kHz). NAM-class capture = `@audio/neural-amp`.

#### `@audio/note` — music-theory primitives
✔ `note-{convert, scale}` — Hz ↔ MIDI ↔ name, cents (tuner readout), scale tables + nearest-degree snapping — 4 tests, 113 assertions (12-TET identities, full name/parse roundtrip). Substrate for `tune`, `midi`, the tuner tool.

#### `@audio/measure` — acoustic & system measurement
✔ `measure-{ir, response, latency, align}` — 5 tests: Farina ESS deconvolution recovers a known 3-tap system ±0.03 (identity → δ = 1.000), latency sample-exact, align recovers delay+polarity, response matches analytic one-pole ±0.5 dB. Feeds `reverb-convolution` + `amp-cabinet`: measure once, convolve forever.

#### `@audio/voice` — voice synthesis
◌ `voice-{tract, voder, glottis}` — Kelly-Lochbaum waveguide (Pink Trombone class), Dudley 1939 Voder, LF/Rosenberg glottal pulses. Site-todo "voice generator via natural tract gen"; speech *analysis* stays `@audio/speech-*`; TTS = neural lane.

#### `@audio/midi` — symbolic bridge
◌ `midi-{parse, write, soundfont}` — SMF I/O (`mir-transcribe` output target, `tune-midi` reference input), midi-js-soundfonts rendering. Singing-to-midi tool substrate.

#### `@audio/neural` — the opt-in ML lane
◌ `neural-{runtime, denoise, amp, separate}` — one inference adapter (ONNX Runtime Web/tflite, worklet-ready) + RNNoise/DeepFilterNet, NAM, Demucs classes. Policy: classical tools never require it; weights hosted separately, license-audited (resolves the freemium "premium ML weights" conflict); MIR's deferred ML tier lands here.

#### `@audio/defeedback` — adaptive feedback suppression
✔ `defeedback-{analyzer, tracker, notchbank}` + streaming umbrella factory — 3 tests: growing howl killed ≥12 dB with music ±1 dB, harmonic-rich tones deploy zero notches, and a **closed electro-acoustic loop** (resonant room, gain >1) runs away without and stays bounded with the suppressor inline. Zero-latency direct path (pure IIR); PNPR/PHPR + relational harmonic gates; click-free coefficient morphing. Alpha-Labs-class ML suppression = `@audio/neural`.

#### `@audio/resample` — sample-rate conversion
✔ `resample-{sinc, linear}` (extracted from `audio` core) — 8 tests: pitch preservation, round-trip energy <1%, anti-alias at Nyquist. ◌ `resample-polyphase` (streaming voice-agent path). Differential-test vs libsamplerate at publish.

#### `@audio/sinusoidal` — sinusoidal modeling
✔ `sinusoidal-{track, synth, residual}` — 4 tests: two-tone tracked (amp ratio ±5%), vibrato contour followed, energy-preserving resynthesis, tonal/noise separation (MQ 1986 / Serra SMS). The De-Slop substrate.

#### `@audio/host` / `@audio/atom` — extension mechanisms
`host`: native plugin hosts — `@audio/host` + `@audio/host-vst`/`@audio/host-clap` atoms + per-platform binary packages (speaker/mic pattern); full test needs a real VST3 + audio hardware (environment-gated). `module`: the cross-target module contract (JS → AudioWorklet / WAM / CLAP / VST3 / AU / LV2) — 16 tests ✓; the API-unification substrate (contract + migration plan in `module/CONTRACT.md` + `audio/.work/atom.md`). Wrapper convention decided and **pilot-verified (2026-07)**: `atom.js` descriptor at subpath `<pkg>/atom` + `"atom": "./atom.js"` manifest key — one token in all four places (package, key, file, subpath); `toBatch`/`toStream` JS hosts shipped; contract held against 8 atoms across every convention (differential vs native, stream≡batch, generators, analyzers, streaming:false) — two amendments only: `ctx.maxChannels`, equal-frames scope (rate-changers stay batch APIs). See `module/GUIDE.md` § Verified.

#### `@audio/decode` / `@audio/encode` / `@audio/speaker` / `@audio/mic` — codecs & I/O
✔ decode 12 codec atoms (published), encode 10 (published), speaker/mic 5 platform-binary packages each (optionalDependencies pattern — native binaries, not algorithm atoms; exempt from the packages-only rule).


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
| `@audio/dynamics-*` | Dynamics processing (compressor, limiter, gate, expander, transient-shaper, envelope) |
| `@audio/spatial-*` | Spatial/channel utilities (midside, channelsplit, delay, crossfeed, panner, widener, haas) |
| `@audio/speech-*` | Speech processing (formant, LPC, vocoder) |
| `@audio/denoise-*` | Noise reduction & restoration |
| `@audio/synth-*` | Synthesis (oscillator, pluck, rhythm, chirp, DTMF, risset-drum) |
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

- [x] **Phase 0** (2026-07): co-locate all repos at `~/projects/@audio/<sub>`; scoped umbrella names; unified metadata; scaffolds absorbed.
- [x] **Phase 0.5** (2026-07): full structure unification — every algorithm an atom in `packages/*` (pitch 8, beat 5, dynamics 11, denoise 15, effect 20, filter 11 + speech 3, eq 7, weighting 5, auditory 5, spatial 5, mir 3, synth 1 + 26 shift/stretch); families deduped (effect/dynamics dissolved, pitch-shifter superseded, crossfeed→spatial, pink-noise→synth, chroma/chord/key→mir); new umbrellas scaffolded (spectral, loudness, vocals, primitives + stubs across mir/spatial/synth). 724 tests green, every pre-restructure test preserved.
- [ ] **Phase 1**: publish all source-complete atoms + umbrellas (`npm run publish:all` per repo); deprecate unscoped npm names (audio-decode, encode-audio, audio-speaker, audio-mic, audio-effect, audio-filter, pitch-detection, beat-detection, time-stretch, pitch-shift) with pointers; create/rename GitHub repos (new umbrellas have no remotes yet).
- [x] **Phase 2** (2026-07-08): stubs implemented — the 22-package wave (effect 5, mir 6, voice 3, midi 2, synth 2, primitives 3 published as @audio/{stft,window,biquad}, denoise-repair, resample-polyphase, tune-midi) with tests, published + pushed. Deferred with documented reasons: speech-world, midi-soundfont, neural lane.
- [ ] **Phase 3**: atom contract migration (see `~/projects/audio/.work/atom.md`) — unify the 3 API conventions behind adapters (toBatch/toStream/toWorklet; `audio` hosts the contract natively); swap family-core copies for `@audio/{stft, window, biquad}` behind differential tests; merge gate/deesser variants; per-atom .d.ts + READMEs.
- [ ] **Phase 4**: optionally transfer `fourier-transform`, `window-function`, `digital-filter`, `periodic-function` to `scijs` org with deprecation notices.
