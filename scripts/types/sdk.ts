import { OfflineAudioContext } from 'web-audio-api'
import { toWam } from '@audio/compile-wam'
import { gain } from '@audio/compile-wam/examples/gain.js'
const context = new OfflineAudioContext(2, 1024, 48000)
const plugin = toWam(gain)
const registered: Promise<void> = plugin.register(context)
const node = plugin.create(context)
context.createGain().connect(node)
node.connect(context.destination)
node.parameters.get('value')?.setValueAtTime(-6, 0)
node.dispose()
context.oncomplete = event => { const rendered: Float32Array = event.renderedBuffer.getChannelData(0) }
// @ts-expect-error preserve the host's connection types
node.connect({})
