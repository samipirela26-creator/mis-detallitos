// respaldo.js — bajar TODO a un archivo, y poder volver a meterlo.
//
// El formato y las conversiones viven en `core/respaldo-formato.js`, que no
// toca Firestore y está probado en `test/respaldo.test.mjs`. Aquí queda solo la
// entrada y salida: leer las colecciones y escribirlas de vuelta.
//
// Lo que NO hace, a propósito: restaurar NO borra lo que hay. Escribe encima
// por id y deja lo demás. Vaciar la base desde el teléfono es una forma muy
// fácil de perderlo todo por un toque mal dado.

import { db, col, ref, negocioId } from '../core/firebase.js';
import {
  getDocs, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import {
  COLECCIONES, COLECCION_FOTOS, armar, validar, aFirestore, nombreArchivo,
} from '../core/respaldo-formato.js';
import { reconstruirCatalogoPublico } from './productos.js';
import { anotar } from './auditoria.js';

export { validar, nombreArchivo } from '../core/respaldo-formato.js';

const TAMANO_LOTE = 150;

/** Lee una colección entera. Si falla una, no se cae el respaldo completo. */
async function leerColeccion(nombre) {
  try {
    const snap = await getDocs(col(nombre));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`[respaldo] no se pudo leer "${nombre}":`, e);
    return null;
  }
}

/**
 * Arma el respaldo completo.
 *
 * `alProgreso(nombre, i, total)` se llama por colección: con 2.000 ventas esto
 * tarda y hay que decirle al dueño que no se ha trabado.
 */
export async function armarRespaldo({ incluirFotos = false, alProgreso = () => {} } = {}) {
  const lista = incluirFotos ? [...COLECCIONES, COLECCION_FOTOS] : COLECCIONES;
  const datos = {};
  const fallaron = [];
  for (let i = 0; i < lista.length; i++) {
    const nombre = lista[i];
    alProgreso(nombre, i, lista.length);
    const filas = await leerColeccion(nombre);
    if (filas === null) fallaron.push(nombre);
    else datos[nombre] = filas;
  }
  const respaldo = armar(datos, { negocio: negocioId, incluyeFotos: incluirFotos });
  return { respaldo, fallaron };
}

/** Baja el archivo al teléfono o a la computadora. */
export function descargar(respaldo) {
  const texto = JSON.stringify(respaldo);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo();
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el archivo entero se queda en memoria hasta recargar la página.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return texto.length;
}

/** Lee el archivo que el dueño eligió y lo deja listo para validar. */
export function leerArchivo(file) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.onload = () => {
      try { resolver(JSON.parse(lector.result)); }
      catch { rechazar(new Error('El archivo no es un JSON válido. ¿Se bajó completo?')); }
    };
    lector.readAsText(file);
  });
}

/**
 * Escribe el respaldo de vuelta.
 *
 * Se valida ANTES de escribir el primer documento: restaurar a medias deja la
 * base con una mitad vieja y otra nueva, que es peor que no restaurar.
 *
 * Al terminar reconstruye `productos_venta` desde `productos`, porque el espejo
 * del empleado no se guarda: si se restaurara uno viejo, el empleado vería
 * precios que ya no existen.
 */
export async function restaurar(datos, { alProgreso = () => {} } = {}) {
  const v = validar(datos);
  if (!v.ok) throw new Error(v.error);

  let escritos = 0;
  const porColeccion = {};
  const rechazadas = {};

  for (const [nombre, filas] of Object.entries(datos.colecciones)) {
    if (!Array.isArray(filas) || !filas.length) continue;
    // Una colección que esta versión de la app no conoce se salta: escribirla
    // a ciegas mete basura que después nadie sabe de dónde salió.
    if (nombre !== COLECCION_FOTOS && !COLECCIONES.includes(nombre)) continue;

    let hechos = 0;
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const trozo = filas.slice(i, i + TAMANO_LOTE);
      const lote = writeBatch(db);
      for (const fila of trozo) {
        const { id, ...campos } = fila;
        lote.set(ref(nombre, id), aFirestore(campos, Timestamp), { merge: true });
      }
      try {
        await lote.commit();
        hechos += trozo.length;
        escritos += trozo.length;
        alProgreso(nombre, escritos, v.total);
      } catch (e) {
        // NO se corta la restauración: lo que sí entra, entra. Pero se guarda
        // qué colección rechazó y por qué, porque callarlo es exactamente el
        // fallo que esto venía a evitar — creer que restauró cuando no.
        //
        // Lo normal aquí es `permission-denied`: las reglas son append-only a
        // propósito (`movimientos` no admite update, y `ventas`/`cajas` exigen
        // que el uid del documento sea el de quien escribe). Un respaldo trae
        // el uid ORIGINAL, así que el dueño no puede reponer lo que registró
        // el empleado. Para eso está `scripts/restaurar-respaldo.mjs`, que
        // entra con llave de administrador y no pasa por las reglas.
        rechazadas[nombre] = e?.code || e?.message || 'error desconocido';
        console.warn(`[respaldo] "${nombre}" rechazada:`, e);
        break;
      }
    }
    if (hechos) porColeccion[nombre] = hechos;
  }

  // El espejo público se rehace, no se restaura.
  let espejo = null;
  try { espejo = await reconstruirCatalogoPublico(); }
  catch (e) { console.warn('[respaldo] no se pudo rehacer el catálogo público:', e); }

  anotar('respaldo-restaurado', {
    fechaDelRespaldo: datos.fecha || null,
    documentos: escritos,
    colecciones: porColeccion,
    rechazadas,
  });

  return { escritos, porColeccion, espejo, rechazadas, total: v.total };
}
