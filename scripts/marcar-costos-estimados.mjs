// Marca los costos que no salieron de una factura, sino de una fórmula.
//
// Uso:  node scripts/marcar-costos-estimados.mjs            → propone, NO escribe
//       node scripts/marcar-costos-estimados.mjs --aplicar  → marca costoEstimado: true
//       node scripts/marcar-costos-estimados.mjs --limpiar  → quita la marca de un producto
//                                                              (node ... --limpiar "Lapiz Kores")
//
// De dónde salió esto: el Excel que se importó traía en la columna de costo una
// FÓRMULA, no lo que se le pagó al proveedor. 112 de los 158 productos tienen
// costoUSD exactamente igual a precioUSD / 1,30.
//
// Que la fórmula va del precio al costo (y no al revés) se ve en los pesos: los
// precios son redondos en COP (precioUSD × 30 cae en múltiplo de 500 en 145 de
// 158 productos) y los costos no (12 de 158). El precio es el ancla; el costo
// es el cociente.
//
// No se borran: borrarlos haría que el margen saliera 100% en verde, que es
// peor mentira que la de ahora. Se MARCAN, y la app deja de darlos por firmes.

import { productos, col } from './admin.mjs';

const K = 1.30;          // el divisor que traía la fórmula
const TOLERANCIA = 1;    // un centavo, por el redondeo

const aplicar = process.argv.includes('--aplicar');
const limpiar = process.argv.indexOf('--limpiar');
const d = (c) => '$' + (c / 100).toFixed(2);

const todos = await productos();

if (limpiar > -1) {
  const nombre = process.argv[limpiar + 1];
  if (!nombre) { console.error('Dime de cuál producto quitar la marca.'); process.exit(1); }
  const p = todos.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (!p) { console.error(`No encuentro "${nombre}".`); process.exit(1); }
  await col('productos').doc(p.id).set({ costoEstimado: false }, { merge: true });
  console.log(`✓ ${p.nombre}: el costo ${d(p.costoUSD)} queda como real.`);
  process.exit(0);
}

/** ¿Este costo es el precio dividido entre 1,30? */
const esDerivado = (p) => {
  if (!(p.precioUSD > 0) || !(p.costoUSD > 0)) return false;
  return Math.abs(p.costoUSD - Math.round(p.precioUSD / K)) <= TOLERANCIA;
};

const derivados = todos.filter(esDerivado);
const propios = todos.filter((p) => p.costoUSD > 0 && !esDerivado(p));

// La prueba de que el ancla es el precio: redondez en pesos a la tasa vieja.
// Con holgura de 15 pesos: $3,33 son 9.990 COP, que es la etiqueta de 10.000
// con el redondeo a centavos del dólar encima. Exigir el múltiplo exacto
// escondía justo la prueba que se busca.
const redondoEnCop = (centavos) => {
  const cop = (centavos / 100) * 3000;
  return Math.abs(cop - Math.round(cop / 500) * 500) <= 15;
};
const preciosRedondos = todos.filter((p) => p.precioUSD > 0 && redondoEnCop(p.precioUSD)).length;
const costosRedondos = todos.filter((p) => p.costoUSD > 0 && redondoEnCop(p.costoUSD)).length;

const valorTotal = todos.reduce((t, p) => t + (p.costoUSD || 0) * (p.stock || 0), 0);
const valorDerivado = derivados.reduce((t, p) => t + p.costoUSD * (p.stock || 0), 0);

console.log(`${derivados.length} de ${derivados.length + propios.length} costos salen de la fórmula precio/${K}`);
console.log(`\nLa prueba de que el ancla es el PRECIO, no el costo:`);
console.log(`   precios redondos en pesos: ${preciosRedondos} de ${todos.length}`);
console.log(`   costos  redondos en pesos: ${costosRedondos} de ${todos.length}`);
console.log(`\nValor del inventario: ${d(valorTotal)}, de los cuales ${d(valorDerivado)} descansan en costos inventados.`);

console.log(`\nSe marcarían (los 10 de más peso):`);
for (const p of [...derivados].sort((a, b) => b.costoUSD * (b.stock || 0) - a.costoUSD * (a.stock || 0)).slice(0, 10)) {
  console.log(`   ${p.nombre.padEnd(30)} precio ${d(p.precioUSD).padStart(7)}  "costo" ${d(p.costoUSD).padStart(7)}  stock ${p.stock}`);
}

if (!aplicar) {
  console.log('\nNo se escribió nada. Para marcarlos:  node scripts/marcar-costos-estimados.mjs --aplicar');
  console.log('Cuando cargues el costo real de uno:   node scripts/marcar-costos-estimados.mjs --limpiar "<nombre>"');
  process.exit(0);
}

// `costoEstimado` es un campo de costo: va solo en `productos`, nunca en el
// espejo público (está en SECRETOS, ver public/js/data/productos.js).
let n = 0;
for (let i = 0; i < derivados.length; i += 400) {
  const lote = col('productos').firestore.batch();
  for (const p of derivados.slice(i, i + 400)) {
    lote.set(col('productos').doc(p.id), { costoEstimado: true }, { merge: true });
  }
  await lote.commit();
  n += Math.min(400, derivados.length - i);
  console.log(`  ${n}/${derivados.length} marcados`);
}
console.log('\nListo. En Inventario salen con la etiqueta "costo estimado".');
