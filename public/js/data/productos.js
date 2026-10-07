// productos.js — alta, edición y baja del catálogo. SOLO el dueño escribe aquí.
//
// CLAVE DE SEGURIDAD: cada escritura toca DOS documentos en el mismo writeBatch:
//   productos/{id}        -> completo, con costoUSD   (lo lee el dueño)
//   productos_venta/{id}  -> espejo SIN costo ni margen (lo lee el empleado)
// Si se escribe uno sin el otro, el empleado ve precios viejos o ve costos.

import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, doc, getDocs, query, where, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { normalizar, claveProducto } from '../core/texto.js';
import { anotar } from './auditoria.js';

/** Campos que NUNCA pueden llegar a la app del empleado. */
const SECRETOS = ['costoUSD', 'margenObjetivo', 'proveedor', 'notaCosto'];

/** Deja el producto listo para guardar: normaliza nombre, alias y números. */
export function normalizarProducto(p) {
  const nombre = (p.nombre || '').trim();
  const alias = (p.alias || []).map((a) => a.trim()).filter(Boolean);
  return {
    nombre,
    nombreNorm: normalizar(nombre),
    clave: claveProducto(nombre),
    alias,
    aliasNorm: alias.map(normalizar),
    categoria: (p.categoria || '').trim(),
    sku: (p.sku || '').trim(),
    codigoBarras: (p.codigoBarras || '').trim(),
    tipo: p.tipo || 'producto',
    tipoPrecio: p.tipoPrecio === 'variable' ? 'variable' : 'fijo',
    precioUSD: Math.round(p.precioUSD || 0),
    precioMinimoUSD: Math.round(p.precioMinimoUSD || 0),
    escalas: (p.escalas || [])
      .filter((e) => e && e.desdeCant > 0 && e.precioUSD >= 0)
      .map((e) => ({ desdeCant: Number(e.desdeCant), precioUSD: Math.round(e.precioUSD) }))
      .sort((a, b) => a.desdeCant - b.desdeCant),
    costoUSD: Math.round(p.costoUSD || 0),
    stock: Number(p.stock || 0),
    stockMinimo: Number(p.stockMinimo || 0),
    unidad: p.unidad || 'unidad',
    fotoPendiente: p.fotoPendiente !== false,
    tieneFoto: !!p.tieneFoto,
    incompleto: !p.precioUSD || !p.costoUSD,
    activo: p.activo !== false,
    importId: p.importId || null,
  };
}

/** La versión que puede ver el empleado. */
export function versionVenta(p) {
  const copia = { ...p };
  for (const campo of SECRETOS) delete copia[campo];
  // El mínimo tampoco se manda: delataría el costo.
  delete copia.precioMinimoUSD;
  delete copia.incompleto;
  return copia;
}

/** Crea o actualiza un producto (los dos documentos a la vez). */
export async function guardarProducto(datos, id = null) {
  const limpio = normalizarProducto(datos);
  const documento = id ? ref('productos', id) : refNuevo('productos');
  const productoId = documento.id;

  const lote = writeBatch(db);
  lote.set(documento, { ...limpio, actualizado: serverTimestamp() }, { merge: !!id });
  lote.set(ref('productos_venta', productoId), { ...versionVenta(limpio), actualizado: serverTimestamp() }, { merge: !!id });
  await lote.commit();

  anotar(id ? 'producto-editado' : 'producto-creado', { productoId, nombre: limpio.nombre });
  return productoId;
}

/** Desactivar en vez de borrar: las ventas viejas tienen que seguir cuadrando. */
export async function desactivarProducto(id) {
  const lote = writeBatch(db);
  lote.set(ref('productos', id), { activo: false, actualizado: serverTimestamp() }, { merge: true });
  lote.set(ref('productos_venta', id), { activo: false, actualizado: serverTimestamp() }, { merge: true });
  await lote.commit();
  anotar('producto-desactivado', { productoId: id });
}

export async function reactivarProducto(id) {
  const lote = writeBatch(db);
  lote.set(ref('productos', id), { activo: true }, { merge: true });
  lote.set(ref('productos_venta', id), { activo: true }, { merge: true });
  await lote.commit();
}

/** Agrega un sinónimo y lo deja listo para buscar. */
export async function agregarAlias(id, alias, aliasPrevios = []) {
  const alias2 = [...new Set([...aliasPrevios, alias.trim()].filter(Boolean))];
  const lote = writeBatch(db);
  const campos = { alias: alias2, aliasNorm: alias2.map(normalizar) };
  lote.set(ref('productos', id), campos, { merge: true });
  lote.set(ref('productos_venta', id), campos, { merge: true });
  await lote.commit();
  anotar('alias-agregado', { productoId: id, alias });
}

/** Marca que el producto ya tiene foto (lo usa el Estudio de Fotos). */
export async function marcarFoto(id, tiene = true) {
  const lote = writeBatch(db);
  const campos = { tieneFoto: tiene, fotoPendiente: !tiene };
  lote.set(ref('productos', id), campos, { merge: true });
  lote.set(ref('productos_venta', id), campos, { merge: true });
  await lote.commit();
}

/**
 * Guarda muchos productos de un golpe (el importador de Excel).
 * Firestore aguanta 500 operaciones por lote y aquí van 2 por producto,
 * así que se parte de 200 en 200. `alAvanzar(hechos, total)` pinta la barra.
 */
export async function guardarEnLote(lista, importId, alAvanzar = () => {}) {
  const TAMANO = 200;
  let hechos = 0;
  const ids = [];
  for (let i = 0; i < lista.length; i += TAMANO) {
    const trozo = lista.slice(i, i + TAMANO);
    const lote = writeBatch(db);
    for (const p of trozo) {
      const limpio = normalizarProducto({ ...p, importId });
      const documento = p.id ? ref('productos', p.id) : refNuevo('productos');
      ids.push(documento.id);
      lote.set(documento, { ...limpio, actualizado: serverTimestamp() }, { merge: !!p.id });
      lote.set(ref('productos_venta', documento.id), { ...versionVenta(limpio), actualizado: serverTimestamp() }, { merge: !!p.id });
    }
    await lote.commit();
    hechos += trozo.length;
    alAvanzar(hechos, lista.length);
  }
  anotar('importacion', { importId, cantidad: lista.length });
  return ids;
}

/** Deshace una importación completa: borra solo lo que entró con ese importId. */
export async function deshacerImportacion(importId, alAvanzar = () => {}) {
  const snap = await getDocs(query(col('productos'), where('importId', '==', importId)));
  const docs = snap.docs;
  const TAMANO = 200;
  for (let i = 0; i < docs.length; i += TAMANO) {
    const lote = writeBatch(db);
    for (const d of docs.slice(i, i + TAMANO)) {
      lote.delete(d.ref);
      lote.delete(ref('productos_venta', d.id));
    }
    await lote.commit();
    alAvanzar(Math.min(i + TAMANO, docs.length), docs.length);
  }
  anotar('importacion-deshecha', { importId, cantidad: docs.length });
  return docs.length;
}

/** Ajuste directo del stock (lo usa el ledger de inventario). */
export function operacionStock(lote, productoId, delta) {
  lote.set(ref('productos', productoId), { stock: increment(delta) }, { merge: true });
  lote.set(ref('productos_venta', productoId), { stock: increment(delta) }, { merge: true });
}
