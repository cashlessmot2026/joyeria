// Service worker de ROUX: la tienda abre sin conexión y las fotos se guardan al verlas.
// Los precios del oro y Supabase NUNCA se cachean (siempre red).
const VERSION = "roux-v1";
const SHELL = ["/", "/manifest.webmanifest", "/assets/roux-logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // APIs externas: directo a la red

  // Páginas: red primero, copia guardada si no hay conexión
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); return r; }).catch(() => caches.match("/")));
    return;
  }
  // Archivos propios (js, css, fotos): copia primero y se actualiza en segundo plano
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
