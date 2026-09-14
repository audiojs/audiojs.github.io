# Package baseline — 2026-09-14

The first priority is dependable installation, documentation and composition of the existing packages. The catalog already has breadth. For musicians and DSP developers, a small supported path with accurate examples, types and runtime limits is more useful than another batch of algorithms.

## Scope and findings

Checked the local repositories in `~/projects/@audio`: 356 root/workspace manifests, 332 publishable packages and 24 private manifests. This excludes the separate unscoped repositories outside that directory. The check is source-level inventory, not evidence that every npm artifact, declaration or DSP algorithm works.

| Check | Result after this pass |
|---|---|
| README presence | All 332 publishable packages have one. Completeness still needs executable examples and API review. |
| Declared entry files | Present except three platform-built microphone binaries. Wildcard entries check their directory only. |
| Visible relative README links | No missing local targets found. External links and anchors are not checked; commented-out plots are excluded. |
| Generated examples importing an undeclared umbrella | Fixed 34 leaf READMEs: beat 2, dynamics 11, effect 21. |
| Incorrect default import | Fixed `@audio/dynamics-envelope`; its export is named. Generator reads umbrella re-exports to preserve this distinction. |
| License navigation | Fixed denoise's badge link to a nonexistent local LICENSE. |
| Declaration presence | Closed all 23 non-platform gaps: 21 roots and two compiler adapters. Five EQ leaves already had adjacent declarations. Existing declarations outside the tested path still need semantic API review. |
| Declaration exports | Repaired 70 leaf export maps across beat, denoise, measure, midi, mir, pitch, resample and spectral. Their `types` fields pointed at declarations that NodeNext/bundler resolution could not reach through `exports`. The baseline now detects this defect and invalid non-relative export targets. |
| Test entry points | 84 packages declare their own test command; 248 have a family test entry point. This does not imply that all 248 are covered or untested. |

The corrected leaf imports were also resolved against the actual package entry modules. Hand-written READMEs were preserved. These changes are local; updated npm documentation still requires release.

## Baseline every supported package should meet

- A clean install supplies the files, dependencies and exports shown in the README. Run examples against packed/installed packages, outside workspace resolution.
- The first example works with the stated install command. Explain inputs, outputs, units, defaults, mutation and state where relevant; distinguish a complete example from a fragment.
- State supported environments and runtime limits: browser/Node, streaming/whole-buffer, channel layout, sample-rate handling, parameter changes, reset/disposal, latency and tails. Say when a processor restarts or cannot run in real time.
- Types resolve through the same public imports and describe the actual option/return surfaces. Check both NodeNext and bundler resolution from installed artifacts.
- Tests exercise observable signal behavior and important failure cases. A passing umbrella command is not proof that every leaf or artifact is covered.
- Package metadata, source docs and published versions agree. Use the existing release sweep; distinguish source-ready, locally packed and publicly installed results.

## Next work, in order

1. **Completed: umbrella types and their installation checks.** All 21 missing root declarations and both compiler adapters now have types. Ordinary umbrellas re-export leaf declarations, including their unambiguous named option/result types; local wrappers describe their own semantics. The compiler's browser/Node conditions expose different APIs, with a common processor declaration shipped identically in both standalone adapters. Native declarations describe the current API; native release/build acceptance remains gated on JZ v1.
2. **Continue the installed-package check on the supported DSP path.** Dynamics/EQ now have executable first README examples, strict types and signal/state assertions in a fresh tarball consumer. Delay and ping-pong now also run as real installed AudioWorklets, including their relative helper imports, in three browser engines. Keep family source tests. This is the protection against workspace-only success and empty npm releases.
3. **Align generated processor-factory types with the shared contract.** The effect-default/delay repair below is complete. Next, fix the generated `Ctx` shape: a strict `toWam(delay)` composition currently fails because `maxChannels` is required by the generated declaration but absent from `ProcessorContext`. Regenerate from `compile/tools/dts.js`, verify params/context compatibility and direct adapter composition, then widen automation/tail coverage. Native release remains gated on JZ v1.
4. **Audit native microphone releases on their platforms.** `@audio/mic-linux-arm64`, `@audio/mic-linux-x64`, and `@audio/mic-win32-x64` lack local `mic.node` files. Inspect exact public tarballs and run installation/load checks in the matching OS/architecture CI before deciding that publication is broken. Do not treat absence on this macOS checkout as proof of an npm defect.
5. **Automate the release discipline.** Reuse `scripts/release.mjs` for drift reporting and layer artifact checks into family CI. Publish leaves before dependent umbrellas, then test exact public versions. Keep registry publication separate from checks. Broader native compiler release/DAW acceptance waits for JZ v1.

