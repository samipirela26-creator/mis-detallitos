// Borra TODAS las fotos del catálogo, dejando antes una copia en disco.
//
// Uso:  node scripts/borrar-fotos.mjs                     → dice qué borraría, no borra
//       node scripts/borrar-fotos.mjs --borrar            → respalda y borra
//       node scripts/borrar-fotos.mjs --devolver <carpeta> → las vuelve a poner
//
// Borrar fotos es de las pocas cosas que no se pueden deshacer con un ctrl+z:
// las de la carpeta del dueño costaron mirar 189 imágenes una por una. Por eso
// el respaldo no es opcional ni una bandera aparte: va siempre, antes de tocar
// nada, y queda el comando para devolverlas.

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { productos, col } from './admin.mjs';

const borrar = process.argv.includes('--borrar');
const iDevolver = process.argv.indexOf('--devolver');

// --- devolver ----------------------------------------------------------------
if (iDevolver > -1) {
  const carpeta = process.argv[iDevolver + 1];
  if (!carpeta || !existsSync(carpeta)) { console.error('Dime cuál carpeta de respaldo.'); process.exit(1); }
  const fotos = readdirSync(carpeta).filter((f) => f.endsWith('.json') && f !== '_indice.json');
  console.log(`Devolviendo ${fotos.length} fotos…`);
  let n = 0;
  for (const archivo of fotos) {
    const { id, datos, bytes, origen } = JSON.parse(readFileSync(join(carpeta, archivo), 'utf8'));
    const lote = col('productos').firestore.batch();
    lote.set(col('fotos').doc(id), { datos, bytes, origen: origen || 'respaldo', ts: new Date() });
    lote.set(col('productos').doc(id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
    lote.set(col('productos_venta').doc(id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
    await lote.commit();
    n++;
  }
  console.log(`Listo: ${n} fotos de vuelta.`);
  process.exit(0);
}

// --- mirar antes de borrar ---------------------------------------------------
const todos = await productos();
const snap = await col('fotos').get();
const conFoto = todos.filter((p) => p.tieneFoto);
const porOrigen = {};
snap.docs.forEach((d) => { const o = d.data().origen || 'sin origen'; porOrigen[o] = (porOrigen[o] || 0) + 1; });

console.log(`${snap.size} fotos guardadas · ${conFoto.length} productos marcados con foto`);
console.log('\nDe dónde salieron:');
for (const [o, n] of Object.entries(porOrigen).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${o}`);

if (!borrar) {
  console.log('\nNo se borró nada. Para hacerlo:  node scripts/borrar-fotos.mjs --borrar');
  process.exit(0);
}

// --- respaldo, siempre -------------------------------------------------------
const hoy = new Date().toISOString().slice(0, 10);
const carpeta = `respaldo-fotos-${hoy}`;
mkdirSync(carpeta, { recursive: true });
const nombres = new Map(todos.map((p) => [p.id, p.nombre]));
const indice = [];
for (const d of snap.docs) {
  const x = d.data();
  writeFileSync(join(carpeta, `${d.id}.json`), JSON.stringify({ id: d.id, nombre: nombres.get(d.id) || '', datos: x.datos, bytes: x.bytes, origen: x.origen }));
  indice.push({ id: d.id, nombre: nombres.get(d.id) || '(ya no existe)', origen: x.origen, bytes: x.bytes });
}
writeFileSync(join(carpeta, '_indice.json'), JSON.stringify(indice, null, 2));
console.log(`\nRespaldo de ${indice.length} fotos en ${carpeta}/`);
console.log(`Para devolverlas:  node scripts/borrar-fotos.mjs --devolver ${carpeta}`);

// --- borrar ------------------------------------------------------------------
let n = 0;
for (const d of snap.docs) { await col('fotos').doc(d.id).delete(); n++; }
console.log(`${n} fotos borradas`);

// Y desmarcar los productos, o el catálogo pide fotos que ya no están.
let m = 0;
for (let i = 0; i < conFoto.length; i += 400) {
  const lote = col('productos').firestore.batch();
  for (const p of conFoto.slice(i, i + 400)) {
    lote.set(col('productos').doc(p.id), { tieneFoto: false, fotoPendiente: true }, { merge: true });
    lote.set(col('productos_venta').doc(p.id), { tieneFoto: false, fotoPendiente: true }, { merge: true });
  }
  await lote.commit();
  m += Math.min(400, conFoto.length - i);
}
console.log(`${m} productos desmarcados. El catálogo queda sin fotos.`);
