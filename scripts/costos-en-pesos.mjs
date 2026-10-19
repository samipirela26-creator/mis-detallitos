// Le pone a cada producto su costo también en PESOS (`costoCOP`).
//
// Uso:  node scripts/costos-en-pesos.mjs                      → propone, NO escribe
//       node scripts/costos-en-pesos.mjs --aplicar            → escribe (deja respaldo)
//       node scripts/costos-en-pesos.mjs --revertir <archivo> → deshace
//
// El problema: el precio ya vive en pesos y se recalcula solo con cada tasa
// nueva (ver precios-en-pesos.mjs). El costo no: quedó clavado en dólares. Así
// que cada vez que el peso se mueve, el precio se corrige y el costo se queda
// quieto, y el margen que muestran los reportes se abre solo sin que nadie haya
// cambiado nada. A tasa 3.174 el margen se ve mejor de lo que es, y la brecha
// crece sola igual que pasó con los precios.
//
// Lo que hace: guarda el costo de hoy en pesos. De ahí en adelante
// `recalcularPrecios` mantiene el `costoUSD` pegado a ese peso.
//
// Lo que NO puede hacer: saber si un costo se pagó en pesos o en dólares. Se
// asume pesos, que es como se le compra al proveedor de esta papelería. Los 122
// que están marcados `costoEstimado` ya eran una estimación antes de esto: la
// marca no se les quita.

import { writeFileSync, readFileSync } from 'node:fs';
import { productos, col } from './admin.mjs';

const aplicar = process.argv.includes('--aplicar');
const iRevertir = process.argv.indexOf('--revertir');
const cop = (n) => Number(n).toLocaleString('es-VE');
const d = (c) => '$' + (c / 100).toFixed(2);
const hoy = new Date().toISOString().slice(0, 10);

if (iRevertir > -1) {
  const archivo = process.argv[iRevertir + 1];
  if (!archivo) { console.error('Dime cuál respaldo usar.'); process.exit(1); }
  const respaldo = JSON.parse(readFileSync(archivo, 'utf8'));
  for (let i = 0; i < respaldo.length; i += 400) {
    const lote = col('productos').firestore.batch();
    for (const r of respaldo.slice(i, i + 400)) {
      // Solo `productos`: el costo nunca estuvo en el espejo público.
      lote.set(col('productos').doc(r.id), { costoCOP: r.costoCOP || 0 }, { merge: true });
    }
    await lote.commit();
  }
  console.log(`${respaldo.length} costos devueltos como estaban.`);
  process.exit(0);
}

let tasaCOP = null, diaTasa = null;
for (let i = 0; i < 10 && !tasaCOP; i++) {
  const clave = new Date(Date.parse(hoy) - i * 86400000).toISOString().slice(0, 10);
  const snap = await col('tasas').doc(clave).get();
  if (snap.exists && snap.data().COP > 0) { tasaCOP = snap.data().COP; diaTasa = clave; }
}
if (!tasaCOP) { console.error('No hay tasa del peso de los últimos 10 días.'); process.exit(1); }

const todos = await productos();
const plan = todos
  .filter((p) => p.activo !== false && p.costoUSD > 0 && !(p.costoCOP > 0))
  .map((p) => ({ ...p, costoCOP: Math.round((p.costoUSD / 100) * tasaCOP) }));

console.log(`Tasa del peso: ${cop(tasaCOP)} por dólar (del ${diaTasa})\n`);
if (!plan.length) { console.log('Todos los costos ya están en pesos. Nada que hacer.'); process.exit(0); }

console.log('producto                              costo USD    queda en    margen hoy');
for (const p of plan.slice(0, 10)) {
  const m = p.precioCOP ? (((p.precioCOP - p.costoCOP) / p.precioCOP) * 100).toFixed(0) + '%' : '—';
  console.log(`  ${p.nombre.slice(0, 34).padEnd(34)} ${d(p.costoUSD).padStart(10)} ${(cop(p.costoCOP) + ' COP').padStart(13)} ${m.padStart(9)}${p.costoEstimado ? '  (estimado)' : ''}`);
}
if (plan.length > 10) console.log(`  … y ${plan.length - 10} más`);

const estimados = plan.filter((p) => p.costoEstimado).length;
console.log(`\n${plan.length} productos · ${estimados} con costo estimado (siguen marcados)`);
console.log('Lo que gana el negocio: el margen deja de moverse solo cuando cambia la tasa.');

if (!aplicar) {
  console.log('\nNo se escribió nada. Para hacerlo:  node scripts/costos-en-pesos.mjs --aplicar');
  process.exit(0);
}

const archivo = `respaldo-costos-${hoy}.json`;
writeFileSync(archivo, JSON.stringify(
  plan.map((p) => ({ id: p.id, nombre: p.nombre, costoUSD: p.costoUSD, costoCOP: 0 })), null, 2));
console.log(`\nRespaldo en ${archivo} — para deshacer:  node scripts/costos-en-pesos.mjs --revertir ${archivo}`);

let n = 0;
for (let i = 0; i < plan.length; i += 400) {
  const lote = col('productos').firestore.batch();
  for (const p of plan.slice(i, i + 400)) {
    // `costoCOP` está en SECRETOS (data/productos.js): NO va al espejo.
    lote.set(col('productos').doc(p.id), { costoCOP: p.costoCOP }, { merge: true });
  }
  await lote.commit();
  n += Math.min(400, plan.length - i);
  console.log(`  ${n}/${plan.length} escritos`);
}
console.log('\nListo. El costo y el precio ahora se mueven juntos.');
