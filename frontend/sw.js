const VERSION = "stockd-v1";
const STATIC_CACHE = `${VERSION}-static`;
const ASSETS = ["./", "./index.html", "./css/app.css", "./js/app.js", "./js/api.js", "./js/demo-data.js", "./assets/icon.svg", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached ?? caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (response.ok) event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())));
    return response;
  })));
});

