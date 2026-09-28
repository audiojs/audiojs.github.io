# Speech prosody editor

Static tool at `/util/prosody/`. The maintained page definition is
`scripts/pages/prosody.mjs`; `npm run build` generates its HTML and browser bundles,
links it from the tools index/homepage and adds it to the sitemap.

`model.js` stores non-destructive pitch targets and monotonic source→output timing
anchors, and computes every pitch correction. `process.js` analyzes and renders mono
PCM; `worker.js` keeps that work off the UI thread. `editor.js` draws the notes and
handles selection, note dragging, the correction sliders, keyboard alternatives,
undo, playback and export. Audio is not uploaded.

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
silent tails, and a voiced run whose median waveform periodicity is below 0.2 is
dropped whole, which removes the runs Harvest finds in noise without fragmenting
breathy or creaky phrases. Periodicity is judged at the tracked pitch and, when
that fails, at the best lag within ±20%: on short voiced islands Harvest's pitch
can be a few semitones off, and judged only at its lag such a syllable was
discarded and then left at the old pitch by every edit. Harvest scores harmonics:
a pure sinusoid is not voice to it. Analysis costs about a tenth of the
recording's duration.

Glottal cycle marks refine that contour. Within each voiced run, cycles are
located from the loudest one outward by matching one period of waveform, with
sub-sample refinement, so every frame's pitch is the mean of the cycles it
covers and stays exact through fast inflections, where Harvest alone drifts by
about a semitone. Edits apply as a smooth ratio to the frame contour.

A voiced run (a maximal stretch of voiced frames) is the unit of resynthesis.
Any run containing a pitch change or lying in a retimed span is rebuilt whole
by one of two engines. It fades in over 2 ms at its first frame, aligned to the
source's first pulse. By its last cycle the rebuilt voice has drifted by up to
half a period from the source, and fading it into the unshifted source there
cancelled harmonics and clicked at every phrase end, so the source itself
continues from the last cycle, shifted by that drift, and rejoins the true
timeline over 10 ms at the quietest unvoiced moment within the next 80 ms,
where phase means nothing. Untouched runs, consonants and silence beyond that
handover keep their original samples bit-exactly.

The waveform engine (`waveform.js`) re-spaces the recording's own cycles.
Below 4 kHz each cycle is resampled by the edit ratio, so its period becomes the
target period and the copies that overlap at the new spacing are phase-aligned:
the comb that plain overlap-add produces by crossfading copies offset by the
period difference (a sweeping flanger on real speech) does not arise. Cycles are
read at fractional positions through a 32-tap windowed-sinc delay with a lowpass
at Nyquist / r. Timing changes repeat or skip cycles at their own spacing, which
is comb-free. Pulse shapes, breath and jitter are the voice's own, and unchanged
cycles reproduce the source: bit-exactly in runs without a pitch change, to float
precision in runs with one, which the band split's complementary filters rebuild.

Above 4 kHz (a ±300 Hz raised-cosine crossover) the same cycles are laid at the
new spacing without resampling, so breath, clicks and codec texture keep their
frequencies. Resampling the whole band moved every patch and hole of an MP3's
high band up with the pitch, into bands the source never had, where the formant
correction turned them into bright narrow spikes at 10–15 kHz: on an MP3-like
10–12 kHz patch raised 4 st, the empty 13–15.5 kHz band held −33 dB re the patch,
and now −71 dB. A raised pitch overlaps about r copies at any instant, and their
breath and noise are partly unrelated, so they sum to less power than their
parts: 2 dB less at +4 st, 3.4 dB at +12. A gain smoothed over a 20 ms triangle
gives back the power the copies read. A lowered pitch spaces the copies wider
than a cycle, so their lobes reach out to the new spacing; one-cycle lobes left
gaps where the noise dipped 7 dB between pulses at −4 st, a buzz. Every band
above 4.3 kHz stays within 0.5 dB of the source from −4 to +12 st. In the
crossover the two bands are unrelated too, and a raised pitch dips it about 1 dB.

