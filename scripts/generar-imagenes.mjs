// Genera con IA la foto de cada producto sin foto, sobre fondo blanco.
//
// Uso:
//   node scripts/generar-imagenes.mjs --prueba            → muestra los textos que mandaría, no gasta nada
//   node scripts/generar-imagenes.mjs --limite 5          → genera 5 (para ver cómo salen antes de soltar la plata)
//   node scripts/generar-imagenes.mjs                     → genera todas las que faltan
//   node scripts/generar-imagenes.mjs --subir             → además las guarda en el inventario
//
// La llave va en `.secretos/clave-imagenes.txt` (una línea, nada más) o en la
// variable OPENAI_API_KEY. Esa carpeta está en .gitignore.
//
// Por qué generar y no buscar: ya se buscó. De 159 productos, los bancos de
// imágenes libres dieron 20 útiles; el resto son cosas concretas de esta
// papelería ("Sacapunta capibara", "Borrador Hello Kitty") que no existen en
// ningún banco. Y bajarlas de Google es usar fotos con dueño en un catálogo
// que vende.
//
// Las imágenes salen todas con el mismo encuadre y el mismo fondo a propósito:
// un catálogo parejo es lo que lo hace ver serio, y es justo lo que no se podía
// conseguir buscando.
//
// Cuesta plata: ~$0,04 por imagen con gpt-image-1. Las 139 son unos $5,50.
// Por eso --prueba no gasta nada y --limite deja ver cómo salen primero.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { productos, col } from './admin.mjs';

const MODELO = 'gpt-image-1';
const CARPETA = 'imagenes-generadas';
const LADO = 800;
const TOPE_BYTES = 900 * 1024;

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : null;
};
const prueba = process.argv.includes('--prueba');
const subir = process.argv.includes('--subir');

/** Qué es cada cosa, en inglés y sin marcas: el modelo responde mucho mejor,
 *  y la marca no se pide a propósito (ni se puede dibujar un logo ajeno). */
const QUE_ES = [
  [/liquipeiper|corrector/i, 'a bottle of white correction fluid'],
  [/borrador|goma de borrar/i, 'a rubber eraser'],
  [/sacapunta|saca punta/i, 'a small pencil sharpener'],
  [/portamina/i, 'a mechanical pencil'],
  [/minas de repuesto/i, 'a tube of pencil lead refills'],
  [/boligrafo|boligrafos/i, 'a ballpoint pen'],
  [/lapiz|lapices/i, 'a graphite pencil'],
  [/creyones|colores/i, 'a set of colored pencils'],
  [/resaltador|subrayador/i, 'a highlighter pen'],
  [/marcador/i, 'a permanent marker pen'],
  [/tijera/i, 'a pair of scissors'],
  [/cuter/i, 'a utility knife'],
  [/compas/i, 'a drawing compass'],
  [/regla/i, 'a straight ruler'],
  [/grapadora/i, 'a stapler'],
  [/grapas/i, 'a box of staples'],
  [/perforadora|abre hueco/i, 'a paper hole punch'],
  [/clips/i, 'metal paper clips'],
  [/chinches/i, 'colored push pins'],
  [/carpeta|folder/i, 'a document folder'],
  [/sobre manila/i, 'a manila envelope'],
  [/separadores/i, 'a set of index dividers'],
  [/cinta/i, 'a roll of adhesive tape'],
  [/silicon|silicona/i, 'a glue stick for a hot glue gun'],
  [/pega/i, 'a bottle of white school glue'],
  [/foami|fomi/i, 'a sheet of craft foam'],
  [/cartulina/i, 'a sheet of poster board'],
  [/plastilina/i, 'sticks of modeling clay'],
  [/tempera|pintura/i, 'a jar of poster paint'],
  [/pincel/i, 'a paint brush'],
  [/cuaderno|libreta/i, 'a spiral notebook'],
  [/block|bloc /i, 'a writing notepad'],
  [/papel/i, 'a stack of paper sheets'],
  [/ficha/i, 'blank index cards'],
  [/libro/i, 'a hardcover ledger book'],
  [/globo/i, 'inflated party balloons'],
  [/caja/i, 'a small gift box'],
  [/lazo/i, 'a gift ribbon bow'],
  [/peluche/i, 'a small plush keychain'],
  [/cartuchera/i, 'a zippered pencil case'],
  [/lonchera/i, 'a lunch box'],
  [/calculadora/i, 'a small pocket calculator'],
  [/paraguas/i, 'a folding umbrella'],
  // Estos quedaban fuera en la primera pasada: cada uno es su propio objeto y
  // ninguna regla de arriba los agarraba.
  [/gancho sujetador/i, 'black binder clips'],
  [/notas adhesivas/i, 'a stack of yellow sticky notes'],
  [/tinta para almohadilla/i, 'a small bottle of stamp ink'],
  [/lanas/i, 'balls of colored yarn'],
  [/limpia pipa/i, 'colorful craft pipe cleaners'],
  [/palillos de altura/i, 'wooden craft sticks'],
  [/acetato/i, 'a clear transparency plastic sheet'],
  [/agenda/i, 'a daily planner notebook'],
  [/talonario/i, 'a carbon copy receipt book'],
  [/curitas/i, 'adhesive bandages'],
  // El mini va ANTES: gana la primera regla que coincida, y "mini gancho de
  // ropa" caería en el gancho grande.
  [/mini gancho de ropa/i, 'small wooden clothespins'],
  [/gancho de ropa|gancho de metal/i, 'a wire clothes hanger'],
  [/pa[nñ]itos/i, 'a folded cleaning cloth'],
];

