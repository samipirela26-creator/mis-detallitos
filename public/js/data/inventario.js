// inventario.js — el LEDGER. El stock del producto es un espejo; la verdad es
// la lista de movimientos. Así se puede auditar de dónde salió cada unidad.

import { db, col, refNuevo } from '../core/firebase.js';
import {
  writeBatch, getDocs, query, where, orderBy, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { operacionStock } from './productos.js';

export const TIPOS = {
  compra: { etiqueta: 'Compra', signo: +1 },
  venta: { etiqueta: 'Venta', signo: -1 },
  ajuste: { etiqueta: 'Ajuste', signo: +1 },   // el signo lo trae la cantidad
  merma: { etiqueta: 'Merma / dañado', signo: -1 },
  devolucion: { etiqueta: 'Devolución', signo: +1 },
  inicial: { etiqueta: 'Carga inicial', signo: +1 },
};

/**
 * Registra movimientos y mueve el stock, todo en el mismo lote: o entran los
 * dos o no entra ninguno.
 * movimientos = [{ productoId, tipo, cantidad, costoUnitUSD?, nota?, ventaId? }]
 */
export async function registrarMovimientos(movimientos, { lote = null, ventaId = null } = {}) {
  const u = usuarioActual();
  const propio = !lote;
  const l = lote || writeBatch(db);

  for (const m of movimientos) {
    const signo = TIPOS[m.tipo]?.signo ?? 1;
    const delta = m.tipo === 'ajuste' ? Number(m.cantidad) : signo * Math.abs(Number(m.cantidad));
    l.set(refNuevo('movimientos'), {
      productoId: m.productoId,
      nombre: m.nombre || '',
      tipo: m.tipo,
      cantidad: delta,
      costoUnitUSD: Math.round(m.costoUnitUSD || 0),
      nota: m.nota || '',
      ventaId: m.ventaId || ventaId || null,
      uid: u.uid,
      nombreUsuario: u.nombre,
      ts: serverTimestamp(),
    });
    operacionStock(l, m.productoId, delta);
  }

  if (propio) await l.commit();
  return l;
}

/** Entrada de mercancía: sube stock y actualiza el costo del producto. */
export async function registrarCompra(lineas, { nota = '' } = {}) {
  await registrarMovimientos(
    lineas.map((x) => ({ ...x, tipo: 'compra', nota }))
  );
}

export async function movimientosDe(productoId, cuantos = 50) {
  const snap = await getDocs(query(
    col('movimientos'),
    where('productoId', '==', productoId),
    orderBy('ts', 'desc'),
    limit(cuantos)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Productos por debajo de su mínimo. */
export const bajoMinimo = (productos) =>
  productos.filter((p) => p.tipo !== 'servicio' && p.stockMinimo > 0 && p.stock <= p.stockMinimo);
