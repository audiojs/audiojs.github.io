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
  description: 'Edit speech intonation and phrase duration in your browser. Drag a pitch curve, reduce pitch variation, compare with the original and save a WAV. Nothing is uploaded.',
  lead: 'Shape how a sentence sounds. Adjust its pitch, emphasis and pace.',
  powered: ['@audio/pitch-yin', '@audio/shift-formant', '@audio/stretch-wsola', '@audio/encode-wav'],
  repo: 'https://github.com/audiojs/audiojs.github.io/tree/main/util/prosody',
  body: `
    <link rel="stylesheet" href="/util/prosody/editor.css?v=${version}">
    <div class="prosody">
      ${drop('Drop a speech recording here', 'audio/*,.wav,.mp3,.m4a,.ogg,.flac').trimStart()}
      <div class="row intro"><button class="btn ghost" id="demo">Try a speech sample</button><span>Experimental · one voice · up to 60 seconds · mono output</span></div>
      <p id="status" class="status" role="status" aria-live="polite">Choose a short, clean recording to begin.</p>
      <section id="editor" class="panel" hidden aria-label="Speech editor">
        <div class="row"><strong id="filename" class="file"></strong><button id="replace" class="btn ghost">Change file</button></div>
        <fieldset id="controls" disabled>
          <div class="row"><span id="length" class="file"></span><button id="undo" class="btn ghost" disabled>Undo</button><button id="reset" class="btn ghost">Reset all</button></div>
          <div class="legend"><span>Waveform</span><span>┄ Detected pitch</span><strong>━ Edited pitch</strong><span id="point-info">No point selected</span></div>
          <svg id="curve" viewBox="0 0 960 300" tabindex="0" role="group" aria-label="Pitch curve editor" aria-describedby="curve-help"></svg>
          <p id="curve-help" class="hint">Drag a pitch point up or down. Drag the background to select time. Arrow keys move the selected point; left/right chooses another. Fields below offer the same controls. Timeline stays in original seconds.</p>
          <div class="row selection">
            <label>Start (s)<input id="start" type="number" min="0" step="0.01" value="0"></label>
            <label>End (s)<input id="end" type="number" min="0" step="0.01" value="1"></label>
            <button id="select-all" class="btn ghost">Select all</button><button id="zoom" class="btn ghost">Zoom selection</button><button id="zoom-out" class="btn ghost">Show all</button>
          </div>
          <div class="edit-grid">
            <section><h2>Intonation</h2>
              <label>Pitch change (semitones)<input id="semitones" type="number" min="-12" max="12" step="0.5" value="1"></label>
              <button id="shift" class="btn ghost">Shift selection</button>
              <div class="actions"><button id="flatten" class="btn ghost">Reduce variation 50%</button><button id="rise" class="btn ghost">Rising end</button><button id="fall" class="btn ghost">Falling end</button><button id="pitch-reset" class="btn ghost">Restore pitch</button></div>
              <label>Selected point (Hz)<input id="point-hz" type="number" min="1" step="1" disabled></label><button id="set-point" class="btn ghost" disabled>Set pitch point</button>
            </section>
            <section><h2>Phrase timing</h2>
              <p class="hint">Change the selected fragment’s length. The rest shifts in time. Select vowels or pauses for gentler edits.</p>
              <label>New duration (s)<input id="duration" type="number" min="0.01" step="0.01" value="1"></label><button id="retime" class="btn ghost">Set duration</button>
              <p id="timing" class="hint"></p>
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
    ['Will it preserve the voice?', 'Pitch shifting compensates for formant movement, but edits can still sound processed. Breathy or creaky speech, inaccurate pitch detection and large changes are harder. Compare with the original before saving.'],
    ['Why are parts of the curve missing?', 'Silence and unvoiced consonants do not have a reliable fundamental pitch. Those regions stay unpitched. Very short clips may also have too little audio for detection.'],
  ],
  seo: `<h2>Edit delivery, one phrase at a time</h2><p>Select a word or phrase, reduce excessive pitch variation, shift its emphasis or adjust its duration. Changes are rendered from the original recording, so undoing an edit does not require reversing an audio effect.</p><p>This first version uses frame-level YIN detection, a formant-compensated pitch shifter and WSOLA time stretching. Timing edits stretch the whole selection, including consonants; automatic phoneme protection and linguistic intonation correction are future work. WAV export contains audio only, without source tags.</p>`,
}
