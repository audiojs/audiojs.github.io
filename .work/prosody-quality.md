# Prosody correction quality

## Current renderer, 2026-09-16

The previous phase-vocoder fixes were necessary but insufficient. The live page matched commit `8b8206d` when the user reported damaged speech and uneven transitions. A unity-pitch reconstruction test does not establish the quality of actual pitch correction.

The editor now uses the unmodified **WORLD reference implementation** for CheapTrick spectral-envelope estimation, D4C aperiodicity estimation, and synthesis. Only the synthesized F0 changes; the estimated vocal-tract spectrum and aperiodicity come from the source. The mono input and target contour remain local to the browser's worker. This is a new renderer, not a preset on the old spectral shifter.

- Source: [mmorise/World](https://github.com/mmorise/World), revision `d625e7608ca23a870018f01e7c562ac683d9847f`, BSD-3-Clause.
- Binding: `scripts/prosody-world.cpp`; build: `node scripts/prosody-world.mjs /path/to/World` with that checkout and Emscripten (built here with 5.0.7).
- Generated `world.wasm.js` embeds the binary as base64. No runtime CDN or binary fetch. The worker's content hash includes the engine, so changed code gets a new URL.
- DIO now tracks pitch candidates across time on a 5 ms grid; StoneMask refines that contour against the waveform. Both come from the same pinned WORLD source. This replaces independently thresholded YIN frames while retaining the existing mean-square silence floor of 1e-7, to avoid spurious pitch in nearly silent vowel tails. Pitch interpolation is a shape-preserving cubic in octaves, shared by synthesis and the displayed curve. Voiced/unvoiced boundaries do not interpolate toward zero Hz. No confidence percentage is displayed: DIO does not provide one.
- WORLD parameters use a 5 ms grid. The wrapper includes 100 ms of analysis context around the changed span. Narrowband recordings below 16 kHz are sinc-resampled for D4C, then returned to their original rate and length.
- Unedited exterior and unvoiced interiors stay exactly dry. Crossfades occur at edit boundaries, including the outermost analysis points, not whenever correction crosses or touches unity. No-op/reset returns the original PCM exactly.
- Phrase timing remains WSOLA; no automatic phoneme protection has been added.

## What the measurements establish

`scripts/prosody-fixture.mjs` creates a moving-pitch excitation through fixed vowel resonances. Correcting it to 155 Hz should produce coherent repeated cycles. The test supplies the known source contour to isolate synthesis from detection. Correlation between adjacent output cycles over the central 2.4 seconds:

| Sample rate | Previous spectral engine | WORLD reference |
| --- | ---: | ---: |
| 16 kHz | 0.876 | 0.999 |
| 22.05 kHz | 0.908 | 0.999 |
| 48 kHz | 0.958 | 0.999 |

The regression requires >0.985 coherence and detected F0 within 1 Hz of the requested 155 Hz. These are synthesis measurements, not listening scores.

The built-in speech sample is 6.18 s at 22.05 kHz. Rendering a 50% reduction took roughly 0.36 s locally in Node, versus 0.05 s for the old engine. DIO/StoneMask analysis took roughly 0.05 s locally. The worker grew from 118,032 to 135,733 bytes (gzip: 56,718 → 63,473 bytes). These are not mobile performance guarantees.

Before the DIO/StoneMask change, re-analyzing the built-in output with YIN gave a median target error of 0.083 semitones and a 95th percentile of 0.292, compared with 0.044 and 0.224 for the previous renderer. YIN accepted 177 output frames as voiced versus 184 previously (199 in the source). These aggregate metrics missed the following audible defect because they excluded rejected frames.

## Confirmed source of abrupt pitch changes

The user still heard low-to-high jumps after the renderer/interpolation updates. At 1.745 and 1.765 s in the built-in sample, independent-frame YIN rejected voiced speech. Both relaxed YIN and McLeod found a descending pitch in those frames. The wet mask therefore switched to the original voice inside a continuous vowel: the output went from roughly 157 Hz to 128 Hz and back toward 147 Hz. Correcting only those two analysis frames in a diagnostic render eliminated that excursion. Smoothing the target curve could not repair it because those frames had no target pitch.

DIO/StoneMask finds a continuous voiced contour through this passage without a sample-specific repair. The full analysis → reduce variation 50% → render path is now tested at ten 10 ms positions from 1.72–1.81 s. An independent YIN detector on 40 ms output windows measures <0.09 semitone target error and clarity >0.95; the regression allows <0.2 semitone and >0.9 clarity, and rejects adjacent pitch changes ≥0.5 semitone. The source must remain voiced throughout. Actual consonants at 0.38–0.42 s and silence at 2.05–2.20 s must stay unvoiced and their output PCM must equal the original.

A negative-control run using the previous committed analyzer with the same renderer yields four missing voiced probes in that interval and a maximum adjacent output excursion of 3.28 semitones (relaxed YIN measurement). The new analyzer yields no missing probes and a maximum excursion of 0.256 semitone. The regression would therefore catch the original failure.

Harvest was also evaluated from the same reference source. It repaired this speech passage but rejected sustained pure tones used by the editor's existing tests; DIO/StoneMask handled both. This is a scoped selection based on those inputs, not a general ranking of the trackers. The synthesis engine and edit-boundary mixing are unchanged in this fix.

The old engine's phase-history bug, zero-crossing mix and timing-offset findings remain documented in the previous revision of this audit. Its independent package fixes remain valid. The website no longer includes that shifter; package-specific regression coverage should remain in the package repositories rather than imply that those tests validate WORLD.

## Verification

Validation: all 15 prosody tests and the full website suite passed, including all eight page modules and all three browser engines.

`npm run test:prosody` covers:

- Continuous pitch slopes, no interpolation overshoot, empty curves, endpoint values and unvoiced gaps.
- Dynamic vowel normalization, measured cycle coherence and target F0.
- ±3-semitone speech rendering at 8/16/22.05/44.1/48/96 kHz; finite PCM, exact duration, silence and A → B → A reuse.
- Actual built-in speech reduction through the formerly rejected voiced frames, independently measured target tracking/continuity, dry consonants and silence, finite output, original sample count and exact reset.
- Tiny edits through unity, interior/outer boundary fades, untouched PCM and source-time automation.
- Existing short/empty input, >60-second recordings, timing edits, edit validation and exact float WAV export.

`npm run test:all` also exercises the website and browser lifecycle. The prosody browser test covers on-plot zoom icons, keyboard +/−/0/F, trackpad/touch pinch, transparent native scrolling, selection handles, gesture cancellation, selection preservation, fit/show-all, file replacement, mobile layout, intonation scaling (0–200%) and transposition, timing, playback, export and reset in Chromium, Firefox and WebKit, with external requests blocked. Touch-pointer pinch/cancellation uses Chromium touch injection; cumulative WebKit gesture scales and wheel events are dispatched explicitly. Layout is checked at 320, 375, 414, 768 and 812 px.

## Remaining acceptance work

The user confirmed that the DIO/StoneMask change sounds better. Broader listening comparisons on their own recording and varied voices are still needed; the synthetic fixture and the WORLD reference's reputation cannot substitute for this check. Keep the editor experimental.

Next steps, in order:

1. Establish a listening corpus and reference renders: original, our output and an established editor at matched loudness, using gentle correction, ±3-semitone edits and phrase-boundary edits. Include low/high, breathy/creaky voices and actual user failures. Measure voicing mistakes and pitch excursions as well as listening quality; a correct F0 is not proof of natural timbre.
2. Represent voiced syllables and transitions explicitly. Separate slow intonation, local modulation and transition duration. The intonation percentage currently scales every frame’s deviation from one selection median; it does not infer intended emphasis or questions. Allow analysis correction before modifying delivery.
3. Validate consonant/breath preservation and edited/original joins, then compare waveform-preserving pulse-synchronous processing against WORLD on the same corpus. Adopt a renderer only with evidence that the complete edit sounds better. WORLD reconstructs speech from estimated parameters; using it does not establish Melodyne-equivalent transparency.
4. Promote the binding into `@audio/speech-world` only after the reusable analysis/synthesis API, long-recording memory behavior and quality limits are specified and tested.

Celemony's public documentation describes separate [pitch transitions](https://helpcenter.celemony.com/M5/doc/melodyneStudio5/en/M5tour_ToolPitch_2?env=reaper), and [analysis correction, robust pitch curves and formant controls](https://helpcenter.celemony.com/M5/doc/melodyneStudio5/en/M5tour_NA_Mode_2?env=cubase). These describe required editing behavior, not a disclosure of Melodyne's proprietary synthesis algorithm. The [WORLD source and references](https://github.com/mmorise/World) describe the algorithms used here.

## Plot controls

Navigation, the legend and selection now live on the waveform. Instructions are behind the question mark; selection edges support dragging and keyboard arrows. Pinch supports two touch pointers, Ctrl-wheel trackpads and WebKit’s [cumulative gesture scale](https://developer.mozilla.org/en-US/docs/Web/API/Element/gesturechange_event), with provisional edits rolled back when a second finger arrives. The scrollbar has a transparent track. Identity edits do not invalidate playback/export.

Intonation scales semitone deviations around the selection’s median: 0% flattens, 100% preserves current variation, and 200% doubles it. Transposition adds a uniform semitone offset. Both operate on the current selection/current curve; Apply is an explicit edit and Undo reverses it. Existing ±12-semitone source-relative limits still apply.
