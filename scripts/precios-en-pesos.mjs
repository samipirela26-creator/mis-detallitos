// Pasa el catálogo a tener el precio fijado en PESOS, no en dólares.
//
// Uso:  node scripts/precios-en-pesos.mjs                      → propone, NO escribe
//       node scripts/precios-en-pesos.mjs --aplicar            → escribe (deja respaldo)
//       node scripts/precios-en-pesos.mjs --revertir <archivo> → deshace con el respaldo
//
// El problema que resuelve: la lista de precios se armó en pesos a tasa 3.000 y
// se guardó convertida a dólares. El peso siguió moviéndose (hoy 3.185) y el
// dólar guardado se quedó quieto, así que el catálogo le cobra al cliente
// ~6% más de lo que dice la etiqueta del estante, y la brecha crece sola.
//
// Lo que hace: recupera el precio en pesos de cada producto (el número que está
// escrito en la etiqueta), lo guarda como `precioCOP`, y vuelve a calcular el
// `precioUSD` con la tasa de HOY. De ahí en adelante, cada vez que se carga una
// tasa nueva la app recalcula sola (ver recalcularPrecios en data/productos.js).
//
// Los precios en dólares BAJAN ~6%: es justo lo que el cliente creía pagar.

import { writeFileSync, readFileSync } from 'node:fs';
import { productos, col } from './admin.mjs';

const TASA_VIEJA = 3000;   // con la que se armó la lista original
// De 100 en 100, no de 500: con 500 la carpeta de oficio ($0,40 = 1.200 COP)
// caía a 1.000, un 17% de rebaja que nadie pidió. Con 100 se recupera el número
// exacto de la etiqueta y los 9.990 siguen cuadrando en 10.000.
const PASO = 100;

const aplicar = process.argv.includes('--aplicar');
const iRevertir = process.argv.indexOf('--revertir');
const d = (c) => '$' + (c / 100).toFixed(2);
const cop = (n) => Number(n).toLocaleString('es-VE');

// --- reversa -----------------------------------------------------------------
if (iRevertir > -1) {
  const archivo = process.argv[iRevertir + 1];
  if (!archivo) { console.error('Dime cuál respaldo usar.'); process.exit(1); }
  const respaldo = JSON.parse(readFileSync(archivo, 'utf8'));
  console.log(`Devolviendo ${respaldo.length} precios como estaban…`);
  for (let i = 0; i < respaldo.length; i += 400) {
    const lote = col('productos').firestore.batch();
    for (const r of respaldo.slice(i, i + 400)) {
      const campos = { precioUSD: r.precioUSD, precioCOP: r.precioCOP || 0 };
      lote.set(col('productos').doc(r.id), campos, { merge: true });
      lote.set(col('productos_venta').doc(r.id), campos, { merge: true });
    }
    await lote.commit();
  }
  console.log('Listo, todo como antes.');
  process.exit(0);
}

// --- la tasa de hoy ----------------------------------------------------------
const hoy = new Date().toISOString().slice(0, 10);
let tasaCOP = null;
for (let i = 0; i < 10 && !tasaCOP; i++) {
  const clave = new Date(Date.parse(hoy) - i * 86400000).toISOString().slice(0, 10);
  const snap = await col('tasas').doc(clave).get();
  if (snap.exists) tasaCOP = snap.data().COP;
}
if (!tasaCOP) { console.error('No hay tasa del peso de los últimos 10 días. Cárgala en la app primero.'); process.exit(1); }

const todos = (await productos()).filter((p) => p.precioUSD > 0);
console.log(`Tasa del peso: ${cop(tasaCOP)} por dólar (la lista se armó con ${cop(TASA_VIEJA)})\n`);

const plan = todos.map((p) => {
  // El precio de la etiqueta: lo que el dueño escribió en pesos, recuperado y
  // devuelto a su número redondo (los centavos del dólar lo habían corrido).
  const precioCOP = Math.round((p.precioUSD / 100) * TASA_VIEJA / PASO) * PASO;
  const nuevoUSD = Math.round((precioCOP * 100) / tasaCOP);
  return { ...p, precioCOP, nuevoUSD, difUSD: nuevoUSD - p.precioUSD };
});

const sinCambio = plan.filter((p) => p.difUSD === 0).length;
const totalViejo = plan.reduce((t, p) => t + p.precioUSD * (p.stock || 0), 0);
const totalNuevo = plan.reduce((t, p) => t + p.nuevoUSD * (p.stock || 0), 0);

console.log('producto                        etiqueta      cobra hoy   pasará a cobrar');
for (const p of plan.slice(0, 12)) {
  const cobraHoy = Math.round((p.precioUSD / 100) * tasaCOP);
  console.log(`  ${p.nombre.slice(0, 28).padEnd(28)} ${(cop(p.precioCOP) + ' COP').padStart(11)} ${(cop(cobraHoy) + ' COP').padStart(13)} ${(cop(p.precioCOP) + ' COP').padStart(14)}  (${d(p.precioUSD)} → ${d(p.nuevoUSD)})`);
}
console.log(`  … y ${plan.length - 12} más`);

console.log(`\n${plan.length} productos · ${sinCambio} se quedan igual`);
console.log(`El catálogo valorado a precio de venta: ${d(totalViejo)} → ${d(totalNuevo)} (${((totalNuevo / totalViejo - 1) * 100).toFixed(1)}%)`);
console.log('\nLo que gana el negocio con esto: lo que cobra la app vuelve a ser lo que dice la etiqueta,');
console.log('y de ahora en adelante se mantienen pegados solos cuando cambie la tasa.');

if (!aplicar) {
  console.log('\nNo se escribió nada. Para hacerlo:  node scripts/precios-en-pesos.mjs --aplicar');
  process.exit(0);
}

// --- respaldo antes de tocar -------------------------------------------------
const archivo = `respaldo-precios-${hoy}.json`;
writeFileSync(archivo, JSON.stringify(todos.map((p) => ({
  id: p.id, nombre: p.nombre, precioUSD: p.precioUSD, precioCOP: p.precioCOP || 0,
})), null, 2));
console.log(`\nRespaldo en ${archivo} — para deshacer:  node scripts/precios-en-pesos.mjs --revertir ${archivo}`);

let n = 0;
for (let i = 0; i < plan.length; i += 400) {
  const lote = col('productos').firestore.batch();
  for (const p of plan.slice(i, i + 400)) {
    const campos = { precioCOP: p.precioCOP, precioUSD: p.nuevoUSD };
    lote.set(col('productos').doc(p.id), campos, { merge: true });
    // El precio sí va al espejo público: es el que ve el cliente.
    lote.set(col('productos_venta').doc(p.id), campos, { merge: true });
  }
  await lote.commit();
  n += Math.min(400, plan.length - i);
  console.log(`  ${n}/${plan.length} escritos`);
}
console.log('\nListo. La etiqueta del estante y el catálogo vuelven a decir lo mismo.');