### Declaration gaps closed in this pass

21 root packages: `@audio/amp`, `@audio/compile`, `@audio/defeedback`, `@audio/denoise`, `@audio/effect`, `@audio/measure`, `@audio/midi`, `@audio/mir`, `@audio/note`, `@audio/pitch`, `@audio/resample`, `@audio/reverb`, `@audio/saturate`, `@audio/sinusoidal`, `@audio/spatial`, `@audio/spectral`, `@audio/stft`, `@audio/synth`, `@audio/tune`, `@audio/voice`, `@audio/window`.

Two compiler leaves: `@audio/compile-wam`, `@audio/compile-vst`.

Supporting fixes outside `~/projects/@audio`: `window-function` now has 34 real default-subpath declarations instead of invalid module augmentations and a misleading wildcard type redirect. `web-audio-api` declares the completion callback only on `OfflineAudioContext`, fixing its strict inheritance error. The AudioWorklet adapter preserves the supplied host's node/parameter types, so browser and Node graphs both accept the returned worklet node without casts. Runtime DSP code is unchanged.

`npm run test:types` packs the 21 newly typed roots plus dynamics/EQ, both adapters, window-function and their local dependency closure (210 tarballs), installs them in a fresh consumer and checks NodeNext and bundler resolution with TypeScript 5.8.2, strict mode and library checking enabled. It checks every runtime export on those entry points, named option imports, representative processing calls, invalid calls that must fail, all 34 window default subpaths, both shipped compiler examples, and the browser's absence of the native builder. Native adapter declarations also compile without DOM libraries. A separate packed Node Web Audio SDK declaration check verifies connections into and out of the worklet; SDK device dependencies are not installed by that declaration check.

### API and README follow-up

A named re-export scan of 29 umbrellas found 14 missing typed exports: dynamics lacked `transientShaper`, `multiband`, `opto`, `fet`, `vca`, `varimu`, `leveler`; EQ lacked `firEq`, `firDesign`, `dynamicEq`, `fitEq`, `toEqualizerApo`, `fromEqualizerApo`, `eqResponse`. Both now reuse their leaf function declarations. Existing umbrella option names remain available; obsolete `rmsWindow` fields on gate/deesser are retained as deprecated, ignored fields. The compressor leaf now declares its already-supported detector/RMS-window options.

The clean consumer exposed five additional packaging omissions: eq-parametric, eq-crossover, eq-lowshelf, eq-highshelf and eq-fir had local declarations excluded from `files`. Their package lists and exports now ship the declarations. The packing loop asserts that each selected package's declared/adjacent main declaration is present; this assertion failed on the old eq-crossover artifact before the fix. Strict installed NodeNext and bundler checks now pass all 210 tarballs' selected entry points, including all 35 dynamics/EQ runtime exports and legacy type names. This does not establish complete semantic accuracy for every declaration in the catalog.

Dynamics/EQ READMEs now have self-contained first examples, leaf/umbrella import guidance and explicit units, rate keys, ownership, state/reset and streaming limits. Dynamics' limiter no longer claims inter-sample peak protection; FIR docs describe a finite approximation with whole-buffer lookahead; fit-EQ docs apply the returned preamp and distinguish response headroom from a peak ceiling. Regenerated dynamics-envelope and dynamics-limiter docs are in sync; a second generator pass reports zero changes.

The four installed tests in `scripts/types/readmes.mjs` execute the first JavaScript fences from the packed READMEs, then assert:

- **Dynamics README:** a 4800-sample, 220 Hz, 48 kHz sine stays unchanged at the input; compressor/limiter allocate distinct full-length outputs; the limiter obeys its sample ceiling; split compressor output equals batch sample-for-sample.
- **Writers:** compressor/limiter/gate at 44.1/48/96 kHz, empty write then flush, a two-impulse signal split immediately before/at/after 5 ms lookahead and at the final boundary, and fresh-writer A → A → one-sample B. Concatenated output equals the batch result and preserves total length. No promise of resetting by reusing a flushed writer is made.
- **EQ README:** the installed umbrella is the same function as its leaf, the original 512-sample impulse is preserved, and the processed copy matches a fresh leaf call with the documented settings.
- **EQ state:** `number[]`, Float32Array and Float64Array at 44.1/48/96 kHz, splits at 0/1/127/128/final-minus-one/final with an intervening empty call, and fresh-params A → A → one-sample B. Return identity and every output sample are checked against a whole-buffer pass.

