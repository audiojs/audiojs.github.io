# Publish plan — `@audio` scope migration

Goal: publish all 37 repos' packages under `@audio/*`, then deprecate the unscoped names with pointers. One pass, leaf-first; every repo already has `npm run publish:all` (workspaces then umbrella).

## 0. Preflight (once) — done 2026-07-08

- [x] npm: confirmed — `npm whoami` → `dy`, `audio` org (owner: dfcreative/jamen, dy: developer), read-write on existing `@audio` packages; profile 2FA = `auth-and-writes` → actual `npm publish` (phase 1) will need an OTP or an automation token, not scriptable blind
- [x] Swapped local `file:` deps → semver (all targets confirmed at `1.0.0`, matching the plan's guess): loudness-lufs/truepeak, saturate-core/multiband, dynamics-multiband, mir-melody/tempogram/structure, tune-snap (+ tune root devDep), amp-tube/cabinet, measure (devDep) — 7 repos, 7 commits. Family test suites reconfirmed green post-swap (deps still resolve via existing workspace symlinks; nothing reinstalled). Dev links correctly left as `file:` (effect→digital-filter, module→web-audio-api)
- [x] `npm pack --dry-run` swept all 315 package.json (280 non-private). Found and fixed real issues, not just the anticipated LICENSE gap:
  - **`@audio/decode` was leaking `.claude/settings.json` + `.github/workflows/test.js.yml` + `.gitmodules`** into its tarball — it had no `files` field and its `.npmignore` didn't cover them (only repo among all 315 with this exposure). Added an explicit `files` whitelist.
  - `decode-wav` and `host` (packages/host) were the only 2 atoms of ~280 missing an explicit `files` field (every sibling atom has one) — added, matching convention; `host` was incidentally shipping its `test.js`.
  - `host`, `host-clap`, `host-vst` declare `index.d.ts` in `files`/`types` but it's never generated anywhere (not gitignored — just absent). Real gap, not fixed — writing accurate native-binding `.d.ts` is its own task.
  - `host-clap-*`, `host-vst-*`, `mic-linux-*` (native prebuild leaves) reference `.node` binaries that don't exist in a dev checkout (gitignored build output, no `prepack`/`prepublishOnly` hook to build them). **Expected for now, but these leaves are not npm-publishable as-is** — needs a prebuildify-style CI pipeline before wave A can include them. JS-only atoms are unaffected.
  - **198 of 280 atoms have no individual README** (only the family umbrella documents them) — this is a real content-authorship decision (write ~200 minimal READMEs, or accept umbrella-only docs for standalone `npm i @audio/x` installs), not something to resolve mechanically. Flagged for a decision, not actioned.
  - LICENSE: plan's assumption ("only umbrella has it") was partly wrong — decode's atoms bundle their own LICENSE; most other families' don't. Cosmetic, not blocking.
- [x] GitHub: created all 22 new umbrella repos (the plan said 15 but listed 21 — undercounted, and omitted `reverb`; actual count needed was 22: weighting, auditory, eq, spatial, mir, synth, spectral, loudness, vocals, resample, sinusoidal, note, tune, saturate, amp, measure, defeedback, primitives, neural, voice, midi, **reverb**) as `audiojs/<name>`, public, pushed. Pushed 12 of the 14 existing-name repos cleanly (fast-forward). **2 held back — see below.**
- [x] Final sweep: `npm test` across all 36 repos. 32 pass real suites (auditory 28, beat 70, decode 67, filter 98, stretch 152, weighting 30, module 26, reverb 14, effect 36, host live-playback demo, …). 4 "fail" (midi, neural, primitives, voice) are the documented stub scaffolds (`private:true`, no `scripts.test` — npm's bare "missing script" exit, not a real failure).

**Held back — not pushed, need a decision:**
- `decode`: GitHub `master` has one commit past our local history (`20c1e35 Update readme.md`, you, direct-to-GitHub, removes 3 lines of format-coverage prose) that a force-push would erase. Local still has those 3 lines.
- `speaker`: GitHub `master` has two commits past our local history — an external contributor PR (#66, Julia Ortiz, "Add optional dependency for speaker-darwin-arm64"). Local already independently carries that same optionalDependency (content isn't at risk), but the commit/attribution history would be erased by force-push.
- Neither was force-pushed. Merging needs `git merge`/`pull`, which is off-limits without you asking for it directly — resolve by hand, or say the word and it's a two-commit merge for each.

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
