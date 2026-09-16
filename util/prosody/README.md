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

Limits: one voice, mono output. WORLD's DIO detector connects pitch candidates
across time, with StoneMask refinement and a 60–600 Hz analysis range. WORLD
resynthesizes edited pitch using the source spectral envelope and aperiodicity;
unvoiced interiors and untouched audio remain dry. Rebuild the pinned WASM engine
with `node scripts/prosody-world.mjs` (requires Emscripten), then `npm run build`.

Intonation scales semitone deviations around the selection median (0–200%).
Its Smoothing disclosure adjusts a 0–200 ms cosine window, default 60 ms, within
voiced regions. At 100%, Apply smooths without scaling; set smoothing to 0 for an
exact no-op. Transposition and point dragging have no source-relative octave cap;
frequency limits reflect the synthesis floor and the recording's Nyquist limit.
Invalid edits are rejected, not clipped. Extreme shifts can still sound poor.
Selected edits ease into surrounding voiced pitch over up to 80 ms per edge;
Restore pitch and Reset return the selected/full original contour exactly.

Local stretch factors remain 0.5–2. The timeline stays in source seconds after
timing edits. WSOLA stretches the entire selected fragment with 10 ms dry joins;
consonant protection and phoneme alignment are not implemented. Rising/falling
presets are ±2-semitone ramps, not semantic question detection. Smoothing addresses
fast contour fluctuations, not all detection errors or resynthesis artifacts.
Edits are held in memory; reloading/changing the file discards them. Exports are
mono 32-bit float WAV at the decoded input rate, without source metadata.

Validation: `npm run test:prosody` for numerical and model regressions;
`node scripts/pages-test.mjs prosody` for Chromium/Firefox/WebKit interaction tests;
`npm run test:all` for the complete site suite. Listening evaluation on varied
human speech remains necessary before making perceptual quality claims.
