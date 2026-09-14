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
2. **Apply the installed-package check to the supported DSP path.** Extend the pattern now implemented in `compile/tools/test-package.js` to the selected effect and its dependencies: tarball contents, imports, one executable README example, types and a real signal render. Keep family source tests. This is the protection against workspace-only success and empty npm releases.
3. **Finish the environment/behavior inventory.** Record streaming suitability, units, state/reset, modulation and target limits in maintained family docs, then regenerate leaf sections. Known cases to cover: delay-time changes restart processing; tube saturation is whole-signal. Add focused tests where those limits matter to the chosen effect.
4. **Audit native microphone releases on their platforms.** `@audio/mic-linux-arm64`, `@audio/mic-linux-x64`, and `@audio/mic-win32-x64` lack local `mic.node` files. Inspect exact public tarballs and run installation/load checks in the matching OS/architecture CI before deciding that publication is broken. Do not treat absence on this macOS checkout as proof of an npm defect.
5. **Automate the release discipline.** Reuse `scripts/release.mjs` for drift reporting and layer artifact checks into family CI. Publish leaves before dependent umbrellas, then test exact public versions. Keep registry publication separate from checks. Broader native compiler release/DAW acceptance waits for JZ v1.

### Declaration gaps closed in this pass

21 root packages: `@audio/amp`, `@audio/compile`, `@audio/defeedback`, `@audio/denoise`, `@audio/effect`, `@audio/measure`, `@audio/midi`, `@audio/mir`, `@audio/note`, `@audio/pitch`, `@audio/resample`, `@audio/reverb`, `@audio/saturate`, `@audio/sinusoidal`, `@audio/spatial`, `@audio/spectral`, `@audio/stft`, `@audio/synth`, `@audio/tune`, `@audio/voice`, `@audio/window`.

Two compiler leaves: `@audio/compile-wam`, `@audio/compile-vst`.

Supporting fixes outside `~/projects/@audio`: `window-function` now has 34 real default-subpath declarations instead of invalid module augmentations and a misleading wildcard type redirect. `web-audio-api` declares the completion callback only on `OfflineAudioContext`, fixing its strict inheritance error. The AudioWorklet adapter preserves the supplied host's node/parameter types, so browser and Node graphs both accept the returned worklet node without casts. Runtime DSP code is unchanged.

`npm run test:types` packs the 21 roots, both adapters, window-function and their local dependency closure (188 tarballs), installs them in a fresh consumer and checks NodeNext and bundler resolution with TypeScript 5.8.2, strict mode and library checking enabled. It checks every runtime export on those entry points, named option imports, representative processing calls, invalid calls that must fail, all 34 window default subpaths, both shipped compiler examples, and the browser's absence of the native builder. Native adapter declarations also compile without DOM libraries. A separate packed Node Web Audio SDK declaration check verifies connections into and out of the worklet; SDK device dependencies are not installed by that declaration check.

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

`AUDIO_ROOT` overrides `~/projects/@audio` for both scripts. `check:packages` is a local checkout audit, so it is separate from site CI. It exits nonzero for source/documentation defects, while reporting type gaps and platform builds separately. Re-run the appropriate family suite after changes. The generator remains derived from maintained umbrella docs; do not hand-edit generated leaf sections.

The packed type check also expects sibling `window-function` and `web-audio-api` checkouts. It is a separate local integration command, not part of the website-only suite. Its temporary consumer is removed by default; `node scripts/umbrella-types.mjs --keep` retains it for diagnosing a failure. Release the changed packages through the existing version-bump/release sweep before claiming these corrections are available on npm.

For compiler artifacts, run `npm run test:package` in `~/projects/@audio/compile` after installing its development dependencies and Playwright browsers. `npm run pack:preview` writes the verified standalone browser archive. No native compilation or JZ dependency is needed by these two checks.
