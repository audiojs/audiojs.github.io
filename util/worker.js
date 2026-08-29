// Module worker: runs a utility's process() off the main thread. One worker per page, module cached.
let mod
onmessage = async e => {
  const { id, url, audio, opts } = e.data
  const ui = { status: msg => postMessage({ id, type: 'status', msg }), progress: p => postMessage({ id, type: 'progress', p }) }
  try {
    mod ??= (await import(url)).default
    const result = await mod(audio, opts, ui)
    const transfer = []
    if (result.audio) transfer.push(...new Set(result.audio.channelData.map(c => c.buffer)))
    if (result.viz?.data) transfer.push(result.viz.data.buffer)
    for (const f of result.files || []) if (f.data?.buffer instanceof ArrayBuffer) transfer.push(f.data.buffer)
    postMessage({ id, type: 'done', result }, [...new Set(transfer)])
  } catch (err) { postMessage({ id, type: 'error', message: err.message || String(err) }) }
}
