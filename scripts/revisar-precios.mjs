// Busca costos que parecen ser de la CAJA y no de la unidad. Solo lee.
//
// Uso:  node scripts/revisar-precios.mjs
//
// La app usa `costoUSD` como costo POR UNIDAD en todas partes: la ganancia de
// cada venta, los reportes y el "valor del inventario" del panel. Si en el
// Excel se cargó el costo del paquete (la docena de lápices, la caja de
// marcadores), esos números salen mal sin que nada avise.
//
// Cómo se detecta: el dueño vende con un margen bastante parejo (la mediana
// anda por 1,3). Un producto cuyo precio sobre costo se sale mucho de esa
// banda es sospechoso — hacia abajo, casi seguro es costo de caja; hacia
// arriba, puede ser costo cargado por unidad cuando era por paquete, o un
// precio que quedó viejo.
//
// Esto NO corrige nada: nombra los casos para que los mire quien sabe cuánto
// le costaron de verdad.

import { productos } from './admin.mjs';

const BANDA_BAJA = 1.15;
const BANDA_ALTA = 2.0;

const todos = await productos();
const conAmbos = todos.filter((p) => p.precioUSD > 0 && p.costoUSD > 0);
const d = (c) => '$' + (c / 100).toFixed(2);

const margen = (p) => p.precioUSD / p.costoUSD;
const mediana = [...conAmbos].sort((a, b) => margen(a) - margen(b))[Math.floor(conAmbos.length / 2)];
const normal = margen(mediana);

const bajos = conAmbos.filter((p) => margen(p) < BANDA_BAJA).sort((a, b) => margen(a) - margen(b));
const altos = conAmbos.filter((p) => margen(p) > BANDA_ALTA).sort((a, b) => margen(b) - margen(a));

console.log(`${conAmbos.length} productos con precio y costo. Margen normal tuyo: x${normal.toFixed(2)}\n`);

console.log(`CASI SEGURO ES COSTO DE CAJA (${bajos.length})`);
console.log('El costo es tan alto frente al precio que no puede ser de una sola unidad.\n');
for (const p of bajos) {
  // Si el margen de verdad fuera el normal, ¿cuántas unidades trae esa caja?
  const unidades = Math.round(p.costoUSD / (p.precioUSD / normal));
  console.log(`  ${p.nombre.padEnd(28)} precio ${d(p.precioUSD).padStart(7)}  costo ${d(p.costoUSD).padStart(7)}`
    + `   → parece caja de ~${unidades}, costo unitario ${d(p.costoUSD / unidades)}`);
}

console.log(`\nREVISAR, MARGEN MUY ALTO (${altos.length})`);
console.log('O el costo quedó incompleto, o el precio está viejo.\n');
for (const p of altos) {
  console.log(`  ${p.nombre.padEnd(28)} precio ${d(p.precioUSD).padStart(7)}  costo ${d(p.costoUSD).padStart(7)}   x${margen(p).toFixed(1)}`);
}

const sinCosto = todos.filter((p) => p.precioUSD > 0 && !p.costoUSD);
if (sinCosto.length) {
  console.log(`\nSIN COSTO CARGADO (${sinCosto.length}) — no cuentan para la ganancia`);
  for (const p of sinCosto) console.log(`  ${p.nombre}`);
}
