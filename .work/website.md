# Website

## Signals / Aspects

### Visitor questions (primary — must answer obviously)

- **What's this?** — impression first. Main proposition: audio-modules, AI (audio-mcp/skill), JS ↔ pro audio bridge. Secondary: reference DSP, wavearea editor, audio CLI, online tools, platform polyfills.
- **How's it different?** — mission, the moat (cross-runtime + WPT + composable + paper-cited).
- **What does it consist of?** — platform, core modules, audio units.
- **Where do I start?** — clear routing per audience layer.


### Funder/sponsor questions (secondary — answered indirectly)

- Who's behind this and what if they vanish? (bus factor, governance)
- Can I verify your claims? (reproducibility)
- Are you actually shipping? (track record)
- Where does the money go? (transparency)
- What's at risk if we don't fund you? (infrastructure-at-risk story)
- Are you engaged with standards bodies? (W3C, AES, IETF)
- What's your stability promise? (semver, deprecation policy)
- Is putting your code in production safe? (security posture)
- Why audiojs specifically, not someone else? (the moat)

### Embedded signals → design solutions

Don't build separate pages — embed the answer in the artifact.

| Signal | Embedded form |
|--------|---------------|
| Bus factor / who's behind | Tiny `@maintainer + N contributors` line in each module card footer. Org page = credits roll, album-sleeve style. |
| Activity / shipping cadence | Sparkline of commits per month next to module name. Last-release date stamp like film cans: `LOT 2026-03-14`. |
| Verification / reproducibility | Every number has a tiny ▶ next to it — opens live runner. WPT % links to the report. Wikipedia citation pattern. |
| Standards alignment | Stamp badges in module metadata: `WPT 100% ▪ RFC 1951 ▪ ISO 226`. Certification stamps like real measurement gear. |
| Stability promise | Module dossier line: `semver: strict ▪ last breaking: 2024-07-12`. Aircraft maintenance log feel. |
| Security posture | Cosign / OpenSSF badge in module footer. Last-audit date stamp. Tiny, like batch numbers. |
| Funding transparency | Live ledger widget: `MAR 2026 — $1,247 in / $980 out`. Vending machine with glass walls. |
| Risk acknowledgment | Status taxonomy: `CALIBRATED ▪ PENDING CALIBRATION ▪ UNDER EVALUATION ▪ DEPRECATED ▪ RESTRICTED`. Honesty as taxonomy, not confession. |
| Ecosystem proof / used by | Logo strip at page bottom — record-label-back-cover style. Weekly downloads as headline metric per module. |
| Academic credibility | Each algorithm card has `[paper]` micro-link → BibTeX popup. Wolfram MathWorld pattern. |
| Provenance / org age | Thin timeline strip at homepage bottom — museum exhibit caption. `2014 → 2026: shipped, deprecated, in-flight`. |
| Roadmap | Gantt-style strip — flight progress bar. `Q3 2026: web-codecs LANDING ▪ Q4: time-stretch IN-FLIGHT`. |

### Design principles

1. **One artifact carries many signals.** Each module card holds: status, downloads, last-commit, semver, paper citation, benchmark, runtime support — at a glance. The card *is* the trust object.
2. **Borrowed certification language.** Stamp marks, lot numbers, calibration dates, batch IDs, CE-style compliance badges. Trust by visual inheritance, not by claim.
3. **Live data over static claims.** Real-time downloads, live commit sparklines, live test-pass rates. Anything pinned in time decays into marketing.
4. **Honesty as taxonomy.** Status labels for unfinished work read as discipline, not confession. CALIBRATED is more credible than COMING SOON.
5. **Verification one click away.** Every claim → a way to re-run it. Inverts the burden: visitor verifies you, you don't have to defend.
6. **No "About" pages.** If the catalog is dense and alive enough, nobody asks. The Wikipedia / npm / arXiv test.

### Play factors

