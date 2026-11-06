// Registra un retiro que ya ocurrió, desde la computadora.
//
// Uso:  node scripts/registrar-retiro.mjs <archivo.json>            → muestra qué haría
//       node scripts/registrar-retiro.mjs <archivo.json> --guardar  → lo escribe
//
// Para la plata que el dueño sacó de la caja para él o la casa. No es un gasto
// del negocio (ver public/js/data/retiros.js): no baja la ganancia, baja la
// caja. Se escribe igual que si lo hubiera hecho la app, con la tasa del día.
//
// El archivo es una lista:
//   [{ "dia": "2026-11-03", "categoria": "Personal / familia", "moneda": "COP",
//      "monto": 12000, "lugar": "Caja", "porque": "Lo saqué para mí" }]

import { readFileSync } from 'node:fs';
import { col, NEGOCIO } from './admin.mjs';

const archivo = process.argv[2];
const guardar = process.argv.includes('--guardar');
if (!archivo) { console.error('Dime cuál archivo de retiros.'); process.exit(1); }

const UID = '5f0FgkMwOIXec1AOyk1UoQjfQqD3';
const NOMBRE = 'Samuel';

// Las mismas de public/js/core/dinero.js y public/js/data/retiros.js.
const DECIMALES = { USD: 2, COP: 0, VES: 2 };
const LUGARES = ['Caja', 'Caja fuerte', 'Conmigo'];
const CATEGORIAS = ['Pago de trabajador', 'Compra de insumos', 'Personal / familia', 'Diezmo', 'Ajuste de conteo'];

const lista = JSON.parse(readFileSync(archivo, 'utf8'));
const retiros = Array.isArray(lista) ? lista : [lista];

/** La tasa del día del retiro, o la última anterior. */
async function tasaDe(dia, moneda) {
  if (moneda === 'USD') return 100;
  const doc = await col('tasas').doc(dia).get();
  let tasas = doc.exists ? doc.data() : null;
  if (!tasas) {
    const todas = await col('tasas').get();
    const previas = todas.docs.filter((d) => d.id <= dia).sort((a, b) => b.id.localeCompare(a.id));
    if (!previas.length) { console.error(`No hay tasa del ${dia} ni anterior.`); process.exit(1); }
    tasas = previas[0].data();
    console.log(`Sin tasa del ${dia}: se usa la del ${previas[0].id}`);
  }
  const t = tasas[moneda];
  if (!t) { console.error(`Falta la tasa de ${moneda} para el ${dia}.`); process.exit(1); }
  return t;
}

const listos = [];
for (const r of retiros) {
  const moneda = r.moneda || 'USD';
  const dec = DECIMALES[moneda];
  if (dec === undefined) { console.error(`Moneda desconocida: ${moneda}`); process.exit(1); }
  if (!CATEGORIAS.includes(r.categoria)) {
    console.error(`Categoría no permitida: "${r.categoria}". Son: ${CATEGORIAS.join(', ')}`);
    process.exit(1);
  }
  const lugar = r.lugar || 'Caja';
  if (!LUGARES.includes(lugar)) { console.error(`Lugar no permitido: ${lugar}`); process.exit(1); }
  if (!String(r.porque || '').trim()) { console.error('Falta "porque": un retiro sin motivo es un hueco en la caja.'); process.exit(1); }
  const dia = r.dia || new Date().toISOString().slice(0, 10);
  const tasa = await tasaDe(dia, moneda);
  const monto = Math.round(Number(r.monto) * Math.pow(10, dec));
  if (!monto || monto <= 0) { console.error(`Monto raro en "${r.porque}".`); process.exit(1); }
  const montoUSD = moneda === 'USD' ? monto : Math.round((monto * 100) / tasa);
  listos.push({ ...r, dia, moneda, tasa, monto, montoUSD, lugar });
}

console.log(`\nRetiros para ${NEGOCIO}:`);
for (const r of listos) {
  console.log(`   ${r.dia}  ${r.monto} ${r.moneda}  = $${(r.montoUSD / 100).toFixed(2)}`
    + `  ${r.categoria} · sale de: ${r.lugar}  (${r.porque})`);
}

if (!guardar) {
  console.log('\nNo se escribió nada. Para guardarlos, agrega --guardar');
  process.exit(0);
}

const lote = col('retiros').firestore.batch();
for (const r of listos) {
  lote.set(col('retiros').doc(), {
    categoria: r.categoria, lugar: r.lugar,
    montoUSD: r.montoUSD, moneda: r.moneda, monto: r.monto, tasa: r.tasa,
    porque: String(r.porque).trim(), paraQue: String(r.paraQue || '').trim(),
    uid: UID, nombreUsuario: NOMBRE,
    ts: new Date(`${r.dia}T12:00:00`), dia: r.dia,
  });
}
await lote.commit();
console.log(`\nListo: ${listos.length} retiro(s) escrito(s).`);
