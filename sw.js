const CACHE_NAME = 'pvpro-cache-v7.5.1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './qrcode.client.js',
    './app.js',
    './wiring.js',
    './dossier.js',
    './database.js',
    './content.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap'
];

// Install: Cache critical static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for dynamic API calls (PVGIS, Nominatim), Cache-first / Stale-While-Revalidate for app assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass cache for non-GET requests
    if (event.request.method !== 'GET') return;

    // External APIs (PVGIS / OSM) -> Network first with fallback handling in app.js
    if (url.origin.includes('nominatim.openstreetmap.org') || url.origin.includes('pvgis.mb10.org') || url.origin.includes('europa.eu')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // App core assets & CDNs -> Cache first with network fallback & cache update (Stale-While-Revalidate)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If offline and not in cache, fallback
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});
