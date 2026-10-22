// contar-dinero.mjs — VOLVER A CONTAR TODO EL DINERO, desde cero.
//
// Para cuando la caja no cuadra y ya no se sabe en quién creer. No escribe
// NADA: lee los documentos crudos de Firestore y rehace la cuenta a mano,
// movimiento por movimiento, moneda por moneda y sitio por sitio.
//
// Por qué moneda por moneda: lo que se cuenta con los dedos son billetes de
// pesos, de bolívares y de dólares. El total en dólares sirve para saber cuánto
// vale el negocio, pero NO sirve para cuadrar una gaveta: la tasa de hoy no es
// la del día que entró cada billete.
//
//   node scripts/contar-dinero.mjs                 → el conteo completo
//   node scripts/contar-dinero.mjs --detalle       → además, cada movimiento
//
// Lo que arroja al final ("LO QUE NO CUADRA") son las cosas que de verdad
// mueven el efectivo y que la app todavía no estaba restando o sumando.

import { col } from './admin.mjs';
import { MONEDAS, LUGARES, LUGAR_VENTAS, formatear } from '../public/js/core/dinero.js';
import { dineroPorLugar, cobradoDeVentas, efectivoPorLugar, vueltoDeVenta } from '../public/js/reports/analisis.js';

const DETALLE = process.argv.includes('--detalle');

