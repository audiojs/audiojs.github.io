## Now (ordered)

1. [ ] Website: resolve homepage direction (index-v2/3/4, undecided since Apr) → ship **Mix Analyser** first (`@audio/loudness` + `@audio/spectral` real) → FUNDING.yml/OSC/Sponsors plumbing → **Speech Enhancer** (see Website)
2. [ ] Funding now-actions: GitHub Secure OSS Fund application, Open Source Collective host, Tidelift, STR audit request, thanks.dev/Pledge query, corporate outreach (see Funding)
3. [ ] Registry-drift holds (all other drift resolved 2026-07-09: compile 0.1.1 + ducker 0.1.5 published, sweeps clean): 3 mic platform binaries (need CI runners) · pcm-convert 3.2.0 (needs 2FA OTP) · decode wasm WIP (3 wasm.cjs + lockfile, in progress)
4. [x] **2026-07-10 gap-closure wave published**: NEW `@audio/{synth-fm, synth-modal, effect-rotary, effect-tapestop}` 0.1.0 · dynamics compressor/expander/softclip 0.2.0 + multiband 0.4.0 (upward/OTT/oversample; expander knee sign fix) + 6 sibling range bumps · umbrellas dynamics 0.2.3, synth 1.1.1, effect 2.1.2 · `audio@2.6.2` (registry +4; engine 669/669). Suites: dynamics 47 · synth 31/113 · effect 65. Committed + pushed per repo (dynamics/synth/effect/audio/site). (New-package GETs lagged npm indexing ~10 min at publish; all four verified visible same session.)
5. [x] **2026-07-10 component wave published** (all app components except `audio-chain` now shipped): NEW `@audio/dynamics-unlimit` 0.1.0 (deficit-mode classical de-limiter — Ozone-Unlimiter counterpart, 3-gate detector) · `@audio/spatial-binaural` 0.1.0 (Brown-Duda structural HRTF, dataless, paper-verified constants) · `@audio/spectral-target` 1.0.0 (target-curve library: Byrne/Pestana-cited + deviation/smooth — Auto-Chain data layer done) · umbrellas dynamics 0.2.4, spatial 1.0.1, spectral 1.2.1 (+ envelope 0.1.2, multiband 0.4.1 d.ts-regen republishes) · `audio@2.6.3` (registry: unlimit, binaural). Suites: dynamics 56 · spatial 18(+4) · spectral 31 · engine 669/669 (one meter-playback flake proven environmental via standalone probe: 612 ms, rms 0.707 exact). Committed + pushed.
6. [x] **2026-07-10 audit + staging wave**: full-org audit (`.work/audit.md`, Resolution section) → four fix waves same day. Correctness on npm: multiband/envelope rate bug (root-cause dual-read + 44.1k/96k invariance test), umbrella stale ranges, synth `(freq, opts)` unification (fm/modal 0.2, drum 2.0, noise 2.0 seconds+colors-main, poly voiceOpts + real voice tests), stretch channel-arrays ×9, filter manifest-defaults→kernel ×5 + biquad manifest fc/Q 2.0, WAM restart+streaming:false refusal (22 tests), `audio@2.6.4` (a-weighting→weighting-a.response, batch suite into test:all, +5 hosted tests). Truth: 34 atom + 7 umbrella stale-"planned" READMEs rewritten from kernels (examples executed); effect §Dynamics → pointer; filter strands → pointers + biquad section; weighting k/riaa gained `.response`. Conventions: CONTRACT §Conventions (fs/sampleRate boundary, units per class, kernel-is-truth); chorus/flanger delay→seconds + vibrato depth→0..1 (majors); dehum q→Q. Dedupe: digital-filter→window-function (2.4.1 bit-identical), biquad `cascadeMagnitude` (7 weighting copies gone), amp/saturate loops→biquad (0.0 diff), speech-lpc→@audio/lpc (2.7e-15), note ×4, stft→@audio/window, deesser shim. Strategy: audio-decode un-deprecated + 3.11.2 maintained alias; digital-filter WIP shipped **non-breaking as 2.4.0** (sosfilt_zi alias, poles/type2 kept, dynamicSmoothing maxFc throws, levinson sign flagged); audio-buffer-utils deprecated. Plumbing: metadata ×234 fields org-wide, CI test.yml ×25, gh descriptions ×22, release.mjs +5 extra repos + STALE-range class. Open: funding field (couples to Sponsors setup), kernel-entry d.ts (~content decision), weighting/auditory/measure processor + pitch/beat stat manifests.

## Next

