/* Offline cache. Vite fingerprints the assets, so they are immutable and cached
   forever; index.html is not, so it goes network-first — otherwise a new build
   ships and the phone keeps booting the old one off the cache. */
// ponytail: superseded bundles stay cached until CACHE is bumped, which drops the
// whole cache on activate. Fine at a few hundred KB a build; if it ever matters,
// prune entries not in the current index.html instead.
const CACHE = "kotoba-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const store = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(store).catch(() => caches.match(req).then((hit) => hit || caches.match("./"))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
});
