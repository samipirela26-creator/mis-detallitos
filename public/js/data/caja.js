// caja.js — turnos, arqueo y cierre.
//
// Reporte X: foto parcial del turno, se puede sacar las veces que haga falta.
// Cierre Z: cierra el turno, compara lo contado con lo esperado y queda fijo.
// La idea no es acusar a nadie: es que el sistema compare, no la persona.

import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, getDocs, getDoc, query, where, orderBy, limit, serverTimestamp, setDoc,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { MONEDAS, desdeUSD } from '../core/dinero.js';
import { ventasEntre, hoyISO } from './ventas.js';
import { gastosEntre } from './gastos.js';
import { anotar } from './auditoria.js';

// Los billetes viven en dinero.js, que es donde está todo lo que es plata.
// Aquí se reexporta para no romper a quien ya los importaba de este módulo.
export { DENOMINACIONES } from '../core/dinero.js';

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

/**
 * Quién tiene la caja abierta AHORA, sea quien sea.
 *
 * `turnoAbierto()` solo mira los turnos propios, y por reglas de Firestore el
 * empleado ni siquiera puede leer los de otro. Pero la gaveta es UNA SOLA: si
 * dos personas abren turno, el mismo dinero físico queda en dos arqueos y
 * ninguno de los dos cuadra. Por eso hay un marcador aparte, sin cifras de
 * plata, que el equipo entero puede leer: dice quién la tiene abierta y desde
 * cuándo, y nada más.
 */
export async function quienTieneLaCaja() {
  try {
    const snap = await getDoc(ref('equipo', 'turno'));
    const d = snap.exists() ? snap.data() : null;
    return d?.abierto ? d : null;
  } catch {
    return null;   // sin internet no se bloquea el trabajo
  }
}

/** fondo = { USD: 2000, COP: 50000, VES: 0 } en unidades menores. */
export async function abrirTurno(fondo) {
  const u = usuarioActual();
  const documento = refNuevo('cajas');
  const marcador = ref('equipo', 'turno');

  // En transacción y no con un simple "si no hay, abre": entre leer y escribir
  // caben dos clics seguidos o dos teléfonos a la vez, y así fue como quedaron
  // dos cajas abiertas del mismo minuto en las pruebas.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(marcador);
    const abierto = snap.exists() ? snap.data() : null;
    if (abierto?.abierto) {
      const quien = abierto.uid === u.uid ? 'Ya tienes' : `${abierto.nombre || 'Alguien'} ya tiene`;
      const desde = abierto.dia === hoyISO() ? 'hoy' : `desde el ${abierto.dia}`;
      throw new Error(`${quien} la caja abierta ${desde}. La gaveta es una sola: hay que cerrar ese turno antes de abrir otro.`);
    }
    tx.set(documento, {
      estado: 'abierta',
      fondo,
      apertura: serverTimestamp(),
      dia: hoyISO(),
      uid: u.uid,
      nombreUsuario: u.nombre,
    });
    tx.set(marcador, { abierto: true, cajaId: documento.id, uid: u.uid, nombre: u.nombre, dia: hoyISO() });
  });

  anotar('caja-abierta', { cajaId: documento.id, fondo });
  return documento.id;
}

/**
 * Lo que DEBERÍA haber en la gaveta: el fondo, más lo cobrado en efectivo,
 * menos los gastos y menos lo que se sacó de la caja, moneda por moneda.
 *
 * Mira desde el día de apertura hasta HOY, no solo el día que se abrió: un
 * turno que cruzó la medianoche dejaba fuera las ventas del día siguiente y el
 * arqueo acusaba un faltante del tamaño de todo lo vendido ese día.
 *
 * Y cuenta los retiros: la plata que sale por "Mi dinero → Sacar" sale de la
 * MISMA gaveta. Sin eso, sacar un dólar para la casa aparecía al cerrar como
 * un dólar faltante, y un faltante inventado tapa los de verdad.
 */
export async function esperadoDelTurno(turno) {
  const hasta = hoyISO();
  const desde = turno.dia <= hasta ? turno.dia : hasta;
  const [ventas, gastos, retiros] = await Promise.all([
    ventasEntre(desde, hasta),
    gastosEntre(desde, hasta).catch(() => []),
    import('./retiros.js').then((m) => m.retirosEntre(desde, hasta)).catch(() => []),
  ]);
  const mias = ventas.filter((v) => v.uid === turno.uid);
  const misGastos = gastos.filter((g) => g.uid === turno.uid);
  const misRetiros = retiros.filter((r) => r.uid === turno.uid && (r.lugar || 'Caja') === 'Caja');
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
  let retiradoUSD = 0;
  for (const r of misRetiros) {
    retiradoUSD += r.montoUSD || 0;
    if (r.moneda) {
      esperado[r.moneda] = (esperado[r.moneda] || 0) - (r.monto || 0);
    }
  }
  return { esperado, totalUSD, gananciaUSD, gastosUSD, retiradoUSD, cantidad: mias.length, ventas: mias };
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

  // Una moneda que NO se contó no es una moneda en cero. Antes, dejar los
  // bolívares en blanco reportaba un faltante del tamaño de todos los
  // bolívares del turno, y un faltante inventado tapa los de verdad.
  const contadas = Object.keys(MONEDAS).filter((m) => contado[m] !== undefined && contado[m] !== null);
  const noContadas = Object.keys(MONEDAS).filter((m) => !contadas.includes(m) && (esperado[m] || 0) !== 0);
  const diferencia = {};
  for (const moneda of contadas) {
    diferencia[moneda] = (contado[moneda] || 0) - (esperado[moneda] || 0);
  }

  const lote = writeBatch(db);
  // Soltar la gaveta: sin esto nadie podría volver a abrir turno.
  lote.set(ref('equipo', 'turno'), { abierto: false, cajaId: turno.id, cerradoPor: u.nombre, dia: hoyISO() });
  lote.set(ref('cajas', turno.id), {
    estado: 'cerrada',
    esperado, contado, diferencia, noContadas,
    ventasUSD: totalUSD,
    gananciaUSD,
    cantidadVentas: cantidad,
    nota,
    cierre: serverTimestamp(),
    cerradaPor: u.nombre,
  }, { merge: true });
  await lote.commit();

  anotar('caja-cerrada', { cajaId: turno.id, diferencia, contado, esperado });
  return { esperado, contado, diferencia, noContadas, totalUSD, gananciaUSD, cantidad };
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
