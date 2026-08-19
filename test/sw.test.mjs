/* The service worker's navigation branch, driven against stub caches and fetch.
   No framework: node test/sw.test.mjs  (or: npm test)

   Worth a suite of its own because it is the only code between the app icon and
   first paint, and its failure mode is invisible on a desk: every path here is
   fast on localhost, and the one that used to hang for tens of seconds — a network
   that neither answers nor refuses — is the one a phone meets most.

   Timers are scaled 100x so the 1500ms wait costs 15ms here. The race is real,
   only the clock is short. */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`  FAIL ${label}\n       got  ${got}\n       want ${want}`);
};

const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

/* A navigate request through the worker, with the network and the cache both
   supplied by the caller. Returns what the browser would have painted. */
function launch({ network, cached }) {
  const handlers = {};
  const put = [];
  const store = new Map(Object.entries(cached || {}));

  const caches = {
    match: (req) => Promise.resolve(store.get(typeof req === "string" ? req : req.url)),
    open: () => Promise.resolve({ put: (req, res) => put.push([req.url, res]) }),
    keys: () => Promise.resolve([]),
  };

  const self = {
    addEventListener: (type, fn) => (handlers[type] = fn),
    location: { origin: "https://example.test" },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };

  new Function("self", "caches", "fetch", "setTimeout", "URL", src)(
    self,
    caches,
    () => network(),
    (fn, ms) => globalThis.setTimeout(fn, ms / 100),
    URL
  );

  const req = { method: "GET", url: "https://example.test/", mode: "navigate" };
  let painted, waited;
  handlers.fetch({
    request: req,
    respondWith: (p) => (painted = p),
    waitUntil: (p) => (waited = p),
  });
  return { painted, waited, put };
}

const res = (tag, ok = true) => ({ ok, tag, clone: () => ({ tag: tag + ":copy" }) });
const after = (ms, v) => new Promise((r) => globalThis.setTimeout(() => r(v), ms));

const shell = { "https://example.test/": res("cached-shell") };

const run = async () => {
  /* A network that answers promptly still wins: a fresh build is never hidden
     behind the cache when there is a working connection. */
  {
    const { painted, put } = launch({ network: () => Promise.resolve(res("network")), cached: shell });
    eq((await painted).tag, "network", "fast network wins the race");
    await after(5);
    eq(put.length, 1, "the network response is cached for the next launch");
    eq(put[0][1].tag, "network:copy", "the cached copy is the clone, not the consumed body");
  }

  /* The regression this file exists for. A network that neither answers nor
     refuses used to block first paint until TCP gave up. */
  {
    const t0 = Date.now();
    const { painted, put } = launch({ network: () => after(60, res("network")), cached: shell });
    eq((await painted).tag, "cached-shell", "a stalled network falls back to the cached shell");
    eq(Date.now() - t0 < 40, true, "the fallback does not wait for the network");
    await after(60);
    eq(put.length, 1, "the slow response still reaches the cache once it lands");
  }

  /* Offline, refused, DNS failure — the old fast-failing path, still covered. */
  {
    const { painted } = launch({ network: () => Promise.reject(new Error("offline")), cached: shell });
    eq((await painted).tag, "cached-shell", "a rejected fetch falls back to the cached shell");
  }

  /* A deep link the cache has never seen falls back to the app root, which is the
     only entry the SPA has. */
  {
    const { painted } = launch({
      network: () => Promise.reject(new Error("offline")),
      cached: { "./": res("root-shell") },
    });
    eq((await painted).tag, "root-shell", "an uncached navigation falls back to the app root");
  }

  /* A 404 or 500 must not evict the good shell. */
  {
    const { painted, put } = launch({ network: () => Promise.resolve(res("error-page", false)), cached: shell });
    eq((await painted).tag, "error-page", "an error response is still what the network said");
    await after(5);
    eq(put.length, 0, "a failed response is never cached over the working shell");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

console.log("service worker navigation");
run();