- Microdemos per module — drop-in usable tools, not illustrations.
- Cross-runtime demonstrations: same code, three runtime badges, all green.

### Aesthetic signals

- Maxell pro audio recording tape style — direct reuse, perfect with wavefont.
- plus some inspiration from `## CIA Aesthetics` section below.

### Quality signals

- Performance numbers per module, WASM annotations, WPT conformance %, illustrative comparison vs alternatives.
- Every number reproducible — see Embedded signals above.

## Sections

```
/              Catalog index
/audio         Audio tool (CLI + API + audio-host)
/modules       Audio modules — composable processors, multi-target
/dsp           DSP primitives — paper-traced signal math
/platform      Platform polyfills — cross-runtime compliance
/ai            MCP + audio skill
/wavearea      Editor component
/lab           Interactive demos
```

### `/` — Index

**User intent:** "What is audiojs?" — arrived from npm, search, or a link. Needs orientation in 5 seconds.

**The artifact:** A dense master catalog — every module visible, filterable, alive with signals. Not a marketing landing page. The catalog *is* the pitch. Think npm org page meets NIST equipment directory meets Discogs label page.

**Contents:**
- Org headline + one-sentence positioning (JS audio infrastructure, not a framework)
- Full module grid — dossier cards with status badges, sparklines, download counts, runtime icons
- Section routing — clear paths to /audio, /modules, /dsp, /platform, /ai, /wavearea
- Timeline strip at bottom — `2014 → 2026`, museum exhibit caption
- Ecosystem proof — used-by logo strip, record-label back-cover style
- Funding transparency widget — live ledger, glass walls

**Soul:** The feeling of walking into a well-organized instrument workshop. Everything has its place. Every tool is labeled. You trust the shop before anyone says a word.

---

### `/audio` — Audio Tool

**User intent:** "I need to work with audio files in JS/CLI." Arrived from `npm i audio` or "how to decode mp3 in node" search.

**The artifact:** Product page for the `audio` package — the high-level entry point. CLI reference + API reference as tabs or sections. This is where 80% of casual users convert.

**Contents:**
- BLUF: "Decode, encode, inspect, and stream audio across all JS runtimes. One import."
- Install + first example (3 lines to decode a file)
- CLI reference — command table, flags, output examples
- API reference — method signatures, return types, format support matrix
- audio-host section — load AU/VST/CLAP plugins into JS pipeline. "The bridge inward."
- Format support table — 14 formats × 3 runtimes, green/yellow/red
- Benchmark: decode time vs native, file size overhead

**Soul:** The Swiss Army knife page. You landed here with a problem, you leave with a solution. No philosophy, no manifesto — just sharp tools and clear measurements.

---

### `/modules` — Audio Modules

**User intent:** "I need a specific audio processor — filter, pitch shift, beat detection — that works everywhere and compiles to pro audio targets."

**The artifact:** Searchable catalog of composable audio processors. Each module is a standalone unit with defined I/O, compilable to JS, AudioWorklet, and pro audio targets (VST/CLAP). The distinction from `/dsp`: these are *directly useful for audio work*, not abstract signal math.

**Contents:**
- Module grid — filterable by category (codec, I/O, analysis, effects, synthesis), status, runtime
- Categories:
  - **Codec:** audio-decode, audio-encode
  - **I/O:** audio-speaker, audio-mic
  - **Analysis:** beat-detection, pitch-detection
  - **Effects:** audio-filter, time-stretch, pitch-shift, audio-effect
  - **Synthesis:** floatbeats, generator
- Each card: status badge, install command, runtime icons, weekly downloads, minimal snippet, compile targets
- Compile target badges: `JS ▪ Worklet ▪ VST3 ▪ CLAP` — the multi-target story
- Composability demo — chain two modules in 4 lines

**Soul:** A parts catalog for audio engineers who think in JavaScript. Every module is a calibrated instrument — tested, traced, interchangeable. You pick what you need, snap it together, ship it anywhere.

---

