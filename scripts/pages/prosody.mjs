import { drop, hash } from '../page-helpers.mjs'
import { build } from 'esbuild'
await build({ entryPoints: ['util/prosody/editor.js', 'util/prosody/worker.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outdir: 'util/prosody', entryNames: '[name].bundle', minify: true, external: ['../util.js'] })
// Hash the editor dependency graph too: static hosting must not mix old and new workers.
const assets = ['editor.bundle.js', 'editor.css', 'worker.bundle.js']
const version = assets.map(f => hash('prosody/' + f)).join('')
export default {
  slug: 'prosody', order: 85, name: 'Speech prosody editor',
  short: 'Move syllables to notes, straighten or smooth intonation, change phrase timing',
  title: 'Speech prosody editor: edit pitch curves and phrase timing',
  description: 'Edit speech intonation and phrase duration in your browser. Drag syllables to notes, snap them to semitones, straighten or smooth pitch, compare with the original and save a WAV. Nothing is uploaded.',
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
            <div class="plot-bar">
              <div class="legend" aria-label="Plot legend"><span class="detected-key">Original</span><span class="target-key">Edited</span></div>
              <output id="point-info" class="point-info"></output>
              <div class="plot-tools" role="group" aria-label="Waveform view">
                <button id="zoom-less" aria-label="Zoom out waveform" title="Zoom out (−)">−</button><button id="zoom-in" aria-label="Zoom in waveform" title="Zoom in (+)">+</button>
                <button id="zoom" aria-label="Fit selection" title="Fit selection (F)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H5v14h3m8-14h3v14h-3M9 12h6"/></svg></button>
                <button id="zoom-out" aria-label="Show full recording" title="Show full recording (0)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14m16-14v14M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3"/></svg></button>
              </div>
              <details class="plot-help"><summary aria-label="How to edit the plot">?</summary><div id="curve-help">Each blob is a syllable, as thick as it is loud; faint ones are noise without a clear pitch. Drag a note up or down to move it: it snaps to semitones, or moves freely with Alt (⌥). Double-click a note to snap it. Click a note to select it, Shift-click to add one, or drag across the plot to select a range; click empty space or press Esc to clear. Pinch or Ctrl-scroll to zoom; scroll sideways to pan.<br><br>Keyboard: ←/→ select the previous or next note, ↑/↓ move the selection by 10 cents (Shift: a semitone), +/− zoom, 0 shows all, F fits the selection, Ctrl/⌘A selects all. Tab to a selection edge and use ←/→ to move it. Times refer to the original recording.</div></details>
            </div>
            <div class="plot-canvas">
              <svg id="curve" viewBox="0 0 960 300" tabindex="0" role="group" aria-label="Pitch editor" aria-describedby="curve-help"></svg>
              <button id="selection-start" class="selection-handle" role="slider" aria-label="Selection start" aria-orientation="horizontal" aria-controls="curve"></button>
              <button id="selection-end" class="selection-handle" role="slider" aria-label="Selection end" aria-orientation="horizontal" aria-controls="curve"></button>
              <div id="view-scroll" class="plot-scroll" tabindex="0" role="scrollbar" aria-label="Waveform position" aria-controls="curve" aria-orientation="horizontal"><div></div></div>
            </div>
          </div>
          <div class="edit-grid">
            <section><h2>Pitch <span id="scope" class="hint"></span></h2>
              ${[
                ['smooth', 'Smooth', 0, 200, 10, 0, 'Softens pitch changes faster than the window.'],
                ['straighten', 'Straighten', 0, 100, 5, 0, 'Flattens each note toward its centre.'],
                ['snap', 'Snap to notes', 0, 100, 5, 0, 'Moves each note centre toward the nearest semitone.'],
                ['intonation', 'Intonation', 0, 200, 10, 100, 'Below 100% flattens the melody toward its middle; above, raises its peaks over its floor.'],
                ['rise', 'Rise', -6, 6, .5, 0, 'Raises or lowers the pitch gradually from the start of the selection to its end.'],
              ].map(([id, label, min, max, step, value, help]) => `<div class="parameter" title="${help}"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-describedby="${id}-help"><output id="${id}-value" for="${id}"></output><span id="${id}-help" class="sr-only">${help}</span></div>`).join('\n              ')}
              <div class="actions"><button id="pitch-reset" class="btn ghost">Restore pitch</button></div>
            </section>
            <section><h2>Timing</h2>
              <label>Duration (s)<input id="duration" type="number" min="0.01" step="0.01" value="1"></label><button id="retime" class="btn ghost">Apply</button>
            </section>
          </div>
          <div class="row"><button id="render" class="btn" disabled>Render edits</button><label class="engine">Engine<select id="engine" aria-describedby="engine-help"><option value="auto">Auto</option><option value="waveform">Waveform</option><option value="vocoder">Vocoder</option></select></label><span id="render-state">Original audio · no edits</span></div>
          <p id="engine-help" class="hint">Waveform keeps the recording's own voice cycles and suits changes within an octave. Vocoder rebuilds the voice and handles any change. Auto picks per phrase.</p>
        </fieldset>
        <div class="players"><label>Original<audio id="original" controls preload="metadata"></audio></label><label>Edited<audio id="edited" controls preload="metadata"></audio></label></div>
        <div class="row"><a id="save" class="btn" aria-disabled="true">Save WAV</a><span class="hint">32-bit float · mono · original sample rate</span></div>
      </section>
    </div>`,
  script: `import { startEditor } from '/util/prosody/editor.bundle.js?v=${version}'; startEditor('${version}')`,
  faq: [
    ['Can this automatically fix the tone of a question?', 'Rise tilts the pitch of your selection up or down toward its end. It does not infer sentence meaning. Select the last word, listen and adjust it to match your intended delivery.'],
    ['Can it tune speech or chant to notes, like Auto-Tune or Melodyne?', 'Yes. Each syllable becomes a note you can drag; it snaps to the semitones of A4 = 440 Hz. Snap to notes moves the centres of the selected notes onto the nearest semitone, Straighten flattens the pitch within each note, and together at 100% they give flat notes on the grid with natural glides between them. Smooth softens fast wobbles while keeping the melody.'],
    ['Will it preserve the voice?', 'For changes within an octave the waveform engine resamples the recording\'s own voice cycles to the new pitch and restores their formants, so pulse shapes, breath and jitter stay the voice\'s own. Larger changes use the WORLD vocoder, which rebuilds the voice from its vocal-tract spectrum and breathiness and restores the original loudness contour. Consonants, silence and untouched phrases keep their original samples. Compare with the original before saving.'],
    ['Why are parts of the curve missing?', 'Silence and unvoiced consonants do not have a reliable fundamental pitch. Those regions stay unpitched. Very short clips may also have too little audio for detection.'],
  ],
  seo: `<h2>Edit delivery, one syllable at a time</h2><p>Each syllable is a note on a piano roll. Drag it to another pitch, snap a phrase to semitones, straighten wobbly notes, smooth or exaggerate the intonation, or change a phrase's duration. Pinch to zoom into the recording and drag across the plot to select a phrase.</p><p>Pitch and timing edits use the <a href="https://github.com/mmorise/World">WORLD reference speech engine</a>, compiled to WebAssembly and run locally. Harvest tracks pitch continuously across each phrase and glottal cycle marks make it exact per cycle. Phrases are split into syllables at loudness dips, and pitch the tracker is unsure of follows the voice around it. Every edited voiced phrase is rebuilt whole at the new pitch and duration: the waveform engine resamples the recording's own voice cycles and restores their formants, the vocoder engine rebuilds the voice for large changes. Unvoiced audio in a retimed span is stretched with WSOLA and consonant bursts keep their length. WAV export contains audio only, without source tags.</p>`,
}