- [ ] Open, reasons on record in their READMEs: `speech-world` (faithful WORLD port or WASM — not a namesake; doubles as De-Slop's phase-2 vocoder), `midi-soundfont` (asset-strategy decision), neural lane (runtime adapter + policy) · reverb partitioned→streaming
- [ ] Per-repo README refresh at publish (names renamed 2026-07 ✓; API docs/examples per repo still to verify) — filter: re-enable `test/readme.js` fence runner with the new import map; update `filter/plot/generate.js` + `test/types.ts` to split families
- [ ] Per-atom `.d.ts` + individual READMEs — denoise family done 2026-07-09 (13 strict-clean `index.d.ts` with full option surfaces + 14 generated READMEs via `scripts/atomdocs.mjs`; pattern proven); ~265 atoms to go — a content-authorship decision, not a mechanical one
- [~] Release automation — `scripts/release.mjs` shipped 2026-07-09: org-wide registry-drift sweep (315 packages; AHEAD/DIRTY/BEHIND/UNPUB; content-hash vs registry tarball) + `--publish` mode. Remaining: wire into CI/cron; changesets still an option for changelog discipline; bus factor (2nd npm owner + recovery playbook)
- Workspace policy (standing, decided 2026-07): raw-source publishing + zero shared-only packages — small util duplication is the accepted cost. A util with real standalone value → promote to a *categorized* atom (`@audio/quality`/`@audio/spectral-pvoc` precedent), never a `*-core`/`*-utils`.

## [ ] Website

* [ ] Resolve homepage direction: pick one of index-v2/v3/v4.html drafts, land it, delete the rest (undecided since Apr)

### Strategy

Goal: **corporate sponsors/consulting first** (fastest to cash, needs no website — npm stats already exist) + **grants** (NLnet Open Internet Stack reopens post-summer 2026; STF Fellowship 2027; NumFOCUS for scijs layer) + **freemium hosted product** (cleanvoice/auphonic model). Three audiences, one site. (Verified 2026-07: NGI Zero closed all calls; "Google Web Fund" doesn't exist; Sloan needs scientific framing — see Funding.)

* **Plugin-landscape map** (2026-07-10): `plugins.md` — famous/trendy VSTs → free/OSS alternatives → per-atom coverage + site angles; verified only-open-implementation categories (defeedback, denoise-repair, microshift, restoration suite) and ranked gaps (OTT upward mode = highest fame-per-effort).
* **Skip oversaturated commodity tools** (converter, trimmer, joiner) — flooded by ad-driven SEO farms; race-to-the-bottom; doesn't differentiate audiojs.
* **Win where ML+DSP meets browser**: enhancer-class tools no one ships purely client-side, privately.
* **Killing feature: auto-chain analyser** — user picks content type (Speech / Music / Voice-over-Music), the system measures (LUFS, noise floor, peaks, spectral balance, hum, sibilance, clipping), then **picks and configures a processing chain** from existing modules (denoise → declick → de-hum → de-ess → adaptive EQ → multiband comp → limiter). Output is *both* the processed file *and* the visible chain (so the user learns what was done and which packages did it). Dolby.io does this server-side and paid; we do it open and client-side.
* **Privacy moat**: "Files never leave your device. No upload, no signup, no watermark." Top-3 ranking signal in this category.
* **Each tool page = proof of one module cluster.** Tool brings traffic; "powered by" links push devs into the catalog; catalog converts into stars, sponsors, grant evidence.
* SEO queries to own: audio recorder, audio editor, audio cutter, audio enhancer, free sound effects, zfx sound, audio extractor, audio converter, audio mixer, audio to text

### Flagship tools (the wedge — build first)

**The module layer is ready** (2026-07): every DSP stage below is a shipped package. What's missing is the target-curve data, the `audio-chain` orchestrator, and the pages themselves. In ship order:

* [ ] **Mix Analyser** — drop a track, get a *report*: LUFS-I, true peak, dynamic range (PLR/PSR), spectral balance (genre reference curves = v2, needs target-curve library), mono compatibility, clipping detection, recommendations. Audience: mixing engineers. Competitors: youlean, izotope insight ($199), masteringthemix levels ($79). Modules: `@audio/loudness` ✔, `@audio/spectral` ✔, `audio-buffer`. No processing — pure measurement; smallest scope, fastest ship.
* [ ] **Speech Enhancer** — voice recordings: denoise + declick + de-hum + de-ess + loudness normalize (-16 LUFS speech target). Audience: podcasters, journalists, course creators. Competitors: cleanvoice.ai ($10/mo), adobe podcast enhance, krisp. Modules: `@audio/denoise` ✔, `@audio/dynamics-deesser` ✔, `@audio/loudness` ✔. Positioning: sell the transparent chain + privacy, NOT denoise quality — ML (DeepFilterNet worklets; free: sapphi-red/web-noise-suppressor) beats classical on raw denoise.
* [ ] **Music Enhancer** — music tracks: denoise (gentler), spectral repair, stereo-image fix, mastering chain (multiband comp + limiter + LUFS target -14). Audience: bedroom producers, archivists. Competitors: landr ($10-25/mo), bandlab mastering, eMastered. Modules: `@audio/denoise` ✔ (incl. `denoise-repair`), `@audio/spatial` ✔, `@audio/dynamics` ✔, `@audio/loudness` ✔.
* [ ] **Auto-Chain** (umbrella product, after the three above) — drop file → pick content type → analyse → pick chain → process → render. Visible chain. Editable. Exports as audiojs JS pipeline (recipe). This is the grant story and the freemium upsell.

### Auto-Chain engineering map

Reverse-engineered from Dolby.io Media Enhance (classical DSP, no ML in the hot path). **Every stage is a shipped module** — open work is the two items under "Still to build" plus the pages.

**Pipeline:**

```
input → user picks content type → analysis pass (no processing) →
  adaptive chain (parameters set from analysis) → loudness target → output
  + visible chain JSON (audiojs recipe)
```

**Stage 1 — Analysis pass** (read-only; all modules ✔):

* Loudness: ITU-R BS.1770-4 integrated LUFS, LRA, true peak — `@audio/loudness` (EBU-verified)
* Noise PSD estimation: minimum-statistics on quiet frames (Martin 2001) — `@audio/noise-estimate`
* LTAS (long-term average spectrum) → drives adaptive EQ — `@audio/spectral-ltas`
* Sibilance band energy (5–9 kHz) → de-ess threshold — `@audio/spectral`
* Hum detection: spectral peaks at 50/60/100/120 Hz — `@audio/spectral` + `fourier-transform`
* Clipping detection: consecutive samples at ±1 — `audio-buffer/util`
* Voiced/unvoiced ratio, F0 range — `@audio/vad` + `@audio/pitch` (informs presets, also surfaces "is this really speech?" if user picked wrong)

**Stage 2 — Adaptive chain** (parameters from Stage 1; all modules ✔):

* DC remove + low-cut HPF 20–80 Hz — `digital-filter`
* Hum notch comb at detected mains frequency + harmonics — `@audio/denoise-dehum`
* Spectral noise reduction — Wiener / MMSE-LSA using estimated noise PSD — `@audio/denoise`
* Declick / decrackle — `@audio/denoise-{declick,decrackle}`
* De-ess — sidechain on sibilance band — `@audio/dynamics-deesser`
* Adaptive EQ — match measured LTAS toward content-type target curve, smoothed in critical bands — FIR EQ ✔ + `@audio/spectral-target` ✔ (2026-07-10)
* Multiband compressor — light, content-type-specific — `@audio/dynamics-multiband`
* True-peak limiter, ceiling -1 dBTP — `@audio/dynamics-limiter`
* Loudness normalize to target: speech -16 LUFS, music -14 LUFS, voice-over-music -16 LUFS — `@audio/loudness`

**Stage 3 — Output:**

* [ ] Render processed audio
* [ ] Render visible chain (graph + parameters + module names + paper citations)
* [ ] Export chain as audiojs JS recipe (copy-paste runnable)

**Still to build:**

* [x] **Target curve library** — shipped 2026-07-10 as `@audio/spectral-target`: speech = Byrne et al. 1994 LTASS (cited table), music = Pestana et al. 2013 AES (−5 dB/oct 100–4 kHz, cited), pink analytic, voice-music convention; `deviation()` = band-limited mean-normalized ⅓-oct-smoothed clamped correction (feeds `eq-fir` directly; doubles as the Match-by-Reference core with a measured reference as target); `smooth()` exported.
* [ ] **`@audio/chain`** (decided 2026-07-10; was "audio-chain" — unscoped names were deprecated in the July consolidation, and it IS an atom): infrastructure-register sibling of compile/host/wam. Ships (a) pure planner — `analyze()` + `plan()` → recipe JSON (the visible chain) + `apply()` + one-shot default; (b) `audio.js` manifest: `auto` processor (streaming: false whole-render one-knob enhance — hostable/compilable, the open God-Particle) + `chain` stat returning the recipe without processing (Mix Analyser report feed); (c) engine wiring = one lazy registry line `auto: '@audio/chain/audio'` — zero new engine machinery. Analysis-atom deps stay in the package, engine stays lean. Reference mode (Match-by-Reference) = API-level `{reference}`.

**Why no classifier:** user prompt is faster, more honest, and avoids ML weights in the hot path. If the user's pick disagrees with our voiced/unvoiced measurement, surface a soft hint ("This sounds like music — use Music preset?") but never override.

**Why this works as the wedge:** every box maps to a shipped audiojs module. No ML weights to host, train, or version. Deterministic and re-runnable. The visible chain is something Dolby will *never* show — because that's their moat. Showing it is *our* moat.

### Match-by-Reference (Matchering-style mastering)

Second mode of Auto-Chain. Same engine, target curve comes from a user-supplied reference instead of a preset. Reproduces the algorithm of [Matchering 2.0](https://github.com/sergree/matchering) (GPL Python, ~2000 lines, fully classical DSP) and the commercial behaviour of iZotope Ozone Match EQ + Master Assistant ($249) and Mastering The Mix REFERENCE ($99).

**Selling line:** "Make my podcast sound like Joe Rogan's." / "Master my track like this Daft Punk reference."

**License**: clean-room reimplementation from the algorithm description/papers only — never read GPL source (Matchering is GPL, ecosystem is MIT).

**Algorithm** (no ML, all classical; modules ✔ except noted):

* Load reference + target into `audio-buffer`
* Compute LTAS of both — `@audio/spectral-ltas` (Welch / averaged FFT, smoothed in critical bands or 1/3-octave)
* Derive matching EQ curve = `ref_LTAS - target_LTAS`, smoothed, with safety clamps (max ±12 dB to avoid catastrophic boosts)
* Apply as **linear-phase FIR** (no phase smear on transients) — `digital-filter` FIR mode ([ ] confirm linear-phase design from arbitrary frequency response: frequency-sampling method or windowed inverse FFT)
* Match RMS / integrated loudness — `@audio/loudness` (BS.1770) → gain trim
* Match stereo width — `@audio/spatial-midside` decomposition + side-band gain
* Match true peak — `@audio/dynamics-limiter`, ceiling -1 dBTP

**Output:** processed audio · visible chain (EQ curve plotted against reference + target LTAS) · exported audiojs JS recipe — captures the derived EQ as an FIR coefficients array, fully reproducible without the reference file

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

**Algorithm — conservative MVP** (all classical DSP):

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

**Algorithm — ambitious version** ("gaussian splats for sound"):

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

**Modules: all shipped** (2026-07) — `@audio/lpc` ✔ (Levinson-Durbin, prediction/extrapolation) · PSOLA ✔ (`@audio/shift-psola`, `@audio/stretch-psola`, `tune-midi`'s YIN→PSOLA) · sinusoidal model ✔ (`@audio/sinusoidal-{track,synth,residual}`, MQ/SMS — the substrate) · spectral repair ✔ (`@audio/denoise-repair`, RX-class) · SBR ✔ (`@audio/effect-sbr`) · voiced detection ✔ (`@audio/vad` + `@audio/pitch`). Only open: WORLD-style `voice-vocoder` for the ambitious version = `speech-world` (see Next).

**Output (visible chain):** processed audio · per-artefact severity readout (ringing: low / spectral holes: 14 detected / pitch jitter: ±18 cents / formant wobble: moderate / bandwidth: 13.2 kHz → extended to 18 kHz) · F0 track plot original vs smoothed · formant track plot F1/F2/F3 original vs smoothed · exported audiojs JS recipe

**Why this fits audiojs strategy:**

* All classical DSP, "no ML in the hot path" stance preserved
* Defensible long-term: nobody else does this; iZotope RX has the closest tools (spectral repair, mouth de-click) but no AI-deslop preset
* Strongest grant pitch in the space: "open-source remediation of generative-AI audio artefacts" is exactly what NLnet / Sloan / Sovereign Tech Fund are calling for in 2026
* The vocoder infrastructure (`lpc`, `sinusoidal`, WORLD) unlocks future tools: voice morphing, cross-synthesis, time-stretch quality bump, formant-preserving pitch shift — all reusable
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
5. De-Slop ambitious (sinusoidal model + WORLD vocoder)

### eqacademy — tutorial-quest for sound engineers/producers

* [ ] Gamified learning track over the real atom stack: ear-training + hands-on quests (EQ guess-the-band, compression before/after, de-noise this recording, master to −14 LUFS) — each quest runs live on `@audio/*` modules with the visible chain as the teaching artifact. Competitors: SoundGym ($15/mo), quiztones ($10), Izotope's Pro Audio Essentials (free, dormant) — none open, none code-backed. Doubles as docs-by-doing for the catalog + SEO surface ("learn EQ", "compression explained"). Scope after flagship tools; reuses tool-page template.

### Tool pages & demos (Tier-2, lower priority)

* [ ] BPM detector (`@audio/beat`)
* [ ] Pitch / key detector (`@audio/pitch`)
* [ ] Tuner — visual (Madri) with piano location; singing → MIDI (`@audio/tune-midi` ✔)
* [ ] Spectrogram viewer (`fourier-transform`)
* [ ] Filter lab — hear in real time; collection of filters with shown characteristics (`@audio/filter`, `digital-filter`)
* [ ] Loudness meter — real-time LUFS (`@audio/loudness`)
* [ ] Voice generator (`@audio/voice-{tract,voder,glottis}` ✔ implemented, 5 tests — page not built)
* [ ] File converter demo — sample rate / meta choice, packages-used info (a stack demo, not an SEO play — strategy skips commodity tools)
* [ ] Before/after demos per algorithm; `npm i audio`
* [ ] audio-buffer demo: load any waveform wavearea-style, edit/trim/crop (no history, direct buffer), play/save
* [ ] web-audio-api demo: REPL (write any code, play, open examples) + graph view
* [ ] audio demo: real waveform-editing experience; grows toward minimal online DAW (analysis + manipulations)
* [ ] Concept-package demos as audio plugins: open or stream audio/mic
* [ ] CLI-mode site style (dark, striped) as separate look

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
  * [ ] resolve first: "premium ML weights" contradicts no-ML-in-hot-path; needs weight hosting + license audit (many audio models are research-only licensed) before promising
* [ ] Team / API (~$50-200/mo): API endpoints, webhook callbacks, SLA. Same engine, hosted.
* [ ] OSS modules stay MIT forever. Pro = hosted convenience + curated weights, not paywalled algorithms.

### Funder/sponsor evidence the site must surface

* [ ] Ecosystem reach: total weekly downloads across org (live counter) + GitHub stars
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
* [ ] `/modules` — package catalog (dossier cards: status, downloads, runtime support, interactive demo per package — doubles as useful tool; pro/wasm tier — compile to VST/AU/etc; needs architecture beforehand)
* [ ] `/dsp` — DSP primitives + briefs (paper-cited)
* [ ] `/platform` — polyfill compliance dashboard
* [ ] `/sponsor` — tiers, ledger, current backers

### Build order (smallest first, traction-gated)

1. [ ] Cover page polish + module catalog stub + sponsor/roadmap strips (the grant pitch is functional at this point)
2. [ ] **Mix Analyser** ships first — measurement only, no ML, fastest path to a real working tool
3. [ ] FUNDING.yml + Open Collective + GH Sponsors live (do during step 2, not after) + start corporate outreach (see Funding — doesn't need the site)
4. [ ] **Speech Enhancer** ships second — proves the chain idea
5. [ ] Apply NLnet Open Internet Stack (call reopens post-summer 2026) with: working tools + ecosystem stats + roadmap
6. [ ] MCP server + CLI + Agent Skill (see Agents section — same modules, second distribution surface)
7. [ ] **Music Enhancer** + Auto-Chain umbrella
8. [ ] Apply STF Fellowship 2027 cohort with traction numbers
9. [ ] Freemium hosted layer

## [ ] Agents: MCP + CLI + skill (sequence after Mix Analyser + Speech Enhancer ship)

Verified 2026-07: no audio-DSP MCP server exists (nearest: a macOS playback toy); BPM/key detection has zero agent-facing competitor; a commercial LUFS-report MCP (Elysia) validates Mix Analyser demand. This is a credibility/grant wedge, not growth — best audio MCP (ElevenLabs TTS) tops out at 1.4k stars; ffmpeg-wrapper MCPs sit under 100. sox is dead (14.4.2, 2015; sox_ng is a C fork), ffmpeg carries live CVEs — a memory-safe npx-able CLI is a real security argument, not positioning.

- [ ] Canonical CLI: npx-able, JSON output, exact errors, composable — over `@audio/loudness`/`@audio/spectral`/beat/pitch/`@audio/denoise`
- [ ] MCP server = thin wrapper over the CLI: analysis-native tools first (LUFS report, BPM/key, spectral), visible-chain recipe as output — what no ffmpeg shell can produce
- [ ] Submit: official MCP registry + smithery/glama/pulsemcp
- [ ] Agent Skill (SKILL.md, agentskills.io spec — 32 tools adopted it; zero audio skills in anthropics/skills)
- [ ] Context7 indexing + typed, example-rich per-package READMEs (skip llms.txt: ~10% adoption, unproven citation value)

## [ ] Realtime / voice-agent plumbing

Strongest durable 2026 demand: OpenAI Realtime / LiveKit / Pipecat pipelines all need client-side 48↔16/24kHz resampling, VAD gating, buffering ahead of ML stages — model-agnostic, unglamorous, ours to take. Every flagship tool above is batch; this is the streaming leg.

- [x] `pcm-convert`: real resampler — done 2026-07-09 (3.2.0): polyphase FIR via `@audio/resample-polyphase` when from/to rates differ, float-domain per channel, layout preserved, AudioBuffer stamps the target rate; 5 differential tests (pitch/level, alias floor, int16 stereo layout, audiobuffer, identity). npm publish pending 2FA OTP (see Now holds).
- [ ] Streaming/AudioWorklet-ready chunked API for chain stages
- [ ] Position READMEs/pages for the voice-agent SDK plumbing use-case

## [ ] WASM

- [ ] `jz`: prove DSP integration — compile digital-filter biquad hot loop, benchmark vs JS. jz is the most mature asset in the org (1927 commits, daily-active, jz@0.8.1 published) with zero DSP integration yet; this is the VST/pro-tier proof point — gate Steinberg/NI/Ableton outreach on it
- [ ] web-audio-api
- [ ] stat packages, edit packages

## Backlog

- [ ] Close all issues in `contributing`, archive repo
- [ ] `web-codecs`: portable WebCodecs API — WASM-based polyfill for cross-runtime codec access. Time-sensitive: native AudioEncoder = Opus/AAC only, Safari 26 only just added audio — ship FLAC/MP3/Vorbis polyfill while the gap is fresh
- [ ] Polyfills: AudioBuffer · WebAudioAPI · WebCodecs (above) · AudioWorklet · Audio
- [ ] `web-audio-api` positioning vs IRCAM node-web-audio-api (Rust, ~6× our downloads)
- [ ] `defeedback` realtime leg (offline MVP ✔ — closed-loop verified, zero-latency, analyzer/tracker/notchbank done; realtime waits on atom worklet): Node.js audio I/O via Dante VSC (appears as standard OS device) · click-free parameter updates (coefficient interpolation or crossfade on notch add/remove/move) · WASM build of filter cascade (hot path) · end-to-end test mic → Dante → defeedback → Dante → speakers, measure latency budget
- [ ] Consistency of all packages API across the org
- [ ] `floabeat` fixtures package (seeds live in beat/{synth,floatbeats}.js); `audio-input` unified source idea
- [ ] `audio-module` idea (broader than `@audio/compile`, which covers processing units specifically) — cross-compiling audio-files, audio-shaders etc
- [ ] Recognition: write "State of Audio in JS" article · get listed (awesome-nodejs, awesome-web-audio, MDN resources) · engage W3C Audio WG
- [ ] Ideas: Icecast/internet-radio adapter (stream e.g. `audio`) · GPU processing (where?) · Essentia tone analysis — reproduce flute · Bassmaker https://www.youtube.com/watch?v=EpzQe8f6FfA

## Funding

Reality check (deep-verified 2026-07, adversarially checked vs primary sources): OSS funding is **redistributed, not gone** — away from application-shaped micro-grants (NGI Zero closed all calls; US NSF ~20% of prior pace, OTF in litigation; Ford/Sloan cohort was one-time; Mozilla MOSS dead since 2020) toward gates a solo maintainer must actively build: criticality flags (STA), internal nominations (corporate funds), public profile (Sponsors/Pledge). Honest 12-month expectation: **~$8-15k** — and that's an optimistic-modal figure dominated by one GitHub-fund win, not a weighted average. Grants are episodic project fuel, not salary (Zrythm: single NLnet grant ≫ its <$50/mo organic donations). Durable audio-OSS income has only ever come from a commercial derivative product (Ardour >$100k/yr subscriptions; JUCE; VCV) or employment — **the freemium/pro tier is the income line; grants bridge.**

### Now (2026-Q3)
- [ ] **GitHub Secure Open Source Fund** — apply now: $10k/project ($6k+$2k+$2k over 12mo), rolling, no residency bar, no entity needed. Pitch: audio-decode parses untrusted WAV/MP3/FLAC/OGG binaries — security hardening of a real attack surface, not download counts. Best single near-term shot (competitive: interview + cohort; odds unpublished)
- [ ] Join **Open Source Collective** as fiscal host — free, immediate, wavesurfer precedent; prerequisite plumbing for org payouts / Pledge routing / future grants
- [ ] Enroll as **Tidelift lifter**
- [ ] **Sovereign Tech Resilience** (rolling, free, in-kind): request security audit / bug bounty on audio-decode — builds a documented STA relationship ahead of any Fellowship/Fund application
- [ ] **thanks.dev / Open Source Pledge**: query dependency data — which of ~38 Pledge members (paying $3.7M/yr) already depend on audiojs packages; contact directly. Passive expectation: $0-2k/yr
- [ ] Corporate outreach (needs no website — npm stats exist): dependents of audio-decode (666k dl/wk) via npm/GitHub graph; direct pitch Descript, Riverside.fm, BandLab + voice-agent platforms (LiveKit, Daily). Publish a public maintenance-policy page — groundwork for a filippo.io-style retainer (multi-year play, start now)
- [ ] Enable GitHub Sponsors on audiojs org + FUNDING.yml on all active repos + "Sponsor" README sections (hygiene, not revenue)

### Watch — apply within days of window opening
- [ ] **NLnet Restack / Open Internet Stack** (€5-50k, worldwide individuals): reopens "after summer 2026" — monitor nlnet.nl/news. Frame as infrastructure per NLnet's own funded precedent (Tiliqua audio-DSP, DPF, HVCC, Servo Multimedia), NOT an end-user app. Don't force-fit Taler/Fediversity (Aug 1 deadline, zero overlap)
- [ ] **STF Fellowship 2027** (freelance track, worldwide; Montreal precedent: Julia Evans, 2026 cohort; ~€15-40k/slot, ~8% acceptance): expect ~Q1 2027 window, 4-8 weeks — subscribe to STA newsletter/Mastodon now. Weakest criterion = societal Relevance: pitch accessibility / ed-tech / digital preservation / podcasting-journalism, and pre-empt the "dependency vs user-facing app" question with infrastructure framing
  - [ ] GOVERNANCE.md, contributor guidelines, release process
  - [ ] Document dependents count, download stats, ecosystem impact
  - [ ] Verify Canada→Germany freelance invoicing/withholding before counting the income (unverified)
- [ ] **Anthropic Claude-for-OSS** next round (2026 window closed Jun 30; audio-decode ~2.9M dl/mo clears the 1M threshold — in-kind, not cash)
- [ ] **Mitacs** via CIRMMT (McGill) / BRAMS (UdeM): one outreach email to an audio/music-tech professor ($15k CAD/cycle; needs partner-org entity + grad student — low odds, cheap to open)

### Later (gated)
- [ ] STF Fund — only once a €50k+ hardening scope exists (solo-maintainer precedent: curl, WireGuard, OpenSSH, libmicrohttpd at €195-300k; ~6-month runway)
- [ ] NumFOCUS affiliation for scijs layer (fourier-transform, digital-filter, window-function) — GNU Radio precedent
- [ ] Spotify FOSS Fund — thematically perfect, internal-nomination ONLY (has only ever funded FFmpeg/Xiph/MSW); needs a Spotify engineer champion, find one first
- [ ] Sponsor tiers page + corporate logo wall + "fund the next package" widget (with website)

### Skip — verified dead ends for a Canada-based unincorporated solo maintainer
CZI EOSS (biomedical-only — unless a real bioacoustics adoption story exists by the Oct 18 2026 LOI) · NSF PESOSE (US institutions) · Chrome Framework Fund + Cloudflare Vite fund (bundlers/frameworks only) · CALQ/SODEC/Canada Council (artworks, not tooling) · NRC IRAP (requires for-profit incorporation — values conflict) · Prototype Fund / SIDN / Horizon FSTP / Creative Europe (need EU entity or resident co-applicant)

### With atom (gated on jz DSP proof, see WASM)
- [ ] Pro audio industry outreach: consulting for "JS → VST/CLAP" pipeline
- [ ] Approach Steinberg, Native Instruments, Ableton re: web plugin deployment
- [ ] Paid workshop: "Audio DSP in JavaScript" — target conference workshops (Web Audio Conf, JSConf)

## Archive

### 2026-07 — publish · atom/audio.js convention · biquad/stft · core dissolution

- [x] **`@audio` scope published** (2026-07-08) — preflight → waves A/B/C → 22-package stub wave → `@audio/module`→`@audio/atom` rename → deprecate 10 of 11 unscoped names (`pitch-shift` was never ours — third-party placeholder at 0.0.0) → a-weighting absorption: `.response(f, fs)` on `weighting-{a,b,c,itu468}` (self-consistent with each atom's `coefs()`, verified 1e-9 differential), new `@audio/weighting-b` atom differential-tested against `a-weighting.b()` — caught a real mid-derivation error (B's mid-pole is its own 158.5 Hz, not A's f2/f3). Full record: publish.md (deleted; in git history). `a-weighting` itself deprecated 2026-07-09 — all versions, message points A/B/C/ITU-468 to `@audio/weighting-*` while staying the honest D/Z reference.
- [x] **`audio@2.3.0` published** (2026-07-09) — deps fully `@audio/*`, old unscoped refs gone. CI finding (global `File` missing in Node 18; 20/22 jobs `cancelled` = fail-fast, not independent failures) resolved: `test/fix-core.js` imports `File` from `node:buffer` (≡ the global, works 18.13+); matrix keeps 18/20/22.
- [x] **atom integration** (2026-07-08) — `@audio/atom` (renamed from `@audio/module`) fully rolled out: 50 manifests across 9 families, `audio@2.3.0` hosts the contract natively (`audio.use(factory)`, tail-compose, engine automation ≡ contract params).
- [x] **Engine `streaming: false` whole-render + sidechain key bus** — verified shipped & tested 2026-07-09 (this list's item predated the 2.3.x–2.5.x engine waves): core.js `whole()` dispatch materializes the timeline for `streaming: false` atoms (tail-padded, composes, undoes); declared extra buses fed from the chain's `key` option (rendered per block, rate-reconciled) — engine-hosting tests cover time-varying leveler + ducker duck/recover under a real key. Stale "host doesn't provide yet" comments refreshed to match: audio `test/atom-ops.js` ×2 + `dynamics-ducker` manifest NOTE (suites green; ducker patch published 0.1.5, all pushed).
- [x] **Gate/deesser near-dupe merge** (2026-07-09; suites green: dynamics 35, denoise 54, engine 643): impls consolidated into the canonical dynamics atoms. `@audio/dynamics-gate@0.1.4` gained denoise-gate's hysteresis (`closeThreshold`, default threshold−6) + look-ahead as a delay-line stream with function-form `latency` — batch stays sample-aligned (write+flush, no silence prefix/dropped tail), block hosts compensated; also fixes denoise-gate's real defect: its manifest declared lookahead latency while the 0.1.3 kernel peeked in-buffer at zero net latency. `@audio/dynamics-deesser@0.2.3` gained `mode: 'band'` (denoise-deesser's dynamic peaking-EQ — the two were canonical *architectures*, not dupes, so mode-merged per wideband/split-band precedent; broadband stays default). `@audio/denoise@0.3.5` + `denoise-detect@0.1.6` keep the family's seconds-based in-place API via thin adapters (accepted workspace-policy duplication); `denoise-gate`/`denoise-deesser` dirs removed, both deprecated on npm all-versions with pointers; `@audio/dynamics@0.2.2` README documents the superset; engine dep dropped + its gate hosting test now exercises function-latency compensation via lookahead; registry comment updated. All repos pushed, sweeps registry ≡ repos.
- [x] **audio.js manifest convention + `@audio/compile`/`@audio/wam` split + `audio@2.4.0`** (2026-07-09) — convention renamed `atom.js`/`stat.js` → **`audio.js`**, subpath `<pkg>/audio`, package.json key `"audio"` (consumer-named, svelte's `"svelte"` precedent; `atom.js` implied atom = processor and mismarked manifest-less atoms; stat manifests unify — export shape declares the kind). 121 manifests across 18 repos, all suites green. Package split along its true grain: `@audio/compile` = contract custodian + future compiler CLI (repo renamed from `audiojs/atom`, redirect live) · `@audio/wam` = runtime WAM/AudioWorklet adapter (16 tests) · `toBatch`/`toStream` → engine `audio/batch`+`audio/stream` with 10-test conformance suite (`test:batch`); mirror of `@audio/host` (in ↔ out). Engine registry (123 entries) + docs swept; `audio@2.4.0` published after full-suite verify vs live registry (621/621 + 10/10 batch); 121/121 sweep packages + compile/wam published, `@audio/atom` deprecated, `audiojs/wam` created. Verify surfaced + fixed: mir-tempogram/drums still importing spectralFlux/peakPick from beat-core (missed onset-promotion consumers → repointed, @1.1.2); deplosive integration threshold 0.7→0.75 (exact-complement design). Pushes completed 2026-07-09 — final wave of 10 repos (audio ×8 incl. 2.5.0/2.5.1 codec-manifest work, compile/decode/encode/synth manifests, lockfile post-publish syncs ×6); org sweep clean except decode wasm WIP.
- [x] **Stub wave** (2026-07-08/09) — 22 packages implemented+published: voice ×3, midi ×2 + tune-midi, denoise-repair, synth ×2, effect ×5, mir ×6, resample-polyphase, primitives ×3. Bonus root-cause fix: denoise-core/`@audio/stft` shared stream ring-compaction bug (erased OLA tails past ~16k samples) — fixed in both, 0.1.1.
- [x] **Biquad done properly** (2026-07-08, published+pushed 07-09) — `@audio/biquad` moved into the `filter` repo (+`step()` per-sample, +`filter()` params-convention SOS kernel), made the one RBJ source ecosystem-wide: filter-biquad/variable/vocoder, eq ×7, auditory ×2, amp ×2, spatial-crossfeed, defeedback-notchbank, weighting ×6 (kernel; matched-z stays digital-filter), dynamics deesser/multiband (dynamics-core's hand copy deleted). Layering rule: **`digital-filter` = design math (butterworth, LR, matched-z) + differential reference; `@audio/biquad` = RBJ coefficients + SOS runtime kernel**. Two behavior fixes: filter-biquad `bandpass` and eq-dynamic's detector were constant-skirt while documented 0dB-peak (detector read +20log10(Q) hot). `primitives` repo → `stft`. All 9 repo suites green; 8 repos at 0 ahead/0 behind, every package verified live on npm.
- [x] **stft/window split** (2026-07-08) — `@audio/stft-root` workspace proxy dissolved: `audiojs/stft` root is `@audio/stft` itself; `@audio/window` split to own `audiojs/window` repo (both 1.0.2, real READMEs). Never published under old name, nothing to unpublish; repository fields verified live.
- [x] **Core policy landed — ALL 6 CORES DISSOLVED** (2026-07-09, ~50 packages republished across 10 repos, every suite green): no `*-core` package exists in any repo; every published atom is useful standalone and as a dep. The policy: a `*-core` is internal glue, never a product — anything with independent user value gets promoted to a named atom; consumers repoint to the new atom directly (no re-export shim — a shim inverts the hierarchy, making glue depend on product); the core sheds the code entirely.
  - Promotions: **`@audio/vad@1.0.0`** + **`@audio/noise-estimate@1.0.0`** (out of denoise-core, STFT from `@audio/stft`; umbrella `@audio/denoise@0.3.1` re-exports) · **`@audio/onset@1.0.0`** (spectralFlux/energyFlux/peakPick/ODF out of beat-core; umbrella `@audio/beat@2.1.0`; 70/70) · **`@audio/lpc@1.0.0`** (Levinson-Durbin AR analysis/prediction/extrapolation/interpolation out of denoise-core/ar.js — seeds the De-Slop vocoder track).
  - New categorized atoms (never single-entry): **`@audio/quality@1.0.0`** (snr/segSnr/lsd/spectralSim/nrr/goertzel; merged denoise+stretch duplicate suites) · **`@audio/spectral-pvoc@1.0.0`** (scatterGated/scatterLocked/lockPhase/findPeaks/makeFrameRatio — the pvoc engine; applications already existed as shift/stretch atoms).
  - Absorptions: `@audio/stft@1.0.3` (OLA-tail fix ported from denoise-core WIP + regression tests — killed 3-copies drift) · `@audio/resample-sinc@1.1.0` (+`sincRead`/`resampleTo`). Routes: denoise STFT→`@audio/stft`, RBJ→`@audio/biquad` (coefs byte-identical), shift/stretch STFT→`fourier-transform/stft` direct.
  - Inlined per atom (deliberate stable-boilerplate duplication over shared-dep packages): dynamics dB/timeCoef/writers (14), saturate shape/onepole (4), beat validate (4), stretch framing/OLA (9), shift host plumbing as per-atom `host.js` (15 + umbrella router).
  - Same wave: `denoise-core@0.1.4` (ar shed; carried user's stft OLA-tail WIP), `denoise-deplosive@0.1.3` (HF = exact complement of LF), `denoise-gate@0.1.3` (look-ahead sample-aligned, no net latency).
  - **Unpublish hard-blocked** (E422 "has dependent packages" — old atom versions resolve cores in-range forever, even --force, even <72h). Ceiling reached: every version of all 6 cores deprecated with pointers ("Internal glue for @audio/X-* atoms"), verified per-version; nothing at latest depends on any core; `audio` engine has no core deps.
- [x] `@audio/denoise` family complete — spectral subtraction, gating, dehum, declick + full family (54 tests)
- [x] Recognition: recovered x.com/audio_js, started publishing humanized releases

### 2026-07 — @audio restructure & baseline waves (1–4)

- [x] Ecosystem unified: 37 repos at `~/projects/@audio/<sub>`, one shape (umbrella root + `packages/*` atoms), 847 tests green — see research.md catalog + audio/.work/baseline.md matrix
- [x] Moves/renames: 14 repos in (incl. audio-host → host, atom → module); scaffolds absorbed; conflicts resolved; bytebeat moved out (app-side, units-not-apps principle)
- [x] Baseline implemented: resample, vocals, spectral (full), loudness (BS.1770/EBU-verified), multiband, FIR EQ, reverb family (7 kinds, Jot-T60-verified), saturate (oversampled), dynamics character models + leveler, eq-dynamic, tune-snap, measure (Farina ESS round-trip), amp, mir (tonnetz/melody/tempogram/structure/fingerprint), synth (generators + drums + voice), sinusoidal (MQ/SMS), defeedback MVP (closed-loop verified, zero-latency), spatial (complete), note, spectral freeze/contrast/harmonics/cqt
- [x] Quality passes: FDN → canonical Jot T60 (Schroeder-EDC test); fft scratch-buffer aliasing found & hardened; consistency audit across all repos
- [x] Docs: README package refs renamed to @audio scope everywhere; publish plan written (.work/publish.md); research.md catalog authoritative
- [x] `@audio/effect`: exciter, frequency-shifter committed (auto-panner → @audio/spatial)
- [x] `~/projects/@audio/{denoise,effect,eq,filter}` scaffolds: absorbed + committed
- [x] reconcile draft atoms with canonical root DSP (full atomization)
- [x] `@audio/dynamics` home resolved; `effect/dynamics` dissolved; gate/deesser variants qualified
- [x] colors-of-noise (pink→violet, slope-verified); reverbs (Freeverb/Dattorro/Schroeder/convolution/FDN/spring/shimmer); defeedback analyzer/tracker/notchbank; K-weighting exact BS.1770 (in @audio/weighting-k)

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
