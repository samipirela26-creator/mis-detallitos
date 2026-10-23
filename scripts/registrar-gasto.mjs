// Registra un gasto que ya ocurrió, desde la computadora.
//
// Uso:  node scripts/registrar-gasto.mjs <archivo.json>            → muestra qué haría
//       node scripts/registrar-gasto.mjs <archivo.json> --guardar  → lo escribe
//
// Para cuando el dueño dicta un gasto que no quedó anotado. Se escribe IGUAL
// que si lo hubiera hecho la app: con su categoría, su moneda, la tasa del día
// del gasto (no la de hoy: cambiarla movería la ganancia de ese día) y, sobre
// todo, con el SITIO de donde salió la plata — la gaveta o la caja fuerte.
// Sin el sitio, el arqueo le cobra a la gaveta un dinero que a lo mejor nunca
// pasó por ahí.
//
// El archivo es una lista:
//   [{ "dia": "2026-10-23", "categoria": "Otros", "moneda": "COP",
//      "monto": 4000, "lugar": "Caja", "nota": "Una galleta" }]
//
// `monto` va en la unidad de todos los días (4000 pesos, 12.50 dólares,
// 500.00 bolívares); el script lo pasa a unidades menores, que es como lo
// guarda la app.

import { readFileSync } from 'node:fs';
import { col, NEGOCIO } from './admin.mjs';

const archivo = process.argv[2];
const guardar = process.argv.includes('--guardar');
if (!archivo) { console.error('Dime cuál archivo de gastos.'); process.exit(1); }

const UID = '5f0FgkMwOIXec1AOyk1UoQjfQqD3';
const NOMBRE = 'Samuel';

// Las mismas de public/js/core/dinero.js y public/js/data/gastos.js.
const DECIMALES = { USD: 2, COP: 0, VES: 2 };
const LUGARES = ['Caja', 'Caja fuerte'];
const CATEGORIAS = [
  'Mercancía', 'Herramientas o artículos para el negocio',
  'Servicios (luz, agua, internet)', 'Alquiler', 'Sueldos / pago de trabajador',
  'Transporte / flete', 'Mantenimiento', 'Impuestos', 'Otros',
];

const lista = JSON.parse(readFileSync(archivo, 'utf8'));
const gastos = Array.isArray(lista) ? lista : [lista];

/** La tasa del día del gasto, o la última anterior. */
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

const enTexto = (menores, mon) => {
  const dec = DECIMALES[mon] ?? 2;
  return (menores / Math.pow(10, dec)).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const listos = [];
for (const g of gastos) {
  const moneda = g.moneda || 'USD';
  const dec = DECIMALES[moneda];
  if (dec === undefined) { console.error(`Moneda desconocida: ${moneda}`); process.exit(1); }
  if (!CATEGORIAS.includes(g.categoria)) {
    console.error(`Categoría no permitida: "${g.categoria}". Son: ${CATEGORIAS.join(', ')}`);
    process.exit(1);
  }
  const lugar = g.lugar || 'Caja';
  if (!LUGARES.includes(lugar)) { console.error(`Lugar no permitido: ${lugar}`); process.exit(1); }
  const dia = g.dia || new Date().toISOString().slice(0, 10);
  const tasa = await tasaDe(dia, moneda);
  const monto = Math.round(Number(g.monto) * Math.pow(10, dec));
  if (!monto || monto <= 0) { console.error(`Monto raro en "${g.nota || g.categoria}".`); process.exit(1); }
  const montoUSD = moneda === 'USD' ? monto : Math.round((monto * 100) / tasa);
  listos.push({ ...g, dia, moneda, tasa, monto, montoUSD, lugar });
}

console.log(`\nGastos para ${NEGOCIO}:`);
for (const g of listos) {
  console.log(`   ${g.dia}  ${enTexto(g.monto, g.moneda).padStart(10)} ${g.moneda}`
    + `  = $${(g.montoUSD / 100).toFixed(2).padStart(7)}`
    + `  ${g.categoria} · sale de: ${g.lugar}`
    + (g.nota ? `  (${g.nota})` : ''));
}
const totalUSD = listos.reduce((t, g) => t + g.montoUSD, 0);
console.log(`   TOTAL: $${(totalUSD / 100).toFixed(2)}`);

if (!guardar) {
  console.log('\nNo se escribió nada. Para guardarlos, agrega --guardar');
  process.exit(0);
}

const lote = col('gastos').firestore.batch();
for (const g of listos) {
  lote.set(col('gastos').doc(), {
    categoria: g.categoria,
    lugar: g.lugar,
    moneda: g.moneda, monto: g.monto, tasa: g.tasa, montoUSD: g.montoUSD,
    nota: g.nota || '',
    foto: null,
    uid: UID, nombreUsuario: NOMBRE,
    ts: new Date(`${g.dia}T12:00:00`),
    dia: g.dia,
  });
}
await lote.commit();
console.log(`\nListo: ${listos.length} gasto(s) escrito(s).`);
