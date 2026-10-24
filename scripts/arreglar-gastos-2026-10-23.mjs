// Arreglo puntual del 23/10/2026. Se corre una vez y se puede borrar.
//
// Uso:  node scripts/arreglar-gastos-2026-10-23.mjs            → muestra qué haría
//       node scripts/arreglar-gastos-2026-10-23.mjs --guardar  → lo hace
//
// Tres cosas, en un solo lote:
//
//  1. La galleta deja de ser gasto del negocio y pasa a RETIRO "Personal /
//     familia". No baja la ganancia: es plata ya ganada que se sacó.
//  2. Los dos gastos que quedaron duplicados (los metí yo por script y además
//     estaban anotados desde la app) se quedan en uno solo: el de la app, que
//     tiene la hora de verdad.
//  3. A los gastos que no traen `lugar` se les pone. La lámpara se pagó en
//     bolívares, o sea por pago móvil: nunca estuvo en la gaveta, y mientras
//     diga "Caja" el arqueo la reclama como faltante.

import { col } from './admin.mjs';

const guardar = process.argv.includes('--guardar');
const UID = '5f0FgkMwOIXec1AOyk1UoQjfQqD3';
const NOMBRE = 'Samuel';

const borrar = [
  ['1GyPRzuTrSdjcYouIgqc', 'galleta 4.000 COP (la metí yo) → se va: pasa a retiro'],
  ['6JY234UcCRxYrO4Lx9ZZ', 'galleta de huevo 4.000 COP (la de la app) → se va: pasa a retiro'],
  ['D13SCBtcS0MEjjab3ryS', 'papel imantado 10.000 COP (la metí yo) → duplicado, se queda el tuyo'],
];
const ponerLugar = [
  ['rnWZgTLRAT6VoDIzYdNR', 'Caja', 'papel imantado 10.000 COP (el tuyo) → salió de la gaveta'],
  ['TW8meAiE2DK0eIe2iIPl', 'Caja fuerte', 'lámpara 500.000 Bs → pago móvil, no estuvo en la gaveta'],
];
const retiro = {
  categoria: 'Personal / familia', lugar: 'Caja',
  moneda: 'COP', monto: 4000, tasa: 3184, montoUSD: 126,
  porque: 'Galleta de huevo', paraQue: '',
  uid: UID, nombreUsuario: NOMBRE,
  ts: new Date('2026-10-23T12:00:00'), dia: '2026-10-23',
};

console.log('\nGastos que se borran:');
for (const [id, que] of borrar) console.log(`   ${id}  ${que}`);
console.log('\nGastos a los que se les pone el sitio:');
for (const [id, lugar, que] of ponerLugar) console.log(`   ${id}  → ${lugar.padEnd(11)} ${que}`);
console.log('\nRetiro que se escribe:');
console.log(`   Personal / familia · 4.000 COP = $1,26 · sale de Caja · "${retiro.porque}"`);
console.log('\nEfecto en la ganancia del mes: sube $1,26 (la galleta deja de ser costo).');

if (!guardar) { console.log('\nNo se escribió nada. Para hacerlo, agrega --guardar'); process.exit(0); }

const lote = col('gastos').firestore.batch();
for (const [id] of borrar) lote.delete(col('gastos').doc(id));
for (const [id, lugar] of ponerLugar) lote.update(col('gastos').doc(id), { lugar });
lote.set(col('retiros').doc(), retiro);
await lote.commit();
console.log('\nListo.');
