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

**decode/speaker — resolved 2026-07-08:** merged (not forced) and pushed on your ask. `decode` kept your direct README edit; `speaker` kept Julia Ortiz's PR #66 in history.

## 0b. Repo rename — done 2026-07-08

Renamed all 14 old-style GitHub repos to match their local short names (`gh repo rename`, redirects live): `audio-decode`→`decode`, `audio-encode`→`encode`, `audio-speaker`→`speaker`, `audio-mic`→`mic`, `audio-filter`→`filter`, `audio-effect`→`effect`, `audio-host`→`host`, `audio-module`→`module` (since renamed again → `atom`), `pitch-detection`→`pitch`, `beat-detection`→`beat`, `time-stretch`→`stretch`, `pitch-shift`→`shift`, `noise-reduction`→`denoise`, `dynamics-processor`→`dynamics`.

Followed by an ecosystem-wide link sweep (197 files across 19 repos: 18 `@audio` repos + the `audio` engine): GitHub URLs (`package.json` repository/bugs/homepage, README badges/links) repointed to the new canonical names, then a second pass fixed link *labels* that still read the old name even after the href was corrected (e.g. `[audio-encode](.../encode)` → `[encode](.../encode)`). Also fixed, found along the way: three `audio/README.md` ecosystem-list entries pointing at `github.com/nickolanack/*` instead of `audiojs/*` (pre-existing, unrelated to this rename, clearly a stale mistake). All local git remotes repointed to the new URLs. Verified zero remaining old-name references anywhere; full test sweep green (audio engine 508/508). All 19 repos committed and pushed.

Remaining 22 repos didn't need renaming (already created under their short names in the preflight push).

## 1. Publish order (dependency-leaf first) — done 2026-07-08

Registry deps (digital-filter, fourier-transform, window-function, periodic-function, tst, audio-lena) are already public. Cross-`@audio` runtime deps define the order:

| Wave | Repos (each: `npm run publish:all`) |
|---|---|
| A — no `@audio` deps | note, weighting, auditory, resample, vocals, filter (+speech atoms), reverb, spatial, effect, pitch, beat, denoise, spectral, synth, sinusoidal, defeedback, shift, stretch, decode, encode, speaker, mic, module, host |
| B — dep on A | eq (none actually — A), loudness (weighting, resample), saturate (resample, eq), dynamics (eq), measure (synth devDep), mir (pitch, beat, spectral) |
| C — dep on B | tune (pitch, note, shift), amp (saturate, reverb) |

**Result: 241 packages published across 29 repos.** Not the `npm run publish:all` per-repo scripts (found inconsistent across repos: some idempotent shell loops, some bare `npm publish --workspaces` that hard-errors on a conflict, `mic` had no publish script at all) — wrote one driver instead, leaf-then-umbrella per repo, classifying each attempt by the registry's actual reply rather than pre-checking:

- 22 **private stubs** correctly skipped (denoise-repair, effect-{graindelay,lofi,sbr,stutter,subbass}, mir-{coversong,downbeat,drums,multif0,similarity,transcribe}, resample-polyphase, speech-world, synth-{poly,sfx}, tune-midi — matches the documented stub list)
- 22 **already-live legacy leaves** skipped clean (decode-*, encode-* — pre-existing published packages, versions matched, no republish needed)
- 10 **not-ready native leaves** skipped by design (`host-clap-*`, `host-vst-*` ×5 platforms, `mic-linux-*`/`mic-win32-x64` — missing `.node` binary, no build hook; flagged in preflight, unchanged)
- 2 `mic-darwin-{arm64,x64}` and all 5 `speaker-*` published at their current local versions (1.1.0 / 2.3.1 — ahead of what was live, no bump needed, they were already due)

Auth note: account 2FA is `auth-and-writes`; the classic token in `.npmrc` demanded an OTP after the very first publish (a stale grace window, not a real bypass) — blocked automation until swapped for an Automation token, which bypasses 2FA for writes as designed. Token rotated in `~/.npmrc` 2026-07-08.

One name defect found publishing: `@audio/module` shipped at version `0.0.0` (its package.json was never bumped off the placeholder) — resolved by the atom rename below (unpublished, reborn as `@audio/atom@0.1.0`).

