// ============================================================
//  CODYWEB.COM — sw.js (Service Worker)
//  Permite instalar la app y que cargue rápido / offline
// ============================================================

// IMPORTANTE: sube este número cada vez que hagas un deploy con cambios
// de código (api.js, script.js, index.html, etc). Eso fuerza a que
// los celulares con la app instalada bajen la versión nueva.
const CACHE_NAME = 'codyweb-v2';

// Archivos que casi nunca cambian → estrategia "caché primero"
const ARCHIVOS_ESTATICOS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Archivos de código/lógica de la app → estrategia "red primero"
// (siempre intenta traer la versión más nueva del servidor)
const ARCHIVOS_CODIGO = [
  './',
  './index.html',
  './login.html',
  './style.css',
  './script.js',
  './api.js',
  './supabaseClient.js',
];

// Al instalar: guardamos todo en caché como respaldo offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([...ARCHIVOS_ESTATICOS, ...ARCHIVOS_CODIGO])
    )
  );
  self.skipWaiting(); // activa el nuevo SW de inmediato, sin esperar a cerrar pestañas
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
  self.clients.claim(); // toma control de las pestañas abiertas de inmediato
});

function esArchivoDeCodigo(url) {
  return ARCHIVOS_CODIGO.some((archivo) => {
    const nombre = archivo.replace('./', '');
    return nombre === '' ? url.endsWith('/') : url.endsWith(nombre);
  });
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // No cachear peticiones a Supabase (necesitan datos siempre actualizados)
  if (url.includes('supabase.co')) {
    return; // deja pasar la petición normal a internet
  }

  // Código de la app (HTML, JS, CSS propio) → RED PRIMERO
  // Si hay internet, siempre trae la versión más nueva del servidor.
  // Si falla (sin internet), recién ahí usa lo que haya en caché.
  if (esArchivoDeCodigo(url) || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Archivos estáticos (íconos, manifest) → CACHÉ PRIMERO
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
        .catch(() => cacheado);

      return cacheado || fetchPromise;
    })
  );
});
