// The field: how other tools arrange the same parts, each drawn from its manual as boxes on a 24 × 15 grid. The part
// that holds the work (the sound, the canvas, the preview) is outlined in the accent; a panel that floats is dashed; a
// thin bar is filled. Every tool's line says what the arrangement does, and links where it is documented.
import { h } from './dom.js'

// [x, y, w, h, label, kind]: kind 'stage' (the work), 'panel', 'bar', 'rail' (a strip of icons), 'float'
export const tools = [
  {
    name: 'iZotope RX', version: '12',
    does: 'The sound in the middle, spectrogram and waveform overlaid; the module chain and the history at the right. Modules open as floating windows.',
    how: 'fixed · floating module windows · a slider blends waveform into spectrogram',
    src: 'https://docs.izotope.com/rx12/en/rx-overview.html',
    boxes: [[0, 0, 24, 1.3, 'file tabs', 'bar'], [0, 1.3, 18.6, 1.4, 'overview', 'panel'], [0, 2.7, 18.6, 8.7, 'spectrogram + waveform', 'stage'], [0, 11.4, 18.6, 1.3, 'tools', 'bar'], [18.6, 1.3, 5.4, 1.9, 'chain', 'panel'], [18.6, 3.2, 5.4, 5.8, 'modules', 'panel'], [18.6, 9, 5.4, 3.7, 'history', 'panel'], [0, 12.7, 24, 2.3, 'transport · readouts · meter', 'bar'], [12.4, 3, 5.6, 3.4, 'module', 'float']]
  },
  {
    name: 'SpectraLayers', version: '12',
    does: 'Tools down the left, panels stacked down the right, each channel’s waveform strip above its spectrogram.',
    how: 'fixed, saved layouts · Tab compacts everything, Shift+Tab the panels',
    src: 'https://download.steinberg.net/downloads_software/SpectraLayers_12/help/Pro/_user_interface.html',
    boxes: [[0, 0, 24, 1.2, 'menus', 'bar'], [0, 1.2, 24, 1.3, 'tool settings', 'bar'], [0, 2.5, 1.6, 10.3, '', 'rail'], [1.6, 2.5, 17.2, 1.5, 'tabs · overview', 'panel'], [1.6, 4, 17.2, 1.5, 'wave', 'stage'], [1.6, 5.5, 17.2, 2.9, 'spectral', 'stage'], [1.6, 8.4, 17.2, 1.5, 'wave', 'stage'], [1.6, 9.9, 17.2, 2.9, 'spectral', 'stage'], [18.8, 2.5, 5.2, 1.7, 'display', 'panel'], [18.8, 4.2, 5.2, 3.9, 'modules', 'panel'], [18.8, 8.1, 5.2, 2.6, 'layers', 'panel'], [18.8, 10.7, 5.2, 2.1, 'history', 'panel'], [0, 12.8, 24, 2.2, 'transport', 'bar']]
  },
  {
    name: 'Adobe Audition', version: '26.5',
    does: 'Panel groups dock around the editor; the spectral display splits it under the waveform. Workspaces save arrangements.',
    how: 'dock, tabs, float, workspaces · ` maximises the panel under the pointer',
    src: 'https://helpx.adobe.com/audition/desktop/workspace-and-setup/customizing-workspaces.html',
    boxes: [[0, 0, 24, 1, 'menus', 'bar'], [0, 1, 24, 1.3, 'toolbar · workspaces', 'bar'], [0, 2.3, 5, 3.5, 'files', 'panel'], [0, 5.8, 5, 4.2, 'effects', 'panel'], [0, 10, 5, 3.8, 'history', 'panel'], [5, 2.3, 13.4, 5.4, 'waveform', 'stage'], [5, 7.7, 13.4, 3.5, 'spectral', 'stage'], [5, 11.2, 13.4, 2.6, 'levels', 'panel'], [18.4, 2.3, 5.6, 8.9, 'essential sound', 'panel'], [18.4, 11.2, 5.6, 2.6, 'selection', 'panel'], [0, 13.8, 24, 1.2, '', 'bar']]
  },
  {
    name: 'Audacity 4', version: '4.0, Sept 2026',
    does: 'Two toolbars over the tracks, a meter down the right. Tool modes are gone: what a click does depends on where it lands.',
    how: 'workspaces, docking toolbars · per track: waveform, spectrogram or both stacked',
    src: 'https://www.audacityteam.org/manual/workspaces/modern/',
    boxes: [[0, 0, 24, 1.3, 'project · workspace', 'bar'], [0, 1.3, 24, 1.3, 'tools', 'bar'], [0, 2.6, 4.8, 11, 'tracks', 'panel'], [4.8, 2.6, 16.8, 11, 'clips', 'stage'], [21.6, 2.6, 2.4, 11, 'meter', 'panel'], [0, 13.6, 24, 1.4, 'selection', 'bar']]
  },
  {
    name: 'Logic Pro', version: '12.3',
    does: 'The tracks in the middle; library and inspector left, editors and mixer below, browsers right. Each area has one key.',
    how: 'fixed · Y, I, E, X, F show and hide areas · screensets 1–99',
    src: 'https://support.apple.com/guide/logicpro/global-commands-lgcp02bf31b6/mac',
    boxes: [[0, 0, 24, 1.4, 'control bar', 'bar'], [0, 1.4, 6, 13.6, 'library · inspector', 'panel'], [6, 1.4, 12.4, 8.6, 'tracks', 'stage'], [6, 10, 12.4, 5, 'editors · mixer', 'panel'], [18.4, 1.4, 5.6, 13.6, 'browsers', 'panel']]
  },
  {
    name: 'VS Code', version: '1.139',
    does: 'An activity bar and two side bars frame the editor, the panel under it. Views drag between them.',
    how: 'dock, tabs, floating windows · ⌘B, ⌘J, ⌥⌘B',
    src: 'https://code.visualstudio.com/docs/configure/custom-layout',
    boxes: [[0, 0, 24, 1.2, 'title bar', 'bar'], [0, 1.2, 1.3, 12.6, '', 'rail'], [1.3, 1.2, 5, 12.6, 'explorer', 'panel'], [6.3, 1.2, 11.7, 8.6, 'editor', 'stage'], [6.3, 9.8, 11.7, 4, 'panel', 'panel'], [18, 1.2, 6, 12.6, 'chat', 'panel'], [0, 13.8, 24, 1.2, 'status bar', 'bar']]
  },
  {
    name: 'CodePen 2.0', version: '2026',
    does: 'An icon bar opens one panel at a time; the editors sit left, top or right of the preview.',
    how: 'three layouts, up to three tab groups · ⌘K, ⌘U',
    src: 'https://blog.codepen.io/docs/view-preferences/',
    boxes: [[0, 0, 24, 1.3, 'omnibar', 'bar'], [0, 1.3, 1.3, 12.4, '', 'rail'], [1.3, 1.3, 4.4, 12.4, 'files', 'panel'], [5.7, 1.3, 6.3, 4.1, 'html', 'panel'], [5.7, 5.4, 6.3, 4.1, 'css', 'panel'], [5.7, 9.5, 6.3, 4.2, 'js', 'panel'], [12, 1.3, 12, 8.9, 'preview', 'stage'], [12, 10.2, 12, 3.5, 'console', 'panel'], [0, 13.7, 24, 1.3, '', 'bar']]
  },
  {
    name: 'Observable', version: 'notebooks, 2026',
    does: 'One column of cells, each output with its code under it when pinned; panels open from a side bar.',
    how: 'fixed · code shown per cell',
    src: 'https://observablehq.com/notebook-kit/desktop-guide',
    boxes: [[0, 0, 24, 1.3, 'notebook', 'bar'], [5, 1.9, 12.4, 3.1, 'output', 'stage'], [5, 5, 12.4, 1.5, 'code', 'panel'], [5, 7, 12.4, 3.1, 'output', 'stage'], [5, 10.6, 12.4, 3.1, 'output', 'stage'], [22.7, 1.3, 1.3, 13.7, '', 'rail']]
  },
  {
    name: 'Figma', version: 'UI3',
    does: 'Layers left, properties right, tools in a bar floating over the canvas. Floating side panels were tried and reversed.',
    how: 'fixed, resizable · ⌘\\ hides the UI',
    src: 'https://www.figma.com/blog/our-approach-to-designing-ui3/',
    boxes: [[0, 0, 1.3, 15, '', 'rail'], [1.3, 0, 4.7, 15, 'layers', 'panel'], [6, 0, 12, 15, 'canvas', 'stage'], [18, 0, 6, 15, 'properties', 'panel'], [8.7, 12.4, 6.6, 1.6, 'tools', 'float']]
  },
  {
    name: 'Lightroom Classic', version: '15.5',
    does: 'Seven modules share one frame: sources left, adjustments right, the filmstrip below.',
    how: 'modules · Tab, F5–F8 hide panels · solo mode',
    src: 'https://helpx.adobe.com/lightroom-classic/help/workspace-basics.html',
    boxes: [[0, 0, 24, 1.4, 'module picker', 'bar'], [0, 1.4, 4.8, 10.6, 'sources', 'panel'], [4.8, 1.4, 14.4, 10.6, 'image', 'stage'], [19.2, 1.4, 4.8, 10.6, 'adjust', 'panel'], [0, 12, 24, 3, 'filmstrip', 'panel']]
  }
]

