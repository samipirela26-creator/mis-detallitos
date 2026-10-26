// lectura.js — leer DOS VECES: primero lo que ya está en el teléfono.
//
// El gemelo de data/cola.js, para el otro lado del mismo problema. Firestore,
// con caché local encendida, tiene las ventas de hoy guardadas en el teléfono,
// pero `getDocs` pregunta al SERVIDOR igual: abrir Reportes o tocar la pestaña
// "Ayer" se queda esperando la señal aunque la respuesta esté ahí mismo.
//
// LO QUE NO SE PUEDE HACER es leer solo de la caché: la venta que acaba de
// cobrar el empleado en su teléfono no está en el del dueño, y un reporte que
// miente no sirve para nada. Así que se leen las dos:
//
//   1. CACHÉ: instantánea. La pantalla pinta algo de inmediato.
//   2. SERVIDOR: la de verdad. Cuando contesta, repinta encima.
//
// Casi siempre son el mismo número y el repintado no se nota. Cuando no, el
// dueño ve el dato bueno un segundo después, en vez de ver una pantalla en
// blanco ese mismo segundo.
//
// `pasadas(hacer)` es el patrón que usan las pantallas; `traer` es lo que usan
// las funciones de data/ para pedir una consulta a una fuente u otra.
import { getDocs, getDocsFromCache } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

export const CACHE = 'cache';
export const SERVIDOR = 'servidor';

/** Los documentos de una consulta, de la fuente que se pida. */
export async function traer(consulta, fuente = SERVIDOR) {
  const snap = fuente === CACHE
    ? await getDocsFromCache(consulta)
    : await getDocs(consulta);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Las dos pasadas de una pantalla.
 *
 * `hacer(fuente)` carga y pinta. Devuelve `false` si decidió NO pintar (la
 * caché no tenía nada que valga la pena: en ese caso se deja el "Cargando…" en
 * su sitio en vez de cantar un "no hay nada" que es mentira).
 *
 * La pasada de caché nunca rompe nada: si falla o está vacía, se sigue
 * derecho al servidor. La del servidor sí: si esa falla, es que no hay datos y
 * la pantalla tiene que poder decirlo, así que el error se deja salir.
 */
export async function pasadas(hacer) {
  let pintado = false;
  try {
    pintado = (await hacer(CACHE)) !== false;
  } catch (e) {
    pintado = false;   // sin caché (primera vez, o se limpió): no pasa nada
  }
  await hacer(SERVIDOR);
  return pintado;
}
