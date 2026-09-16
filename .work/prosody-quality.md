# Prosody correction quality audit

The reported symptom is a metallic voice after reducing pitch variation. The current renderer had reproducible phase errors, independent of pitch detection. Fixing these removes confirmed defects; it does not establish perceptual parity with a professional speech editor.

## Findings and changes

1. **Phase history followed destination bins.** `scatterLocked` read synthesis phase from the output bin. Moving a partial could therefore inherit unrelated history. Neighbouring source bins lacked history when they became peaks. The shared engine now tracks phase by source bin, including peak neighbours, referenced to the window center. Silent/untracked regions reinitialize from analysis phase. Frames without a resolved peak preserve their original spectrum, including DC and very short boundaries.
2. **Dry/wet mixing followed correction magnitude.** The editor faded toward the original whenever correction approached zero, even though the shifted signal had accumulated a different phase. This produces cancellation/modulation within an otherwise continuous edit. The renderer now crossfades at edit boundaries and remains wet through unity crossings. Unvoiced frames and untouched exterior samples stay dry.
3. **Automation used window-start timestamps.** A control intended for time t was sampled at the left edge of a window centered later. All seven spectral shifter call sites now use window-center timestamps. At 22.05 kHz and N=2048, the old timestamps lagged the frame centers by 46.4 ms. This fixes the gross offset; window/hop resolution still limits automation accuracy.
4. **Detection is not the demonstrated primary cause.** The supplied sample has 307 analysis frames, 199 voiced, with no adjacent voiced jump exceeding half an octave. This does not validate YIN on other speakers. Rhythm processing is not invoked by a pitch-only edit.

## Evidence

Fixture: committed `util/prosody/sample.wav`, 136244 samples, 22050 Hz. Baseline: site commit `37b2641`, `shift(samples, {sampleRate, ratio: () => 1})`. A callback intentionally exercises the engine; scalar `ratio: 1` bypasses it.

Relative error is `10 log10(sum((output-input)^2) / sum(input^2))`:

| Unity processing | Before | Fixed |
| --- | ---: | ---: |
| Relative waveform error | +2.72 dB | below −120 dB |
| Largest absolute sample error | 1.125 | below 1e-12 |

These are reconstruction measurements, not listening scores. An incorrect engine changed speech even when asked to keep its pitch unchanged.

The synthetic automation test uses a 250 Hz input, ratio `1+t`, and measures 0.4–0.5 s. Expected central F0 is 362.5 Hz. With the repaired phase engine but old timestamps, the package estimator measured 351.2 Hz; centered timestamps give 367.1 Hz. The remaining difference includes window/hop resolution and estimator error.

A local Node 25 benchmark on the 6.18-second speech sample, nine warmed renders with ±1.5-semitone automation, took about 32 ms before and 35 ms after (median). The extra source-bin phase bookkeeping has a measurable cost; no new per-frame arrays were introduced. This is not a browser/mobile performance guarantee.

## Regression coverage

- Spectral `locked scatter tracks source phases across silence and bin moves`: silent → voiced, source peak moves, changing destination bins, interleaved states, silence → new peak, explicit reset; verifies phases and magnitudes.
- Spectral `unresolved boundary frames preserve energy, including DC-only input`: half-spectrum sizes 0, 1 and 16, nonzero magnitudes, no peaks; verifies original spectrum and untracked state.
- Site `vendored shifter reconstructs speech with unity automation, without bypass`: real sample relative squared error < 1e-12.
- Site `unity automation: sample rates, silence, moving peaks, empty writes and final splits`: 16/22.05/44.1/48 kHz; two voices separated by silence; nonempty inputs of 1/511/512/513 samples and a full second; empty writes and splits immediately before the final sample; batch/stream equivalence and repeated calls.
- Site `small edits stay fully wet through unity; unvoiced and untouched frames stay dry`: ±0.06-semitone ramp with an exact unity point; interior equals the fully processed output, exterior and unvoiced gap equal the original.
- Site `automated pitch follows source time rather than the left edge of its analysis window`: semantic F0 bound for a known ramp.

The website full suite passes, including all eight page modules and prosody interactions in Chromium, Firefox and WebKit. The final prosody suite has 11 passing tests.

The spectral full suite (33 tests), shift full suite (50 tests) and unchanged `quality:ci` bounds pass against the fixed engine. The shift suite also passes against its currently installed npm dependency. One test previously required transient processing to beat basic phase locking on a drum fixture. Transient correlation stayed ~0.957 while phase locking improved from ~0.950 to ~0.960; the test now requires both to exceed 0.95 instead of enforcing a ranking.

Integration regressions live in the site because its committed DSP bundle contains the corrected engine. The vendor script explicitly resolves the sibling spectral checkout rather than an older installed transitive copy. Public npm consumers still need a release of `@audio/spectral-pvoc` and the affected shift packages; this work does not publish npm releases.

Run `npm run test:all` in spectral and the site. Run `npm test` and `npm run quality:ci` in shift. To validate unreleased sibling changes together, resolve `@audio/spectral-pvoc` to `../spectral/packages/spectral-pvoc/pvoc.js` using a Node module resolve hook; otherwise shift uses its installed dependency.

## Remaining quality work, in order

1. Listening comparisons on licensed real speech: male/female voices, creak, breathiness, voiced/unvoiced transitions, tiny corrections through unity, and larger interval changes. Include unprocessed audio and an established reference. Keep loudness and intended F0/duration comparable. Do not label this engine high-end until these comparisons support that claim.
2. Evaluate pitch-synchronous speech synthesis with reliable pulse/voicing tracking. [Praat's TD-PSOLA method](https://www.fon.hum.uva.nl/praat/manual/overlap-add.html) explicitly treats voiced pulses and unvoiced material differently. That is a better architectural candidate for speech-specific work than indefinitely tuning a general spectral shifter. The existing package named PSOLA must be evaluated on its implementation, not its name.
3. Compare with [Rubber Band's formant-preserved, high-consistency dynamic pitch mode](https://www.breakfastquay.com/rubberband/code-doc/classRubberBand_1_1RubberBandStretcher.html); its documentation explicitly distinguishes dynamic pitch, including unity crossings. Use it as an offline reference before considering browser integration and licensing.
4. Improve F0 continuity/voicing confidence and separate syllable-scale contour from microprosody. “Reduce variation 50%” currently contracts pitches toward the selection median; it does not infer a natural question contour or intended emphasis. Phoneme-aware timing remains separate work.
