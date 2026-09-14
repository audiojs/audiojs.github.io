import { tube as amp, type AmpTubeOptions } from '@audio/amp'
import defeedback from '@audio/defeedback'
import { defeedback as feedbackAtom } from '@audio/defeedback/audio'
import { gate, dehum, type DehumOptions } from '@audio/denoise'
import { delay, type DelayOptions } from '@audio/effect'
import { latency } from '@audio/measure'
import { parse as parseMidi } from '@audio/midi'
import { chroma } from '@audio/mir'
import { cents, parse, snapHz } from '@audio/note'
import { yin } from '@audio/pitch'
import { linear } from '@audio/resample'
import { freeverb } from '@audio/reverb'
import { tube } from '@audio/saturate'
import { track } from '@audio/sinusoidal'
import { panner } from '@audio/spatial'
import { centroid } from '@audio/spectral'
import { stftBatch, stftStream, stftAnalyse } from '@audio/stft'
import { noise } from '@audio/synth'
import { snap } from '@audio/tune'
import { glottis } from '@audio/voice'
import window, { apply, cola, hann } from '@audio/window'
import hannSubpath from 'window-function/hann'
import { toWam, type ProcessorFactory } from '@audio/compile'
import { gain } from '@audio/compile-wam/examples/gain.js'
import { compressor } from '@audio/compile-wam/examples/compressor.js'

const data = new Float32Array(2048)
const ampOptions: AmpTubeOptions = { fs: 48000, gain: 0.3 }
const humOptions: DehumOptions = { freq: 50 }
const delayOptions: DelayOptions = { time: 0.25, feedback: 0.3 }
const processed: Float32Array[] = [amp(data, ampOptions), gate(data, { attack: 0.001 }), dehum(data, humOptions), delay(data, delayOptions),
  linear(data, { from: 48000, to: 44100 }), freeverb(data), tube(data), snap(data), noise(1, { color: 'pink' }), glottis({ f0: 220 })]
const feedback = defeedback({ fs: 48000, pnpr: 18, ramp: 256 })
const same: Float32Array = feedback.process(data)
feedback.notches().map(notch => notch.freq + notch.gain)
feedback.reset()
const atom = feedbackAtom({ sampleRate: 48000, params: { notches: data, q: data, strength: data } })
atom([[data]], [[data]])
const seconds: number = latency(data, data).seconds
const notes: number[] = parseMidi(new Uint8Array()).notes.map(note => note.midi)
const chromaFrame: Float64Array = chroma(data)
const hz: number = snapHz(cents(443).hz, { scale: 'major' })
const midi: number = parse('A4')
const estimate = yin(data)
if (estimate) { const frequency: number = estimate.freq }
const frames: number = track(data).frames
const stereo: [Float32Array, Float32Array] = panner(data, data, { pan: 0.2 })
const centroidHz: number = centroid(data)
const rendered: Float32Array = stftBatch(data, (mag, phase, state, ctx) => {
  state.frames = Number(state.frames ?? 0) + 1
  const sampleRate: number = ctx.fs
  return { mag, phase }
})
const stream = stftStream((mag, phase) => ({ mag, phase }))
const chunks: Float32Array[] = [stream.write(data), stream.write(new Float32Array(0)), stream.flush()]
stftAnalyse(data, (mag, phase, pos) => { const offset: number = pos })
const win: Float64Array = window('hann', 2048)
const applied: Float32Array = apply(data, win)
const overlap: boolean = cola(win, 512, { squared: true }).ok
const sample: number = hann(0, 2048)
const subpathSample: number = hannSubpath(0, 2048)
const factory: ProcessorFactory<{ value: Float32Array }> = ctx => (inputs, outputs, params) => {
  outputs[0][0].set(inputs[0][0])
  const value: number = params.value[0]
}
factory.params = { value: { type: 'number', min: 0, max: 1 } }
const plugin = toWam(factory)
const gainPlugin = toWam(gain)
const compressorPlugin = toWam(compressor)
const context = new OfflineAudioContext(2, 2048, 48000)
const registered: Promise<void> = plugin.register(context)
const node = plugin.create(context, { parameterData: { value: 0.5 } })
node.connect(context.destination)
node.setParam('value', 0.5)
node.dispose()

// Invalid calls must remain errors: detect accidental any and widened wrappers.
// @ts-expect-error delay time is seconds, represented by a number
delay(data, { time: '250ms' })
// @ts-expect-error gate times are numeric
gate(data, { attack: 'fast' })
// @ts-expect-error a streaming write requires a chunk; flush has its own method
stream.write()
// @ts-expect-error a frame processor must return magnitude and phase
stftBatch(data, () => undefined)
// @ts-expect-error invalid scale name
snapHz(440, { scale: 'unknown-scale' })
// @ts-expect-error apply takes window samples, not a window function
apply(data, hann)
// @ts-expect-error named window must exist
window('not-a-window', 2048)
// @ts-expect-error resampling requires both rates
linear(data, { from: 48000 })
// @ts-expect-error parameter values cannot be arbitrary objects
node.setParam('value', {})