**Post-publish queue (audio-agent feedback) — resolved 2026-07-08:**
- `@audio/vocals@1.0.1` + `@audio/loudness-lra@1.0.1` — the two packages that shipped with runtime `file:` specs, republished with semver same day. Publish driver now hard-fails any runtime `file:`/`link:` spec before attempting a publish (dev-links in effect/module are devDeps — harmless, deliberate, kept).
- `@audio/stretch-core@1.0.1` — anaHop rounding fix (published 1.0.0 NaN'd on every non-integer ratio); caret ranges propagate it to all stretchers and the umbrella, no other bumps needed.
- `@audio/dynamics-{expander,compand,leveler,transient-shaper,ducker}@0.1.1` — atom manifests (e2561f0) live; audio's registry names all 18 modules against published packages.

(Practically: A then B then C; within a wave order is free. Stubs are `private: true` — `--workspaces` skips them automatically? **No — verify**: npm publishes non-private only; private workspaces are skipped with a warning. Confirm on the first repo.)

Versions: as committed (atoms 1.0.0 / 0.1.0 per family; umbrellas carry lineage versions — decode 3.11.0, filter 3.0.0, effect 2.0.0…). No bumps needed for first scoped publish.

## 2. Deprecate unscoped — done 2026-07-08

`npm deprecate <name>@'*' "<msg>"`, verified live via `npm view <name> deprecated` after each:

| Old | Message | Status |
|---|---|---|
| audio-decode | Renamed to @audio/decode | ✔ deprecated (51 versions) |
| encode-audio | Renamed to @audio/encode | ✔ deprecated (11 versions) |
| audio-speaker | Renamed to @audio/speaker | ✔ deprecated (41 versions) |
| audio-mic | Renamed to @audio/mic | ✔ deprecated (2 versions) |
| audio-filter | Split into @audio/filter, @audio/weighting, @audio/auditory, @audio/eq (+ @audio/spatial-crossfeed) | ✔ deprecated (6 versions) |
| audio-effect | Split into @audio/effect, @audio/dynamics, @audio/spatial, @audio/reverb; pitch-shifting → @audio/shift | ✔ deprecated (2 versions) |
| pitch-detection | Renamed to @audio/pitch; chroma/chord/key → @audio/mir | ✔ deprecated |
| beat-detection | Renamed to @audio/beat | ✔ deprecated (2 versions) |
| time-stretch | Renamed to @audio/stretch | ✔ deprecated (4 versions) |
| audio-module | Renamed to @audio/atom (was @audio/module, itself renamed 2026-07-08 — see §4) | ✔ deprecated |
| ~~pitch-shift~~ | — | **Not deprecated — not ours.** `npm owner ls pitch-shift` shows `mikolalysenko`, not `dy`; the live package is an unrelated third-party placeholder at `0.0.0`. The `shift` repo's package.json was always named `pitch-shift` locally, but it was never actually published under that name (same bucket as noise-reduction/dynamics-processor/audio-host below) — the plan's table assumed ownership that was never verified. No action possible or needed. |

Not deprecated (stay canonical): `audio`, `audio-buffer`, `web-audio-api`, `pcm-convert`, `audio-type`, `audio-lena`, `a-weighting` (absorbed for A/B/C/ITU-468 per §3 below, but D/Z-weighting have no equivalent — stays canonical for those, its own deprecation held pending), scijs tier (`digital-filter`, `fourier-transform`, `window-function`, `periodic-function`). Never published, nothing to deprecate: noise-reduction, dynamics-processor, audio-host.

Optional breadcrumb: publish one final patch of each old package whose README top says "moved to @audio/x" before deprecating — recommend **skip** (deprecation banner suffices; avoids 11 pointless releases).

## 3. After

- [ ] `audio` package: switch its registry/plugin references to `@audio/*` names (its own release) — **on hold, repo is mid-rebuild on your side, not touched**
- [ ] Site catalog + README org profile update; announce (x.com/audio_js release-notes style) — separate from this pass, tracked as its own todo.md item
- [x] a-weighting absorption (2026-07-08) — `.response(f, fs)` added to `weighting-{a,b,c,itu468}`, self-consistent with each atom's own `coefs()` (not a parallel reimplementation — verified to 1e-9 against a differential `magDB` check). New `@audio/weighting-b` atom implemented (was missing entirely): differential-tested against `a-weighting`'s own `b()` — caught and fixed a real error mid-derivation (assumed B shared A's f2/f3 poles; the correct mid-pole is its own 158.5 Hz, confirmed by back-solving `a-weighting`'s formula). `a-weighting`'s README now points A/B/C/ITU-468 users to `@audio/weighting`; stale `audio-filter` link fixed. **Deprecating `a-weighting` itself held back** — it was never on the named-11 list (marked "stay canonical until absorbed"), and absorption is partial: D-weighting and flat Z-weighting have no `@audio/weighting` equivalent, so the package is still the honest reference for those. One command away when you say go: `npm deprecate 'a-weighting@*' "A/B/C-weighting + ITU-468 moved to @audio/weighting-{a,b,c,itu468} (also .response(f)). D-weighting and Z-weighting have no @audio equivalent yet -- this package remains the reference for those."`
- [x] Rename GitHub repos to scope names — done in §0b, all 14

## 4. @audio/module → @audio/atom — done 2026-07-08

The contract package renamed to name the unit rather than collide with its own compile targets (module = *Web Audio Modules*' word, unit = *AudioUnit*'s, node/processor = Web Audio's; "atom" is the ecosystem's existing vocabulary and the last generic term standing). Scope:

- 50 manifests `audio-module.js` → `atom.js` across 9 repos (denoise 12, dynamics 10, effect 22, filter, pitch, reverb, saturate, synth, vocals); package.json subpath `./audio-module` → `./atom`, key `"audio-module"` → `"atom"`; all patch-bumped and republished.
- `@audio/module@0.0.0` **unpublished** (placeholder version, <72 h old, zero dependents) and reborn as `@audio/atom@0.1.0` — real first version. GitHub repo `audiojs/module` → `audiojs/atom` (redirect live), local dir renamed, CONTRACT/GUIDE/README terminology swept module→atom (protecting "Web Audio Modules", "ES module", `node_modules`), 26/26 tests green.
- Old unscoped `audio-module` deprecation re-pointed: "Renamed to @audio/atom".
- `audio` engine: registry subpaths ×~40, test files `module-*` → `atom-*`, docs — committed; `core.js`'s two references patched in the working tree but left uncommitted with the rebuild. Suite 548/548 against the republished registry packages.
- Manifest filename decision: `atom.js` (not `.atom.js` — hidden dotfile; not `aa.js` — same ambiguity class as the rejected `am.js`). CLI naming headroom: `aa` the npm name is squatted, but a future `@audio/atom` bin can still be named `aa` (`npx @audio/atom` unaffected).


## 5. audio.js manifest convention + @audio/atom split — repos done 2026-07-09, publish pending

Convention: manifest `atom.js`/`stat.js` → `audio.js`, subpath `./atom`/`./stat` → `./audio`, package.json key `"atom"`/`"stat"` → `"audio"` — consumer-named (svelte's `"svelte"` field precedent); `atom.js` implied atom = processor and mismarked the manifest-less atoms; stat manifests unified (export shape declares kind: factory+params = processor, `{ stat, compute }` = analyzer).

Package split (adapters were never the product — compiling manifests to targets is):
- `@audio/compile@0.1.0` — contract custodian (CONTRACT.md, GUIDE.md, doc-only files) + future WASM compiler CLI. GitHub `audiojs/atom` → `audiojs/compile` renamed (redirect live), description updated. Local dir `@audio/atom` → `@audio/compile`.
- `@audio/wam@0.1.0` — `toWam` + examples + demo + 3 test files (16/16 green), new local repo `~/projects/@audio/wam`; default vendor `'audio-plugin'` → `'audio'`.
- `audio/batch` + `audio/stream` — `toBatch`/`toStream` absorbed into the engine (batch.js), conformance suite → `test/batch.test.js` (`npm run test:batch`, 10/10 green vs sibling checkouts). Registry `audio.atoms` 123 entries → `/audio`; `core.js`/`bin/cli.js` package-name parsing fixed (`spec.split('/atom')[0]` broke on `/audio` — now `split('/').slice(0,2).join('/')`); README/architecture docs swept; `audio@2.4.0` staged.

Sweep: 121 manifests, 18 repos (dynamics 15, denoise 12, effect 22, filter 11, synth 9, mir 10, eq 4, reverb 6, saturate 5, spatial 7, shift 4 incl. umbrella manifest, loudness 4, spectral 6, amp 2, pitch 1, tune 1, defeedback 1, vocals 1) — every affected package patch-bumped, `"audio"` marker added where missing (~35 packages had export but no key), all 18 suites green, one commit per repo, nothing pushed.

**Published 2026-07-09/10 (user go-ahead):** 121 sweep packages via `release.mjs --publish --repo <r>` ×18 (per-repo to avoid the known holdouts: 3 mic platform binaries need CI runners, pcm-convert 2FA, 3 decode wasm WIP left DIRTY on purpose) — 121/121 clean. `@audio/compile@0.1.0` + `@audio/wam@0.1.0` published; `@audio/atom@0.1.0` deprecated ("Split: contract + compiler → @audio/compile; toWam → @audio/wam; toBatch/toStream → audio/batch"). GitHub `audiojs/wam` created, local remote wired. `audio@2.4.0` published after full-suite verify against the republished set (prepublishOnly: build + test:all; plus 621/621 main suite + 10/10 batch conformance run standalone).

Fallout found & fixed during engine verify (both pre-existing, surfaced by fresh installs):
- `mir-tempogram`/`mir-drums` still imported `spectralFlux`/`peakPick` from `@audio/beat-core` — consumers missed in the onset promotion; beat-core@1.0.2 shed the code. Repointed to `@audio/onset`, both @1.1.2 published.
- Engine `test/atom-denoise.js` deplosive duck threshold 0.7 recalibrated to 0.75 — the exact-complement deplosive (≥0.1.3) ducks 28.7% here vs the old crossover's ≥30%, by design (no coloration); revisit if deeper ducking is wanted.
- `fourier-transform` CI "failure": the v2.3.0 *tag* run only — that tag's workflow predates the `npm install` step. master + v2.3.1 green; historical noise, no action.

**Remaining: pushes only** (never pushed without explicit ask) — 21 repos have local commits: compile, wam (initial — repo exists, remote wired), audio, the 18 family repos, and this site repo.
