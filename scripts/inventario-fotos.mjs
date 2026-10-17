// Radiografía de las fotos del inventario. SOLO LEE, no toca nada.
//
// Uso:  node scripts/inventario-fotos.mjs
//       node scripts/inventario-fotos.mjs --lista     (nombra cada producto sin foto)
//       node scripts/inventario-fotos.mjs --csv > faltan.csv

import { productos, proyecto, NEGOCIO } from './admin.mjs';

const lista = process.argv.includes('--lista');
const csv = process.argv.includes('--csv');

const todos = await productos();
const reales = todos.filter((p) => p.tipo !== 'servicio');
const sinFoto = reales.filter((p) => !p.tieneFoto);

if (csv) {
  console.log('id,nombre,categoria,sku,codigoBarras');
  for (const p of sinFoto) {
    const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    console.log([p.id, p.nombre, p.categoria, p.sku, p.codigoBarras].map(campo).join(','));
  }
  process.exit(0);
}

console.log(`Proyecto ${proyecto} · negocio ${NEGOCIO}`);
console.log(`${todos.length} productos (${todos.length - reales.length} servicios, que no llevan foto)`);
console.log(`${reales.length - sinFoto.length} con foto · ${sinFoto.length} sin foto\n`);

// Por categoría: así se sabe por dónde conviene empezar.
const porCategoria = new Map();
for (const p of sinFoto) {
  const c = p.categoria || 'Sin categoría';
  porCategoria.set(c, (porCategoria.get(c) || 0) + 1);
}
const orden = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
for (const [categoria, n] of orden) {
  console.log(`  ${String(n).padStart(4)}  ${categoria}`);
}

if (lista) {
  console.log('\nSin foto, uno por uno:');
  for (const p of sinFoto) {
    console.log(`  ${(p.categoria || '—').padEnd(20)} ${p.nombre}`);
  }
}
