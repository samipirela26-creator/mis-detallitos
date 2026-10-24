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
import { aUSD } from '../core/dinero.js';
import { versionVenta, SECRETOS } from '../core/producto-publico.js';

export { versionVenta, SECRETOS };

/** Campos que NUNCA pueden llegar a la app del empleado. */

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
    // El precio de verdad es el de la etiqueta del estante, que está en pesos.
    // `precioUSD` se deriva de él con la tasa del día (ver recalcularPrecios).
    // Antes era al revés y por eso la etiqueta y el catálogo se separaban 6%:
    // la lista se armó a tasa 3.000 y el peso siguió moviéndose.
    precioCOP: Math.round(p.precioCOP || 0),
    precioUSD: Math.round(p.precioUSD || 0),
    precioMinimoUSD: Math.round(p.precioMinimoUSD || 0),
    // Igual que el precio base: el número de verdad es el peso y el dólar se
    // deriva. Antes la escala SOLO se guardaba en dólares y `recalcularPrecios`
    // no la tocaba, así que al mover la tasa el precio de la etiqueta se
    // corregía y el del mayoreo se quedaba atrás: el mismo desfase del 6% que
    // ya se arregló arriba, vivo en las fotocopias al mayor.
    // Las escalas viejas no traen `precioCOP` (0): esas se dejan como están.
    escalas: (p.escalas || [])
      .filter((e) => e && e.desdeCant > 0 && (e.precioCOP >= 0 || e.precioUSD >= 0))
      .map((e) => ({
        desdeCant: Number(e.desdeCant),
        precioCOP: Math.round(e.precioCOP || 0),
        precioUSD: Math.round(e.precioUSD || 0),
      }))
      .sort((a, b) => a.desdeCant - b.desdeCant),
    costoUSD: Math.round(p.costoUSD || 0),
    // El costo también se paga en pesos (la resma, la mica, la tinta), así que
    // también se guarda en pesos y el dólar se deriva. Sin esto el precio se
    // corregía con cada tasa nueva y el costo se quedaba quieto: el margen que
    // muestran los reportes se iba abriendo solo, sin que nadie cambiara nada.
    // OJO: `costoCOP` está en SECRETOS. No puede llegar al empleado.
    costoCOP: Math.round(p.costoCOP || 0),
    // Cómo se compró: "la docena en 1,80". Solo para que el dueño lo vea tal
    // como lo escribió; lo que manda en las cuentas es el unitario de arriba.
    // Marca que ese costo NO salió de una factura. 112 de los 158 productos
    // importados traían costo = precio/1,30: era una fórmula del Excel, no lo
    // que se le pagó al proveedor. Marcarlo evita que el valor del inventario
    // y la ganancia se den por firmes.
    costoEstimado: !!p.costoEstimado,
    costoPaquete: p.costoPaquete?.unidades > 1 && p.costoPaquete?.totalUSD > 0
      ? { unidades: Number(p.costoPaquete.unidades), totalUSD: Math.round(p.costoPaquete.totalUSD) }
      : null,
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

  // Cómo estaba ANTES, para poder explicar un descuadre sin adivinar. Se lee
  // de la caché en memoria (no cuesta una lectura) y si no está, no pasa nada:
  // el rastro sale sin el "antes", que es lo que había hasta ahora.
  const antes = id ? (leer('productos') || []).find((p) => p.id === id) : null;

  const lote = writeBatch(db);
  lote.set(documento, { ...limpio, actualizado: serverTimestamp() }, { merge: !!id });
  lote.set(ref('productos_venta', productoId), { ...versionVenta(limpio), actualizado: serverTimestamp() }, { merge: !!id });
  await lote.commit();

  anotar(id ? 'producto-editado' : 'producto-creado', {
    productoId,
    nombre: limpio.nombre,
    ...(antes ? { cambios: queCambio(antes, limpio) } : {}),
  });
  return productoId;
}