Both README snippets also pass strict JavaScript checking in NodeNext and bundler modes. The full dynamics suite (56 tests), EQ suites (8 leaf + 31 umbrella tests), and full site suite (Chromium/Firefox/WebKit and all seven utility pages) pass. These checks do not yet exercise these DSP leaves through AudioWorklet or a native plugin.

The subsequent effect repair below started from this inconsistency: All 24 leaves with an optional `params` declaration and a required runtime params argument threw in direct probes with `Float32Array.of(1, 0)` (both channel arguments supplied for ping-pong/rotary). Delay probes with `fs: 8`, `mix: 1`, `feedback: 0`, and `[1, 0]` return NaN at `time: 0` and `time: 0.01`. Processing `[1, 0, 0]` with a four-sample delay, shrinking to one sample, then processing `[0, 0]` emits `[0, 1]` instead of discarding the old impulse. These boundaries need repair before integration. Those probes describe the state before the effect repair below. Native work still waits for JZ v1.

### Effect API repair and installed browser evidence

Completed the next ordered repair:

- All 24 kernels whose options were declared optional now use fresh defaults when options are omitted/undefined. Reusing one options object continues state; a fresh object resets it. All 25 PCM function declarations preserve Float32Array/Float64Array return types, including mixed-type stereo pairs.
- Delay/ping-pong quantize time to `max(1, floor(time * fs))` samples, reset rings when that effective length changes, preserve history at unchanged lengths, and leave state untouched on empty writes. Invalid time/rates fail before processing; mismatched stereo lengths reject for ping-pong and rotary. Direct feedback remains unclamped, including negative feedback and unity sustain.
- Chorus/flanger no longer create zero-length rings. Vibrato already reserves two extra slots in its supported depth range; multitap, grain delay, lo-fi, stutter and rotary have nonzero minimum rings in their supported parameter ranges. Existing modulation-ring shrink tests remain in place; historical content retention during live modulation is not given the fixed-delay reset promise.
- Multitap caches its default tap table instead of allocating it every block. Mixer returns an empty Float64Array for an empty list, rejects unequal lengths and preserves input buffers.
- Delay/ping-pong processor wrappers consume silence after input disconnection so tails drain. Delay supports output channels beyond its eight-channel initial allocation. Tail functions use effective delay length and feedback to estimate 60 dB decay; zero feedback drains one delay. This estimate is not exact silence and must not be treated as a bound under later feedback automation.
- Effect's first README example is executable and checks exact echo positions/amplitudes. The overview documents mutation, state, units, stereo/mixer exceptions and whole-buffer tape stop. Five generated leaf sections (delay, ping-pong, chorus, flanger, mixer) and the generated delay manifest type are in sync.

`effect/test-api.js` is the shared source/installed regression suite, using public imports. The full effect suite passes **130 tests**, including 63 new API tests. It checks every PCM function with omitted/undefined/explicit options, empty/one-sample inputs, repeated A → A → different B calls and both floating array types. Stateful defaults are split at 0/1/127/128/final-minus-one/final with an intervening empty call; every output sample matches whole-buffer processing. Tape stop is excluded from streaming claims.

Delay/ping-pong impulse fixtures additionally cover 44.1/48/96 kHz; zero, fractional-sample, one-sample and 1 ms times; zero/negative/positive/unity feedback; splits immediately before/at/after the echo and final boundary; shrinking/growing/rate changes; mix/feedback changes retaining queued audio and ring identity; and invalid inputs preserving samples/options. Tests failed before their corresponding fixes. A wrapper fixture sends an impulse, removes the input bus, checks three exact echoes and a silent second instance, and exercises nine independent delay channels.

`test:types` now runs the identical 63 effect API tests from installed tarballs plus five installed README/state tests (**68 tests**), then strict NodeNext/bundler checks. It locates the actual README filename case, including effect's `readme.md`. All 210 local tarballs pass the selected checks. Integer PCM and null options are rejected by types; generic return types are exercised for every PCM function.

`scripts/types/worklet.mjs` then loads the installed delay/ping-pong factories through the installed compile-wam adapter by module URL, including relative DSP imports. Chromium, Firefox and WebKit each render both processors at 44.1/48/96 kHz. The input ends after 128 frames, before any echo; every output sample is compared to five independently calculated stereo echoes with tolerance `1e-7`, with a second silent instance connected. All 18 renders pass. This is browser evidence, not native/DAW validation or a listening assessment.

