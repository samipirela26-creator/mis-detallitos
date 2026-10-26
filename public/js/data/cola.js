// cola.js — las escrituras que NO se esperan.
//
// POR QUÉ EXISTE ESTE ARCHIVO. Firestore, con caché local encendida (ver
// core/firebase.js), aplica la escritura en el disco del teléfono en el acto,
// pero la promesa de `commit()` / `setDoc()` solo se cumple cuando el SERVIDOR
// contesta. Si una pantalla hace `await` de eso antes de cerrar el cuadro o
// repintar, el botón se queda pegado el tiempo que tarde la señal: en el
// mostrador, con una raya de datos, eso es un segundo o dos por cada toque —
// "le doy clic y no pasa nada".
//
// El dato ya está guardado antes de que el servidor conteste. Así que lo que
// hacemos es anotar la escritura como PENDIENTE, seguir de largo, y dejar que
// el SDK la suba cuando pueda (también si la app se cerró en el medio: la cola
// vive en disco). Es el mismo trato que `registrarVenta` ya se daba desde el
// principio; aquí se vuelve la regla de la casa.
//
// Cuándo NO usarlo: cuando la pantalla necesita de verdad la respuesta del
// servidor para decidir algo (un PIN, un permiso, un dato que vuelve escrito).
// Para "guardé esto", nunca.
import { leer, escribir } from '../core/estado.js';
import { avisarMal } from '../ui/avisos.js';

export function encolar(promesa, etiqueta = 'escritura') {
  escribir('pendientes', (leer('pendientes') || 0) + 1);
  return promesa
    .then(() => { escribir('pendientes', Math.max(0, (leer('pendientes') || 1) - 1)); })
    // Se queda contada como pendiente a propósito: el SDK la sigue
    // reintentando y el aviso de "queda algo por subir" tiene que seguir ahí.
    .catch((e) => {
      console.warn(`[${etiqueta}] quedó en cola:`, e?.code || e);
      // Sin señal no hay nada que avisar: se sube cuando vuelva. Pero un
      // RECHAZO no se reintenta nunca —las reglas dijeron no—, y entonces la
      // pantalla ya dijo "guardado" por algo que se va a deshacer. Eso hay que
      // cantarlo, o se trabaja sobre un dato que no existe.
      if (e?.code === 'permission-denied' || e?.code === 'invalid-argument') {
        avisarMal(`No se pudo guardar (${etiqueta}). No tienes permiso para eso.`);
      }
    });
}
