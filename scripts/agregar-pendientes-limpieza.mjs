// Crea los pendientes de limpieza del empleado (los mismos que se crean desde la
// pantalla Pendientes). Los ids son fijos: correrlo dos veces no duplica nada.
//
// Los pendientes se muestran ordenados por título, por eso llevan número: así
// salen en el orden en que hay que hacerlos.
//
// Uso:  node scripts/agregar-pendientes-limpieza.mjs            → muestra qué haría
//       node scripts/agregar-pendientes-limpieza.mjs --guardar  → los escribe

import { FieldValue } from 'firebase-admin/firestore';
import { col, NEGOCIO } from './admin.mjs';

const guardar = process.argv.includes('--guardar');

const TITULOS = [
  '1. Sacar todo lo del estante de madera y limpiarlo',
  '2. Limpiar la impresora y lo que está debajo',
  '3. Limpiar todos los escritorios: arrastrar y mover todo para limpiar el sucio',
  '4. Limpiar la ventana que está al lado del aire',
  '5. Limpiar bien el baño',
  '6. Lampasear todo, todo el piso del negocio',
];

console.log(`Pendientes de limpieza para ${NEGOCIO} (todos los días):`);
TITULOS.forEach((t) => console.log(`   ${t}`));
if (!guardar) { console.log('\nNo se escribió nada. Para guardarlos, agrega --guardar'); process.exit(0); }

const lote = col('pendientes').firestore.batch();
TITULOS.forEach((titulo, i) => {
  lote.set(col('pendientes').doc(`limpieza-${i + 1}`), {
    titulo, tipo: 'diario', dias: [], fecha: null, ancla: null, activo: true,
    creado: FieldValue.serverTimestamp(),
  }, { merge: true });
});
await lote.commit();
console.log(`\nListo: ${TITULOS.length} pendientes escritos.`);
