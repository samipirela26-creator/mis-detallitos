// rehacer-cuentas.mjs — BORRAR LAS CUENTAS DE DINERO Y VOLVER A EMPEZAR
// desde un conteo físico, SIN tocar las ventas.
//
// Para cuando el historial de movimientos de plata ya no sirve (se cargó dos
// veces, hay ingresos sin identificar, nadie sabe de dónde salió un número) y
// lo único confiable es lo que se acaba de contar con la mano.
//
// QUÉ BORRA:  ingresos, retiros y traslados. Nada más.
// QUÉ NO TOCA: ventas, gastos, abonos, clientes, inventario, fotos. Las ventas
//              se quedan completas: son el historial del negocio y de ahí salen
//              los reportes y la ganancia.
//
// CÓMO QUEDA LA CUENTA. El conteo es de HOY, así que ya tiene dentro la plata
// de todo lo que se vendió y se gastó antes. Si solo se cargara el conteo, la
// app volvería a sumarle encima el efectivo de esas ventas y el total saldría
// de más. Por eso se escriben dos cosas por moneda y por sitio:
//
//   1. el conteo, como "Dinero inicial" (lo que de verdad hay);
//   2. un "Ajuste de conteo" que neutraliza lo registrado antes del conteo,
//      con su explicación escrita.
//
// Así "Mi dinero" muestra EXACTAMENTE lo que se contó, las ventas siguen
// estando, y cualquiera puede leer de dónde salió cada número.
//
//   node scripts/rehacer-cuentas.mjs              → en seco, no escribe nada
//   node scripts/rehacer-cuentas.mjs --aplicar    → lo hace
//
// Antes de borrar deja un respaldo en respaldo-cuentas-<fecha>.json.

import { writeFileSync } from 'node:fs';
import { col, db } from './admin.mjs';
import { MONEDAS, LUGARES, formatear, aUSD } from '../public/js/core/dinero.js';
import { efectivoPorLugar } from '../public/js/reports/analisis.js';

const APLICAR = process.argv.includes('--aplicar');
const HOY = new Date().toISOString().slice(0, 10);

// --- EL CONTEO ---------------------------------------------------------------
// Lo que Samuel contó el 22/10/2026. Montos en unidades MENORES: los pesos no
// llevan decimales, el dólar va en centavos ($11 = 1100).
//
// Las monedas y los billetes van en renglones aparte a propósito: así se puede
// volver a leer el conteo tal como se hizo, y no un total que ya no se puede
// comprobar.
//
// Los bolívares van completos a la caja fuerte: entran por pago móvil y nunca
// pasan por la gaveta (ver public/js/core/sitios.js).
const CONTEO = [
  { lugar: 'Caja fuerte', moneda: 'COP', monto: 16500, que: 'monedas' },
  { lugar: 'Caja fuerte', moneda: 'COP', monto: 382000, que: 'billetes' },
  { lugar: 'Caja fuerte', moneda: 'USD', monto: 1100, que: 'billetes' },
  { lugar: 'Caja fuerte', moneda: 'VES', monto: 2354500, que: 'pago móvil' },
  { lugar: 'Caja', moneda: 'COP', monto: 15000, que: 'monedas' },
  { lugar: 'Caja', moneda: 'COP', monto: 23000, que: 'billetes' },
  { lugar: 'Caja', moneda: 'USD', monto: 500, que: 'billetes' },
];

// LA HORA DEL CONTEO. Todo lo anotado HASTA aquí ya está dentro de lo que se
// contó y se neutraliza; lo de después se suma encima, como debe ser.
//
// Sin este corte, volver a correr el script más tarde borraba del saldo el
// efectivo de las ventas hechas DESPUÉS del conteo: la plata estaba en la
// gaveta y la app decía que no. Es la hora del primer reseteo, que es cuando
// Samuel acababa de contar.
const CORTE = new Date('2026-10-22T22:42:02.635Z');

const BORRAR = ['ingresos', 'retiros', 'traslados'];

