// Baja imágenes de productos desde una URL, las deja parejas (cuadrado 800px,
// fondo blanco, WebP) y las guarda — primero en disco para revisarlas, y solo
// con --subir las escribe en Firestore.
//
// Uso:
//   node scripts/fotos-desde-url.mjs candidatas.json          → baja y procesa
//   node scripts/fotos-desde-url.mjs candidatas.json --subir  → además las sube
//
// candidatas.json es una lista:
//   [{ "id": "qHEXpx…", "nombre": "Lapiz Kores", "url": "https://…/lapiz.jpg",
//      "fuente": "kores.com" }]
//
// El formato de salida es el MISMO que produce la app (WebP cuadrado dentro de
// `fotos/{productoId}`), así que una foto bajada aquí y una tomada con el
// teléfono se ven igual en la lista. Y el tope de 900 KB es el mismo que revisa
// guardarFoto(): un documento de Firestore aguanta 1 MB y no más.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const LADO = 800;
const CALIDAD = 82;
const TOPE_BYTES = 900 * 1024;
const CARPETA = 'imagenes-descargadas';

const archivo = process.argv[2];
const subir = process.argv.includes('--subir');

if (!archivo || !existsSync(archivo)) {
  console.error('Uso: node scripts/fotos-desde-url.mjs <candidatas.json> [--subir]');
  process.exit(1);
}

const candidatas = JSON.parse(readFileSync(archivo, 'utf8'));
mkdirSync(CARPETA, { recursive: true });

/** Baja la imagen con un límite de tamaño: una foto de producto no pesa 20 MB. */
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function bajar(url, intento = 0) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MisDetallitos/1.0; catálogo de papelería)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  // 429 = "vas muy rápido". Es gente regalando ancho de banda: se espera y ya.
  if (r.status === 429 && intento < 2) {
    await dormir(3000 * (intento + 1));
    return bajar(url, intento + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.startsWith('image/')) throw new Error(`no es una imagen (${tipo || 'sin tipo'})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new Error('pesa más de 12 MB');
  return buf;
}

/** Qué tan "foto de producto" es: mira el borde de la imagen y mide cuánto de
 *  ese marco es casi blanco. Una foto de catálogo tiene el producto al centro
 *  sobre fondo limpio, así que su borde da casi 1; una foto de escritorio, de
 *  museo o de paisaje da bajo. Es tosco a propósito: ningún modelo, solo
 *  píxeles, y separa muy bien lo que sirve de lo que no. */
async function blancura(buf) {
  const L = 100, BORDE = 12;
  const { data } = await sharp(buf)
    .flatten({ background: '#ffffff' })
    .resize(L, L, { fit: 'fill' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  let claros = 0, total = 0;
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const enBorde = x < BORDE || y < BORDE || x >= L - BORDE || y >= L - BORDE;
      if (!enBorde) continue;
      total++;
      if (data[y * L + x] > 232) claros++;
    }
  }
  return claros / total;
}

/** Cuadrado de 800 con fondo blanco: el producto completo, sin estirar ni cortar. */
async function emparejar(buf) {
  let calidad = CALIDAD;
  for (let intento = 0; intento < 4; intento++) {
    const salida = await sharp(buf)
      .flatten({ background: '#ffffff' })          // transparencias → blanco
      .resize(LADO, LADO, { fit: 'contain', background: '#ffffff' })
      .webp({ quality: calidad })
      .toBuffer();
    if (salida.length * 1.37 < TOPE_BYTES) return salida;   // 1.37 = lo que crece en base64
    calidad -= 15;
  }
  throw new Error('no baja de 900 KB ni bajando la calidad');
}

const hechas = [];
const fallidas = [];

// Fondo que hay que tener para entrar al catálogo. Por debajo de esto la foto
// trae mostrador, mesa o paisaje, y en la lista se ve sucia al lado del resto.
const MINIMO_BLANCO = 0.9;

for (const [n, c] of candidatas.entries()) {
  const etiqueta = `${String(n + 1).padStart(3)}/${candidatas.length}  ${c.nombre}`;
  // Se prueban todas las opciones y gana la de fondo más limpio.
  const opciones = [{ url: c.url, fuente: c.fuente }, ...(c.alternativas || [])];
  let mejor = null;
  const porque = [];

  for (const o of opciones) {
    try {
      await dormir(250);          // paso tranquilo: son servidores ajenos y gratis
      const crudo = await bajar(o.url);
      const nota = await blancura(crudo);
      porque.push(nota.toFixed(2));
      if (!mejor || nota > mejor.nota) mejor = { ...o, crudo, nota };
      if (mejor.nota >= 0.97) break;   // fondo impecable: no hace falta seguir bajando
    } catch (e) {
      porque.push(`x(${e.message})`);
    }
  }

  if (!mejor || mejor.nota < MINIMO_BLANCO) {
    const razon = mejor ? `fondo sucio (mejor ${mejor.nota.toFixed(2)})` : 'ninguna se pudo bajar';
    fallidas.push({ id: c.id, nombre: c.nombre, busqueda: c.busqueda, razon });
    console.log(`${etiqueta} — descartada: ${razon} [${porque.join(' ')}]`);
    continue;
  }

  try {
    const imagen = await emparejar(mejor.crudo);
    const ruta = join(CARPETA, `${c.id}.webp`);
    writeFileSync(ruta, imagen);
    hechas.push({ id: c.id, nombre: c.nombre, url: mejor.url, fuente: mejor.fuente, ruta, bytes: imagen.length, nota: mejor.nota });
    console.log(`${etiqueta} — ok (fondo ${mejor.nota.toFixed(2)}, ${Math.round(imagen.length / 1024)} KB)`);
  } catch (e) {
    fallidas.push({ id: c.id, nombre: c.nombre, razon: e.message });
    console.log(`${etiqueta} — FALLÓ: ${e.message}`);
  }
}

writeFileSync(join(CARPETA, '_resultado.json'), JSON.stringify({ hechas, fallidas }, null, 2));
console.log(`\n${hechas.length} listas en ${CARPETA}/ · ${fallidas.length} fallaron`);

if (!subir) {
  console.log('Nada se escribió en Firestore. Revisa las imágenes y luego corre lo mismo con --subir');
  process.exit(0);
}

// --- subida ---
const { col } = await import('./admin.mjs');
let subidas = 0;
for (const h of hechas) {
  const datos = `data:image/webp;base64,${readFileSync(h.ruta).toString('base64')}`;
  const bytes = Math.round((datos.length * 3) / 4);
  if (bytes > TOPE_BYTES) { console.log(`${h.nombre}: quedó muy pesada, se salta`); continue; }
  const lote = col('productos').firestore.batch();
  lote.set(col('fotos').doc(h.id), {
    datos, bytes,
    origen: h.fuente || h.url,          // de dónde salió, por si hay que rehacerla
    ts: new Date(),
  });
  lote.set(col('productos').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  lote.set(col('productos_venta').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  await lote.commit();
  subidas++;
  console.log(`  subida ${subidas}/${hechas.length}  ${h.nombre}`);
}
console.log(`Listo: ${subidas} fotos en el inventario.`);
