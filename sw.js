// ============================================================
//  CODYWEB.COM — sw.js (Service Worker)
//  Permite instalar la app y que cargue rápido / offline
// ============================================================

const CACHE_NAME = 'codyweb-v1';

// Archivos propios que guardamos en caché (la "cáscara" de la app)
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './login.html',
  './style.css',
  './script.js',
  './api.js',
  './supabaseClient.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Al instalar: guardamos los archivos base en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_CACHE))
  );
  self.skipWaiting();
});

// Al activar: borramos cachés viejas de versiones anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Al pedir un archivo:
// - Si es Supabase (datos en vivo) → siempre ir a internet, nunca caché
// - Si es un archivo propio → usar caché primero, y de fondo actualizar
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // No cachear peticiones a Supabase (necesitan datos siempre actualizados)
  if (url.includes('supabase.co')) {
    return; // deja pasar la petición normal a internet
  }

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const fetchPromise = fetch(event.request)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => cacheado); // sin internet: usar lo que haya en caché

      return cacheado || fetchPromise;
    })
  );
});