const traer = async (nombre) => {
  const snap = await col(nombre).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** La tasa más reciente que haya cargada, para pasar cada monto a dólares. */
async function tasasDeHoy() {
  const snap = await col('tasas').get();
  const dias = snap.docs.map((d) => ({ dia: d.id, ...d.data() })).sort((a, b) => b.dia.localeCompare(a.dia));
  const t = dias[0];
  if (!t) throw new Error('No hay ninguna tasa cargada: sin eso no se puede pasar a dólares.');
  return { dia: t.dia, COP: t.COP, VES: t.VES };
}

/** El dueño, para que los movimientos queden firmados por alguien real. */
async function dueno() {
  const snap = await col('usuarios').get();
  const d = snap.docs.map((x) => ({ uid: x.id, ...x.data() })).find((x) => x.rol === 'dueno');
  if (!d) throw new Error('No encontré al dueño en la colección de usuarios.');
  return d;
}

const enUSD = (monto, moneda, tasas) =>
  moneda === 'USD' ? monto : aUSD(monto, moneda, tasas[moneda]);

async function main() {
  const [ventas, gastos, abonos, tasas, u] = await Promise.all([
    traer('ventas'), traer('gastos'), traer('abonos'), tasasDeHoy(), dueno(),
  ]);
  const vivas = ventas.filter((v) => v.estado !== 'anulada');
  const viejos = Object.fromEntries(await Promise.all(BORRAR.map(async (c) => [c, await traer(c)])));

  console.log(`\nTasa usada: ${tasas.dia} · ${tasas.COP} pesos y ${tasas.VES / 100} bolívares por dólar`);
  console.log(`Firmado como: ${u.nombre} (dueño)`);

  // --- 1. lo que se va a borrar ---------------------------------------------
  console.log('\n── SE BORRA ──');
  for (const c of BORRAR) {
    console.log(`  ${c}: ${viejos[c].length} movimiento(s)`);
    for (const x of viejos[c]) {
      console.log(`     ${(x.dia || '—')}  ${formatear(x.monto || 0, x.moneda)}  ${x.categoria || `${x.desde}→${x.hacia}`} · ${x.porque || ''}`);
    }
  }
  console.log(`\n── NO SE TOCA ──`);
  console.log(`  ventas: ${ventas.length} (se quedan completas)`);
  console.log(`  gastos: ${gastos.length} · abonos: ${abonos.length}`);

  // --- 2. el conteo que entra ------------------------------------------------
  const deseado = Object.fromEntries(LUGARES.map((l) => [l, Object.fromEntries(Object.keys(MONEDAS).map((m) => [m, 0]))]));
  for (const c of CONTEO) deseado[c.lugar][c.moneda] += c.monto;

  console.log('\n── LO CONTADO (queda como "Dinero inicial") ──');
  for (const c of CONTEO) {
    console.log(`  ${c.lugar.padEnd(13)} ${formatear(c.monto, c.moneda).padStart(12)}  en ${c.que}  = ${formatear(enUSD(c.monto, c.moneda, tasas))}`);
  }

  // --- 3. el ajuste que hace que la cuenta dé exactamente eso ---------------
  // Se calcula, no se escribe a mano: entran las ventas, los gastos y los
  // abonos que se quedan, y sale lo que hay que neutralizar.
  const nuevosIngresos = CONTEO.map((c) => ({
    lugar: c.lugar, moneda: c.moneda, monto: c.monto,
  }));
  const hastaElCorte = (x) => {
    const t = x.ts?.toDate ? x.ts.toDate() : x.ts ? new Date(x.ts) : null;
    return t ? t <= CORTE : true;      // sin hora: se cuenta como de antes
  };
  const antes = {
    ventas: vivas.filter(hastaElCorte),
    gastos: gastos.filter(hastaElCorte),
    abonos: abonos.filter(hastaElCorte),
  };
  const despues = vivas.length - antes.ventas.length;
  if (despues) {
    console.log(`\n  (${despues} venta(s) son POSTERIORES al conteo: su plata se suma, no se neutraliza.)`);
  }
  const conSoloElConteo = efectivoPorLugar({
    ingresos: nuevosIngresos, ...antes, retiros: [], traslados: [],
  });

  const ajustes = [];
  for (const lugar of LUGARES) {
    for (const moneda of Object.keys(MONEDAS)) {
      const diferencia = deseado[lugar][moneda] - (conSoloElConteo[lugar][moneda] || 0);
      if (diferencia === 0) continue;
      ajustes.push({ lugar, moneda, monto: Math.abs(diferencia), signo: Math.sign(diferencia) });
    }
  }

  console.log('\n── EL AJUSTE (neutraliza lo de antes del conteo) ──');
  if (!ajustes.length) console.log('  Ninguno: la cuenta ya daba el conteo exacto.');
  for (const a of ajustes) {
    console.log(`  ${a.lugar.padEnd(13)} ${(a.signo > 0 ? '+' : '−')} ${formatear(a.monto, a.moneda).padStart(12)}`
      + `  (lo registrado antes ${a.signo > 0 ? 'se queda corto' : 'ya está dentro de lo contado'})`);
  }

  // --- 4. cómo va a quedar ---------------------------------------------------
  // Lo que va a mostrar la app: el conteo, el ajuste y TODO lo posterior al
  // corte. Si solo se imprimiera el conteo, una venta hecha después del conteo
  // haría que el número de la pantalla no coincidiera con este informe.
  const final = efectivoPorLugar({
    ingresos: [...nuevosIngresos, ...ajustes.filter((a) => a.signo > 0)],
    retiros: ajustes.filter((a) => a.signo < 0),
    ventas: vivas, gastos, abonos, traslados: [],
  });
  console.log('\n── COMO VA A QUEDAR ──');
  let totalUSD = 0;
  for (const lugar of LUGARES) {
    console.log(`\n  ${lugar}`);
    for (const moneda of Object.keys(MONEDAS)) {
      const v = final[lugar][moneda];
      if (!v) continue;
      totalUSD += enUSD(v, moneda, tasas);
      console.log(`    ${MONEDAS[moneda].nombre.padEnd(10)} ${formatear(v, moneda).padStart(14)}`);
    }
  }
  console.log(`\n  TOTAL EN DÓLARES  ${formatear(totalUSD)}`);
  for (const lugar of LUGARES) {
    for (const moneda of Object.keys(MONEDAS)) {
      if (!CONTEO.some((c) => c.lugar === lugar && c.moneda === moneda) && final[lugar][moneda]) {
        console.log(`\n  OJO: ${lugar} queda con ${formatear(final[lugar][moneda], moneda)} `
          + `y eso no se contó: salió de lo registrado después del conteo.`);
      }
    }
  }

  if (!APLICAR) {
    console.log('\nEsto fue en seco: no se escribió nada. Para hacerlo:');
    console.log('  node scripts/rehacer-cuentas.mjs --aplicar\n');
    return;
  }

  // --- 5. respaldo y escritura ----------------------------------------------
  const ruta = `respaldo-cuentas-${HOY}.json`;
  writeFileSync(ruta, JSON.stringify(viejos, null, 2));
  console.log(`\nRespaldo de lo borrado: ${ruta}`);

  const lote = db.batch();
  for (const c of BORRAR) {
    for (const x of viejos[c]) lote.delete(col(c).doc(x.id));
  }

  const firma = {
    uid: u.uid, nombreUsuario: u.nombre, ts: new Date(), dia: HOY,
  };
  for (const c of CONTEO) {
    lote.set(col('ingresos').doc(), {
      categoria: 'Dinero inicial',
      lugar: c.lugar,
      moneda: c.moneda,
      monto: c.monto,
      tasa: c.moneda === 'USD' ? 100 : tasas[c.moneda],
      montoUSD: enUSD(c.monto, c.moneda, tasas),
      porque: `Conteo del ${HOY}: ${formatear(c.monto, c.moneda)} en ${c.que}`,
      paraQue: 'Punto de partida de las cuentas, contado a mano',
      ...firma,
    });
  }
  for (const a of ajustes) {
    const comun = {
      categoria: 'Ajuste de conteo',
      lugar: a.lugar,
      moneda: a.moneda,
      monto: a.monto,
      tasa: a.moneda === 'USD' ? 100 : tasas[a.moneda],
      montoUSD: enUSD(a.monto, a.moneda, tasas),
      porque: `Cuadre del conteo del ${HOY}`,
      paraQue: 'Lo vendido y lo gastado antes del conteo ya está dentro de lo que se contó: '
             + 'este ajuste evita contarlo dos veces. Las ventas siguen completas en su historial.',
      ...firma,
    };
    lote.set(col(a.signo > 0 ? 'ingresos' : 'retiros').doc(), comun);
  }
  lote.set(col('auditoria').doc(), {
    que: 'cuentas-rehechas',
    detalle: {
      borrados: Object.fromEntries(BORRAR.map((c) => [c, viejos[c].length])),
      conteo: CONTEO,
      ajustes,
      respaldo: ruta,
    },
    ...firma,
  });

  await lote.commit();
  console.log('Hecho. Comprueba con:  node scripts/contar-dinero.mjs\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
