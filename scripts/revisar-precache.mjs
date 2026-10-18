// Cuida el service worker: que no falte ningún archivo en PRECACHE_URLS, y que
// CACHE_NAME suba cuando algo de public/ cambie.
//
// Lo primero es el error que más veces se ha colado aquí: se agrega un módulo,
// se importa desde otro, y como el navegador lo descarga igual estando online
// nadie lo nota... hasta que alguien abre la app sin señal y no arranca.
//
// Lo segundo costó caro de verdad. El arreglo de la miniatura (commit 1ba5c9b)
// estaba bien escrito y desplegado, pero ese commit no subió CACHE_NAME: el
// service worker del teléfono siguió sirviendo el CSS viejo de su caché y el
// arreglo nunca llegó. En la computadora se veía perfecto. Un cambio que no
// sube la versión es un cambio que no existe para quien ya tiene la app.
//
// Por eso aquí se guarda una HUELLA de todo lo que se cachea. Si no coincide,
// el número sube solo.
//
// Uso:  node scripts/revisar-precache.mjs             → revisa y sube la versión si hace falta
//       node scripts/revisar-precache.mjs --revisar   → solo avisa, no toca nada (para un hook o CI)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const RAIZ = 'public';
const SW = join(RAIZ, 'service-worker.js');
// Pesados y de uso puntual: se cachean solos la primera vez que se usan.
const DIFERIDOS = new Set([
  'vendor/xlsx.js', 'vendor/exceljs.min.js', 'vendor/jspdf.js', 'vendor/jspdf-autotable.js', 'vendor/chart.js',
  // El codificador WebP: 320 KB que solo baja el teléfono que no sabe hacer
  // WebP por su cuenta. El service worker lo guarda la primera vez que se usa.
  'vendor/webp-enc.js', 'vendor/webp_enc.wasm',
]);
const IGNORAR = new Set(['index.html', 'service-worker.js']);

const soloRevisar = process.argv.includes('--revisar');
const sw = readFileSync(SW, 'utf8');

// --- 1. ¿está todo en la lista? ---------------------------------------------

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
  console.error('\nAgrégalos y vuelve a correr esto.');
  process.exit(1);
}
console.log(`✓ Los ${todos.length} archivos de public/ están cubiertos (${DIFERIDOS.size} diferidos a propósito).`);

// --- 2. ¿cambió algo desde la última versión? -------------------------------

/** El service worker sin sus dos líneas variables: así un cambio de versión
 *  no se cuenta a sí mismo como cambio, pero tocar su lógica sí cuenta. */
const swEstable = sw
  .replace(/const CACHE_NAME = '[^']*';/, '')
  .replace(/(?:\/\/ Huella[^\n]*\n(?:\/\/[^\n]*\n)*)?const HUELLA = '[^']*';\n?/, '');

const huella = createHash('sha1');
for (const archivo of [...todos].sort()) {
  huella.update(archivo);
  huella.update(archivo === 'service-worker.js' ? swEstable : readFileSync(join(RAIZ, archivo)));
}
const ahora = huella.digest('hex').slice(0, 12);
const guardada = (sw.match(/const HUELLA = '([^']*)';/) || [])[1] || null;

if (guardada === ahora) {
  console.log(`✓ Nada cambió desde ${(sw.match(/const CACHE_NAME = '([^']*)';/) || [])[1]}. No hace falta subir la versión.`);
  process.exit(0);
}

const versionVieja = (sw.match(/const CACHE_NAME = '([^']*)';/) || [])[1];
const n = Number((versionVieja.match(/(\d+)$/) || [])[1]);
if (!Number.isFinite(n)) {
  console.error(`✗ No entiendo el número de CACHE_NAME ("${versionVieja}"). Súbelo a mano.`);
  process.exit(1);
}
const versionNueva = versionVieja.replace(/\d+$/, String(n + 1));

if (soloRevisar) {
  console.error(`✗ public/ cambió y CACHE_NAME sigue en ${versionVieja}.`);
  console.error('  Quien ya tenga la app instalada NO va a recibir el cambio.');
  console.error('  Corre:  npm run precache');
  process.exit(1);
}

let nuevo = guardada === null
  ? sw
  : sw.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = '${versionNueva}';`);
nuevo = guardada !== null
  ? nuevo.replace(/const HUELLA = '[^']*';/, `const HUELLA = '${ahora}';`)
  // La primera vez hay que crear la línea, justo debajo de CACHE_NAME.
  : nuevo.replace(
    /(const CACHE_NAME = '[^']*';)/,
    `$1\n// Huella de todo lo que se cachea. La pone \`npm run precache\`: si no coincide,\n`
    + `// sube CACHE_NAME solo. No se edita a mano.\nconst HUELLA = '${ahora}';`);
writeFileSync(SW, nuevo);

// La primera corrida solo deja la huella puesta: no hay con qué comparar
// todavía, así que subir la versión sería gratuito.
console.log(guardada === null
  ? `✓ Huella puesta (${ahora}). De aquí en adelante la versión sube sola.`
  : `✓ public/ cambió → CACHE_NAME ${versionVieja} → ${versionNueva}. Súbelo con el despliegue.`);
