const CACHE = "orgfinan-v6.8.0";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./refinements.css",
  "./app.js",
  "./financial-validation.js",
  "./vendor/supabase.min.js",
  "./vendor/chart.umd.min.js",
  "./manifest.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("orgfinan-") && key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never intercept Supabase, other origins, authorization-bearing requests or API routes.
  if (url.origin !== self.location.origin || event.request.headers.has("authorization") || url.searchParams.has("access_token")) return;
  const allowed = new Set(ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname));
  if (!allowed.has(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        if (event.request.mode === "navigate") return (await cache.match(new URL("./index.html", self.registration.scope).pathname)) || Response.error();
        return Response.error();
      })
  );
});
