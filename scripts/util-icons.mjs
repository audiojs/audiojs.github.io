// The utilities' icons: one drawing each, line only, on a 32 px square, the stroke the page gives them (util.css);
// a dot or a block filled where the drawing needs one. Each says what its tool does to a sound.
const icons = {
  // film, and the sound taken out of it
  'extract-audio': '<rect x="3.5" y="7.5" width="14" height="17" rx="1.5"/><path d="M7 7.5v17M14 7.5v17M3.5 12h3.5M3.5 20h3.5M14 12h3.5M14 20h3.5"/><path d="M21.5 13v6M25 10v12M28.5 14v4"/>',
  // film whose sound is swapped
  'video-audio': '<rect x="3.5" y="7.5" width="14" height="17" rx="1.5"/><path d="M7 7.5v17M14 7.5v17"/><path d="M21 12.5h7.5l-2.5-2.5M28.5 19.5H21l2.5 2.5"/>',
  // one format into another and back
  'convert-audio': '<path d="M6.5 13a9.5 9.5 0 0 1 17.5-3.5"/><path d="M24.5 4.5v5h-5"/><path d="M25.5 19a9.5 9.5 0 0 1-17.5 3.5"/><path d="M7.5 27.5v-5h5"/><path d="M13 14v4M16 12.5v7M19 14.5v3"/>',
  // levels rising to a target
  loudness: '<path d="M6 25v-4M11 25v-8M16 25v-12M21 25v-15M26 25v-11"/><path d="M3.5 9.5h25" stroke-dasharray="2 2.5"/>',
  // the sound clear of the specks around it
  denoise: '<path d="M3.5 16c3 0 3.5-7 6.25-7s3.5 14 6.25 14 3.5-14 6.25-14 3.5 7 6.25 7"/><circle cx="6" cy="7" r=".9" fill="currentColor" stroke="none"/><circle cx="27" cy="25" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="26.5" r=".9" fill="currentColor" stroke="none"/><circle cx="21" cy="5.5" r=".9" fill="currentColor" stroke="none"/>',
  // a key, and the beat of the song in it
  'key-bpm': '<path d="M8.5 6v20M13.5 5v20M5 13l12-3M5 21l12-3"/><path d="M21 19v6M24.5 13v12M28 17v8"/>',
  // a metronome
  metronome: '<path d="M11.5 4.5h9l5 23h-19z"/><path d="M8.5 21.5h15"/><path d="M16 21.5 22 8"/><circle cx="20.6" cy="11.2" r="1.4"/>',
  // a voice taken out
  'vocal-remover': '<rect x="12" y="3.5" width="8" height="14" rx="4"/><path d="M8 15a8 8 0 0 0 16 0M16 23v5M12 28h8"/><path d="M5 5l22 22"/>',
  // a tone higher, a pace faster
  'pitch-tempo': '<path d="M3.5 18c2.5 0 3-6 5.5-6s3 12 5.5 12 3-6 5.5-6"/><path d="M25 14V5M22 8l3-3 3 3M25 18v9M22 24l3 3 3-3"/>',
  // a needle over its scale
  tuner: '<path d="M4.5 22a11.5 11.5 0 0 1 23 0"/><path d="M16 10.5v2M8 13.5l1.4 1.4M24 13.5l-1.4 1.4"/><path d="M16 22l5-7"/><circle cx="16" cy="22" r="1.5" fill="currentColor" stroke="none"/><path d="M4.5 26h23"/>',
  // recording
  recorder: '<circle cx="16" cy="16" r="11.5"/><circle cx="16" cy="16" r="5" fill="currentColor" stroke="none"/>',
  // frequency over time, as bands
  spectrogram: '<path d="M4 8h9M17 8h11M4 12.5h5M12 12.5h16M4 17h14M21 17h4M4 21.5h7M14 21.5h14M4 26h24"/>',
  // a speaker and the room's answer
  measure: '<path d="M4.5 12.5h4l6-5v17l-6-5h-4z"/><path d="M19 12a5.5 5.5 0 0 1 0 8M22.5 8.5a10.5 10.5 0 0 1 0 15M26 5a15.5 15.5 0 0 1 0 22"/>',
  // a sound read into notes
  'audio-to-midi': '<path d="M4 13v6M7.5 10v12M11 14v4"/><path d="M14.5 16h2.5"/><rect x="19.5" y="7.5" width="8" height="3.5" rx=".8"/><rect x="21.5" y="14" width="6" height="3.5" rx=".8"/><rect x="19.5" y="20.5" width="4" height="3.5" rx=".8"/>',
  // the silence between taken out, the parts closed up
  desilence: '<path d="M3.5 13v6M6.5 10v12M9.5 14v4"/><path d="M22.5 14v4M25.5 10v12M28.5 13v6"/><path d="M12.5 13l2.5 3-2.5 3M19.5 13l-2.5 3 2.5 3"/>',
  // a wavering pitch made steady
  dewow: '<path d="M3.5 11c2 0 2.5-3 4.5-3s2.5 6 4.5 6 2.5-3 4.5-3"/><path d="M17 11h3"/><path d="M20 9l2 2-2 2"/><path d="M23.5 11h5"/><path d="M3.5 22h25"/><path d="M3.5 19v6M28.5 19v6"/>',
  // the time a sound takes to come back
  latency: '<circle cx="16" cy="17.5" r="10"/><path d="M16 17.5v-5.5M16 17.5l3.5 3.5M13 4h6M16 4v3.5M24 8.5l1.8-1.8"/>',
  // a spectrum cut short: a lossy file's tell
  'lossless-check': '<path d="M3.5 9c3 0 5 1 8 1.5s5 1 7.5 1.5L21 25"/><path d="M21 25h7.5"/><path d="M21 5v22" stroke-dasharray="2 2.5"/><path d="M3.5 27.5h25"/>',
  // notes made into a sound
  'midi-to-mp3': '<rect x="3.5" y="7.5" width="8" height="3.5" rx=".8"/><rect x="5.5" y="14" width="6" height="3.5" rx=".8"/><rect x="3.5" y="20.5" width="4" height="3.5" rx=".8"/><path d="M15 16h2.5"/><path d="M21 13v6M24.5 10v12M28 14v4"/>',
  // speech, and the melody of it
  prosody: '<path d="M5 6.5h22a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14l-6 5v-5H5A1.5 1.5 0 0 1 3.5 21V8A1.5 1.5 0 0 1 5 6.5z"/><path d="M8 17c2.5-6 5-6 7-2s4.5 3 9-3"/>',
  // one sound into its parts
  'stem-splitter': '<path d="M3.5 16h8"/><path d="M11.5 16c4 0 5-8 9-8h8M11.5 16h17M11.5 16c4 0 5 8 9 8h8"/>',
  // a tone
  'tone-generator': '<path d="M3.5 16c2.1 0 3.1-9.5 6.25-9.5S13.9 25.5 16 25.5s3.1-19 6.25-19 4.15 9.5 6.25 9.5"/>',
  // a voice written down
  transcribe: '<path d="M4 13v6M7.5 10v12M11 14v4"/><path d="M15.5 10.5h13M15.5 16h13M15.5 21.5h8"/>'
}
// the icon of a utility, or a plain wave for one drawn yet
export const icon = slug => `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">${icons[slug] ?? icons['tone-generator']}</svg>`
