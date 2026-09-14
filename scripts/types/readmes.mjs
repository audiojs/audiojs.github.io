// Runs inside the fresh tarball consumer, alongside the installed README examples.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as dynamics from '@audio/dynamics'
import * as eq from '@audio/eq'
import compressor from '@audio/dynamics-compressor'
import parametricEq from '@audio/eq-parametric'
import * as d from './dynamics-readme.js'
import * as e from './eq-readme.js'

test('installed dynamics README preserves input, returns full output and matches streaming samples', () => {
  assert.equal(dynamics.compressor, compressor)
  const original = Float32Array.from({ length: 4800 }, (_, i) => 0.8 * Math.sin(2 * Math.PI * 220 * i / 48000))
  assert.deepEqual(d.samples, original)
  assert.notEqual(d.compressed, d.samples)
  assert.notEqual(d.limited, d.compressed)
  assert.deepEqual(d.compressed, compressor(original, d.opts))
  assert.equal(d.limited.length, original.length)
  assert.ok(d.compressed.every(Number.isFinite))
  assert.ok(d.compressed.some((x, i) => Math.abs(x) < Math.abs(original[i])))
  assert.ok(d.limited.every(x => Math.abs(x) <= 10 ** (-1 / 20) + 1e-7))
  assert.deepEqual(Float32Array.from(d.blocks.flatMap(block => Array.from(block))), d.compressed)
})

test('installed writers preserve empty writes and splits before/at/after lookahead; fresh writers reset', () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    const lookahead = 5, boundary = Math.round(lookahead * sampleRate / 1000)
    const a = new Float32Array(boundary * 2 + 1); a[0] = 1; a[boundary] = -0.75
    const b = Float32Array.of(0.25)
    for (const process of [dynamics.compressor, dynamics.limiter, dynamics.gate]) {
      const opts = { sampleRate, lookahead }
      const empty = process(opts)
      assert.deepEqual(empty(new Float32Array(0)), new Float32Array(0))
      assert.deepEqual(empty(), new Float32Array(0))
      for (const data of [a, a, b]) {
        const expected = process(data, opts)
        assert.equal(expected.length, data.length)
        for (const split of [0, 1, boundary - 1, boundary, boundary + 1, data.length - 1, data.length]) {
          const write = process(opts)
          const chunks = [write(data.subarray(0, split)), write(new Float32Array(0)), write(data.subarray(split)), write()]
          assert.deepEqual(Float32Array.from(chunks.flatMap(chunk => Array.from(chunk))), expected)
        }
      }
    }
  }
})

test('installed EQ README uses the leaf API, preserves input and returns the supplied copy', () => {
  assert.equal(eq.parametricEq, parametricEq)
  assert.deepEqual(e.input, Float32Array.from({ length: 512 }, (_, i) => i === 0 ? 1 : 0))
  assert.notEqual(e.output, e.input)
  assert.deepEqual(e.output, parametricEq(e.input.slice(), { bands: [{ fc: 1000, Q: 1, gain: -6 }], fs: 48000 }))
  assert.ok(e.output[0] > 0 && e.output[0] < 1)
  assert.ok(e.output.every(Number.isFinite))
})

test('installed stateful EQ preserves array identity and chunk history; fresh params reset', () => {
  for (const ArrayType of [Array, Float32Array, Float64Array]) {
    for (const fs of [44100, 48000, 96000]) {
      const a = ArrayType.from({ length: 257 }, (_, i) => i === 0 ? 1 : 0)
      const b = ArrayType.from([0.25])
      const options = () => ({ fs, bands: [{ fc: 1000, Q: 1, gain: -6 }] })
      for (const data of [a, a, b]) {
        const whole = data.slice()
        assert.equal(eq.parametricEq(whole, options()), whole)
        for (const split of [0, 1, 127, 128, data.length - 1, data.length]) {
          const params = options(), first = data.slice(0, split), last = data.slice(split)
          const empty = ArrayType.from([])
          assert.equal(eq.parametricEq(first, params), first)
          assert.equal(eq.parametricEq(empty, params), empty)
          assert.equal(eq.parametricEq(last, params), last)
          assert.deepEqual([...first, ...last], [...whole])
        }
      }
    }
  }
})
