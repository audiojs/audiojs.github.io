// Tests for wav.js: the probe WAV (ffmpeg's pcm_s16le, 44-byte header) written again from its own samples, byte for byte;
// a stereo header against the RIFF WAVE fields (IBM & Microsoft 1991); clamping; and the page's listing as the module.
// Run: node --test 'lab/**/*.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wav } from './wav.js'

const file = name => readFileSync(new URL(name, import.meta.url))
const buffer = (channels, sampleRate) => ({ numberOfChannels: channels.length, sampleRate, length: channels[0].length, getChannelData: c => channels[c] })

test('wav: ffmpeg\'s 16-bit WAV, read and written again, comes back byte for byte', () => {
  const probe = file('probe/probe.wav'), view = new DataView(probe.buffer, probe.byteOffset, probe.byteLength)
  assert.equal(probe.toString('latin1', 36, 40), 'data', 'the probe has the canonical 44-byte header')
  const n = view.getUint32(40, true) / 2, x = Float32Array.from({ length: n }, (_, i) => view.getInt16(44 + 2 * i, true) / 32767)
  assert.equal(n, 2205)
  assert.deepEqual(wav(buffer([x], 44100)), new Uint8Array(probe))
})

test('wav: the RIFF WAVE fields of a stereo file, channels interleaved', () => {
  const left = Float32Array.of(0, .5, -1), right = Float32Array.of(1, -.5, 0)
  const bytes = wav(buffer([left, right], 48000)), v = new DataView(bytes.buffer), text = (a, b) => String.fromCharCode(...bytes.slice(a, b))
  assert.equal(bytes.length, 44 + 3 * 2 * 2)
  assert.equal(text(0, 4), 'RIFF'); assert.equal(v.getUint32(4, true), bytes.length - 8)
  assert.equal(text(8, 16), 'WAVEfmt '); assert.equal(v.getUint32(16, true), 16)
  assert.equal(v.getUint16(20, true), 1, 'WAVE_FORMAT_PCM')
  assert.equal(v.getUint16(22, true), 2)
  assert.equal(v.getUint32(24, true), 48000)
  assert.equal(v.getUint32(28, true), 48000 * 2 * 2, 'bytes a second')
  assert.equal(v.getUint16(32, true), 4, 'bytes a frame')
  assert.equal(v.getUint16(34, true), 16)
  assert.equal(text(36, 40), 'data'); assert.equal(v.getUint32(40, true), 12)
  // L R L R L R; ±0.5 × 32767 is ±16383.5, which Math.round takes up: 16384 and −16383
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => v.getInt16(44 + 2 * i, true)), [0, 32767, 16384, -16383, -32767, 0])
})

test('wav: samples past full scale clip at it', () => {
  const v = new DataView(wav(buffer([Float32Array.of(1.5, -2, 1e-6)], 8000)).buffer)
  assert.deepEqual([0, 1, 2].map(i => v.getInt16(44 + 2 * i, true)), [32767, -32767, 0])
})

test('the page shows wav.js as it is', () => {
  const html = file('index.html').toString(), pre = html.match(/<pre class="code" id="wav-source"><code>([\s\S]*?)<\/code><\/pre>/)?.[1]
  const shown = pre.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
  assert.equal(shown, file('wav.js').toString().trimEnd())
})
