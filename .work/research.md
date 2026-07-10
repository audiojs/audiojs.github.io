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

* **VST/plugin landscape × stack coverage**: see `plugins.md` (researched 2026-07-10) — popular/trendy plugins per category, free/OSS alternatives, per-atom coverage matrix, verified empty categories (feedback suppressor, spectral repair, micro-detune have zero open competitors), ranked gap list (OTT upward mode first).

* **hyperframes** (HeyGen, 33k★ in 4 months): NOT audio — HTML→video renderer for AI agents. Three signals: (1) agent tools win on formats agents already know — plain JS/JSON, never a new DSL; (2) MCP server + packaged skills is the proven distribution unit; (3) its audio layer is volume-only `<audio>`+FFmpeg mixing — agent-authored media pipelines have **no DSP/loudness layer**. That's our adjacent lane, not a competitor.
* **Voice agents** (OpenAI Realtime, LiveKit, Pipecat v1.0): durable client-side demand for 48↔16/24kHz resample / VAD / buffering plumbing — model-agnostic, under-tooled in browser.
* **ML vs classical split**: ML wins raw denoise ceiling (DeepFilterNet), separation, transcription; classical keeps decode/encode, resample, loudness/LUFS, spectral repair of known artefacts, deterministic re-runnable chains. Sell chain transparency + privacy, not denoise quality.
* **Open niches**: MIR (essentia.js: no npm release in 5 yrs; Meyda: dead 2 yrs, still 14.6k dl/wk); Node PCM I/O (speaker/naudiodon 2+ yrs stale; prism-media 2.08M dl/wk = latent demand); per-codec decode atoms vs ffmpeg.wasm's multi-MB blob (420 open issues); audio-DSP MCP server (none exists); BPM/key agent tools (zero competitors).
* **Threats**: IRCAM node-web-audio-api (Rust, v2.0 2026-05, ~6× our web-audio-api downloads); sapphi-red/web-noise-suppressor (free ML AudioWorklets); soundtouchjs (active but WSOLA-only — beat with algorithm breadth, PSOLA/pvoc/paulstretch).
* **De-slop**: real + monetized for speech (Cleanvoice, Auphonic); AI-music **watermark** stripping = adversarial dead end (SynthID engineered to survive processing) — stays out of scope, artefact suppression stays in.
* **Determinism as feature**: agent pipelines (CI, regression tests) require bit-exact same-input→same-output rendering — foreground it.

---

## `@audio` Package Ecosystem