/** Detalles que el nombre sí dice y hay que respetar: color, forma, tamaño. */
const DETALLES = [
  [/\bazul\b/i, 'blue'],
  [/\bnegro\b/i, 'black'],
  [/\brojo\b/i, 'red'],
  [/amarill/i, 'yellow'],
  [/marr[oó]n/i, 'brown'],
  [/transparente/i, 'transparent'],
  [/metalizad|metalic/i, 'metallic'],
  [/ne[oó]n|fluorescente/i, 'neon fluorescent colors'],
  [/escarchad|gliter|glitter/i, 'with glitter'],
  [/grande/i, 'large'],
  [/peque|chiquit|mini/i, 'small'],
  [/flexible/i, 'flexible bendable'],
  [/de metal|metalic/i, 'made of metal'],
  [/de gato/i, 'shaped like a cat'],
  [/de carro/i, 'shaped like a car'],
  [/capibara/i, 'shaped like a capybara'],
  [/sandia|patilla/i, 'shaped like a watermelon slice'],
  [/coraz[oó]n/i, 'heart shaped'],
  [/balones|pelota/i, 'shaped like a soccer ball'],
  [/paleta|chupeta/i, 'shaped like a lollipop'],
  [/animalito|alienigena/i, 'shaped like a cartoon animal'],
  [/muñec|infantil|ni[nñ]os/i, 'with a childish cartoon design'],
  [/borrable/i, 'erasable'],
  [/multipunta/i, 'with multiple tips'],
  [/doble faz/i, 'double sided'],
];

function texto(p) {
  const nombre = p.nombre;
  const base = (QUE_ES.find(([r]) => r.test(nombre)) || [])[1];
  if (!base) return null;   // sin saber qué es, no se inventa nada
  const detalles = DETALLES.filter(([r]) => r.test(nombre)).map(([, d]) => d);
  const descripcion = detalles.length ? `${base}, ${detalles.join(', ')}` : base;
  // El mismo encuadre para las 139: eso es lo que hace que el catálogo case.
  return `Product catalog photo of ${descripcion}. Single object centered on a pure white seamless background, `
    + 'soft even studio lighting, subtle shadow under the object, sharp focus, photorealistic, '
    + 'no text, no logos, no watermarks, no hands, no packaging.';
}

const todos = await productos();
let faltan = todos.filter((p) => !p.tieneFoto && p.tipo !== 'servicio');
const soloEste = arg('--solo');
if (soloEste) faltan = faltan.filter((p) => p.nombre.toLowerCase().includes(soloEste.toLowerCase()));
const limite = Number(arg('--limite')) || faltan.length;
faltan = faltan.slice(0, limite);

