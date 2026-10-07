// caja.js — turnos, arqueo y cierre.
//
// Reporte X: foto parcial del turno, se puede sacar las veces que haga falta.
// Cierre Z: cierra el turno, compara lo contado con lo esperado y queda fijo.
// La idea no es acusar a nadie: es que el sistema compare, no la persona.

import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, getDocs, query, where, orderBy, limit, serverTimestamp, setDoc,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { MONEDAS, desdeUSD } from '../core/dinero.js';
import { ventasEntre, hoyISO } from './ventas.js';
import { anotar } from './auditoria.js';

/** Billetes y monedas que de verdad circulan, para contar sin pensar. */
export const DENOMINACIONES = {
  USD: [10000, 5000, 2000, 1000, 500, 200, 100],
  COP: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500],
  VES: [20000, 10000, 5000, 2000, 1000, 500],
};

export async function turnoAbierto() {
  const u = usuarioActual();
  const snap = await getDocs(query(
    col('cajas'),
    where('uid', '==', u.uid),
    where('estado', '==', 'abierta'),
    limit(1)
  ));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** fondo = { USD: 2000, COP: 50000, VES: 0 } en unidades menores. */
export async function abrirTurno(fondo) {
  const u = usuarioActual();
  const documento = refNuevo('cajas');
  await setDoc(documento, {
    estado: 'abierta',
    fondo,
    apertura: serverTimestamp(),
    dia: hoyISO(),
    uid: u.uid,
    nombreUsuario: u.nombre,
  });
  anotar('caja-abierta', { cajaId: documento.id, fondo });
  return documento.id;
}

import { gastosEntre } from './gastos.js';

/**
 * Lo que DEBERÍA haber en la gaveta: el fondo más lo cobrado en efectivo,
 * menos los gastos de caja del turno, moneda por moneda.
 */
export async function esperadoDelTurno(turno) {
  const [ventas, gastos] = await Promise.all([
    ventasEntre(turno.dia, turno.dia),
    gastosEntre(turno.dia, turno.dia).catch(() => []),
  ]);
  const mias = ventas.filter((v) => v.uid === turno.uid);
  const misGastos = gastos.filter((g) => g.uid === turno.uid);
  const esperado = { ...turno.fondo };
  let totalUSD = 0;
  let gananciaUSD = 0;
  let gastosUSD = 0;
  for (const v of mias) {
    totalUSD += v.totalUSD;
    gananciaUSD += v.gananciaUSD || 0;
    for (const p of v.pagos || []) {
      esperado[p.moneda] = (esperado[p.moneda] || 0) + p.monto;
    }
  }
  for (const g of misGastos) {
    gastosUSD += g.montoUSD || 0;
    if (g.moneda) {
      esperado[g.moneda] = (esperado[g.moneda] || 0) - (g.monto || 0);
    }
  }
  return { esperado, totalUSD, gananciaUSD, gastosUSD, cantidad: mias.length, ventas: mias };
}

/** Reporte X: no cierra nada, solo muestra cómo va el turno. */
export const reporteX = esperadoDelTurno;

/**
 * Cierre Z. `contado` = { USD: 12500, COP: 230000, VES: 8000 }.
 * La diferencia se guarda tal cual; no se "corrige" para que cuadre.
 */
export async function cerrarTurno(turno, contado, { nota = '' } = {}) {
  const u = usuarioActual();
  const { esperado, totalUSD, gananciaUSD, cantidad } = await esperadoDelTurno(turno);

  const diferencia = {};
  for (const moneda of Object.keys(MONEDAS)) {
    diferencia[moneda] = (contado[moneda] || 0) - (esperado[moneda] || 0);
  }

  const lote = writeBatch(db);
  lote.set(ref('cajas', turno.id), {
    estado: 'cerrada',
    esperado, contado, diferencia,
    ventasUSD: totalUSD,
    gananciaUSD,
    cantidadVentas: cantidad,
    nota,
    cierre: serverTimestamp(),
    cerradaPor: u.nombre,
  }, { merge: true });
  await lote.commit();

  anotar('caja-cerrada', { cajaId: turno.id, diferencia, contado, esperado });
  return { esperado, contado, diferencia, totalUSD, gananciaUSD, cantidad };
}

export async function turnosRecientes(cuantos = 20) {
  const snap = await getDocs(query(col('cajas'), orderBy('apertura', 'desc'), limit(cuantos)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Suma de un conteo por denominaciones: { 10000: 2, 5000: 1 } -> 25000 */
export const sumarConteo = (conteo = {}) =>
  Object.entries(conteo).reduce((t, [valor, cuantos]) => t + Number(valor) * Number(cuantos || 0), 0);

/** Cuánto es eso en dólares, para la vista rápida del dueño. */
export const enUSD = (monto, moneda, tasas) =>
  moneda === 'USD' ? monto : (tasas[moneda] ? Math.round((monto * 100) / tasas[moneda]) : 0);
