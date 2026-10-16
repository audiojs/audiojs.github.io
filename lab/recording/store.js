// Takes kept as they come: each chunk a MediaRecorder hands over goes into IndexedDB at once, so a reload, a crash or
// a closed tab loses only the chunk being made. A take that never reached its end is still there on the next visit.
// takes: { id, type, started }; chunks: [id, n] → bytes (bytes, not Blobs: every engine stores those)
const NAME = 'lab-recording'
let db = null
function base() {
  return db ||= new Promise((ok, fail) => {
    const r = indexedDB.open(NAME, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('takes', { keyPath: 'id' }); r.result.createObjectStore('chunks') }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}
// one transaction, done when it commits (the 'complete' event: the write is in the database). A chunk's is 'strict':
// complete once on the disk itself, where the browser honours the hint
async function tx(stores, mode, work, durability = 'default') {
  const t = (await base()).transaction(stores, mode, { durability })
  const result = work(t)
  await new Promise((ok, fail) => { t.oncomplete = ok; t.onerror = t.onabort = () => fail(t.error) })
  return result
}
const all = request => new Promise((ok, fail) => { request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error) })
const range = id => IDBKeyRange.bound([id, 0], [id, Infinity])

export const begin = (id, type) => tx('takes', 'readwrite', t => t.objectStore('takes').put({ id, type, started: Date.now() }))
export const put = (id, n, bytes) => tx('chunks', 'readwrite', t => t.objectStore('chunks').put(bytes, [id, n]), 'strict')

// every take kept, with its chunks' count and bytes
export async function takes() {
  const list = await tx('takes', 'readonly', t => all(t.objectStore('takes').getAll()))
  return Promise.all(list.map(async take => {
    const chunks = await chunksOf(take.id)
    return { ...take, chunks: chunks.length, bytes: chunks.reduce((n, c) => n + c.byteLength, 0) }
  }))
}
const chunksOf = id => tx('chunks', 'readonly', t => all(t.objectStore('chunks').getAll(range(id))))
// a take's file: its chunks, in order, end to end
export async function file(id, type) { return new Blob(await chunksOf(id), { type }) }
export const remove = id => tx(['takes', 'chunks'], 'readwrite', t => { t.objectStore('takes').delete(id); t.objectStore('chunks').delete(range(id)) })
