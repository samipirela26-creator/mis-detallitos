// deudas-en-pesos.mjs — fijar en PESOS las deudas que solo existían en dólares.
//
// Una deuda se contrae en la moneda de la etiqueta. Guardada solo en dólares, se
// mueve cuando se mueve el dólar: Yenifer debía 20.000 pesos y con el dólar a
// 4.000 le tocaría pagar 25.200. Nadie acepta eso, y con razón.
//
// De dónde sale el peso de cada deuda, en orden de confianza:
//
//   1. El PRECIO DE ETIQUETA de lo que se llevó (`precioCOP` del catálogo).
//      Es el número exacto que las dos personas vieron y acordaron.
//   2. Si algo no tiene precio en pesos (una venta libre, un precio a mano), se
//      convierte con la tasa DEL DÍA DE LA VENTA, no con la de hoy: la deuda se
//      contrajo ese día y a esa tasa.
//
// Los abonos ya cobrados se restan igual, con la tasa de su día.
//
//   node scripts/deudas-en-pesos.mjs              → en seco, no escribe nada
//   node scripts/deudas-en-pesos.mjs --aplicar    → lo hace
//
// Es idempotente: un cliente que ya tenga `saldoCOP` no se vuelve a tocar, a
// menos que se pase --rehacer.

import { col, db } from './admin.mjs';
import { formatear } from '../public/js/core/dinero.js';

const APLICAR = process.argv.includes('--aplicar');
const REHACER = process.argv.includes('--rehacer');

const traer = async (nombre) => {
  const snap = await col(nombre).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const dia = (x) => x.dia || (x.ts?.toDate ? x.ts.toDate().toISOString().slice(0, 10) : null);

async function main() {
  const [clientes, ventas, abonos, productos, tasasDocs] = await Promise.all([
    traer('clientes'), traer('ventas'), traer('abonos'), traer('productos'), traer('tasas'),
  ]);

  const precioCOP = Object.fromEntries(productos.map((p) => [p.id, p.precioCOP || 0]));
  const tasaDe = (fecha) => {
    const dias = tasasDocs.map((t) => t.id).filter((d) => d <= fecha).sort();
    const elegido = dias[dias.length - 1] || tasasDocs.map((t) => t.id).sort()[0];
    return tasasDocs.find((t) => t.id === elegido)?.COP || 0;
  };

  /** Lo que esta venta dejó debiendo, en pesos. */
  function deudaDeLaVenta(v) {
    const tasa = tasaDe(dia(v) || '2026-01-01');
    const avisos = [];
    let pesos = 0;
    for (const l of v.lineas || []) {
      const etiqueta = l.precioCOP || precioCOP[l.productoId] || 0;
      if (etiqueta > 0) {
        pesos += Math.round(l.cantidad * etiqueta);
      } else if (tasa) {
        pesos += Math.round((l.cantidad * l.precioUSD * tasa) / 100);
        avisos.push(`"${l.nombre}" no tiene precio en pesos: convertido a la tasa del ${dia(v)}`);
      }
    }
    const saldo = Math.max(0, v.saldoUSD || 0);
    if (saldo < (v.totalUSD || 0)) pesos = Math.round((pesos * saldo) / (v.totalUSD || 1));
    return { pesos, avisos, tasa };
  }

  console.log('');
  let escrituras = 0;
  for (const c of clientes) {
    const yaEsta = c.saldoCOP !== undefined && c.saldoCOP !== null;
    const fiadas = ventas.filter((v) => v.clienteId === c.id && v.estado !== 'anulada' && (v.saldoUSD || 0) > 0);
    const sus = abonos.filter((a) => a.clienteId === c.id);

    let pesos = 0;
    const avisos = [];
    for (const v of fiadas) {
      const r = deudaDeLaVenta(v);
      pesos += r.pesos;
      avisos.push(...r.avisos);
      console.log(`  ${c.nombre} · venta del ${dia(v)}: ${formatear(r.pesos, 'COP')}`
        + `  (${(v.lineas || []).map((l) => `${l.cantidad}× ${l.nombre}`).join(', ')})`);
    }
    for (const a of sus) {
      const resta = a.montoCOP || Math.round(((a.montoUSD || 0) * tasaDe(dia(a) || '2026-01-01')) / 100);
      pesos -= resta;
      console.log(`  ${c.nombre} · abono del ${dia(a)}: −${formatear(resta, 'COP')}`);
    }
    pesos = Math.max(0, pesos);

    const estado = yaEsta && !REHACER ? 'ya estaba, no se toca'
      : pesos === 0 && !(c.saldoUSD > 0) ? 'sin deuda'
      : 'se escribe';
    console.log(`  ${c.nombre.padEnd(26)} ${formatear(pesos, 'COP').padStart(12)}`
      + `   (en dólares tenía ${formatear(c.saldoUSD || 0)})   ← ${estado}`);
    for (const a of avisos) console.log(`      OJO: ${a}`);
    console.log('');

    if (estado === 'se escribe') {
      escrituras++;
      if (APLICAR) await col('clientes').doc(c.id).set({ saldoCOP: pesos }, { merge: true });
    }
  }

  if (!APLICAR) {
    console.log(`${escrituras} cliente(s) se escribirían. Esto fue en seco.`);
    console.log('Para hacerlo:  node scripts/deudas-en-pesos.mjs --aplicar\n');
  } else {
    console.log(`${escrituras} cliente(s) actualizados.\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