### `/dsp` — DSP Primitives

**User intent:** "I need a reference FFT / window function / weighting curve — correct, fast, cited." Arrived from academic search, StackOverflow, or building something custom.

**The artifact:** A reference library of signal processing primitives. Paper-traced, equation-first, with live verification. The audience is DSP engineers, students, researchers, and anyone building custom audio processing who needs trustworthy building blocks.

**Contents:**
- Module grid — fourier-transform, window-function, a-weighting, digital-filter, periodic-function, pcm-convert, decibels
- Each card: algorithm citation (`Smith 2007, §4.3`), equation rendering, benchmark, WPT compliance
- Traceability: every algorithm links to its paper, every number has a ▶ to re-run
- Comparison tables vs reference implementations (MATLAB, scipy)
- CCRMA/Julius Smith style: equation → diagram → code → live demo

**Soul:** The feeling of reading a well-typeset textbook where every formula actually runs. Wolfram MathWorld meets MDN. Authoritative, verifiable, useful. The page a professor links to instead of writing their own explanation.

---

### `/platform` — Platform Compliance

**User intent:** "Web Audio API is broken/missing in my runtime. I need a polyfill that actually passes WPT." Arrived from a runtime compatibility issue or cross-platform project planning.

**The artifact:** A compliance dashboard and polyfill catalog for web audio standards across runtimes. The moat made visible: cross-runtime + WPT conformance.

**Contents:**
- Compliance matrix — web-audio-api, audio-buffer, web-codecs, audio-worklet × browser, Node, Deno, Bun
- WPT pass rates per module per runtime — live, linked to test reports
- Each polyfill card: what standard it implements, what gap it fills, conformance %, install + usage
- Runtime support timeline — when each gap was closed
- Standards alignment badges: `W3C ▪ WPT 100% ▪ WHATWG`

**Soul:** Air traffic control for JS audio runtimes. Green means go. Red means there's a polyfill. The clarity of a compliance certificate — you know exactly what works where, no guessing.

---

### `/ai` — AI Audio

**User intent:** "I want AI/LLM to work with audio — generate, analyze, manipulate." Arrived from MCP ecosystem, AI tool builders, or "audio + AI" search.

**The artifact:** Entry point for AI-powered audio capabilities. MCP server for tool-use LLMs. Audio skill for agents. Status: PENDING CALIBRATION — honest about what's shipping and what's in-flight.

**Contents:**
- audio-mcp — MCP server: what tools it exposes, which LLMs it works with, setup in 3 steps
- audio-skill — agent skill: capabilities, integration pattern
- Use cases: "Analyze this recording", "Generate a tone sweep", "Detect BPM from file"
- Architecture: how MCP/skill wraps the module ecosystem (the AI layer is thin, the audio layer is deep)
- Status: clear PENDING CALIBRATION markings on what's in-dev

**Soul:** The shortest path from "hey AI, do something with audio" to it actually working. Not an AI hype page — a technical interface specification for machines and the humans configuring them.

---

### `/wavearea` — Wavearea

**User intent:** "I need an audio waveform editor component for my web app." Arrived from component search, audio tool builders.

**The artifact:** Product page for the wavearea editor component. Demo-first — the component speaks for itself.

**Contents:**
- Live embedded demo — load a file, see waveform, interact immediately
- Feature list: zoom, select, cut, markers, regions, spectrogram view
- API surface — props, events, methods, slots
- Theming/customization — how it adapts to host app
- Size/performance: bundle size, render performance, accessibility
- Install + framework integration (vanilla, React, Vue)

**Soul:** Ableton's arrangement view, in a web component. The demo is the pitch. If the waveform feels right under your fingers, nothing else matters.

---

### `/lab` — Lab

**User intent:** "I want to play with audio processing in my browser right now." Arrived from curiosity, sharing, teaching, or evaluating audiojs capabilities.

**The artifact:** Interactive experiment gallery. One demo per module. The highest-shareability, highest-delight section. The reason professors link to you, sponsors get convinced, and developers fall in love.

