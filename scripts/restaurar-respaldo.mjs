// Restaura un respaldo completo. ESTE es el que sirve cuando la base está
// vacía o quedó a medias.
//
// Uso:  node scripts/restaurar-respaldo.mjs <archivo.json>             → en seco
//       node scripts/restaurar-respaldo.mjs <archivo.json> --aplicar   → escribe
//
// Por qué existe, además del botón de la app:
//
// Las reglas de Firestore son append-only a propósito. `movimientos` no admite
// `update` ni `delete` (el ledger de inventario no se reescribe), y `ventas`,
// `cajas` y `gastos` solo dejan crear si el `uid` del documento es el de quien
// escribe. Un respaldo trae los uid ORIGINALES, así que desde la app el dueño
// no puede reponer lo que registró el empleado: las reglas lo rechazan, y hacen
// bien.
//
// Este script entra con la llave de administrador, que se salta las reglas. Es
// la única forma de dejar la base exactamente como estaba.
//
// NO BORRA NADA. Escribe encima por id y deja lo que no esté en el archivo.

import { readFileSync } from 'node:fs';
import { db, col, NEGOCIO, proyecto } from './admin.mjs';
import { Timestamp } from 'firebase-admin/firestore';
import { validar, aFirestore } from '../public/js/core/respaldo-formato.js';
import { versionVenta } from '../public/js/core/producto-publico.js';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const archivo = args.find((a) => !a.startsWith('--'));

if (!archivo) {
  console.error('Falta el archivo.  node scripts/restaurar-respaldo.mjs <respaldo.json> [--aplicar]');
  process.exit(1);
}

let datos;
try {
  datos = JSON.parse(readFileSync(archivo, 'utf8'));
} catch (e) {
  console.error(`No pude leer ${archivo}: ${e.message}`);
  process.exit(1);
}

// Se valida con EL MISMO módulo que usa la app, así no hay dos criterios.
const v = validar(datos);
if (!v.ok) {
  console.error('Ese archivo no sirve para restaurar:', v.error);
  process.exit(1);
}

const cuando = datos.fecha ? new Date(datos.fecha).toLocaleString('es-VE') : 'sin fecha';
console.log(`\nRespaldo del ${cuando}`);
console.log(`Negocio en el archivo: ${datos.negocio || '(sin anotar)'}`);
console.log(`Se va a escribir en:   ${NEGOCIO}  (proyecto ${proyecto})\n`);

if (datos.negocio && datos.negocio !== NEGOCIO) {
  console.error(`PARA. El respaldo es de "${datos.negocio}" y apuntas a "${NEGOCIO}".`);
  console.error('Si de verdad quieres mezclarlos, cambia NEGOCIO en el entorno.');
  process.exit(1);
}

for (const r of v.resumen) console.log(`  ${String(r.cuantos).padStart(6)}  ${r.nombre}`);
if (v.desconocidas?.length) {
  console.log(`\n  (se saltan, no las conoce esta versión: ${v.desconocidas.join(', ')})`);
}
console.log(`\n  TOTAL: ${v.total} documentos`);

if (!aplicar) {
  console.log('\nEn seco: no se escribió nada. Agrega --aplicar para hacerlo de verdad.\n');
  process.exit(0);
}

const TAMANO = 400;   // Firestore admite 500 por lote; 400 va holgado.
let escritos = 0;

for (const [nombre, filas] of Object.entries(datos.colecciones)) {
  if (!Array.isArray(filas) || !filas.length) continue;
  if (v.desconocidas?.includes(nombre)) continue;

  const coleccion = col(nombre);
  for (let i = 0; i < filas.length; i += TAMANO) {
    const trozo = filas.slice(i, i + TAMANO);
    const lote = db.batch();
    for (const fila of trozo) {
      const { id, ...campos } = fila;
      lote.set(coleccion.doc(id), aFirestore(campos, Timestamp), { merge: true });
    }
    await lote.commit();
    escritos += trozo.length;
    process.stdout.write(`\r  escribiendo… ${escritos}/${v.total}`);
  }
}
console.log(`\n\n✓ ${escritos} documentos restaurados.`);

// El espejo del empleado NO se restaura: se reconstruye desde `productos`, que
// es la única fuente de verdad. Si se restaurara uno viejo, el empleado vería
// precios que ya no existen.
if (datos.colecciones.productos?.length) {
  const snap = await col('productos').get();
  let espejo = 0;
  let lote = db.batch();
  let enLote = 0;
  for (const d of snap.docs) {
    const p = d.data();
    // La MISMA regla que usa la app, importada, no copiada: si un día se
    // agrega un campo de costo nuevo, basta ponerlo en SECRETOS una vez.
    lote.set(col('productos_venta').doc(d.id), {
      ...versionVenta(p),
      actualizado: Timestamp.now(),
    }, { merge: true });
    espejo++;
    if (++enLote >= TAMANO) { await lote.commit(); lote = db.batch(); enLote = 0; }
  }
  if (enLote) await lote.commit();
  console.log(`✓ catálogo del empleado rehecho: ${espejo} productos (sin costos).`);
}

console.log('\nAbre la app y revisa antes de seguir vendiendo.\n');
