// Busca una imagen para cada producto sin foto, en bancos de imágenes libres.
//
// Uso:  node scripts/buscar-imagenes.mjs                 → busca para todos los que no tienen foto
//       node scripts/buscar-imagenes.mjs --limite 20     → solo los primeros 20
//       node scripts/buscar-imagenes.mjs --todas         → también los que ya tienen foto
//
// Deja `candidatas.json`, que después come `fotos-desde-url.mjs`.
//
// Por qué estas dos fuentes y no Google: Openverse y Wikimedia Commons dicen
// la licencia de cada imagen, y aquí se piden SOLO las que permiten uso
// comercial y modificación. Una foto bajada de Google es casi siempre de la
// marca o de otra tienda, y ponerla en un catálogo que vende es problema
// ajeno que se vuelve propio. Igual se guarda de dónde salió y quién la hizo,
// en el campo `origen` de la foto.
//
// Las APIs buscan en inglés, así que cada producto se traduce con la tabla de
// abajo. Las marcas se quitan a propósito ("Lapiz Kores" → "pencil"): lo que
// se busca es el objeto, no la marca.

import { writeFileSync } from 'node:fs';
import { productos } from './admin.mjs';

const CANDIDATAS_POR_PRODUCTO = 10;

// Orden: gana la primera que coincida. Lo específico va arriba.
const TERMINOS = [
  [/liquipeiper|corrector/i,            'correction fluid bottle'],
  [/borrador|goma de borrar/i,          'rubber eraser'],
  [/sacapunta|saca punta/i,             'pencil sharpener'],
  [/portamina/i,                        'mechanical pencil'],
  [/minas de repuesto/i,                'pencil lead refill'],
  [/tapa para lapiz/i,                  'pencil cap'],
  [/bicolor/i,                          'red and blue pencil'],
  [/creyones|colores (kores|neon|norma)|colores$/i, 'colored pencils'],
  [/boligrafo/i,                        'ballpoint pen'],
  [/lapiz|lapices/i,                    'graphite pencil'],
  [/resaltador|subrayador/i,            'highlighter pen'],
  [/marcadores? para cd/i,              'cd marker pen'],
  [/marcador|sharpie/i,                 'permanent marker pen'],
  [/tijeras? para ni/i,                 'kids safety scissors'],
  [/tijera/i,                           'scissors'],
  [/cuter|cutter/i,                     'utility knife cutter'],
  [/compas/i,                           'drawing compass tool'],
  [/set de regla/i,                     'geometry set squares'],
  [/regla/i,                            'ruler measuring'],
  [/grapadora/i,                        'stapler'],
  [/saca grapa/i,                       'staple remover'],
  [/grapas/i,                           'staples box'],
  [/perforadora|abre hueco/i,           'hole punch'],
  [/clips/i,                            'paper clips'],
  [/chinches/i,                         'push pins'],
  [/gancho sujetador/i,                 'binder clips'],
  [/mini gancho de ropa/i,              'mini wooden clothespins'],
  [/gancho de (ropa|metal)/i,           'clothes hanger'],
  [/notas adhesivas/i,                  'sticky notes'],
  [/separadores/i,                      'index dividers tabs'],
  [/sobre manila/i,                     'manila envelope'],
  [/carpeta 3 aros|carpeta de 3 aros/i, 'ring binder'],
  [/carpeta|folder/i,                   'file folder'],
  [/almohadilla/i,                      'ink stamp pad'],
  [/tinta para almohadilla/i,           'stamp ink bottle'],
  [/cinta aislante/i,                   'electrical tape roll'],
  [/cinta doble/i,                      'double sided tape'],
  [/cinta/i,                            'adhesive tape roll'],
  [/silicon(a)? liquida/i,              'liquid glue bottle'],
  [/silicon|barra de silicona/i,        'hot glue sticks'],
  [/pega en barra/i,                    'glue stick'],
  [/pega loka|pega loca/i,              'super glue tube'],
  [/pega/i,                             'white school glue'],
  [/foami|fomi/i,                       'craft foam sheet'],
  [/cartulina/i,                        'poster board sheet'],
  [/plastilina/i,                       'modeling clay sticks'],
  [/tempera/i,                          'tempera paint jars'],
  [/pintura/i,                          'poster paint jar'],
  [/pincel/i,                           'paint brush'],
  [/limpia pipa/i,                      'pipe cleaners craft'],
  [/palillos de altura/i,               'wooden craft sticks'],
  [/lanas/i,                            'yarn ball'],
  [/papel crepe/i,                      'crepe paper roll'],
  [/papel seda/i,                       'tissue paper sheets'],
  [/lustrillo/i,                        'glossy colored paper'],
  [/papel bond/i,                       'printer paper ream'],
  [/acetato/i,                          'transparency film sheet'],
  [/milimetrado/i,                      'graph paper pad'],
  [/block de dibujo|libro de artes/i,   'sketch pad'],
  [/block|bloc /i,                      'writing notepad'],
  [/hoja de examen/i,                   'lined paper sheet'],
  [/ficha/i,                            'index cards'],
  [/libro (contable|de acta)/i,         'accounting ledger book'],
  [/talonario/i,                        'receipt book'],
  [/agenda/i,                           'planner notebook'],
  [/cuaderno|libreta/i,                 'spiral notebook'],
  [/stiker|sticker/i,                   'label stickers sheet'],
  [/calculadora/i,                      'pocket calculator'],
  [/cartuchera|estuche/i,               'pencil case'],
  [/lonchera/i,                         'lunch box'],
  [/paraguas/i,                         'umbrella'],
  [/curitas/i,                          'adhesive bandages'],
  [/pañitos/i,                          'cleaning cloth'],
  [/globo de cumplea/i,                 'birthday foil balloon'],
  [/globos/i,                           'colorful balloons'],
  [/caja/i,                             'gift box'],
  [/lazo/i,                             'gift ribbon bow'],
  [/peluche/i,                          'plush keychain'],
  [/kit de lapices/i,                   'stationery set'],
];

