// Borra los datos de prueba de un negocio para que empiece desde cero.
//
// Uso:  NEGOCIO=<id> node scripts/limpiar-datos-prueba.mjs            → solo cuenta
//       NEGOCIO=<id> node scripts/limpiar-datos-prueba.mjs --borrar   → borra
//
// Se borra lo que genera la operación: ventas, abonos, cajas, gastos,
// ingresos, retiros, traslados, anulaciones, movimientos de inventario y
// clientes. NO se tocan los productos, las tasas, los usuarios, la
// configuración ni la auditoría (el rastro de quién hizo qué se queda).
//
// Esto vive en un script y no en un botón de la app a propósito: las reglas de
// Firestore no dejan borrar ventas ni cajas desde la app, y está bien así.

import { col, NEGOCIO, db } from './admin.mjs';

const BORRAR = process.argv.includes('--borrar');
const COLECCIONES = [
  'ventas', 'abonos', 'cajas', 'gastos', 'ingresos', 'retiros', 'traslados',
  'anulaciones', 'movimientos', 'clientes',
];

console.log(`Negocio: ${NEGOCIO}${BORRAR ? '' : '  (en seco: no se borra nada)'}`);
for (const nombre of COLECCIONES) {
  const snap = await col(nombre).get();
  console.log(`  ${nombre}: ${snap.size}`);
  if (!BORRAR) continue;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const lote = db.batch();
    for (const d of snap.docs.slice(i, i + 400)) lote.delete(d.ref);
    await lote.commit();
  }
}
console.log(BORRAR ? 'Listo: empieza desde cero.' : 'Para borrar de verdad: agrega --borrar');
