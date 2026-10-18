// Sube SOLO las fotos elegidas a mano, de las que bajó `fotos-desde-url.mjs`.
//
// Uso:  node scripts/subir-seleccion.mjs            → dice qué haría, no escribe
//       node scripts/subir-seleccion.mjs --subir    → las escribe en Firestore
//
// La lista de abajo se armó MIRANDO las imágenes una por una. La búsqueda
// automática trajo 76 fotos, pero eran 31 imágenes repetidas: el mismo
// borrador rosado le tocaba a 11 productos distintos. Un catálogo así se ve
// peor que uno sin fotos.
//
// Entonces cada imagen va a UN solo producto, el que de verdad retrata: el
// borrador rosado al "Mata 612", que es ese mismo; el sacapuntas rojo al
// "Skole" y no a los de capibara o de carro, que no se parecen en nada.
// El resto se queda sin foto hasta que se le tome la suya con el teléfono.

import { readFileSync } from 'node:fs';
import { col } from './admin.mjs';

// Producto (nombre exacto) → se queda con su imagen. Lo que no está aquí, no sube.
const ELEGIDAS = [
  'Almohadilla standard',
  'Bicolor',
  'Block Milimetrado',
  'Boligrafo negro',
  'Borrador Mata 612',
  'Calculadora Pequeña',
  'Carpeta',
  'Cartucheras',
  'Cinta plastica grande',
  'Compas',
  'Cuter',
  'Hoja de Examen',
  'Paraguas',
  'Perforadora Rekord 8cm',
  'Portaminas',
  'Resaltador',
  'Saca Grapa',
  'Sacapunta Skole',
  'Set de regla',
  'Tijera',
];

const TOPE_BYTES = 900 * 1024;
const subir = process.argv.includes('--subir');

const { hechas } = JSON.parse(readFileSync('imagenes-descargadas/_resultado.json', 'utf8'));
const porNombre = new Map(hechas.map((h) => [h.nombre, h]));

const listas = [];
for (const nombre of ELEGIDAS) {
  const h = porNombre.get(nombre);
  if (!h) { console.log(`· ${nombre}: no está entre las descargadas, se salta`); continue; }
  listas.push(h);
}

console.log(`${listas.length} fotos elegidas de ${hechas.length} descargadas.`);
for (const h of listas) console.log(`   ${h.nombre.padEnd(26)} ${h.fuente}`);

if (!subir) {
  console.log('\nNo se escribió nada. Para subirlas:  node scripts/subir-seleccion.mjs --subir');
  process.exit(0);
}

let n = 0;
for (const h of listas) {
  const datos = `data:image/webp;base64,${readFileSync(h.ruta).toString('base64')}`;
  const bytes = Math.round((datos.length * 3) / 4);
  if (bytes > TOPE_BYTES) { console.log(`${h.nombre}: muy pesada, se salta`); continue; }
  const lote = col('productos').firestore.batch();
  lote.set(col('fotos').doc(h.id), { datos, bytes, origen: h.fuente, ts: new Date() });
  lote.set(col('productos').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  lote.set(col('productos_venta').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  await lote.commit();
  console.log(`  ${++n}/${listas.length}  ${h.nombre}`);
}
console.log(`\nListo: ${n} fotos en el catálogo. Las demás esperan su foto real.`);