/**
 * Qué cambió de verdad, campo por campo: { precioUSD: { antes: 120, ahora: 150 } }.
 *
 * Solo los campos que mueven plata o stock. Guardar el producto entero dos
 * veces engordaría la auditoría sin que nadie la lea; lo que se consulta
 * cuando la caja no cuadra es "¿a esto le cambiaron el precio?".
 */
function queCambio(antes, ahora) {
  const MIRAR = ['precioUSD', 'precioCOP', 'costoUSD', 'costoCOP', 'precioMinimoUSD', 'stock', 'nombre', 'activo'];
  const cambios = {};
  for (const campo of MIRAR) {
    const a = antes?.[campo] ?? null;
    const b = ahora?.[campo] ?? null;
    if (a !== b) cambios[campo] = { antes: a, ahora: b };
  }
  return cambios;
}

/**
 * Vuelve a sacar el precio en dólares desde el precio en pesos, con la tasa que
 * se acaba de cargar.
 *
 * Esto es lo que mantiene pegada la etiqueta del estante al catálogo: el número
 * que el cliente lee en el anaquel está en pesos y no cambia; el dólar que
 * cobra la app se recalcula cada vez que el peso se mueve. Antes era al revés y
 * los dos se fueron separando hasta un 6%.
 *
 * Solo toca los productos que tienen precio en pesos: los demás siguen como
 * estaban, con su precio en dólares escrito a mano.
 */
export async function recalcularPrecios(lista, tasaCOP) {
  if (!tasaCOP || tasaCOP <= 0) return { cambiados: 0 };
  const cambios = [];
  for (const p of lista) {
    const cambio = { id: p.id };
    if (p.precioCOP > 0) {
      const nuevo = aUSD(p.precioCOP, 'COP', tasaCOP);
      if (nuevo > 0 && nuevo !== p.precioUSD) cambio.precioUSD = nuevo;
    }
    // Los tramos de mayoreo se recalculan junto con el precio base, o el que
    // pide 200 fotocopias paga la tasa de hace un mes.
    if (p.costoCOP > 0) {
      const nuevo = aUSD(p.costoCOP, 'COP', tasaCOP);
      if (nuevo > 0 && nuevo !== p.costoUSD) cambio.costoUSD = nuevo;
    }
    const escalas = (p.escalas || []).map((e) => (
      e.precioCOP > 0 ? { ...e, precioUSD: aUSD(e.precioCOP, 'COP', tasaCOP) } : e
    ));
    if (escalas.some((e, i) => e.precioUSD !== p.escalas[i].precioUSD)) cambio.escalas = escalas;
    if (cambio.precioUSD || cambio.costoUSD || cambio.escalas) cambios.push(cambio);
  }
  if (cambios.length) await actualizarEnLote(cambios);
  return { cambiados: cambios.length };
}

/**
 * Rehace `productos_venta` a partir de `productos`.
 *
 * Por qué hace falta: el espejo solo se escribe cuando el dueño guarda un
 * producto. Un catálogo cargado antes de que el espejo existiera (o una
 * importación hecha con una versión vieja) deja `productos` lleno y
 * `productos_venta` vacío — y entonces el catálogo público de los clientes
 * sale en blanco aunque el inventario esté completo.
 *
 * Solo copia; no borra ni toca `productos`. Es idempotente: correrlo dos veces
 * deja lo mismo.
 */
