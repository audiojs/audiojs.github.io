## Motivation

Sound is the first element and medium of communication.

## How can auiojs serve and to whom?

* AI: MCP server
* AI: audio skill
* CLI for headless processing and previewing audio
  * Audacity/DAW in your command line
  * Batch-processing and cleaning up files
* Reference implementation of key audio algorhythms: correct, cross-runtime, performant, open, consistent & composable
* Wavearea and other audio editors data layer.
* Online tools for audio-related operations:
  * metronome, tuner, eq, drone, spectrogram/analysis, editor etc.
* Run VST plugin via CLI (no DAW needed)
* Polyfills for platform features.
* Converting formats, sample rates, normalizing/editing
* DSP education (filters etc)
* AI agents: TTS pipeline (how?)
* AI: Info base about your audio collection

## Insights

* Audio plugins ~~marketplace~~ curated collection: with preview, tags, UI snippet; like unheap.com; similar to producthunt, devhunt.
* All main audio manipulation needs covered
  * preparing kirtans - from cropping, normalizing to mastering; audio-books – shrinking into a limited set.
* Wavearea: complete waveform editing experience
* Audio-lab: interactive audio graphs editor like reaktor, maxdsp/msp (can import nodes) etc.
* Neural-plugin: learns behavior of any vst (combination of filters - possible?)
* Neural-synth: learns any sound into synth
* Defeedback: realtime feedback reducer audio-module/plugin
* Any sort of vst/plugin chain processing in dante network

## Key Result Areas

1. **Core Reliability** — zero bugs in the decode → buffer → transform → encode path
2. **DSP Completeness** — developer never needs to leave audiojs for common DSP tasks
3. **Developer Experience** — frontend dev productive in 2 min; DSP dev productive in 10
4. **Cross-Runtime Portability** — browser + Node + Deno + Edge, identical behavior
5. **Professional Integration** — JS effects deployable as DAW plugins; plugins hostable from JS
6. **Ecosystem & Sustainability** — recognized as the standard, funded, community-maintained

## Monetization

IDEA: make openly available JS packages have classified analogs compiled with JZ to VST/AU etc - for paying pro users. And "tax" for ecosystem boundary - if anyone needs them in VST should pay the tax, each target env - extra tier to pay for.

| Source | Who | Hook |
|--------|-----|------|
| **Public grants** | STF (€150-300k, rolling), NLnet/NGI Zero (€5-50k), Google Web Fund ($5-50k), Sloan ($50-200k), NumFOCUS ($1-5k) | Infrastructure at risk — 350k/wk downloads, one maintainer, zero funding |
| **Corporate sponsors** | Spotify, SoundCloud, Descript, Adobe, Dolby, Izotope, BandLab, Splice, Riverside.fm, Vercel | You already depend on this — $2k/mo vs $200k/yr to build internally |
| **Individual devs** | Frontend devs, DSP hobbyists, music tech builders, podcasting tool makers | GitHub Sponsors + Open Collective; sponsor wall; "fund the next package" campaigns |
| **Pro audio** | Ableton, Steinberg, PreSonus, Dolby, BBC R&D | Consulting contracts — "we build the open-source primitive, you fund the work" |
| **Academic/research** | Stanford CCRMA, MIT Media Lab, IRCAM | Interactive demos as teaching tools; algorithm paper citations; research partnerships |

## Refs

* https://github.com/webprofusion/OpenAudio