const traer = async (nombre) => {
  const snap = await col(nombre).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const cuando = (x) => {
  const t = x?.ts?.toDate ? x.ts.toDate() : x?.ts ? new Date(x.ts) : null;
  return t ? t.toISOString().slice(0, 16).replace('T', ' ') : (x?.dia || '—');
};

const titulo = (texto) => {
  console.log(`\n${'━'.repeat(72)}`);
  console.log(texto);
  console.log('━'.repeat(72));
};

// Lo que de verdad se cuenta con la mano sale de `efectivoPorLugar`, que vive
// en analisis.js y es la MISMA función que usa la app. Aquí solo se rehace la
// lista de movimientos para poder mostrarlos uno por uno.
async function main() {
  const [ventas, cajas, ingresos, retiros, traslados, gastos, abonos, clientes] = await Promise.all([
    traer('ventas'), traer('cajas'), traer('ingresos'), traer('retiros'),
    traer('traslados'), traer('gastos'), traer('abonos'), traer('clientes'),
  ]);
  const vivas = ventas.filter((v) => v.estado !== 'anulada');

  const sitios = efectivoPorLugar({ ingresos, retiros, traslados, ventas: vivas, gastos, abonos });
  // Los mismos movimientos, pero escritos, para poder leerlos de a uno.
  const movs = [];
  const anotar = (sitio, moneda, monto, que) => {
    movs.push({ sitio: sitios[sitio] ? sitio : LUGAR_VENTAS, moneda, monto, que });
  };

  for (const i of ingresos) {
    anotar(i.lugar || LUGAR_VENTAS, i.moneda, i.monto || 0, `${cuando(i)}  ingreso · ${i.categoria} · ${i.porque}`);
  }
  for (const v of vivas) {
    for (const p of v.pagos || []) {
      anotar(LUGAR_VENTAS, p.moneda, p.monto || 0, `${cuando(v)}  venta ${v.id.slice(0, 6)} · pagó ${formatear(p.monto, p.moneda)}`);
    }
    const vuelto = vueltoDeVenta(v);
    if (vuelto) {
      anotar(LUGAR_VENTAS, vuelto.moneda, -vuelto.monto, `${cuando(v)}  venta ${v.id.slice(0, 6)} · VUELTO (reconstruido)`);
    }
  }
  for (const a of abonos) {
    for (const p of a.pagos || []) {
      anotar(a.lugar || LUGAR_VENTAS, p.moneda, p.monto || 0, `${cuando(a)}  abono de fiado · ${formatear(p.monto, p.moneda)}`);
    }
  }
  for (const g of gastos) {
    anotar(g.lugar || LUGAR_VENTAS, g.moneda, -(g.monto || 0), `${cuando(g)}  gasto · ${g.categoria} · ${g.nota || ''}`);
  }
  for (const r of retiros) {
    anotar(r.lugar || LUGAR_VENTAS, r.moneda, -(r.monto || 0), `${cuando(r)}  retiro · ${r.categoria} · ${r.porque}`);
  }
  for (const t of traslados) {
    anotar(t.desde, t.moneda, -(t.monto || 0), `${cuando(t)}  traslado hacia ${t.hacia}`);
    anotar(t.hacia, t.moneda, t.monto || 0, `${cuando(t)}  traslado desde ${t.desde}`);
  }

  // --- 1. lo que hay que encontrar al contar --------------------------------
  titulo('1. CUÁNTO DEBE HABER, PARA CONTARLO CON LA MANO');
  for (const sitio of LUGARES) {
    console.log(`\n  ${sitio}`);
    for (const m of Object.keys(MONEDAS)) {
      const v = sitios[sitio][m] || 0;
      if (!v && !movs.some((x) => x.sitio === sitio && x.moneda === m)) continue;
      console.log(`    ${MONEDAS[m].nombre.padEnd(10)} ${formatear(v, m).padStart(14)}`);
    }
  }
  console.log('\n  (Esto es efectivo en billetes y monedas. No incluye lo fiado:');
  console.log('   esa plata está en la calle, no en la gaveta.)');

  // --- 2. el mismo dinero, en dólares --------------------------------------
  titulo('2. EL MISMO DINERO, EN DÓLARES');
  const d = dineroPorLugar({ ingresos, retiros, traslados, ventas: vivas, gastos, abonos });
  for (const l of d.porLugar) console.log(`  ${l.lugar.padEnd(14)} ${formatear(l.montoUSD).padStart(12)}`);
  console.log(`  ${'TOTAL'.padEnd(14)} ${formatear(d.totalUSD).padStart(12)}`);
  console.log('\n  Cómo se arma:');
  const sumaIngresos = ingresos.reduce((t, x) => t + (x.montoUSD || 0), 0);
  const sumaAbonos = abonos.reduce((t, x) => t + (x.montoUSD || 0), 0);
  const sumaGastos = gastos.reduce((t, x) => t + (x.montoUSD || 0), 0);
  const sumaRetiros = retiros.reduce((t, x) => t + (x.montoUSD || 0), 0);
  const cobrado = cobradoDeVentas(vivas);
  console.log(`    dinero que se metió (ingresos)      + ${formatear(sumaIngresos)}`);
  console.log(`    cobrado de ventas (sin lo fiado)    + ${formatear(cobrado)}`);
  console.log(`    abonos de fiados cobrados           + ${formatear(sumaAbonos)}`);
  console.log(`    gastos del negocio                  − ${formatear(sumaGastos)}`);
  console.log(`    retiros                             − ${formatear(sumaRetiros)}`);
  console.log(`    traslados entre sitios                  no cambian el total`);
  console.log(`    ${'='.repeat(36)} ${formatear(d.totalUSD)}`);

  // --- 3. los turnos de caja ------------------------------------------------
  titulo('3. LOS TURNOS DE CAJA');
  if (!cajas.length) console.log('  No hay ningún turno registrado.');
  const abierta = cajas.filter((c) => c.estado === 'abierta');
  for (const c of cajas.sort((a, b) => String(a.dia).localeCompare(String(b.dia)))) {
    const desc = Object.entries(c.diferencia || {}).filter(([, v]) => v);
    console.log(`\n  ${c.dia} · ${c.nombreUsuario} · ${c.estado}`);
    if (c.estado === 'cerrada') {
      for (const m of Object.keys(MONEDAS)) {
        if (!(c.esperado?.[m] || c.contado?.[m])) continue;
        console.log(`    ${MONEDAS[m].nombre.padEnd(10)} esperado ${formatear(c.esperado?.[m] || 0, m).padStart(12)}`
          + `   contado ${formatear(c.contado?.[m] ?? 0, m).padStart(12)}`
          + `   ${(c.diferencia?.[m] || 0) === 0 ? 'cuadró' : 'DIFERENCIA ' + formatear(c.diferencia[m], m)}`);
      }
      if ((c.noContadas || []).length) console.log(`    sin contar: ${c.noContadas.join(', ')}`);
      if (!desc.length) console.log('    cuadró completo');
    } else {
      console.log('    SIGUE ABIERTA: nada de lo que pasó después tiene arqueo.');
    }
  }

  // --- 4. fiado -------------------------------------------------------------
  titulo('4. LO FIADO (plata que no está, pero te la deben)');
  const fiadoVentas = vivas.reduce((t, v) => t + Math.max(0, v.saldoUSD || 0), 0);
  const saldoClientes = clientes.reduce((t, c) => t + (c.saldoUSD || 0), 0);
  for (const c of clientes.filter((c) => (c.saldoUSD || 0) !== 0)) {
    console.log(`  ${(c.nombre || '—').padEnd(20)} ${formatear(c.saldoUSD).padStart(10)}`);
  }
  console.log(`  ${'—'.repeat(32)}`);
  console.log(`  suma de los clientes       ${formatear(saldoClientes).padStart(10)}`);
  console.log(`  suma de las ventas fiadas  ${formatear(fiadoVentas).padStart(10)}  (menos los abonos: ${formatear(fiadoVentas - sumaAbonos)})`);
  if (saldoClientes !== fiadoVentas - sumaAbonos) {
    console.log('  ⚠ Los dos números deberían ser iguales. Si no, algún saldo se tocó a mano.');
  }

  // --- 5. lo que no cuadra --------------------------------------------------
  titulo('5. LO QUE NO CUADRA (y por qué faltaba o sobraba)');
  const problemas = [];

  const conVuelto = vivas.map((v) => [v, vueltoDeVenta(v)]).filter(([, x]) => x && x.reconstruido);
  if (conVuelto.length) {
    problemas.push(`${conVuelto.length} venta(s) con VUELTO que no quedó anotado. La app esperaba en la `
      + `gaveta el billete completo que entregó el cliente, sin restar el cambio que se le dio:\n`
      + conVuelto.map(([v, x]) =>
        `      ${v.dia}  venta de ${formatear(v.totalUSD)} pagada con ${formatear(v.pagos[0].monto, v.pagos[0].moneda)}`
        + ` → vuelto ${formatear(x.monto, x.moneda)}`).join('\n'));
  }

  const sinTurno = vivas.filter((v) => v.sinTurno);
  if (sinTurno.length) {
    const total = sinTurno.reduce((t, v) => t + (v.totalUSD || 0), 0);
    problemas.push(`${sinTurno.length} venta(s) por ${formatear(total)} se cobraron SIN CAJA ABIERTA `
      + `(${[...new Set(sinTurno.map((v) => v.dia))].join(', ')}). Esa plata entró a la gaveta y `
      + `ningún arqueo la cuenta: al cerrar aparece como sobrante.`);
  }

  if (abierta.length) {
    problemas.push(`Hay ${abierta.length} turno(s) abiertos sin cerrar desde ${abierta.map((c) => c.dia).join(', ')}.`);
  }

  const genericos = ingresos.filter((i) => /sin especificar|falta identificar/i.test(`${i.porque} ${i.paraQue}`));
  if (genericos.length) {
    problemas.push(`${genericos.length} ingreso(s) sin identificar, por `
      + `${formatear(genericos.reduce((t, i) => t + (i.montoUSD || 0), 0))}: `
      + `si eso era el pago de una deuda, está contado dos veces (como ingreso y como fiado por cobrar).`);
  }

  const sinCosto = vivas.filter((v) => (v.lineas || []).some((l) => l.productoId && !l.costoUSD));
  if (sinCosto.length) {
    problemas.push(`${sinCosto.length} venta(s) guardaron costo 0 en productos del catálogo (las registra el `
      + `empleado, que por diseño no lee costos). La PLATA cuadra igual; la que sale inflada es la ganancia.`);
  }

  if (!problemas.length) console.log('  Nada. Todo cuadra.');
  problemas.forEach((p, n) => console.log(`\n  ${n + 1}. ${p}`));

  if (DETALLE) {
    titulo('6. CADA MOVIMIENTO, UNO POR UNO');
    for (const sitio of LUGARES) {
      console.log(`\n  ── ${sitio} ──`);
      for (const m of movs.filter((x) => x.sitio === sitio).sort((a, b) => a.que.localeCompare(b.que))) {
        console.log(`    ${formatear(m.monto, m.moneda).padStart(13)}  ${m.que}`);
      }
    }
  }

  console.log('\nNo se escribió nada: esto solo leyó.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
