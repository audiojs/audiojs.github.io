// Speech-to-text: Whisper (tiny/base/small) via @audio/neural-asr, transcript + SRT/VTT via @audio/subtitle.
import { drop, src } from '../page-helpers.mjs'

export default {
  order: 47,
  slug: 'transcribe', name: 'Transcribe audio to text and subtitles', short: 'Whisper speech-to-text; TXT, SRT, VTT; sentence or word timestamps',
  title: 'Transcribe audio to text and subtitles: free speech-to-text in your browser',
  description: 'Transcribe audio or video to text, SRT and VTT in your browser with Whisper. The model downloads once from huggingface.co, then runs offline. No upload.',
  lead: 'Drop an audio or video file. Get a transcript plus SRT and VTT subtitle files, entirely on your device.',
  powered: ['@audio/neural-asr', '@audio/subtitle'], repo: 'https://github.com/audiojs/neural',
  body: drop('Drop an audio or video file here') + `
    <form class="opts" id="opts">
      <label>Language <select name="language">
        <option value="en">Auto (assumes English)</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="it">Italian</option>
        <option value="pt">Portuguese</option>
        <option value="ru">Russian</option>
        <option value="ja">Japanese</option>
        <option value="zh">Chinese</option>
        <option value="ko">Korean</option>
        <option value="hi">Hindi</option>
        <option value="ar">Arabic</option>
      </select></label>
      <label>Model <select name="model">
        <option value="onnx-community/whisper-tiny">Tiny · fastest · 91 MB</option>
        <option value="onnx-community/whisper-base" selected>Base · better · 136 MB</option>
        <option value="onnx-community/whisper-small">Small · best · 285 MB</option>
      </select></label>
      <label>Timestamps <select name="timestamps">
        <option value="segment">Per sentence</option>
        <option value="word">Per word</option>
      </select></label>
    </form>`,
  worker: `

const asrLib = import('${src('@audio/neural-asr', '0.1.0')}')
const subtitleLib = import('${src('@audio/subtitle', '0.1.0')}')

const MODEL_LABEL = { 'onnx-community/whisper-tiny': 'Tiny', 'onnx-community/whisper-base': 'Base', 'onnx-community/whisper-small': 'Small' }
// onnx-community's tiny/base/small exports drop cross-attention outputs word-level timestamps need;
// the older Xenova conversions keep them (see @audio/neural-asr README — Limitations).
const WORD_MODEL = { 'onnx-community/whisper-tiny': 'Xenova/whisper-tiny', 'onnx-community/whisper-base': 'Xenova/whisper-base', 'onnx-community/whisper-small': 'Xenova/whisper-small' }
const LANG_NAME = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', hi: 'Hindi', ar: 'Arabic' }
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default async function process(a, o, ui) {
  const t0 = performance.now()
  const transcribe = (await asrLib).default
  const subtitle = await subtitleLib
  const wantWords = o.timestamps === 'word'
  const baseModel = o.model || 'onnx-community/whisper-base'
  const model = wantWords ? (WORD_MODEL[baseModel] || baseModel) : baseModel
  const language = o.language || 'en'
  ui.status('Loading the speech model…')
  const result = await transcribe(a, {
    model, language, dtype: 'q4', timestamps: wantWords ? 'word' : 'segment',
    progress(info) {
      if (info.status === 'progress' && info.total) { ui.status('Downloading the speech model' + (info.file ? ' — ' + info.file : '') + '… ' + Math.round(info.progress || 0) + '%'); ui.progress((info.progress || 0) / 100) }
      else if (info.status === 'ready') ui.status('Transcribing…')
      else if (info.status === 'initiate') ui.status('Fetching the speech model from huggingface.co (once; your browser caches it after)…')
    },
  })
  const secs = (performance.now() - t0) / 1000
  const text = result.text.trim()
  const wordCount = result.words && result.words.length ? result.words.length : (text ? text.split(' ').filter(Boolean).length : 0)
  // DTW word-alignment occasionally snaps the last word's end far past the audio (a documented
  // transformers.js limitation, see @audio/neural-asr README); clamp to what was actually decoded.
  const words = result.words && result.words.length ? result.words.map(w => ({ ...w, start: Math.min(w.start, a.duration), end: Math.min(Math.max(w.end, w.start), a.duration) })) : result.words
  const cues = wantWords && words && words.length ? subtitle.fromWords(words) : result.segments.map(s => ({ start: s.start, end: s.end, text: s.text }))
  const srt = subtitle.write(cues, 'srt')
  const vtt = subtitle.write(cues, 'vtt')
  const html = result.segments.length ? result.segments.map(s => escHtml(s.text.trim())).join('<br>') : '(no speech detected)'
  return {
    report: [
      { k: 'Language', v: LANG_NAME[language] || language, note: 'Whisper does not detect language automatically; this used the language picked above. Auto sends English.' },
      { k: 'Duration processed', v: fmtTime(a.duration) },
      { k: 'Words', v: wordCount },
      { k: 'Model', v: (MODEL_LABEL[baseModel] || baseModel) + '<small>' + secs.toFixed(1) + 's</small>', note: wantWords ? 'Word timestamps switched the model to ' + model + ', the export with per-word alignment data.' : 'Time includes the model download on first use; later runs on the same model are much faster.' },
      { k: 'Transcript', cls: 'wide list', v: html },
    ],
    files: [
      { name: 'transcript.txt', data: result.text, mime: 'text/plain', label: 'Save TXT' },
      { name: 'transcript.srt', data: srt, mime: 'text/plain', label: 'Save SRT' },
      { name: 'transcript.vtt', data: vtt, mime: 'text/vtt', label: 'Save VTT' },
    ],
  }
}
`,
  tool: { busy: 'Loading the speech model…' },
  script: `tool({ process: PROCESS, ...TOOL })`,
  faq: [
    ['Is the audio uploaded anywhere?', 'No. Recognition runs in your browser with Whisper through @audio/neural-asr (transformers.js on ONNX Runtime, WASM or WebGPU). Audio never leaves your device. The Whisper model itself downloads once from huggingface.co and is cached by the browser; every transcription after that runs offline.'],
    ['Does it detect the language automatically?', 'No. The browser Whisper pipeline does not auto-detect language; leaving the selector on Auto quietly assumes English. Pick the spoken language from the list for anything else — the wrong language still produces fluent but wrong text.'],
    ['Which model should I pick?', 'Tiny (91 MB) is fastest, good for a quick draft of clear speech. Base (136 MB) is the default: a real accuracy step up for a modest extra download. Small (285 MB) gets closest to a human transcript but downloads more and runs slower, especially on a phone.'],
    ['How accurate are word-level timestamps?', 'They come from Whisper\'s cross-attention alignment, documented as accurate to roughly ±100 ms, sometimes worse: short function words can land at the same instant. Sentence timestamps use Whisper\'s own segment boundaries and are more reliable; pick word-level only when you need karaoke-style captions.'],
    ['What happens with silence or music?', 'Whisper has no explicit silent output. Fed music, noise or long silence it can produce fluent invented text instead of nothing. Trim non-speech sections before transcribing anything you plan to publish as-is.'],
  ],
  seo: `
      <h2>Whisper speech recognition in your browser</h2>
      <p>This page runs <code>@audio/neural-asr</code>, a wrapper around <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener">transformers.js</a> and ONNX Runtime that drives <a href="https://cdn.openai.com/papers/whisper.pdf" target="_blank" rel="noopener">Whisper</a> (Radford et al., OpenAI 2022) entirely on your device. Drop a file, watch the model download once, read the transcript, save it as text or subtitles. Nothing is sent anywhere.</p>
      <h3>Three model sizes</h3>
      <p>Tiny, base and small are the same Whisper architecture at 39M, 74M and 244M parameters, converted to ONNX by the onnx-community project and 4-bit block-quantized (<code>dtype: 'q4'</code>) for a browser-sized download: about 91, 136 and 285 MB. Bigger models make fewer mistakes on accents, background noise and unusual words, at the cost of a longer download and slower inference.</p>
      <h3>Sentence or word timestamps</h3>
      <p>Segment timestamps come straight from Whisper's own chunk boundaries and are the reliable default. Word-level timestamps need cross-attention data that only the older Xenova Whisper exports carry, so picking "Per word" switches the model to the matching Xenova conversion automatically.</p>
      <h3>Transcript, SRT, VTT</h3>
      <p><code>@audio/subtitle</code> writes the recognised segments (or words, via <code>fromWords</code>, when word timestamps are on) to SubRip (.srt) and WebVTT (.vtt) alongside a plain .txt transcript, ready to attach to a video or feed to an editor.</p>`,
}
