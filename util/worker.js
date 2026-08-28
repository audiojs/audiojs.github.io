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
    postMessage({ id, type: 'done', result }, transfer)
  } catch (err) { postMessage({ id, type: 'error', message: err.message || String(err) }) }
}
