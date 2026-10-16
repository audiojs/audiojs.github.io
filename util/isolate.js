// A page cross-origin isolated where its host sets no headers (GitHub Pages): each of its own responses given COOP and
// COEP, so ONNX Runtime's wasm runs a model on threads (SharedArrayBuffer), not on one: SCNet split a minute of
// audio on the CPU in 37 s, not 121 (M4 Max, Chromium). COEP credentialless: what the page loads from elsewhere
// (esm.sh, jsDelivr, the model's weights from Hugging Face, fonts) comes as before, without cookies. Others' responses
// pass as they are.
// A page that runs a model registers it for itself alone (util-pages.mjs `isolated`), its scope the page's folder: a
// page that frames another site's page (the lab's playgrounds) would have that frame refused under COEP.
const isolated = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' }

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).origin !== location.origin) return
  e.respondWith(fetch(e.request).then(r => {
    // a redirect not followed, or nothing to rewrite
    if (r.type === 'opaqueredirect' || r.status === 0) return r
    const headers = new Headers(r.headers)
    for (const k in isolated) headers.set(k, isolated[k])
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers })
  }))
})
