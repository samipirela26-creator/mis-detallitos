// service-worker.js
//
// REGLA: si agregas un archivo a public/, agrégalo a PRECACHE_URLS y SUBE el
// número de CACHE_NAME. Si no, el navegador seguirá sirviendo la versión vieja.
//
// Estrategia:
//  - La cáscara (html, css, js, iconos): cache-first. Abre sin internet.
//  - El SDK de Firebase (gstatic): stale-while-revalidate, también cacheado.
//  - Los datos NO pasan por aquí: de eso se encarga el caché propio de Firestore.

const CACHE_NAME = 'detallitos-v5';

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'icons/icono-192.png',
  'icons/icono-512.png',
  'icons/icono-maskable-512.png',
  'icons/logo-256.webp',
  'icons/logo.webp',
  'css/1-base.css',
  'css/2-layout.css',
  'css/3-componentes.css',
  'css/4-pantallas.css',
  'vendor/fuse.mjs',
  'js/app.js',
  'js/reports/analisis.js',
  'js/reports/export-excel.js',
  'js/reports/export-pdf.js',
  'js/reports/graficos.js',
  'js/reports/panel.js',
  'js/reports/recibo.js',
  'js/ui/avisos.js',
  'js/ui/html.js',
  'js/ui/pantalla-entrar.js',
  'js/ui/pin.js',
  'js/ui/teclado.js',
  'js/data/auditoria.js',
  'js/data/busqueda.js',
  'js/data/caja.js',
  'js/data/catalogo.js',
  'js/data/clientes.js',
  'js/data/fotos.js',
  'js/data/gastos.js',
  'js/data/idb.js',
  'js/data/inventario.js',
  'js/data/productos.js',
  'js/data/sinonimos.js',
  'js/data/tasas.js',
  'js/data/ventas.js',
  'js/core/dinero.js',
  'js/core/estado.js',
  'js/core/firebase-config.js',
  'js/core/firebase.js',
  'js/core/router.js',
  'js/core/sesion.js',
  'js/core/texto.js',
  'js/features/buscador.js',
  'js/features/caja.js',
  'js/features/clientes.js',
  'js/features/config.js',
  'js/features/estudio-fotos.js',
  'js/features/gastos.js',
  'js/features/importar-excel.js',
  'js/features/pos.js',
  'js/features/productos-crud.js',
];

const SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(async (c) => {
      // Uno por uno: si un archivo falla, no se cae toda la instalación.
      await Promise.all(PRECACHE_URLS.map((u) => c.add(u).catch((e) => console.warn('[sw] no cacheó', u, e))));
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firestore, Auth, Storage: siempre a la red, nunca cacheados por nosotros.
  if (/googleapis\.com|firebaseio\.com|firebasestorage/.test(url.hostname)) return;

  if (req.url.startsWith(SDK)) {
    ev.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin === location.origin) {
    // xlsx, chart y jspdf no van en el precache (pesan); se guardan la primera
    // vez que se usan y desde ahí funcionan sin internet.
    ev.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Navegación sin red y sin caché: devolver la cáscara.
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  const red = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || red;
}