**Contents:**
- Filter lab — draw EQ curve → hear it on a file / mic
- FFT analyzer — mic → live spectrogram
- Beat detection — drop a track, see BPM + beat grid animate
- Noise generator — hear white/pink/brown with spectral plot
- Phase vocoder — time-stretch a sample in browser
- Web Audio REPL — write any API code, run it
- Format decoder — drag any audio file, see decoded buffer stats

**Soul:** A science museum's interactive floor. Each exhibit is self-contained, surprising, and teaches something real. You came to evaluate a library — you stayed because you were making sounds.





## CIA Aesthetics

* Secret research papers declassified about the classified top-end grade quality audio components.
* The lingo is technicel - the style of intelligence service lab (not hollywood) mixed with standards spec (w3d) applied to pro audio domain.
* Visuals - scientific acoustic lab, calibration lab technical report, braun/bauhaus, audio technica, ableton/steinberg/senheiser/shure pro audio specs, w3c specs, nasa technical reports, stealth plane engine specs, webassembly spec, aes, ieee, itu. Slight retro-bureaucratic modernism. Monotonic, strict and serious, somewhat sombre, no joking around or shaggy parts, serious tone, to contrast the modern-world diversity - like an agent from 50s in current era. Academic DSP research spirit but not too theoretical, field units.
* Calibration = Correctness: benchmark tables, algorithm citations, WPT complience is inevitable.
* Secret service + calibration lab (light gray, monochrome, Dieter Rams, Audiotechnica). ISO standards documents. NIST calibration certificates. Measurement equipment manuals. Keysight, Brüel & Kjær, Audio Precision.
* Monofont, technical lingo.
* Black areas - for code input.

### The synthesis for audiojs:

  Aesthetic is not tech marketing (Vercel) and not pure academic (arxiv). It's the intersection the real world already has a name for: technical report.
  Specifically:
  AES convention paper format for Briefs (Blog)
  W3C spec structure for module documentation
  NIST certificate format for the catalog cards
  CCRMA/Julius Smith style for algorithm explanations (equation → diagram → code)
  ISO document numbering and normative language for credibility
  No one in the JS ecosystem does this. Everyone imitates Vercel. A site that reads like an AES paper with live demos embedded is genuinely new.
  But the quality of cleanliness is vercel, nextjs (not the stack, just visual quality).

### Refs

* nextjs, vercel, ui.shadcn, planetscale.com, clerk, lit.dev,
* w3.org/TR, aes.org, ieee.org, arxiv.org, jmlr.org, fiiir.com, itu.int
* https://tiptap.dev/docs

### Text style

#### Structure (from IC practice)
* **BLUF** — Bottom Line Up Front. Every section opens with the conclusion. No buildup, no suspense. "audio-decode handles 14 formats across all runtimes." Then details.
* **Key Judgments** — top of any longer section. Numbered, standalone, scannable. "1. Browser-native decoding fails for 6 of 14 formats. 2. WASM fallbacks close the gap. 3. No runtime dependency required."
* **Estimative language** — never overstate. "We assess with high confidence" → CALIBRATED. "Likely" → PENDING CALIBRATION. "Insufficient data" → UNDER EVALUATION. No superlatives, no marketing claims.
* **Classification markings as status** — not spy theater, but borrowed format:
  - `CALIBRATED` — stable, tested, published
  - `PENDING CALIBRATION` — in development, API may shift
  - `DEPRECATED` — superseded, do not use
  - `RESTRICTED` — internal/experimental, not for production

#### Voice
* Third person, passive where natural. "The module decodes..." not "We built..." Not "you can use" but "The interface exposes."
* Declarative, not persuasive. State facts. Let measurements convince. No "powerful", "blazing fast", "easy to use."
* Estimative hedging over false certainty. "Performs within 2% of native on tested runtimes" not "Works everywhere."
* Terse. Short sentences. One idea per sentence. Subordinate clauses are suspect.
* Technical specificity over vague claims. "48kHz float32 stereo, 312ms decode time" not "fast decoding."