Resampling scales the formants too, so the run then passes a short-time filter
that multiplies its spectrum by E(f) / E(f / r), with E the CheapTrick envelope
of the source frame, restoring formants and spectral tilt at their original
frequencies:

- The filter is minimum phase. Like the vocal tract it models, it rings only
  after each glottal pulse; a zero-phase filter also rang before every pulse and
  matched the period waveform of the true voice at the new pitch with a
  correlation of 0.8, against 0.98 for the causal filter.
- Each frame's ratio is the window-weighted log-mean of the ratios its cycles
  were actually resampled by. A single ratio at the frame centre misdescribes a
  frame where a smoothed contour swings the ratio from cycle to cycle, and once
  blew such a frame up by 13 dB, far above the source's peak.
- The correction keeps each frame's energy: resampled overlap-add already keeps
  the source's power, so the filter only reshapes the spectrum.
- Frames are zero-padded to twice their length, so the filter acts linearly
  instead of wrapping its impulse response around the frame.
- It ramps in over a run's first and last 20 ms, where the envelope window
  straddles silence and vowel, and attenuates freely while bounding only
  amplification.

On a steady or gliding synthetic voice the rebuilt envelope is within 1 dB of the
true voice at the new pitch, the envelope estimate's own spread, from −4 to
+8 st. Its roughness stays at the source's own even at an octave, where the
vocoder's sub-harmonic energy rises by about 5 dB.

The vocoder engine (`world.js`) rebuilds the run with WORLD from the source
spectral envelope (CheapTrick) and aperiodicity (D4C) at the edited pitch on a
1 ms grid interpolated from the frame contour; feeding it the measured
cycle-level jitter sounded no more natural and measured the same. D4C estimates
aperiodicity in 3 kHz bands, where the strong low harmonics hide the noise
between the higher ones, so a vocoded voice came out harmonic above 1 kHz where
the original was breathy: the metallic tell. The engine now renders a reference
copy-synthesis of the run's context at the source pitch, measures its waveform
periodicity per band (`noise.js`) against the source's at the same frames, and
adds the excess as noise power in the edited render, above 1 kHz only, since
noise added in the low band modulates the fundamental cycle to cycle and
sounds rough. On real voices this halves
the high-band periodicity excess at the 90th percentile and leaves the median
at zero; WORLD generates its noise per pulse, so the noisiest frames cannot be
matched fully, and a second correction pass buys little for twice the cost. WORLD drives unvoiced stretches with a 500 Hz noise-pulse clock whose
last pulse before an onset borrows the vowel's envelope, so synthesis stays
voiced through a lead and tail of whole periods that the join discards; the
rebuilt run is shifted by up to half a period to line its first pulse up with
the source's, then receives the source's amplitude envelope over two pitch
periods, since WORLD's analysis window smears onsets, and is high-passed at 0.7
times its lowest target pitch: WORLD fills the envelope below the fundamental
with pulse-gated noise, which at breathy phrase edges was a low thump 14 dB
above anything in the source. It handles any change but
is audibly a vocoder on breathy or creaky voices.

Auto, the default, uses the waveform engine for runs whose largest pitch change
is within an octave and whose median cycle periodicity is at least 0.5, and the
vocoder otherwise; on unreliable cycles overlap-add doubles pulses.

Timing edits warp the analysis positions given to WORLD, so stretched voice keeps
its pitch and harmonic structure with no grain repetition. Unvoiced audio in a
retimed span is stretched with WSOLA (30 ms frames, ±10 ms search) with 10 ms
dry joins at the anchors. Consonant bursts, detected as abrupt broadband energy
rises in unvoiced audio, keep their length: the change is shared by the rest of
the selection, or by the whole selection uniformly when bursts leave no room.
Phoneme alignment is not implemented.

## Notes and corrections

Each voiced run is split into syllable notes at loudness dips, after Mermelstein's
convex-hull method (JASA 58, 1975): the run's 500–4000 Hz band level is compared
with its hull, which rises to the loudest frame and falls after it, and the run
splits at the deepest dip once it reaches 4 dB with 60 ms left on each side, then
each part again. The sample's 24 syllables give 25 notes. A note's centre is the
loudness-weighted median of its trusted frames.

