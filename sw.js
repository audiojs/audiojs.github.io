// The playground's service worker once lived here, at the root, before the playground moved to /audio/playground/: in
// browsers that still have it, it removes itself, so the site's pages are no longer passed through it. Safe to delete
// once those registrations have aged out (2027).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.registration.unregister())
