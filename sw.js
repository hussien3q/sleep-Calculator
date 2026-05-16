// Service Worker:
// A small background script that stores important project files in the browser.
// After the first visit, the browser can load these cached files without internet.
const CACHE = 'sleep-calc-v13';

// Keep this list updated whenever you add important local files.
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
];

// Install event: open a cache and save all core files.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );

  // Activate the new service worker immediately after install.
  self.skipWaiting();
});

// Activate event: remove old cache versions so the app does not use stale files.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch event:
// For local development, try the network first so new HTML/CSS/JS updates appear quickly.
// If the user is offline, fall back to the cached version.
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, copy));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