Harvest keeps a run whole, so a fricative inside a phrase or a stray octave
carries a pitch the voice does not have: on a recorded lecture, jumps of 7–21
semitones for 10–100 ms at periodicity 0.1–0.35. A frame is trusted when it is
periodic at the tracked pitch (at least 0.5) and within 4 semitones of the median
of the 45 ms around it, and so is a weaker frame within 3 semitones of the line
through those: a breathy voice continues the pitch around it, a tracking error
leaves it. A run with no periodic frame is trusted whole. Corrections are computed
on trusted frames, and the others take the change of the voice around them.
Pulling a tracking error to its note's target instead would resample those cycles
by up to an octave. The plot draws the trusted contour.

Every pitch correction is one function, `correct`, over the selection, in this
order: smooth (a 0–200 ms cosine window), intonation (0–200%), straighten (0–100%
of the way from each note's contour to its centre), snap (0–100% of the way from
each centre to the nearest semitone of equal temperament, A4 = 440 Hz), rise (a
linear ramp) and shift. Notes that voice continues across crossfade over up to
80 ms centred on their boundary; the selection's edges ease into continuing voice
over up to 80 ms or a quarter of the selection. Those glides pull a note's centre
off its goal, so each note is moved again by what it still misses, up to four
times; centres land within 0.01 cent in the tests. A dragged note lands on its
semitone the same way (`shiftTo`).

On the sample, snap and straighten at 100% render every note of 80 ms or more
within a median 4 cents of its semitone (90th percentile 23 cents) with the
waveform engine, and 6 (10) cents with the vocoder, measured by YIN at each note's
middle. On a male MP3 lecture recording, medians were 4–7 cents and the 90th
percentile 34–36 cents. These measure pitch accuracy, not how natural the result
sounds.

The sliders act live on the selection and recompute from the curve their
correction started on, so they combine and return to it at neutral. One Undo
removes the whole correction; selecting anything else, or any other edit, starts
the next one from neutral.

Rebuild the pinned WASM engine with `node scripts/prosody-world.mjs <WORLD checkout>`
(requires Emscripten), then `npm run build`.

## Limits

One voice, mono output. Intonation below 100% scales semitone deviations toward
the selection median; above 100% it scales the intervals above the selection's
pitch floor (10th percentile) and leaves the valleys, as expressive speech does.
Symmetric exaggeration drove a low voice below 80 Hz, where every engine and the
voice itself turn creaky. Smoothing never crosses unvoiced audio or the selection
edge. Note dragging and arrow-key moves have no source-relative octave cap;
frequency limits reflect the synthesis floor and the recording's Nyquist limit.
Invalid edits are rejected, not clipped. Extreme shifts can still sound poor.
Restore pitch and Reset return the selected/full original contour exactly.

Notes are found automatically and cannot be split or joined by hand; select part
of a note to correct only that part. Snapping is chromatic at A4 = 440 Hz, with no
key or other tuning reference. Glides between straightened notes take up to 80 ms,
faster than speech changes pitch at its fastest for steps of a semitone or more
(Xu & Sun, JASA 111, 2002), so large steps between joined notes can sound tuned.

Local stretch factors remain 0.5–2. The timeline stays in source seconds after
timing edits. Rise is a linear ramp of up to ±6 semitones over the selection, not
semantic question detection. Edits are held in memory; reloading/changing the file discards them.
Exports are mono 32-bit float WAV at the decoded input rate, without source metadata.

Validation: `npm run test:prosody` for numerical and model regressions, including
tracker accuracy on WORLD-resynthesized speech with a known pitch contour and join
level checks on the sample; `node scripts/pages-test.mjs prosody` for
Chromium/Firefox/WebKit interaction tests; `npm run test:all` for the complete site
suite. Listening evaluation on varied human speech remains necessary before making
perceptual quality claims.
