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
    /* Still network first, so a new build is never hidden behind the cache — but only
       for a moment. A bare fetch fails fast on a refused connection and not at all on
       a dead one: an installed app launched against a stopped dev server or a wifi
       with no route out blocked first paint until TCP gave up, tens of seconds of
       staring at the splash. The cached shell now takes over after a second and a
       half, and the network copy still lands in the cache for the next launch. */
    const shell = () => caches.match(req).then((hit) => hit || caches.match("./"));
    const net = fetch(req).then(store);
    e.waitUntil(net.catch(() => {}));
    e.respondWith(
      Promise.race([net, new Promise((r) => setTimeout(r, 1500))]).then((res) => res || shell(), shell)
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
});