#### Vocabulary (IC × metrology × DSP blend)
* Module (not package, not library — a measurement module)
* Specification (not docs)
* Assessment (not review, not comparison)
* Compliance (not support — "WPT-compliant", "W3C-compliant")
* Traceability (not "based on" — algorithm traced to Smith 2007, §4.3)
* Tolerance (not "close enough" — within stated tolerance)
* Operational (not "works" — operationally verified on Chrome 120, Node 22, Deno 1.40)
* Current intelligence (not "news" — current status of the module ecosystem)
* All-source (analysis pulling from multiple benchmarks, runtimes, standards)
* The take (what the measurements show)
* Readout (summary of a demo or benchmark result)
* Brief (not blog post — a technical brief)

#### Sentence patterns
* "We assess [claim] with [high/moderate/low] confidence based on [evidence]."
* "[Module] conforms to [standard] within [tolerance] across [runtimes]."
* "Measurement: [metric]. Result: [value]. Reference: [citation]."
* "Status: CALIBRATED. Last verified: [date]. Traceability: [standard/paper]."

#### What to avoid
* Excitement, exclamation marks, emoji, "🚀"
* Marketing adjectives: powerful, robust, elegant, seamless, cutting-edge
* Filler: "In order to", "It should be noted that", "As you can see"
* First person plural as marketing ("We believe in...")
* Rhetorical questions
* Hollywood spy clichés (redacted bars, "classified", skull icons)

### Ideas
  * Classified - for in-development
  * Two visual styles of modules dossier: classified and declassified units (research, "premium" vs basic).
  * Declassified status - for released
  * Black/white github statuses
  * Gray area for charts with white grid


### Modules

  * This section presen

  * AI: audio-mcp (pending), audio-skill (pending) FIXME: are these good names?
  * Platform: web-audio-api, audio-buffer, web-codecs (pending), audio-worklet (pending)
  * Integration: audio-host (pending), audio-module (pending) (maybe platform?)
  * Codec: audio-decode, audio-encode
  * I/O: audio-speaker, audio-mic
  * Analysis: fourier-transform, beat-detection, window-function, a-weighting, pitch-detection
  * Effects: digital-filter, audio-filter, time-stretch, pitch-shift, audio-effect
  * Syntehis: periodic-function, floatbeats (pending), generator (pending)
  * Utility: audio-type, audio-extensions, pcm-convert, decibels (?)

### Units (catalog)

Each package = a dossier card: status badge, runtime support (browser/node/deno), weekly downloads, install Žommand, minimal snippet. Filterable by layer, status, runtime. Groups: Core Pipeline / DSP Primitives / Umbrellas / Classified (in-dev). This is where the frontend dev converts.

### Lab (demos)

The highest-leverage section. Each package gets one interactive experiment. These are the actual reason people will share the URL, professors will link to it, sponsors will be convinced.
Filter lab: draw EQ curve → hear it on a file / mic
FFT analyzer: mic → live spectrogram
Beat detection: drop a track, see BPM + beat grid animate
Noise generator: hear white/pink/brown with spectral plot
Phase vocoder: time-stretch a sample in browser
Web Audio REPL: write any API code, run it
Format decoder: drag any audio file, see decoded buffer stats

### Architecture

One diagram: how packages compose. Layer 3 primitives → Layer 2 umbrellas → Layer 1 audio API → escape hatch. Shows that Layer 1 is built from Layer 3, not a separate codebase. This convinces DSP devs, tool builders, and grant committees simultaneously.

### Briefs

Release notes + algorithm explainers (YIN, phase vocoder, spectral flux) with paper citations. "State of Audio in JS" annual report. Academic credibility. SEO landing pages for "how to decode MP3 in Node.js", "how to detect BPM in browser", etc.
