# Prosody correction quality

## Current renderer, 2026-09-16

The previous phase-vocoder fixes were necessary but insufficient. The live page matched commit `8b8206d` when the user reported damaged speech and uneven transitions. A unity-pitch reconstruction test does not establish the quality of actual pitch correction.

The editor now uses the unmodified **WORLD reference implementation** for CheapTrick spectral-envelope estimation, D4C aperiodicity estimation, and synthesis. Only the synthesized F0 changes; the estimated vocal-tract spectrum and aperiodicity come from the source. The mono input and target contour remain local to the browser's worker. This is a new renderer, not a preset on the old spectral shifter.

- Source: [mmorise/World](https://github.com/mmorise/World), revision `d625e7608ca23a870018f01e7c562ac683d9847f`, BSD-3-Clause.
- Binding: `scripts/prosody-world.cpp`; build: `node scripts/prosody-world.mjs /path/to/World` with that checkout and Emscripten (built here with 5.0.7).
- Generated `world.wasm.js` embeds the binary as base64. No runtime CDN or binary fetch. The worker's content hash includes the engine, so changed code gets a new URL.
- YIN still supplies the detected contour; WORLD does not repair detector errors in this integration. Pitch interpolation is a shape-preserving cubic in octaves, shared by synthesis and the displayed curve. Voiced/unvoiced boundaries do not interpolate toward zero Hz.
- WORLD parameters use a 5 ms grid. The wrapper includes 100 ms of analysis context around the changed span. Narrowband recordings below 16 kHz are sinc-resampled for D4C, then returned to their original rate and length.
- Unedited exterior and unvoiced interiors stay exactly dry. Crossfades occur at edit boundaries, including the outermost analysis points, not whenever correction crosses unity. No-op/reset returns the original PCM exactly.
- Phrase timing remains WSOLA; no automatic phoneme protection has been added.

## What the measurements establish

`scripts/prosody-fixture.mjs` creates a moving-pitch excitation through fixed vowel resonances. Correcting it to 155 Hz should produce coherent repeated cycles. The test supplies the known source contour to isolate synthesis from detection. Correlation between adjacent output cycles over the central 2.4 seconds:

| Sample rate | Previous spectral engine | WORLD reference |
| --- | ---: | ---: |
| 16 kHz | 0.876 | 0.999 |
| 22.05 kHz | 0.908 | 0.999 |
| 48 kHz | 0.958 | 0.999 |

The regression requires >0.985 coherence and detected F0 within 1 Hz of the requested 155 Hz. These are synthesis measurements, not listening scores.

The built-in speech sample is 6.18 s at 22.05 kHz. Rendering a 50% reduction took roughly 0.36 s locally in Node, versus 0.05 s for the old engine. The bundled worker is about 118 kB before transfer compression. These are not mobile performance guarantees.

Re-analyzing the built-in output with YIN gives a median target error of 0.083 semitones and a 95th percentile of 0.292, compared with 0.044 and 0.224 for the previous renderer. YIN accepts 177 output frames as voiced versus 184 previously (199 in the source). Thus the new engine improves the demonstrated dynamic cycle-coherence defect, but these speech metrics do **not** prove that every recording sounds better or that detection is solved.

The old engine's phase-history bug, zero-crossing mix and timing-offset findings remain documented in the previous revision of this audit. Its independent package fixes remain valid. The website no longer includes that shifter; package-specific regression coverage should remain in the package repositories rather than imply that those tests validate WORLD.

## Verification

Validation: all 14 prosody tests and the full website suite passed, including all eight page modules and all three browser engines.

`npm run test:prosody` covers:

- Continuous pitch slopes, no interpolation overshoot, empty curves, endpoint values and unvoiced gaps.
- Dynamic vowel normalization, measured cycle coherence and target F0.
- ±3-semitone speech rendering at 8/16/22.05/44.1/48/96 kHz; finite PCM, exact duration, silence and A → B → A reuse.
- Actual built-in speech reduction, dry consonants, finite output, original sample count and exact reset.
- Tiny edits through unity, interior/outer boundary fades, untouched PCM and source-time automation.
- Existing short/empty input, >60-second recordings, timing edits, edit validation and exact float WAV export.

`npm run test:all` also exercises the website and browser lifecycle. The prosody browser test covers zoom buttons, keyboard +/−/0, Alt-scroll, position slider, selection preservation, fit/show-all, file replacement, mobile layout, pitch edits, timing, playback, export and reset in Chromium, Firefox and WebKit, with external requests blocked.

## Remaining acceptance work

The user reports both their own recording and slight damage/uneven transitions on the built-in sample. Compare those exact edits by listening after this change; obtain an affected recording if the problem persists. The synthetic fixture and the WORLD reference's reputation cannot substitute for this check. Keep the editor experimental.

Next investigate detector continuity, octave mistakes and voiced/unvoiced classification on real voices. “Reduce variation 50%” contracts pitch toward a selection median; it does not infer intended question intonation or emphasis. Evaluate linguistic rules separately. Promote the WORLD binding into `@audio/speech-world` only after its reusable analysis/synthesis API and memory behavior are specified and tested.
