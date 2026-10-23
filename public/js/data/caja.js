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
import { MONEDAS, desdeUSD, LUGAR_VENTAS } from '../core/dinero.js';
import { entraALaGaveta } from '../core/sitios.js';
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

/**
 * Con cuánto quedó la gaveta en el último cierre, para enseñarlo al abrir.
 * Devuelve null si todavía no hay ninguno (o si no se pudo leer: sin internet
 * se abre igual, solo que sin la ayuda).
 */
export async function comoQuedoLaGaveta() {
  try {
    const snap = await getDoc(ref('equipo', 'turno'));
    const d = snap.exists() ? snap.data() : null;
    if (!d || !d.quedo || !Object.keys(d.quedo).length) return null;
    return {
      contado: d.quedo, noContadas: d.quedoNoContadas || [],
      cerradoPor: d.cerradoPor || '', cuando: d.quedoCierre || null, dia: d.dia || '',
    };
  } catch {
    return null;
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
 * Lo que DEBERÍA haber en la gaveta, moneda por moneda: el fondo con que se
 * abrió, más TODO lo que entró y menos TODO lo que salió de ella.
 *
 * La regla es una sola y es física: si el billete pasó por la gaveta, va aquí.
 *
 *   entra:  lo cobrado en las ventas  +  los abonos de fiados que pagaron
 *         + el dinero que se metió (ingresos)  + lo que llegó de otro sitio
 *   sale:   el VUELTO que se dio  +  los gastos  +  los retiros
 *         + lo que se llevaron a la caja fuerte
 *
 * Cada cosa de esa lista faltó alguna vez, y cada una inventó un descuadre:
 *
 *  - El vuelto. Una venta de $0,79 pagada con 5.000 pesos dejaba esperando los
 *    5.000 completos: faltante del tamaño del cambio. Fue el del 21/10.
 *  - Los abonos. Un fiado que te pagan es plata que entra y no estaba contada:
 *    sobrante sin explicación.
 *  - Los ingresos y los traslados. Meter plata a la gaveta, o llevarse algo a
 *    la caja fuerte en medio del turno, descuadraba para los dos lados.
 *  - Mira desde el día de apertura hasta HOY, no solo el día que se abrió: un
 *    turno que cruzó la medianoche dejaba fuera las ventas del día siguiente.
 *
 * Y nada se filtra por quién lo hizo: LA GAVETA ES UNA SOLA. Si el dueño saca
 * un dólar mientras el empleado tiene el turno abierto, ese dólar no está, sin
 * importar quién lo anotó. (Al empleado las reglas de Firestore le devuelven
 * solo lo suyo, así que para él no cambia nada.)
 */
export async function esperadoDelTurno(turno) {
  const hasta = hoyISO();
  const desde = turno.dia <= hasta ? turno.dia : hasta;
  const [ventas, gastos, retiros, ingresos, traslados, abonos] = await Promise.all([
    ventasEntre(desde, hasta),
    gastosEntre(desde, hasta).catch(() => []),
    import('./retiros.js').then((m) => m.retirosEntre(desde, hasta)).catch(() => []),
    import('./ingresos.js').then((m) => m.ingresosEntre(desde, hasta)).catch(() => []),
    import('./traslados.js').then((m) => m.trasladosEntre(desde, hasta)).catch(() => []),
    import('./clientes.js').then((m) => m.abonosEntre(desde, hasta)).catch(() => []),
  ]);
  // Por HORA, no por día: una venta hecha a las 8 de la mañana no es de un
  // turno que se abrió a las 10, aunque sea el mismo día. Contarla inflaba el
  // esperado y el arqueo acusaba un sobrante que nadie podía explicar.
  const desdeMs = turno.apertura?.toDate ? turno.apertura.toDate().getTime()
    : turno.apertura ? new Date(turno.apertura).getTime() : 0;
  const hastaMs = turno.cierre?.toDate ? turno.cierre.toDate().getTime() : Infinity;
  const enElTurno = (x) => {
    const t = x.ts?.toDate ? x.ts.toDate().getTime() : (x.ts ? new Date(x.ts).getTime() : null);
    if (t === null) return true;    // sin hora (venta en cola, sin red): se cuenta
    return t >= desdeMs && t <= hastaMs;
  };

  const deLaGaveta = (x) => (x.lugar || LUGAR_VENTAS) === LUGAR_VENTAS;
  const delTurno = (lista) => lista.filter(enElTurno);

  const mias = delTurno(ventas);
  const misGastos = delTurno(gastos).filter(deLaGaveta);
  const misRetiros = delTurno(retiros).filter(deLaGaveta);
  const misIngresos = delTurno(ingresos).filter(deLaGaveta);
  const misAbonos = delTurno(abonos).filter(deLaGaveta);
  const misTraslados = delTurno(traslados).filter((t) => t.desde === LUGAR_VENTAS || t.hacia === LUGAR_VENTAS);

  const esperado = { ...turno.fondo };
  const mover = (moneda, monto) => {
    if (!moneda || !monto) return;
    esperado[moneda] = (esperado[moneda] || 0) + monto;
  };
  // Lo que entra por venta o por abono solo se le pide a la gaveta si de
  // verdad cae ahí. Los bolívares entran por pago móvil: reclamarlos al cerrar
  // es un faltante inventado del tamaño de todo lo cobrado en bolívares.
  const siEsDeLaGaveta = (moneda, monto) => { if (entraALaGaveta(moneda)) mover(moneda, monto); };

  let totalUSD = 0;
  let gananciaUSD = 0;
  let vueltoUSD = 0;
  // Vendido y COBRADO no son lo mismo: una venta fiada se vendió y no entró
  // ningún billete. El arqueo se compara contra lo cobrado.
  let cobradoUSD = 0;
  for (const v of mias) {
    totalUSD += v.totalUSD;
    gananciaUSD += v.gananciaUSD || 0;
    for (const p of v.pagos || []) {
      cobradoUSD += p.montoUSD || 0;
      siEsDeLaGaveta(p.moneda, p.monto);
    }
    if (v.vuelto) {
      vueltoUSD += v.vuelto.montoUSD || 0;
      cobradoUSD -= v.vuelto.montoUSD || 0;
      siEsDeLaGaveta(v.vuelto.moneda, -(v.vuelto.monto || 0));
    }
  }

  let gastosUSD = 0;
  for (const g of misGastos) {
    gastosUSD += g.montoUSD || 0;
    mover(g.moneda, -(g.monto || 0));
  }

  let retiradoUSD = 0;
  for (const r of misRetiros) {
    retiradoUSD += r.montoUSD || 0;
    mover(r.moneda, -(r.monto || 0));
  }

  let ingresadoUSD = 0;
  for (const i of misIngresos) {
    ingresadoUSD += i.montoUSD || 0;
    mover(i.moneda, i.monto || 0);
  }

  let abonadoUSD = 0;
  for (const a of misAbonos) {
    abonadoUSD += a.montoUSD || 0;
    for (const p of a.pagos || []) siEsDeLaGaveta(p.moneda, p.monto);
  }

  let trasladadoUSD = 0;
  for (const t of misTraslados) {
    const signo = t.hacia === LUGAR_VENTAS ? 1 : -1;
    trasladadoUSD += signo * (t.montoUSD || 0);
    mover(t.moneda, signo * (t.monto || 0));
  }

  return {
    esperado, totalUSD, cobradoUSD, gananciaUSD, gastosUSD, retiradoUSD,
    vueltoUSD, ingresadoUSD, abonadoUSD, trasladadoUSD,
    cantidad: mias.length, ventas: mias,
  };
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
  // Con cuánto quedó la gaveta, para que el siguiente que abra lo VEA en vez
  // de adivinarlo. Va en el marcador del equipo —y no solo en `cajas`— porque
  // el empleado no puede leer el turno de otro, y el que abre casi nunca es el
  // que cerró. No es el registro contable (ese sigue siendo `cajas`, intacto):
  // es el dato que hace falta en la mano, y es el mismo dinero que esa persona
  // va a contar en un minuto.
  lote.set(ref('equipo', 'turno'), {
    abierto: false, cajaId: turno.id, cerradoPor: u.nombre, dia: hoyISO(),
    quedo: contado, quedoNoContadas: noContadas, quedoCierre: serverTimestamp(),
  });
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
