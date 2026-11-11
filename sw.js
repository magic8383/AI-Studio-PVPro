const CACHE_NAME = 'pvpro-cache-v10.0';
const STATIC_ASSETS = [
    './',
    './index.html',
    './qrcode.client.js',
    './app.js',
    './wiring.js',
    './dossier.js',
    './telemetry.js',
    './database.js',
    './content.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './favicon-32.png',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap'
];

// Validate that a response is a genuine app asset and NOT an Nginx warmup.html / error fallback page
function isValidCacheableResponse(requestUrl, response) {
    if (!response || response.status !== 200) return false;
    if (response.type !== 'basic' && response.type !== 'cors') return false;

    const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
    const pragma = (response.headers.get('pragma') || '').toLowerCase();
    if (cacheControl.includes('no-store') || pragma.includes('no-cache')) {
        return false;
    }

    if (requestUrl.origin === self.location.origin) {
        // Must carry the Express server signature header (Nginx warmup.html does not have this header)
        const serverHeader = response.headers.get('x-pvpro-server');
        if (!serverHeader) return false;

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (requestUrl.pathname.endsWith('.js') && !contentType.includes('javascript')) {
            return false;
        }
        if (requestUrl.pathname.endsWith('.json') && !contentType.includes('json')) {
            return false;
        }
    }

    return true;
}

// Install: Cache critical static assets safely without failing or poisoning if server is warming up
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.allSettled(
                STATIC_ASSETS.map(async (assetUrl) => {
                    try {
                        const req = new Request(assetUrl, { cache: 'reload' });
                        const res = await fetch(req);
                        const parsedUrl = new URL(req.url, self.location.origin);
                        if (isValidCacheableResponse(parsedUrl, res)) {
                            await cache.put(req, res);
                        }
                    } catch (e) {
                        // Ignore individual prefetch failure during install
                    }
                })
            );
        })
    );
});

// Activate: Clean all old caches immediately and claim clients
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

// Fetch: Network-first for same-origin app files (prevents stale/warmup lockouts), with verified offline cache fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass service worker entirely for local API requests (/api/*) and sw.js itself
    if (url.pathname.startsWith('/api/') || url.pathname.endsWith('/sw.js')) {
        return;
    }

    // Bypass cache for non-GET requests
    if (event.request.method !== 'GET') return;

    // External APIs (PVGIS / OSM / Open-Meteo) -> Network first with JSON fallback
    if (
        url.origin.includes('nominatim.openstreetmap.org') ||
        url.origin.includes('pvgis.mb10.org') ||
        url.origin.includes('europa.eu') ||
        url.origin.includes('open-meteo.com')
    ) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Same-origin app shell & JS modules -> Network-First with verified cache update & offline fallback
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (isValidCacheableResponse(url, networkResponse)) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                        return networkResponse;
                    }
                    // If Nginx returned warmup.html (no x-pvpro-server header), try serving verified cached app shell if available
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse && isValidCacheableResponse(url, cachedResponse)) {
                            return cachedResponse;
                        }
                        return networkResponse;
                    });
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // External CDN assets (Tailwind, Chart.js, Google Fonts) -> Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (isValidCacheableResponse(url, networkResponse)) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});
