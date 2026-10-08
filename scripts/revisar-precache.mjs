// Avisa si algún archivo de public/ se quedó fuera de PRECACHE_URLS.
//
// Es el error que más veces se ha colado en este proyecto: se agrega un módulo,
// se importa desde otro, y como el navegador lo descarga igual estando online
// nadie lo nota... hasta que alguien abre la app sin señal y no arranca.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = 'public';
const SW = join(RAIZ, 'service-worker.js');
// Pesados y de uso puntual: se cachean solos la primera vez que se usan.
const DIFERIDOS = new Set(['vendor/xlsx.js', 'vendor/jspdf.js', 'vendor/jspdf-autotable.js', 'vendor/chart.js']);
const IGNORAR = new Set(['index.html', 'service-worker.js']);

const sw = readFileSync(SW, 'utf8');
const bloque = sw.slice(sw.indexOf('PRECACHE_URLS'), sw.indexOf('];', sw.indexOf('PRECACHE_URLS')));
const enPrecache = new Set([...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]));

const todos = [];
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else todos.push(relative(RAIZ, ruta));
  }
})(RAIZ);

const faltan = todos.filter((f) =>
  !IGNORAR.has(f) && !DIFERIDOS.has(f) && !f.endsWith('.example.js') && !enPrecache.has(f));

if (faltan.length) {
  console.error('✗ Faltan en PRECACHE_URLS del service worker:');
  for (const f of faltan) console.error('   ' + f);
  console.error('\nAgrégalos y SUBE el número de CACHE_NAME.');
  process.exit(1);
}
console.log(`✓ Los ${todos.length} archivos de public/ están cubiertos (${DIFERIDOS.size} diferidos a propósito).`);
