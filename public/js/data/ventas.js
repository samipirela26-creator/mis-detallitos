// ventas.js — registrar una venta. Es la operación más delicada de la app.
//
// Dos cosas que no se negocian:
//  1) IDEMPOTENCIA: el id del documento se genera ANTES de escribir. Si no hay
//     señal y el reintento se repite, se escribe el MISMO documento: la venta
//     no se duplica.
//  2) ATOMICIDAD: la venta, sus movimientos de inventario y el descuento de
//     stock van en un solo writeBatch.
//
// Offline: no se espera al commit. Firestore lo encola y lo sube solo cuando
// vuelve la señal; la venta se da por hecha al instante (que es lo que necesita
// una caja registradora).

import { db, ref, refNuevo, col } from '../core/firebase.js';
import {
  writeBatch, serverTimestamp, getDocs, query, where, orderBy, limit, Timestamp, increment,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual, esDueno } from '../core/sesion.js';
import { registrarMovimientos } from './inventario.js';
import { totalesVenta, totalPagadoUSD } from '../core/dinero.js';
import { anotar } from './auditoria.js';
import { escribir, leer } from '../core/estado.js';

/**
 * lineas = [{ productoId, nombre, cantidad, precioUSD, costoUSD, precioEditado,
 *             autorizadoPor, esServicio }]
 * pagos  = [{ moneda, monto, tasa, montoUSD }]
 */
export async function registrarVenta({ lineas, pagos, vuelto = null, clienteId = null, fiado = false, nota = '', sinTurno = false }) {
  const u = usuarioActual();
  if (!lineas?.length) throw new Error('La venta no tiene productos.');

  const documento = refNuevo('ventas');           // id estable ANTES de escribir
  const totales = totalesVenta(lineas);
  const pagadoUSD = totalPagadoUSD(pagos);

  const venta = {
    numero: Date.now(),
    lineas: lineas.map((l) => ({
      productoId: l.productoId || null,
      nombre: l.nombre,
      cantidad: Number(l.cantidad),
      precioUSD: Math.round(l.precioUSD),
      costoUSD: Math.round(l.costoUSD || 0),
      precioEditado: !!l.precioEditado,
      precioOriginalUSD: Math.round(l.precioOriginalUSD || l.precioUSD),
      autorizadoPor: l.autorizadoPor || null,
      // Venta libre: no salió del catálogo y su ganancia la estimó el dueño a
      // ojo. Queda escrito en la venta para poder separarlas en los reportes:
      // sin la marca, un mes con muchas ventas libres parece un mes de margen
      // real y no lo es.
      fueraDeCatalogo: !!l.fueraDeCatalogo,
      gananciaEstimada: !!l.fueraDeCatalogo,
    })),
    totalUSD: totales.totalUSD,
    costoTotalUSD: totales.costoUSD,
    gananciaUSD: totales.gananciaUSD,
    pagos,
    pagadoUSD,
    // El cambio que se le dio al cliente, con la moneda en que salió. SALE de
    // la misma gaveta: sin esto, el arqueo esperaba el billete completo con que
    // pagaron y el faltante era del tamaño del vuelto.
    vuelto: vuelto ? { moneda: vuelto.moneda, monto: vuelto.monto, montoUSD: vuelto.montoUSD } : null,
    vueltoUSD: vuelto?.montoUSD || 0,
    saldoUSD: totales.totalUSD - pagadoUSD,   // > 0 = quedó debiendo
    fiado: !!fiado,
    // Se vendió sin caja abierta: queda escrito en la venta para poder
    // encontrarlas después. Sin esta marca son invisibles.
    sinTurno: !!sinTurno,
    clienteId,
    nota,
    estado: 'ok',
    uid: u.uid,
    nombreUsuario: u.nombre,
    ts: serverTimestamp(),
    dia: new Date().toISOString().slice(0, 10),
  };

  const lote = writeBatch(db);
  lote.set(documento, venta);

  // Solo descuentan stock los productos reales; los servicios (fotocopias) no.
  const conStock = lineas.filter((l) => l.productoId && !l.esServicio);
  if (conStock.length) {
    await registrarMovimientos(
      conStock.map((l) => ({
        productoId: l.productoId,
        nombre: l.nombre,
        tipo: 'venta',
        cantidad: l.cantidad,
        costoUnitUSD: l.costoUSD,
      })),
      { lote, ventaId: documento.id }
    );
  }

  // Fiado: lo que quedó debiendo se suma al saldo del cliente, en el mismo lote.
  if (fiado && clienteId && venta.saldoUSD > 0) {
    lote.set(ref('clientes', clienteId), {
      saldoUSD: increment(venta.saldoUSD),
      ultimaCompra: serverTimestamp(),
    }, { merge: true });
  }

  // No se espera: si no hay señal, Firestore la encola y la sube después.
  const subida = lote.commit()
    .then(() => escribir('pendientes', Math.max(0, (leer('pendientes') || 1) - 1)))
    .catch((e) => console.warn('[ventas] quedó en cola:', e?.code || e));
  escribir('pendientes', (leer('pendientes') || 0) + 1);

  for (const l of venta.lineas) {
    if (l.precioEditado) {
      anotar('precio-editado-en-venta', {
        ventaId: documento.id, producto: l.nombre,
        antes: l.precioOriginalUSD, despues: l.precioUSD,
        autorizadoPor: l.autorizadoPor,
      });
    }
  }

  return { id: documento.id, venta, subida };
}

/** Anular: el dueño lo hace directo; el empleado solo puede pedirlo. */
export async function anularVenta(ventaId, motivo, venta) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(ref('ventas', ventaId), {
    estado: 'anulada',
    motivoAnulacion: motivo,
    anuladaPor: u.nombre,
    anuladaTs: serverTimestamp(),
  }, { merge: true });

  // Devolver al inventario lo que se había descontado.
  const conStock = (venta?.lineas || []).filter((l) => l.productoId);
  if (conStock.length) {
    await registrarMovimientos(
      conStock.map((l) => ({
        productoId: l.productoId, nombre: l.nombre, tipo: 'devolucion',
        cantidad: l.cantidad, costoUnitUSD: l.costoUSD,
        nota: `Anulación de venta: ${motivo}`,
      })),
      { lote, ventaId }
    );
  }
  await lote.commit();
  anotar('venta-anulada', { ventaId, motivo });
}

export async function pedirAnulacion(ventaId, motivo) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(refNuevo('anulaciones'), {
    ventaId, motivo, estado: 'pendiente',
    uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
  });
  await lote.commit();
}

/**
 * Ventas de un rango de días (YYYY-MM-DD, inclusive).
 *
 * Al empleado se le filtra por su uid, y no por gusto: las reglas de Firestore
 * solo le dejan leer SUS ventas, y una consulta que pida más se rechaza
 * COMPLETA. Sin este filtro, el empleado no podía ver su reporte X ni cerrar
 * su propio turno: el arqueo fallaba entero y en silencio.
 */
export async function ventasEntre(desde, hasta) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const u = usuarioActual();
  const soloMias = !esDueno() && u?.uid ? [where('uid', '==', u.uid)] : [];
  const snap = await getDocs(query(
    col('ventas'), ...soloMias, where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() })).filter((v) => v.estado !== 'anulada');
}

export async function ultimasVentas(cuantas = 20) {
  const snap = await getDocs(query(col('ventas'), orderBy('ts', 'desc'), limit(cuantas)));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

export const hoyISO = () => new Date().toISOString().slice(0, 10);
