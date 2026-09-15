# Speech prosody editor

Static tool at `/util/prosody/`. The maintained page definition is
`scripts/pages/prosody.mjs`; `npm run build` generates its HTML and browser bundles,
links it from the tools index/homepage and adds it to the sitemap.

`model.js` stores non-destructive pitch targets and monotonic source→output timing
anchors. `process.js` analyzes and renders mono PCM; `worker.js` keeps that work off
the UI thread. `editor.js` handles selection, pitch gestures, keyboard/numeric
alternatives, undo, playback and export. Audio is not uploaded.

DSP is bundled locally in `dsp.js`. Rebuild with `node scripts/prosody-vendor.mjs`
using checkouts under `~/projects/@audio`, then `npm run build`. Dependency versions
and licenses are in `THIRD_PARTY.txt`. WAV input, the sample, processing and export
work without third-party requests. Other input formats use the site's decoder.

The included sample was synthesized with the macOS Samantha system voice:
“We can change how this sentence sounds. Try making the last word rise, or give
this phrase a little more time.” It is a demo input, not a quality benchmark.

There is no fixed input duration or file-size cap; practical capacity depends on
browser memory and processing time. Empty recordings are rejected. Clips shorter
than the 50 ms analysis window can be played and exported but have no pitch curve;
editing selections still requires at least 20 ms.

Limits: one voice, mono output, F0 range 60–600 Hz. Analysis is
frame-level YIN with confidence gating, not a sequence model. Pitch changes are
limited to ±12 semitones, local stretch factors to 0.5–2. The timeline remains in
source seconds after timing edits. WSOLA stretches the entire selected fragment;
consonant protection and phoneme alignment are not implemented. Rising/falling
presets are ±2-semitone ramps, not semantic question detection. Rendering uses a
formant-compensated phase vocoder then WSOLA with 10 ms dry boundary joins;
artifacts remain possible, especially on extreme edits or unreliable detections.
Edits are held in memory; reloading/changing the file discards them. Exports are
mono 32-bit float WAV at the decoded input rate, without source metadata.

Validation: `npm run test:prosody` for numerical and model regressions;
`node scripts/pages-test.mjs prosody` for Chromium/Firefox/WebKit interaction tests;
`npm run test:all` for the complete site suite. Listening evaluation on varied
human speech remains necessary before making perceptual quality claims.
