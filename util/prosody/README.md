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

## Engine

Pitch is tracked by WORLD's Harvest (60–600 Hz, 5 ms frames). Harvest keeps
voicing continuous across a phrase where a framewise detector breaks vowels into
rejected frames; StoneMask refinement is not applied after it, because it
introduced octave jumps on low voices. A silence floor removes pitch from nearly
silent tails, and a voiced run whose median waveform periodicity at the tracked
pitch is below 0.2 is dropped whole, which removes the runs Harvest finds in
noise without fragmenting breathy or creaky phrases. Harvest scores harmonics:
a pure sinusoid is not voice to it. Analysis costs about a tenth of the
recording's duration.

Glottal cycle marks refine that contour. Within each voiced run, cycles are
located from the loudest one outward by matching one period of waveform, with
sub-sample refinement, so every frame's pitch is the mean of the cycles it
covers and stays exact through fast inflections, where Harvest alone drifts by
about a semitone. Edits apply as a smooth ratio to this cycle-level pitch: the
macro contour follows the edit, the voice's own jitter stays.

A voiced run (a maximal stretch of voiced frames) is the unit of resynthesis.
Any run containing a pitch change or lying in a retimed span is rebuilt whole
by one of two engines and joined to its untouched neighbors with 2 ms fades at
its edge frames. Untouched runs, consonants and silence keep their original
samples bit-exactly.

The waveform engine (`waveform.js`) is pitch-synchronous overlap-add on the
recording's own cycles: each cycle is windowed one period to either side of its
mark and laid down again at the edited spacing along the edited timeline, at
its exact fractional position through a 16-tap windowed-sinc delay. Pulse
shapes, breath and jitter are the voice's own, formants stay put, and unchanged
cycles reproduce the source exactly. Beyond about half an octave, repeated or
thinned cycles start to sound.

The vocoder engine (`world.js`) rebuilds the run with WORLD from the source
spectral envelope (CheapTrick) and aperiodicity (D4C) at the edited pitch on a
1 ms grid. WORLD drives unvoiced stretches with a 500 Hz noise-pulse clock whose
last pulse before an onset borrows the vowel's envelope, so synthesis stays
voiced through a lead and tail of whole periods that the join discards; the
rebuilt run is shifted by up to half a period to line its first pulse up with
the source's, then receives the source's amplitude envelope over two pitch
periods, since WORLD's analysis window smears onsets. It handles any change but
is audibly a vocoder on breathy or creaky voices.

Auto, the default, uses the waveform engine for runs whose largest pitch change
is within six semitones and the vocoder otherwise.

Timing edits warp the analysis positions given to WORLD, so stretched voice keeps
its pitch and harmonic structure with no grain repetition. Unvoiced audio in a
retimed span is stretched with WSOLA (30 ms frames, ±10 ms search) with 10 ms
dry joins at the anchors. Consonant bursts, detected as abrupt broadband energy
rises in unvoiced audio, keep their length: the change is shared by the rest of
the selection, or by the whole selection uniformly when bursts leave no room.
Phoneme alignment is not implemented.

Rebuild the pinned WASM engine with `node scripts/prosody-world.mjs <WORLD checkout>`
(requires Emscripten), then `npm run build`.

## Limits

One voice, mono output. Intonation scales semitone deviations around the
selection median (0–200%). Its Smoothing disclosure adjusts a 0–200 ms cosine
window, default 60 ms, within voiced regions. At 100%, Apply smooths without
scaling; set smoothing to 0 for an exact no-op. Transposition and point dragging
have no source-relative octave cap; frequency limits reflect the synthesis floor
and the recording's Nyquist limit. Invalid edits are rejected, not clipped.
Extreme shifts can still sound poor. Selected edits ease into surrounding voiced
pitch over up to 80 ms per edge; Restore pitch and Reset return the selected/full
original contour exactly.

Local stretch factors remain 0.5–2. The timeline stays in source seconds after
timing edits. Rising/falling presets are ±2-semitone ramps, not semantic question
detection. Edits are held in memory; reloading/changing the file discards them.
Exports are mono 32-bit float WAV at the decoded input rate, without source metadata.

Validation: `npm run test:prosody` for numerical and model regressions, including
tracker accuracy on WORLD-resynthesized speech with a known pitch contour and join
level checks on the sample; `node scripts/pages-test.mjs prosody` for
Chromium/Firefox/WebKit interaction tests; `npm run test:all` for the complete site
suite. Listening evaluation on varied human speech remains necessary before making
perceptual quality claims.