const sinTexto = faltan.filter((p) => !texto(p));
const listos = faltan.filter((p) => texto(p));

if (prueba) {
  for (const p of listos) console.log(`\n${p.nombre}\n   ${texto(p)}`);
  console.log(`\n${listos.length} se pueden generar · ${sinTexto.length} no (no sé qué objeto son)`);
  if (sinTexto.length) for (const p of sinTexto) console.log('   ·', p.nombre);
  console.log(`\nCostarían unos $${(listos.length * 0.04).toFixed(2)}. Para hacerlo de verdad, quita --prueba.`);
  process.exit(0);
}

// --- la llave ---------------------------------------------------------------

const RUTA_LLAVE = '.secretos/clave-imagenes.txt';
const llave = process.env.OPENAI_API_KEY
  || (existsSync(RUTA_LLAVE) ? readFileSync(RUTA_LLAVE, 'utf8').trim() : null);
if (!llave) {
  console.error(`No hay llave. Guárdala en ${RUTA_LLAVE} (una sola línea) o en OPENAI_API_KEY.`);
  console.error('Se saca en platform.openai.com/api-keys. Ponle límite de gasto en el panel.');
  process.exit(1);
}

mkdirSync(CARPETA, { recursive: true });

async function generar(p) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
    body: JSON.stringify({ model: MODELO, prompt: texto(p), n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    if (r.status === 401) throw new Error('la llave no sirve o venció');
    if (r.status === 429) throw new Error('vas muy rápido, o se acabó el saldo');
    throw new Error(`HTTP ${r.status} ${detalle.slice(0, 160)}`);
  }
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('no vino ninguna imagen');
  return Buffer.from(b64, 'base64');
}

const hechas = [];
const fallidas = [];

for (const [n, p] of listos.entries()) {
  const etiqueta = `${String(n + 1).padStart(3)}/${listos.length}  ${p.nombre}`;
  try {
    const crudo = await generar(p);
    const imagen = await sharp(crudo)
      .flatten({ background: '#ffffff' })
      .resize(LADO, LADO, { fit: 'contain', background: '#ffffff' })
      .webp({ quality: 82 })
      .toBuffer();
    const ruta = join(CARPETA, `${p.id}.webp`);
    writeFileSync(ruta, imagen);
    hechas.push({ id: p.id, nombre: p.nombre, ruta, bytes: imagen.length });
    console.log(`${etiqueta} — ok (${Math.round(imagen.length / 1024)} KB)`);
  } catch (e) {
    fallidas.push({ nombre: p.nombre, razon: e.message });
    console.log(`${etiqueta} — FALLÓ: ${e.message}`);
    // Si la llave no sirve o no hay saldo, no tiene sentido seguir 138 veces.
    if (/llave|saldo/.test(e.message)) break;
  }
}

writeFileSync(join(CARPETA, '_resultado.json'), JSON.stringify({ hechas, fallidas }, null, 2));
console.log(`\n${hechas.length} generadas en ${CARPETA}/ · ${fallidas.length} fallaron`);
console.log(`Gastaste unos $${(hechas.length * 0.04).toFixed(2)}.`);

if (!subir) {
  console.log('\nNada se escribió en el inventario. Míralas primero; para subirlas, repite con --subir');
  process.exit(0);
}

let n = 0;
for (const h of hechas) {
  const datos = `data:image/webp;base64,${readFileSync(h.ruta).toString('base64')}`;
  const bytes = Math.round((datos.length * 3) / 4);
  if (bytes > TOPE_BYTES) { console.log(`${h.nombre}: muy pesada, se salta`); continue; }
  const lote = col('productos').firestore.batch();
  lote.set(col('fotos').doc(h.id), { datos, bytes, origen: `IA ${MODELO}`, ts: new Date() });
  lote.set(col('productos').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  lote.set(col('productos_venta').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  await lote.commit();
  console.log(`  ${++n}/${hechas.length}  ${h.nombre}`);
}
console.log(`\nListo: ${n} fotos nuevas en el catálogo.`);
