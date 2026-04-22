const CACHE_NAME = "inr-tracker-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/inr-rates.json",
];

// Install event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        // It's okay if some resources fail to cache
        console.log("Some resources failed to cache");
      });
    }),
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event
self.addEventListener("fetch", (event) => {
  // For JSON data, try network first, fallback to cache
  if (event.request.url.includes(".json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        }),
    );
  } else {
    // For other assets, cache first, fallback to network
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      }),
    );
  }
});
