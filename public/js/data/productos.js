// productos.js — alta, edición y baja del catálogo. SOLO el dueño escribe aquí.
//
// CLAVE DE SEGURIDAD: cada escritura toca DOS documentos en el mismo writeBatch:
//   productos/{id}        -> completo, con costoUSD   (lo lee el dueño)
//   productos_venta/{id}  -> espejo SIN costo ni margen (lo lee el empleado)
// Si se escribe uno sin el otro, el empleado ve precios viejos o ve costos.

import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, doc, getDocs, getDocsFromCache, query, where, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { normalizar, claveProducto } from '../core/texto.js';
import { usuarioActual } from '../core/sesion.js';
import { escribir, leer } from '../core/estado.js';
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

/**
 * Lee del servidor TODAS las claves del catálogo, incluidos los desactivados,
 * para que el importador detecte duplicados de verdad.
 *
 * Por qué no se usa la caché en memoria: esa lista solo trae `activo == true`
 * (ver data/catalogo.js) y encima está vacía hasta que entra el primer
 * snapshot. Importar en ese hueco mete el inventario duplicado sin avisar.
 * Son N lecturas una sola vez por importación: baratísimo contra el destrozo.
 */
export async function clavesExistentes() {
  // Sin señal se usa la última copia sincronizada: no es perfecta (un producto
  // creado en otro dispositivo mientras estabas offline no está), pero es
  // muchísimo mejor que no comparar nada. Quien llama mira `desdeCache` para
  // avisarlo.
  let snap, desdeCache = false;
  try {
    snap = await getDocs(col('productos'));
    desdeCache = snap.metadata.fromCache;
  } catch (e) {
    console.warn('[productos] claves desde caché:', e?.code || e);
    snap = await getDocsFromCache(col('productos'));
    desdeCache = true;
  }
  const mapa = new Map();
  for (const d of snap.docs) {
    const p = d.data();
    const clave = p.clave || claveProducto(p.nombre || '');
    if (clave) mapa.set(clave, { id: d.id, nombre: p.nombre || '', activo: p.activo !== false });
  }
  mapa.desdeCache = desdeCache;
  return mapa;
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
 *
 * Cada producto cuesta hasta 3 operaciones (producto + espejo + asiento
 * `inicial` en el ledger si trae existencia), y Firestore aguanta 500 por
 * lote, así que se parte de 150 en 150. `alAvanzar(hechos, total)` pinta la
 * barra.
 *
 * SIN CONEXIÓN FUNCIONA IGUAL, y es a propósito: `commit()` no se espera, como
 * en una venta (ver data/ventas.js). Firestore escribe en el caché local al
 * instante — el catálogo queda usable de inmediato — y encola la subida en
 * IndexedDB, que sobrevive a cerrar la app. Si se esperara el `commit()`, la
 * barra se quedaría congelada hasta que volviera la señal.
 *
 * El asiento `inicial` NO usa increment(): el stock ya va escrito con su valor
 * exacto arriba. El movimiento está para que el ledger cuadre con el stock
 * desde el primer día — si no, auditar de dónde salió cada unidad es imposible
 * porque el inventario entero habría aparecido de la nada.
 */
export async function guardarEnLote(lista, importId, alAvanzar = () => {}) {
  const TAMANO = 150;
  const u = usuarioActual();
  let hechos = 0;
  const ids = [];
  const subidas = [];
  for (let i = 0; i < lista.length; i += TAMANO) {
    const trozo = lista.slice(i, i + TAMANO);
    const lote = writeBatch(db);
    for (const p of trozo) {
      const limpio = normalizarProducto({ ...p, importId });
      const documento = p.id ? ref('productos', p.id) : refNuevo('productos');
      ids.push(documento.id);
      lote.set(documento, { ...limpio, actualizado: serverTimestamp() }, { merge: !!p.id });
      lote.set(ref('productos_venta', documento.id), { ...versionVenta(limpio), actualizado: serverTimestamp() }, { merge: !!p.id });

      if (u && limpio.stock) {
        lote.set(refNuevo('movimientos'), {
          productoId: documento.id,
          nombre: limpio.nombre,
          tipo: 'inicial',
          cantidad: limpio.stock,
          costoUnitUSD: limpio.costoUSD,
          nota: `Carga inicial (importación ${importId})`,
          ventaId: null,
          importId,
          uid: u.uid,
          nombreUsuario: u.nombre,
          ts: serverTimestamp(),
        });
      }
    }
    // No se espera: si no hay señal, Firestore lo encola y lo sube después.
    // Se cuentan PRODUCTOS, no lotes: "faltan 7 por subir" con lotes de 150
    // no le dice nada a nadie.
    const cuantos = trozo.length;
    escribir('pendientes', (leer('pendientes') || 0) + cuantos);
    subidas.push(
      lote.commit()
        .then(() => escribir('pendientes', Math.max(0, (leer('pendientes') || cuantos) - cuantos)))
        .catch((e) => { console.warn('[productos] lote en cola:', e?.code || e); })
    );

    hechos += trozo.length;
    alAvanzar(hechos, lista.length);
    // Un respiro entre lotes: con miles de productos, encolar sin soltar el
    // hilo congela la pantalla en un teléfono.
    await new Promise((ok) => setTimeout(ok, 0));
  }
  anotar('importacion', { importId, cantidad: lista.length });
  ids.subida = Promise.allSettled(subidas);
  return ids;
}

/**
 * Deshace una importación completa: borra solo lo que entró con ese importId.
 *
 * Los asientos del ledger no se borran (la regla de Firestore no lo permite, y
 * así debe ser: un libro contable no se tacha). Se compensan con un asiento
 * contrario, que es como se corrige un error en contabilidad de verdad: el
 * neto queda en cero y el rastro de que pasó se conserva.
 */
export async function deshacerImportacion(importId, alAvanzar = () => {}) {
  const snap = await getDocs(query(col('productos'), where('importId', '==', importId)));
  const docs = snap.docs;
  const u = usuarioActual();
  const TAMANO = 150;
  for (let i = 0; i < docs.length; i += TAMANO) {
    const lote = writeBatch(db);
    for (const d of docs.slice(i, i + TAMANO)) {
      const p = d.data();
      lote.delete(d.ref);
      lote.delete(ref('productos_venta', d.id));

      if (u && p.stock) {
        lote.set(refNuevo('movimientos'), {
          productoId: d.id,
          nombre: p.nombre || '',
          tipo: 'ajuste',
          cantidad: -Number(p.stock),
          costoUnitUSD: Number(p.costoUSD || 0),
          nota: `Importación ${importId} deshecha`,
          ventaId: null,
          importId,
          uid: u.uid,
          nombreUsuario: u.nombre,
          ts: serverTimestamp(),
        });
      }
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