export async function reconstruirCatalogoPublico() {
  const snap = await getDocs(col('productos'));
  let escritos = 0;

  // Firestore admite 500 operaciones por lote; se va de 400 para ir holgado.
  let lote = writeBatch(db);
  let enLote = 0;

  for (const d of snap.docs) {
    const limpio = normalizarProducto(d.data());
    lote.set(ref('productos_venta', d.id), { ...versionVenta(limpio), actualizado: serverTimestamp() }, { merge: true });
    escritos++;
    if (++enLote >= 400) {
      await lote.commit();
      lote = writeBatch(db);
      enLote = 0;
    }
  }
  if (enLote) await lote.commit();

  anotar('catalogo-publico-reconstruido', { productos: escritos });
  return { leidos: snap.size, escritos };
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
 * Actualiza productos que YA existen, desde una importación.
 *
 * Nació de un problema real: el inventario se cargó bien, y después hubo que
 * agregarle categorías y sinónimos a los 157 productos. Volver a importar no
 * servía (las filas repetidas se saltan) y editarlos a mano era inviable.
 *
 * Lo que NO toca, a propósito:
 *  - `stock`: el del archivo es una foto vieja del día que se contó. Si lo
 *    pisara, borraría todas las ventas hechas desde entonces.
 *  - `importId`: si le pusiera el de esta importación, "deshacer importación"
 *    borraría productos que ya existían antes y que nadie pidió borrar.
 *  - El ledger: no se asienta ningún movimiento, porque no entró ni salió
 *    mercancía. Cambiar una etiqueta no es un movimiento de inventario.
 */
export async function actualizarEnLote(lista, alAvanzar = () => {}) {
  const TAMANO = 150;
  let hechos = 0;
  const subidas = [];
  for (let i = 0; i < lista.length; i += TAMANO) {
    const trozo = lista.slice(i, i + TAMANO);
    const lote = writeBatch(db);
    for (const p of trozo) {
      if (!p.id) continue;
      const alias = (p.alias || []).map((a) => a.trim()).filter(Boolean);
      // Solo los campos que el archivo describe de verdad. Un campo vacío en el
      // Excel se ignora en vez de borrar lo que ya está cargado: el archivo casi
      // nunca trae TODO, y una celda en blanco significa "no sé", no "bórralo".
      const campos = { actualizado: serverTimestamp() };
      if (p.categoria) campos.categoria = p.categoria.trim();
      if (alias.length) { campos.alias = alias; campos.aliasNorm = alias.map(normalizar); }
      if (p.sku) campos.sku = p.sku.trim();
      if (p.codigoBarras) campos.codigoBarras = p.codigoBarras.trim();
      if (p.unidad) campos.unidad = p.unidad.trim();
      if (p.precioCOP) campos.precioCOP = Math.round(p.precioCOP);
      if (p.precioUSD) campos.precioUSD = Math.round(p.precioUSD);
      if (p.costoUSD) campos.costoUSD = Math.round(p.costoUSD);
      if (p.costoCOP) campos.costoCOP = Math.round(p.costoCOP);
      if (p.stockMinimo) campos.stockMinimo = Number(p.stockMinimo);
      if (p.escalas && p.escalas.length) {
        campos.escalas = p.escalas
          .filter((e) => e && e.desdeCant > 0 && (e.precioCOP >= 0 || e.precioUSD >= 0))
          .map((e) => ({
            desdeCant: Number(e.desdeCant),
            precioCOP: Math.round(e.precioCOP || 0),
            precioUSD: Math.round(e.precioUSD || 0),
          }))
          .sort((a, b) => a.desdeCant - b.desdeCant);
      }

      lote.set(ref('productos', p.id), campos, { merge: true });
      lote.set(ref('productos_venta', p.id), versionVenta(campos), { merge: true });
    }
    const cuantos = trozo.length;
    escribir('pendientes', (leer('pendientes') || 0) + cuantos);
    subidas.push(
      lote.commit()
        .then(() => escribir('pendientes', Math.max(0, (leer('pendientes') || cuantos) - cuantos)))
        .catch((e) => { console.warn('[productos] actualización en cola:', e?.code || e); })
    );
    hechos += cuantos;
    alAvanzar(hechos, lista.length);
    await new Promise((ok) => setTimeout(ok, 0));
  }
  anotar('importacion-actualiza', { cantidad: lista.length });
  return Promise.allSettled(subidas);
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