The full site suite also passes, including all three browser engines and seven utility pages. No production website files changed. Steady-state mono-delay sample loops are unchanged; new validation occurs once per block. A local Node 25.9.0 probe (128 frames × 50,000 calls, seven alternating warmed runs) measured median 21.3 ms before versus 21.2 ms after; no regression observed in that probe. Ring/tap identity checks separately pin steady-state allocation behavior. This is not a real-time scheduling guarantee.

Remaining: generated factory → adapter TypeScript compatibility (confirmed TS2345 on required `maxChannels`), restart/automation behavior, other wrappers' disconnected-input tails, and multitap zero-time semantics. Other manifests with early input returns are not marked verified merely because the two delay wrappers pass. Nothing is published to npm; native release/build acceptance still waits for JZ v1.

### Verification in this pass

- Documentation regression suite: named/default/aliased imports, unrelated imports, hand-written preservation, idempotence and dry-run behavior; baseline errors, adjacent declarations and platform-build reporting.
- Full affected family suites: beat 70; dynamics 56; effect 67; denoise 18 workspace + 56 umbrella tests. All passed.
- Compiler source suite: 51 passed in an isolated copy. Native source checks used the development environment; they do not satisfy the released-JZ gate.
- Compiler artifacts: fresh offline consumers, Node umbrella/leaf exports, standalone browser adapter without JZ/native dependencies, stereo render at 44.1/48 kHz and shipped-demo lifecycle in Chromium, Firefox and WebKit. Passed from the applied checkout. Browser archive available under `compile/.work/preview/`; nothing published.
- Full site suite passed, including Chromium/Firefox/WebKit checks and all seven utility pages, in an isolated copy to protect existing site work. The full suite passed again on the final reviewed scripts, including the multiline/trailing-comma regressions below.

Review regressions in `scripts/atomdocs.test.mjs`:

- **“generated leaf examples use the installed leaf; hand-written docs and other imports survive”** uses default/named/aliased imports, including a multiline import with a trailing comma. Generate A → regenerate A (zero changes) → preview changed B (no writes) → generate B (exactly one changed README). Hand-written content and unrelated/multi-function imports remain intact.
- **“empty docs and sections ending at EOF or the next heading preserve exact section boundaries”** starts with an empty README (no generated file), then a heading alone, then a named re-export example at EOF. Adding a final newline or a following same/higher-level heading produces byte-identical output; an umbrella alias maps to the actual leaf export.

**“baseline reports actionable source gaps without mistaking build artifacts or comments for broken docs”** in `scripts/package-baseline.test.mjs` verifies empty-root failure; missing names, READMEs and entries; visible versus commented/fenced links; multiline undeclared imports; repair → repeat with identical reports; null/conditional exports; missing/present wildcard directories; adjacent `.d.ts`, `.d.mts` and `.d.cts`; and native build warnings remaining explicit after other errors are fixed. The trailing-comma generator and multiline-audit cases failed before their parser fixes. A sibling scan of 86 generated READMEs found no further default/named mismatches against umbrella re-exports. These scripts run at development time and do not enter package/browser bundles.

## Repeat the checks

From `audiojs.github.io`:

```sh
npm run test:docs
npm run check:packages
npm run test:types
node scripts/package-baseline.mjs --json
node scripts/atomdocs.mjs effect          # preview generated changes
node scripts/atomdocs.mjs effect --write
```

`AUDIO_ROOT` overrides `~/projects/@audio` for the local scripts. `check:packages` is a local checkout audit, so it is separate from site CI. It exits nonzero for source/documentation defects, while reporting type gaps and platform builds separately. Re-run the appropriate family suite after changes. The generator remains derived from maintained umbrella docs; do not hand-edit generated leaf sections.

The packed consumer check requires installed Playwright browsers and also expects sibling `window-function` and `web-audio-api` checkouts. It is a separate local integration command, not part of the website-only suite. Its temporary consumer is removed by default; `node scripts/umbrella-types.mjs --keep` retains it for diagnosing a failure. Release the changed packages through the existing version-bump/release sweep before claiming these corrections are available on npm.

For compiler artifacts, run `npm run test:package` in `~/projects/@audio/compile` after installing its development dependencies and Playwright browsers. `npm run pack:preview` writes the verified standalone browser archive. No native compilation or JZ dependency is needed by these two checks.
