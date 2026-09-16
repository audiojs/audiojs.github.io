import { drop, hash } from '../page-helpers.mjs'
import { build } from 'esbuild'
await build({ entryPoints: ['util/prosody/editor.js', 'util/prosody/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outdir: 'util/prosody', entryNames: '[name].bundle', minify: true, external: ['../util.js'] })
// Hash the editor dependency graph too: static hosting must not mix old and new workers.
const assets = ['editor.bundle.js', 'editor.css', 'worker.bundle.js']
const version = assets.map(f => hash('prosody/' + f)).join('')
export default {
  slug: 'prosody', order: 85, name: 'Speech prosody editor',
  short: 'Draw intonation, adjust emphasis and change the timing of a phrase',
  title: 'Speech prosody editor: edit pitch curves and phrase timing',
  description: 'Edit speech intonation and phrase duration in your browser. Drag a pitch curve, reduce or amplify pitch variation, compare with the original and save a WAV. Nothing is uploaded.',
  lead: 'Shape how a sentence sounds. Adjust its pitch, emphasis and pace.',
  powered: ['@audio/stretch-wsola', '@audio/encode-wav'],
  repo: 'https://github.com/audiojs/audiojs.github.io/tree/main/util/prosody',
  body: `
    <link rel="stylesheet" href="/util/prosody/editor.css?v=${version}">
    <div class="prosody">
      ${drop('Drop a speech recording here', 'audio/*,.wav,.mp3,.m4a,.ogg,.flac').trimStart()}
      <div class="row intro"><button class="btn ghost" id="demo">Try a speech sample</button><span>Experimental · one voice · mono output</span></div>
      <p id="status" class="status" role="status" aria-live="polite">Choose a short, clean recording to begin.</p>
      <section id="editor" class="panel" hidden aria-label="Speech editor">
        <div class="row"><strong id="filename" class="file"></strong><button id="replace" class="btn ghost">Change file</button><button id="undo" class="btn ghost" disabled>Undo</button><button id="reset" class="btn ghost" disabled>Reset</button></div>
        <fieldset id="controls" disabled>
          <div class="plot">
            <div class="legend" aria-label="Plot legend"><span class="wave-key">Waveform</span><span class="detected-key">Detected</span><span class="target-key">Edited</span></div>
            <details class="plot-help"><summary aria-label="How to edit the plot">?</summary><div id="curve-help">Drag the curve to change pitch. Drag the background or the selection edges to select a phrase. Pinch to zoom and pan; scroll sideways to pan. Double-click or Ctrl/⌘A to select all.<br><br>Keyboard: +/− zoom, 0 shows all, F fits selection. Arrow keys choose and adjust pitch points. Tab to a selection edge and use ←/→ to move it; Shift makes larger steps. Times refer to the original recording.</div></details>
            <svg id="curve" viewBox="0 0 960 320" tabindex="0" role="group" aria-label="Pitch curve editor" aria-describedby="curve-help"></svg>
            <button id="selection-start" class="selection-handle" role="slider" aria-label="Selection start" aria-orientation="horizontal" aria-controls="curve"></button>
            <button id="selection-end" class="selection-handle" role="slider" aria-label="Selection end" aria-orientation="horizontal" aria-controls="curve"></button>
            <output id="point-info" class="point-info"></output>
            <div class="plot-tools" role="group" aria-label="Waveform view">
              <button id="zoom-less" aria-label="Zoom out waveform" title="Zoom out (−)">−</button><button id="zoom-in" aria-label="Zoom in waveform" title="Zoom in (+)">+</button>
              <button id="zoom" aria-label="Fit selection" title="Fit selection (F)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v14h3m8-14h3v14h-3M9 12h6"/></svg></button>
              <button id="zoom-out" aria-label="Show full recording" title="Show full recording (0)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14m16-14v14M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3"/></svg></button>
            </div>
            <div id="view-scroll" class="plot-scroll" tabindex="0" role="scrollbar" aria-label="Waveform position" aria-controls="curve" aria-orientation="horizontal"><div></div></div>
          </div>
          <div class="edit-grid">
            <section><h2>Pitch</h2>
              <div class="parameter"><label for="variation">Intonation</label><input id="variation" type="range" min="0" max="200" step="10" value="100" aria-describedby="variation-help"><output id="variation-value" for="variation">100%</output><button id="vary" class="btn ghost">Apply</button></div>
              <span id="variation-help" class="sr-only">100% keeps the pitch range. Lower values flatten intonation; higher values exaggerate it. Smoothing softens rapid pitch fluctuations.</span>
              <details class="pitch-options hint"><summary>Smoothing</summary><label for="smoothing">Window (ms)<input id="smoothing" type="number" min="0" max="200" step="10" value="60" aria-describedby="smoothing-help"></label><p id="smoothing-help">Applied with Intonation. Higher values soften faster pitch changes; 0 keeps every fluctuation. Selection edges blend over 80 ms.</p></details>
              <div class="parameter"><label for="semitones">Transpose</label><input id="semitones" type="number" step="0.5" value="0" aria-label="Transpose in semitones"><span class="hint">st</span><button id="shift" class="btn ghost">Apply</button></div>
              <div class="actions"><button id="rise" class="btn ghost" aria-label="Rising end">Rise</button><button id="fall" class="btn ghost" aria-label="Falling end">Fall</button><button id="pitch-reset" class="btn ghost">Restore pitch</button></div>
            </section>
            <section><h2>Timing</h2>
              <label>Duration (s)<input id="duration" type="number" min="0.01" step="0.01" value="1"></label><button id="retime" class="btn ghost">Apply</button>
            </section>
          </div>
          <div class="row"><button id="render" class="btn" disabled>Render edits</button><span id="render-state">Original audio · no edits</span></div>
        </fieldset>
        <div class="players"><label>Original<audio id="original" controls preload="metadata"></audio></label><label>Edited<audio id="edited" controls preload="metadata"></audio></label></div>
        <div class="row"><a id="save" class="btn" aria-disabled="true">Save WAV</a><span class="hint">32-bit float · mono · original sample rate</span></div>
      </section>
    </div>`,
  script: `import { startEditor } from '/util/prosody/editor.bundle.js?v=${version}'; startEditor('${version}')`,
  faq: [
    ['Can this automatically fix the tone of a question?', 'The rising and falling controls apply a pitch ramp to your selection. They do not infer sentence meaning. Listen and adjust the selection and pitch to match your intended delivery.'],
    ['Will it preserve the voice?', 'The WORLD speech engine changes pitch while retaining the estimated vocal-tract spectrum and breathiness. Consonants and untouched regions are kept from the original. Edits can still sound processed, especially with inaccurate pitch detection, creaky speech or large changes. Compare with the original before saving.'],
    ['Why are parts of the curve missing?', 'Silence and unvoiced consonants do not have a reliable fundamental pitch. Those regions stay unpitched. Very short clips may also have too little audio for detection.'],
  ],
  seo: `<h2>Edit delivery, one phrase at a time</h2><p>Select a word or phrase, reduce excessive pitch variation, shift its emphasis or adjust its duration. Pinch to zoom into the waveform and drag on the plot to select a phrase. Changes are rendered from the original recording, so undoing an edit does not require reversing an audio effect.</p><p>Pitch edits use the <a href="https://github.com/mmorise/World">WORLD reference speech engine</a>, compiled to WebAssembly and run locally. DIO tracks pitch across time and StoneMask refines it against the voice waveform. Phrase timing uses WSOLA and stretches the whole selection, including consonants; automatic phoneme protection and linguistic intonation correction are future work. WAV export contains audio only, without source tags.</p>`,
}