const W = 240, H = 150, U = 10
function schematic(t) {
  const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${t.name}: ${t.boxes.filter(b => b[4]).map(b => b[4]).join(', ')}` })
  for (const [x, y, w, hh, label, kind] of t.boxes) {
    // boxes sit 3 px in from their cell; a bar only 1.5, so its label fits
    const inset = kind === 'bar' ? 1.5 : Math.max(1.5, Math.min(3, (hh * U - 11) / 2)), r = { x: x * U + 3, y: y * U + inset, width: Math.max(1, w * U - 6), height: Math.max(1, hh * U - 2 * inset), rx: kind === 'rail' || kind === 'bar' ? 2 : 3 }
    svg.append(h('svg:rect', { ...r, class: 'k-' + kind }))
    if (kind === 'rail') for (let i = 0; i < 4; i++) svg.append(h('svg:rect', { x: r.x + r.width / 2 - 3, y: r.y + 6 + i * 11, width: 6, height: 6, rx: 1.5, class: 'k-icon' }))
    if (label) {
      // a label too long for a tall narrow box runs up it
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2, up = label.length * 4.9 > r.width - 4 && r.height > r.width
      const text = h('svg:text', { x: cx, y: cy + (kind === 'bar' ? 2.5 : 3), 'text-anchor': 'middle', class: 't-' + kind, transform: up ? `rotate(-90 ${cx} ${cy})` : null })
      text.textContent = label
      svg.append(text)
    }
  }
  return svg
}

export function field(list) {
  list.replaceChildren(...tools.map(t => h('li', {},
    schematic(t),
    h('b', {}, t.name, h('small', {}, t.version)),
    h('span', { class: 'does' }, t.does),
    h('span', { class: 'how' }, t.how, ' · ', h('a', { href: t.src }, new URL(t.src).hostname.replace(/^www\./, ''))))))
}
field(document.querySelector('#field'))
