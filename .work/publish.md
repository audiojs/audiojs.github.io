# Publish plan — `@audio` scope migration

Goal: publish all 37 repos' packages under `@audio/*`, then deprecate the unscoped names with pointers. One pass, leaf-first; every repo already has `npm run publish:all` (workspaces then umbrella).

## 0. Preflight (once)

- [ ] npm: confirm `@audio` scope publish rights + 2FA/automation token; `npm whoami`
- [ ] Swap local `file:` deps → semver (they only exist where both sides are ours; versions already aligned):
  - loudness-lufs → `@audio/weighting-k ^1.0.0` · loudness-truepeak → `@audio/resample-sinc ^1.0.0`
  - saturate-core → `@audio/resample-sinc` · saturate-multiband → `@audio/eq-crossover`
  - dynamics-multiband → `@audio/eq-crossover`
  - mir-melody → `@audio/pitch-yin` · mir-tempogram → `@audio/beat-core` · mir-structure → `@audio/spectral-mfcc`
  - tune-snap → `@audio/pitch-yin`, `@audio/note-scale`, `@audio/shift-psola`
  - amp-tube → `@audio/saturate-tube` · amp-cabinet → `@audio/reverb-convolution`
  - measure (devDep) → `@audio/synth-chirp` · tune (devDep) → `@audio/pitch-yin`
  - dev links kept as file: (fine, devDeps): effect→digital-filter, module→web-audio-api
- [ ] `npm pack --dry-run` per repo — check `files` lists ship what's needed (LICENSE presence in atoms: only umbrella has it — acceptable, or add at publish)
- [ ] GitHub repos: create remotes for the 15 new umbrellas (weighting, auditory, eq, spatial, mir, synth, spectral, loudness, vocals, resample, sinusoidal, note, tune, saturate, amp, measure, defeedback, primitives, neural, voice, midi — create as `audiojs/<name>`), push; existing repos keep their names (rename later at leisure — GitHub redirects)
- [ ] Final sweep: `node test.js` per repo green (847 as of 2026-07)

## 1. Publish order (dependency-leaf first)

Registry deps (digital-filter, fourier-transform, window-function, periodic-function, tst, audio-lena) are already public. Cross-`@audio` runtime deps define the order:

| Wave | Repos (each: `npm run publish:all`) |
|---|---|
| A — no `@audio` deps | note, weighting, auditory, resample, vocals, filter (+speech atoms), reverb, spatial, effect, pitch, beat, denoise, spectral, synth, sinusoidal, defeedback, shift, stretch, decode, encode, speaker, mic, module, host |
| B — dep on A | eq (none actually — A), loudness (weighting, resample), saturate (resample, eq), dynamics (eq), measure (synth devDep), mir (pitch, beat, spectral) |
| C — dep on B | tune (pitch, note, shift), amp (saturate, reverb) |

(Practically: A then B then C; within a wave order is free. Stubs are `private: true` — `--workspaces` skips them automatically? **No — verify**: npm publishes non-private only; private workspaces are skipped with a warning. Confirm on the first repo.)

Versions: as committed (atoms 1.0.0 / 0.1.0 per family; umbrellas carry lineage versions — decode 3.11.0, filter 3.0.0, effect 2.0.0…). No bumps needed for first scoped publish.

## 2. Deprecate unscoped (after all of 1 succeeds)

`npm deprecate <name>@'*' "<msg>"` — messages name the successor(s):

| Old | Message |
|---|---|
| audio-decode | Renamed to @audio/decode |
| encode-audio | Renamed to @audio/encode |
| audio-speaker | Renamed to @audio/speaker |
| audio-mic | Renamed to @audio/mic |
| audio-filter | Split into @audio/filter, @audio/weighting, @audio/auditory, @audio/eq (+ @audio/spatial-crossfeed) |
| audio-effect | Split into @audio/effect, @audio/dynamics, @audio/spatial, @audio/reverb; pitch-shifting → @audio/shift |
| pitch-detection | Renamed to @audio/pitch; chroma/chord/key → @audio/mir |
| beat-detection | Renamed to @audio/beat |
| time-stretch | Renamed to @audio/stretch |
| pitch-shift | Renamed to @audio/shift |
| audio-module | Renamed to @audio/module |

Not deprecated (stay canonical): `audio`, `audio-buffer`, `web-audio-api`, `pcm-convert`, `audio-type`, `audio-lena`, `a-weighting` (until absorbed into @audio/weighting as `.response()`), scijs tier (`digital-filter`, `fourier-transform`, `window-function`, `periodic-function`). Never published, nothing to deprecate: noise-reduction, dynamics-processor, audio-host.

Optional breadcrumb: publish one final patch of each old package whose README top says "moved to @audio/x" before deprecating — recommend **skip** (deprecation banner suffices; avoids 11 pointless releases).

## 3. After

- [ ] `audio` package: switch its registry/plugin references to `@audio/*` names (its own release)
- [ ] Site catalog + README org profile update; announce (x.com/audio_js release-notes style)
- [ ] a-weighting absorption: add `.response(f)` exports to @audio/weighting atoms, deprecate a-weighting
- [ ] Rename GitHub repos to scope names when convenient (redirects keep old links alive)