const termino = (p) => {
  for (const [patron, ingles] of TERMINOS) if (patron.test(p.nombre)) return ingles;
  return null;   // sin término: se busca a mano, no se inventa
};

/** Openverse: ya filtra por licencia de uso comercial y modificable. */
async function openverse(q) {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', q);
  u.searchParams.set('page_size', '12');
  u.searchParams.set('license_type', 'commercial,modification');
  const r = await fetch(u, { headers: { 'User-Agent': 'MisDetallitos/1.0' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map((x) => ({
    url: x.url,
    fuente: `Openverse · ${x.source} · ${x.license?.toUpperCase?.() || ''} · ${x.creator || 'sin autor'}`,
    licencia: x.license,
    pagina: x.foreign_landing_url,
  }));
}

/** Wikimedia Commons: todo lo de ahí es libre; se pide la versión de 800px. */
async function commons(q) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('format', 'json');
  u.searchParams.set('generator', 'search');
  u.searchParams.set('gsrnamespace', '6');          // 6 = archivos
  u.searchParams.set('gsrsearch', `${q} filetype:bitmap`);
  u.searchParams.set('gsrlimit', '12');
  u.searchParams.set('prop', 'imageinfo');
  u.searchParams.set('iiprop', 'url|extmetadata');
  u.searchParams.set('iiurlwidth', '1000');
  const r = await fetch(u, { headers: { 'User-Agent': 'MisDetallitos/1.0' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return [];
  const j = await r.json();
  const paginas = Object.values(j.query?.pages || {});
  return paginas.map((p) => {
    const info = p.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    const limpio = (v) => String(v || '').replace(/<[^>]*>/g, '').trim();
    return {
      url: info.thumburl || info.url,
      fuente: `Wikimedia Commons · ${limpio(meta.LicenseShortName?.value) || 'libre'} · ${limpio(meta.Artist?.value) || 'sin autor'}`,
      licencia: limpio(meta.LicenseShortName?.value),
      pagina: info.descriptionurl,
    };
  }).filter((x) => x.url);
}

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : null;
};

const todos = await productos();
let objetivo = todos.filter((p) => p.tipo !== 'servicio');
if (!process.argv.includes('--todas')) objetivo = objetivo.filter((p) => !p.tieneFoto);
const limite = Number(arg('--limite')) || objetivo.length;
objetivo = objetivo.slice(0, limite);

const candidatas = [];
const sinTermino = [];

for (const [n, p] of objetivo.entries()) {
  const q = termino(p);
  if (!q) { sinTermino.push(p.nombre); continue; }
  const [a, b] = await Promise.all([openverse(q), commons(q)]);
  // Primero Wikimedia (suele traer el objeto solo y bien iluminado), luego Openverse.
  const opciones = [...b, ...a].slice(0, CANDIDATAS_POR_PRODUCTO);
  if (!opciones.length) { sinTermino.push(`${p.nombre} (sin resultados para "${q}")`); continue; }
  candidatas.push({ id: p.id, nombre: p.nombre, busqueda: q, ...opciones[0], alternativas: opciones.slice(1) });
  console.log(`${String(n + 1).padStart(3)}/${objetivo.length}  ${p.nombre}  →  "${q}"  (${opciones.length} opciones)`);
}

writeFileSync('candidatas.json', JSON.stringify(candidatas, null, 2));
console.log(`\n${candidatas.length} con candidata · ${sinTermino.length} sin nada`);
if (sinTermino.length) {
  console.log('\nEstos hay que buscarlos a mano:');
  for (const s of sinTermino) console.log('   ·', s);
}
console.log('\nSiguiente:  node scripts/fotos-desde-url.mjs candidatas.json');