**Status (2026-07-09, fully published)**: 36 repos at `~/projects/@audio/<sub>`, one shape everywhere — root = thin umbrella, every algorithm an atom in `packages/*`. **~330 packages live on npm** (~942 atom tests + audio engine's own 548 — see `~/projects/audio/.work/baseline.md` for the FFmpeg/SoX/librosa/Pedalboard/MIREX coverage matrix with test evidence). GitHub repos renamed to short scope-matching names (`audio-decode`→`decode`, etc. — redirects live); 10 of 11 unscoped npm names deprecated with pointers (`pitch-shift` was never actually owned — corrected in publish.md). `audio@2.3.0` consumes the scope natively. Full publish record: `publish.md`. Paths below relative to `~/projects/@audio/`.

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
✔ `beat-{onset, tempo, detect, track}` + `@audio/onset` (promoted) — 70 tests. `beat/synth.js` + `beat/floatbeats.js` stay as root test fixtures (future `floatbeats` package). beat-core dissolved 2026-07-09 (validation inlined per atom).

#### `@audio/shift` — pitch shifting
✔ 15 atoms `shift/packages/shift-*` — ola, wsola, pvoc, pvoc-lock, transient, psola, granular, paulstretch, sms, hpss, formant, sample, hybrid, delay, lpc — all published; shift-core dissolved 2026-07-09 (pvoc engine → `@audio/spectral-pvoc`, sinc → `@audio/resample-sinc`, host plumbing inlined per atom). shift-ola/wsola/psola draw stretch from `@audio/stretch-wsola`/`-psola` (legacy `time-stretch` dep dropped 2026-07-09 — npm 1.2.1 lacked the wsola tail + psola period fixes). CI green.

#### `@audio/stretch` — time stretching
✔ 9 atoms `stretch/packages/stretch-*` — wsola, pvoc, pvoc-lock, pghi, transient, paulstretch, psola, sms, hybrid — stretch-core dissolved 2026-07-09 (phase locking → `@audio/spectral-pvoc`, metrics → `@audio/quality`, framing/OLA inlined per atom). CI green (was red on unpublished fourier-transform stft fix — 2.3.1 published 2026-07-09).

#### `@audio/filter` — audio-facing filters
✔ `filter-biquad` (highpass, lowpass, bandpass, notch, allpass), `filter-{comb, dcblocker, resonator, variable, preemphasis, spectral-tilt}`, analog models `filter-{moog-ladder, diode-ladder, korg35, oberheim}` — 98 tests (incl. speech + integration). Generic filter design stays in `digital-filter` (scijs).

#### `@audio/speech-*` — speech processing (atoms live in the `filter` repo)
✔ `speech-{formant, lpc, vocoder}` — co-located with `@audio/filter-resonator` (formant depends on it); extract to own repo after publish. ◌ `speech-world` (WORLD vocoder — F0 + spectral envelope + aperiodicity, Morise 2016).

#### `@audio/eq` — equalization & tone shaping
✔ `eq-{highshelf, lowshelf, parametric, graphic, baxandall, tilt, crossover, fir, dynamic}` — 30 tests. FIR: exact-identity/linear-phase; dynamic = band-energy-driven peaking (Pro-Q3/soothe class): hot band −3 dB+, other bands ±0.7 dB, transparent below threshold. Crossfeed moved to `@audio/spatial-crossfeed`.

#### `@audio/weighting` — frequency weighting filters
✔ `weighting-{a, b, c, k, itu468, riaa}` — 34 tests; K is exact BS.1770-4 at any fs (the `@audio/loudness` prerequisite). `a-weighting` absorbed: `.response(f, fs)` on a/b/c/itu468, self-consistent with each atom's own filter (not a parallel formula). B was missing entirely — implemented and differential-tested against `a-weighting`'s own `b()` (own 158.5 Hz mid pole, not shared with A). D/Z-weighting have no atom equivalent — `a-weighting` stays canonical for those two, deprecation held pending.

#### `@audio/auditory` — auditory filterbanks
✔ `auditory-{bark, erb, mel, gammatone, octave}` — 28 tests.

#### `@audio/effect` — audio effects
✔ family complete, 26 atoms — modulation `effect-{phaser, flanger, chorus, wah, autowah, tremolo, vibrato, ringmod, freqshift, rotary}`, delay `effect-{delay, multitap, pingpong, graindelay}`, distortion `effect-{distortion, bitcrusher, exciter, lofi}`, utility `effect-{gain, mixer, slew, noiseshaper, stutter, subbass, sbr, tapestop}` — 65 tests. graindelay = pitch/time grain scatter; stutter = beat-repeat; lofi = wow/flutter + 3-pole ceiling + vinyl bed; subbass = MaxxBass-class harmonic synthesis; sbr = exciter-class bandwidth recovery; rotary = DAFx-02 Leslie (LR4 split, horn/drum rotors with inertia glide, Doppler+AM, two-mic stereo — per-band sideband-spacing verified) 2026-07-10; tapestop = constant-torque spin-down/up (pitch-trajectory-verified, seeded flutter) 2026-07-10. dynamics/ dissolved into `@audio/dynamics`; spatial/ → `@audio/spatial`; reverb promoted to `@audio/reverb`; pitch-shifter superseded by `@audio/shift` (git history keeps all).

#### `@audio/dynamics` — dynamics processing
✔ `dynamics-{envelope, compressor, limiter, gate, expander, deesser, ducker, softclip, compand, transient-shaper, multiband, opto, fet, vca, varimu, leveler}` — 47 tests; dynamics-core dissolved 2026-07-09 (dB/timeCoef/writers inlined per atom). Character models verified behaviorally: opto's T4 program-dependent release (long reduction → slower recovery), fet ≫ varimu attack speed, varimu drive-dependent ratio; leveler = dynaudnorm-class framewise riding, peak-guarded. **Four-quadrant taxonomy complete 2026-07-10** (Giannoulis/Reiss-cited): compressor + upward compression (`upThreshold/upRatio/upKnee/upRange`, `depth`), expander + `mode: 'upward'` (de-compression; classical de-limit substrate; pre-existing knee sign bug found+fixed by continuity check), multiband passes both per band → **OTT-class** (Xfer-crossover recipe documented; probe: quiet +5.2 dB / loud −11 dB one pass); softclip gained `oversample` 2/4/8× (sinc, alias-floor differential vs 1×). Canonical home for all dynamics per the `audio` plan; audio-effect's parallel variants deleted.

#### `@audio/denoise` — noise reduction & restoration
✔ family complete: `denoise-{spectral, wiener, omlsa, dehum, declick, decrackle, declip, dewind, deplosive, deesser, debreath, dereverb, detect, gate, repair}` + promoted `@audio/{vad, noise-estimate, lpc}` — 54 tests. denoise-core dissolved 2026-07-09 (STFT → `@audio/stft`, RBJ → `@audio/biquad`, metrics → `@audio/quality`). `repair` = RX-class spectral repair: 60 ms dropout → 100.3% of reference, band-limited beep −46 dB with program untouched. Review-fix + quality waves 2026-07-09: stft batch tail bound, gate look-ahead alignment, deplosive exact-complement split + HP detection sidechain, deesser per-block attack/release, specsub Berouti adaptive α(γ), dereverb 3ln10/T60 + recursive tail + **DD-smoothed Wiener gain** (SNR +5 dB, LSD −2.5 vs hard subtraction), classifier whole-signal click scan + **noise-floor stationarity** (rolling-min CV) — auto-selector picks the measured-best method on all 5 canonical scenarios (hum 15.0 dehum · white 20.2 wiener · clicks 44.1 declick · rumble 9.3 wiener · sib 18.4 wiener); dewind measured optimal across 12 variants, beats wiener on gusty wind at ~1/16 CPU (its design center; continuous rumble explicitly routed to wiener), LPC-null post-filter evaluated and rejected with data (voiced speech as AR-predictable as wind).

**Gate/de-esser qualification** (deliberate near-dupes): `dynamics-gate` = musical hold-based gate; `denoise-gate` = look-ahead + hysteresis restoration gate. `dynamics-deesser` = broadband sidechain-compressor; `denoise-deesser` = dynamic peaking-EQ. Merge candidates at the atom migration, behind differential tests.

#### `@audio/spatial` — spatial & channel tools
✔ family complete: `spatial-{panner, widener, haas, autopan, crossfeed, midside, channelsplit, delay, microshift, surround}` — 4 tests, 8 assertions (M/S roundtrip identity, sample-exact delay, microshift ±cents verified, 5.1 matrix content checks). FFmpeg + H3000 parity closed.

#### `@audio/mir` — music information retrieval
✔ family complete: `mir-{chroma, chord, key, tonnetz, melody, tempogram, structure, fingerprint, downbeat, multif0, similarity, transcribe, drums, coversong}` — 27 tests. multif0 = Klapuri iterative spectral subtraction with bandwise-compression whitening (duet/triad/single all correctly resolved); transcribe = continuity note tracking on multif0; drums = flux onsets banded into kick/snare/hihat; downbeat = bass/flux/chroma-change phase scoring against a beat grid; similarity = MFCC-Gaussian + chroma; coversong = OTI + lag cross-correlation (finds a 3-semitone transposition exactly). Plus Foote novelty (texture seams ±0.35 s), Wang landmark fingerprint (self/snippet-offset/noise-robust/junk-rejected). ML-tier (genre/mood/tags/separate) deferred — needs hosted weights, conflicts with no-ML-in-hot-path.

#### `@audio/synth` — synthesis & generators
✔ family complete: noise colors, chirp, osc, dtmf (Q.23 pairs), pluck (Karplus-Strong), risset, rhythm (grid-timed), adsr, lfo, wavetable (morph verified), drum (membrane/metal/noise), voice, poly, sfx, **fm, modal** (2026-07-10) — 31 test blocks / 113 assertions. poly = N-voice allocator with steal-fade (any generator as a voice); sfx = ZZFX-class parameterized SFX, 8 deterministic presets; fm = Chowning-1973 phase modulation (serial op stacks, per-op feedback + index decay, bell/epiano presets) — FFT sidebands match Bessel J_k(2) to 0.00% (A&S tables); modal = impulse-invariant resonator bank (F&R-cited bar/membrane/plate/tube/stiff-string tables, strike-position node weighting, per-mode T60 exact, provable ≤amp headroom) — RipplerX/Chromaphone class.

#### `@audio/spectral` — spectral features
✔ `spectral-{centroid, spread, flatness, rolloff, flux, slope, crest, mfcc, ltas, edit}` — 12 tests, analytic identities (Peeters 2004 / aspectralstats; MFCC gain-invariance per DCT property; LTAS Welch; edit = COLA STFT region gains with reconstruction + band-kill verified). ✔ family complete: + `spectral-{freeze, contrast, harmonics, cqt}` — 16 tests total (freeze sustains, contrast tone≫noise, harmonics matches analytic saw T1=0.645, CQT exact octave spacing).

#### `@audio/loudness` — loudness metering
✔ family complete: `loudness-{lufs, truepeak, lra, replaygain, dr}` — 10 tests. lufs = EBU 3341 cases 1–3 ±0.1 LU; truepeak = 4× sinc inter-sample (fs/4@45° reads 0 dBTP where sample peak is −3 dBFS); lra = EBU 3342 (−20/−30 alternation → 10 ±1 LU); replaygain = RG2 −18 LUFS reference; dr = TT crest method.

#### `@audio/vocals` — vocal isolation
✔ single package (folded from separate `vocals-isolate`/`vocals-remove` atoms — always used together, no independent-install value) — 4 tests: mid/side identities, center cancellation, mono passthrough. Built on `@audio/spatial-midside`'s encode/decode rather than reimplementing the formula. `audio`'s `isolate` op consumes it directly via the atom contract.

#### `@audio/stft` / `@audio/window` — canonical STFT & window (standalone repos)
✔ Published 1.0.2, each its own repo with root = the package itself — no workspace proxy. The `primitives` junk drawer dissolved in two steps (2026-07-08): repo renamed `stft`, then the `@audio/stft-root` two-package workspace flattened — stft and window are independent (`fourier-transform` vs `window-function` substrates), so `audiojs/stft` holds stft alone and `audiojs/window` split out fresh (extraction history stays in audiojs/stft). Real READMEs replaced the "Planned" stubs. stft = canonical `denoise-core` extraction (batch/stream/analyse, includes the OLA-tail compaction fix); window = typed periodic/symmetric fills + COLA check over `window-function`, consistency-tested against stft's internal `hannWindow`. Remaining private-root proxies of the same shape: `host` (root over `packages/{host, host-vst, host-clap}` — entangled with platform-binary leaves, treat when the prebuild CI lands) and `neural` (unimplemented stub lane — root becomes the umbrella when built). 2026-07-09: `@audio/stft@1.0.3` is now the single STFT everywhere (denoise-core dissolved; batch tail fix + stream-compaction fix live); no local copies remain.

#### `@audio/biquad` — the audio-side RBJ kernel (lives in the `filter` repo)
✔ 1.1.0: RBJ cookbook coefficients (Web Audio conventions — `bandpass` = constant 0 dB peak) + SOS runtime (`process`/`step`/`cascade`/`filter` params-convention kernel), zero-dep, differential-tested against `digital-filter` to 1e-9. **The one RBJ source ecosystem-wide** (2026-07-08 sweep): filter-biquad/variable/vocoder, eq ×7, auditory ×2, amp ×2, spatial-crossfeed, defeedback-notchbank, weighting ×6, dynamics deesser/multiband (dynamics-core's hand copy deleted). Layering rule: `digital-filter` = design math (butterworth, linkwitz-riley, matched-z) + differential reference; `@audio/biquad` = RBJ coefficients + runtime kernel. Behavior fixes riding along: filter-biquad `bandpass` + eq-dynamic's detector were constant-skirt while documented/expected 0 dB-peak.

#### `@audio/reverb` — reverberation
✔ family complete: `reverb-{schroeder, freeverb, dattorro, convolution, fdn, spring, shimmer}` — 13 tests. Convolution runs direct or uniform-partitioned FFT (differential-tested to 1e-6); fdn = Householder O(N) + canonical Jot per-line T60 gains, Schroeder-EDC-verified ±30%; spring = dispersive allpass loop (Parker-Välimäki class); shimmer = octave-up feedback (Goertzel-verified 880 in the tail of a 440 input).

#### `@audio/saturate` — saturation
✔ `saturate-{waveshaper, tube, transistor, tape, multiband}` — 5 tests; saturate-core dissolved 2026-07-09 (shape/onepole inlined per atom, oversampling via `@audio/resample-sinc`). Sinc-oversampled transfer application; alias-suppression differential test (4× vs naive on 10 kHz drive); tube even-dominant vs transistor odd-dominant verified by harmonic ratios; tape adds playback HF loss; multiband = Saturn class. Distinct from `effect-distortion` (hard clip).

#### `@audio/tune` — pitch correction
✔ `tune-{snap, midi}` — 6 tests: snap = 47¢-sharp A4 → 440 ±3 Hz in A major, two-note melody corrected per note, in-tune gate leaves audio bit-identical, silence passthrough (per-note v1, no intra-note glide); midi = MIDI-guided retune (YIN → per-guide-note median → PSOLA), the melody-following complement to snap's scale snapping.

#### `@audio/amp` — amplification
✔ `amp-{tube, cabinet}` — 3 tests: tube = HP → oversampled `saturate-tube` → tone stack (even harmonics + tone shaping verified); cabinet = measured-IR convolution (delta-identity verified) or classical speaker-sim fallback (−12 dB+ at 8 kHz). NAM-class capture = `@audio/neural-amp`.

#### `@audio/note` — music-theory primitives
✔ single package (folded from separate `note-convert`/`note-scale` atoms — always used together, foundational-utility size) — Hz ↔ MIDI ↔ name, cents (tuner readout), scale tables + nearest-degree snapping — 4 tests, 113 assertions (12-TET identities, full name/parse roundtrip). Deliberately stays this size: full music theory (chords, keys, roman numerals) is composition/notation tooling, the same category `bytebeat` was cut for — out of audio-processing scope; tonal.js/teoria.js already own it. Substrate for `tune`, `midi`, the tuner tool.

#### `@audio/measure` — acoustic & system measurement
✔ `measure-{ir, response, latency, align}` — 5 tests: Farina ESS deconvolution recovers a known 3-tap system ±0.03 (identity → δ = 1.000), latency sample-exact, align recovers delay+polarity, response matches analytic one-pole ±0.5 dB. Feeds `reverb-convolution` + `amp-cabinet`: measure once, convolve forever.

#### `@audio/voice` — voice synthesis
✔ `voice-{tract, voder, glottis}` — 5 tests. glottis = LF model (Fant's Rd regression + area-balance bisection — textbook pulse shape across Rd) + Rosenberg pulse, jitter/shimmer/aspiration; tract = Kelly-Lochbaum waveguide, 5 vowel area presets (/a/-vs-/i/ formants verified), double-buffered scattering; voder = Dudley 1939 10-band channel synth. Site-todo "voice generator via natural tract gen" realized; speech *analysis* stays `@audio/speech-*`; TTS = neural lane.

#### `@audio/midi` — symbolic bridge
✔ `midi-{parse, write}` — 3 tests: SMF 0/1 parse (running status, VLQ, tempo map, flattened notes), format-0 write, roundtrip-verified against a hand-built file with a mid-file tempo change. ◌ `midi-soundfont` — deferred, real gap: needs an asset-strategy decision (SF2 engine vs ~100 MB pre-rendered banks don't belong in an npm atom). Interim: `poly(parse(smf).notes, { voice })` renders MIDI through any synth voice today. `mir-transcribe` output target, `tune-midi` reference input.

#### `@audio/neural` — the opt-in ML lane
◌ `neural-{runtime, denoise, amp, separate}` — one inference adapter (ONNX Runtime Web/tflite, worklet-ready) + RNNoise/DeepFilterNet, NAM, Demucs classes. Policy: classical tools never require it; weights hosted separately, license-audited (resolves the freemium "premium ML weights" conflict); MIR's deferred ML tier lands here.

#### `@audio/defeedback` — adaptive feedback suppression
✔ `defeedback-{analyzer, tracker, notchbank}` + streaming umbrella factory — 3 tests: growing howl killed ≥12 dB with music ±1 dB, harmonic-rich tones deploy zero notches, and a **closed electro-acoustic loop** (resonant room, gain >1) runs away without and stays bounded with the suppressor inline. Zero-latency direct path (pure IIR); PNPR/PHPR + relational harmonic gates; click-free coefficient morphing. Alpha-Labs-class ML suppression = `@audio/neural`.

#### `@audio/resample` — sample-rate conversion
✔ family complete: `resample-{sinc, linear, polyphase}` — 12 tests: pitch preservation, round-trip energy <1%, anti-alias at Nyquist. polyphase = rational L/M Kaiser-windowed FIR with a true streaming interpolator (the voice-agent 48↔16/24kHz path) — stream ≡ batch bit-identical, −97 dB alias floor.

#### `@audio/sinusoidal` — sinusoidal modeling
✔ `sinusoidal-{track, synth, residual}` — 4 tests: two-tone tracked (amp ratio ±5%), vibrato contour followed, energy-preserving resynthesis, tonal/noise separation (MQ 1986 / Serra SMS). The De-Slop substrate.

#### `@audio/host` / `@audio/compile` / `@audio/wam` — extension mechanisms
`host`: native plugin hosts — `@audio/host` + `@audio/host-vst`/`@audio/host-clap` atoms + per-platform binary packages (speaker/mic pattern); full test needs a real VST3 + audio hardware (environment-gated). Platform leaves (`host-{clap,vst}-{darwin,linux,win32}-*`) aren't npm-publishable yet — they reference `.node` binaries with no prebuildify-style CI pipeline to build them; the JS-only packages are unaffected.

`@audio/compile` (2026-07-09, was `@audio/atom`, before that `@audio/module`): the cross-target processor contract (JS → AudioWorklet / WAM / CLAP / VST3 / AU / LV2). Manifest convention renamed to **`audio.js`** at subpath `<pkg>/audio` + `"audio": "./audio.js"` package.json field — consumer-named like svelte's `"svelte"` field; `atom.js` implied atom = processor and mismarked the other ~180 atoms (packages) that ship no manifest. **stat.js manifests unified into audio.js** (loudness 4, mir 10, spectral 6) — one manifest name, export shape declares the kind (factory+params = processor, `{ stat, compute }` = analyzer). The old package split along its true grain: `@audio/compile` = contract custodian (CONTRACT.md, GUIDE.md) + future WASM compiler CLI; `@audio/wam` = runtime WAM/AudioWorklet adapter (`toWam`, 16 tests; default vendor `audio-plugin`→`audio`); `toBatch`/`toStream` + the 10-test conformance suite absorbed into the engine as `audio/batch`+`audio/stream` (`test:batch`) — mirror of `@audio/host`: host brings native plugins into JS, compile takes JS out to native. **121 audio.js manifests** across 18 repos (dynamics 15, denoise 12, effect 22, filter 11, synth 9, mir 10, eq 4, reverb 6, saturate 5, spatial 7, shift 4 incl. umbrella, loudness 4, spectral 6, amp 2, pitch 1, tune 1, defeedback 1, vocals 1); `audio@2.4.0` hosts the contract natively and re-exports the engine-free hosts. See `compile/CONTRACT.md` (live source of truth) + `compile/GUIDE.md` § Verified.

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
- [x] **Phase 0.5** (2026-07): full structure unification — every algorithm an atom in `packages/*`; families deduped (effect/dynamics dissolved, pitch-shifter superseded, crossfeed→spatial, pink-noise→synth, chroma/chord/key→mir); new umbrellas scaffolded.
- [x] **Phase 1** (2026-07-08): published all atoms + umbrellas (~330 packages, waves A/B/C + stub wave + atom rename republish); deprecated 10 of 11 unscoped npm names with pointers (`pitch-shift` was never owned — a third party holds that name); renamed all 14 pre-existing GitHub repos to short names.
- [x] **Phase 2** (2026-07-08): stubs implemented — 22-package wave (effect 5, mir 6, voice 3, midi 2, synth 2, primitives 3, denoise-repair, resample-polyphase, tune-midi), published. Deferred with documented reasons: speech-world, midi-soundfont, neural lane.
- [x] **`@audio/module` → `@audio/atom` rename** (2026-07-08): contract package renamed (module collided with WAM's own name); 50 manifests across 9 families moved `audio-module.js`→`atom.js`; `audio@2.3.0` hosts the contract natively.
- [x] **`audio.js` manifest convention + `@audio/atom` split** (2026-07-09): `atom.js`/`stat.js`/`"atom"`/`"stat"`/`<pkg>/atom`/`<pkg>/stat` → `audio.js`/`"audio"`/`<pkg>/audio` across 121 manifests in 18 repos (all suites green); `@audio/atom` split → `@audio/compile` (contract + future compiler CLI; repo renamed, redirect live) + `@audio/wam` (toWam runtime adapter) + `audio/batch`/`audio/stream` (toBatch/toStream absorbed into engine, conformance suite = `test:batch`); engine registry + docs swept, `audio@2.4.0`. 121/121 republished + compile/wam published + `@audio/atom` deprecated + `audio@2.4.0` released 2026-07-10 (engine 621/621 + batch 10/10 against the live registry); `audiojs/wam` created. Pushes pending only.
- [x] **Phase 3a — core dissolve complete** (2026-07-09): all 6 `*-core` packages dissolved; `@audio/stft` is the single STFT everywhere (the swap-behind-differential-tests shipped as part of the dissolve); `dynamics-core/biquad` → `@audio/biquad` (2026-07-08, whole-ecosystem RBJ sweep).
- [ ] **Phase 3b (open)**: merge `dynamics-gate`/`denoise-gate` and `dynamics-deesser`/`denoise-deesser` near-dupes (deliberately qualified as different, not yet merged); per-atom `.d.ts` + individual READMEs (currently umbrella-level only — a real content-authorship decision, ~280 atoms); engine-side `streaming: false` whole-signal hosting + true multi-bus sidechain feeding.
- [ ] **Phase 4**: optionally transfer `fourier-transform`, `window-function`, `digital-filter`, `periodic-function` to `scijs` org with deprecation notices.
