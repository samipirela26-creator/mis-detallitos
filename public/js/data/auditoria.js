// auditoria.js — rastro de quién hizo qué. Solo el dueño lo lee; nadie lo borra.
import { col } from '../core/firebase.js';
import { addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';

/** anotar('precio-editado', { productoId, antes, despues }) */
export function anotar(accion, detalle = {}) {
  const u = usuarioActual();
  if (!u) return Promise.resolve();
  // No se espera: la auditoría nunca debe trabar una venta.
  return addDoc(col('auditoria'), {
    accion,
    detalle,
    uid: u.uid,
    nombre: u.nombre,
    ts: serverTimestamp(),
  }).catch((e) => console.warn('[auditoria]', e?.code || e));
}
