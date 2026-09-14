import { toVst3 } from '@audio/compile'
import { toVst3 as leaf } from '@audio/compile-vst'
import { gain } from '@audio/compile-wam/examples/gain.js'
const plugin = toVst3(gain)
const native = leaf(gain, { vendor: 'org.example' })
const normalized: number = plugin.normalize('value', -6)
const bundle: Promise<string> = native.build({ atom: '/tmp/gain.js', compiler: 'jz' }).then(result => result.bundle)
// @ts-expect-error no unimplemented native compiler is advertised
native.build({ atom: '/tmp/gain.js', compiler: 'porffor' })
