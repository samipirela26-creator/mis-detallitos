// sinonimos.js — la app aprende cómo le dice la gente a las cosas.
//
// Si alguien busca "gomita", no encuentra nada (o no hace clic en lo primero) y
// termina vendiendo "Borrador Nata", eso se anota. El dueño luego ve la bandeja
// y con un toque "gomita" queda como sinónimo para siempre. Cada semana la app
// encuentra más cosas que la semana pasada.

import { col, ref, refNuevo } from '../core/firebase.js';
import { setDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { normalizar } from '../core/texto.js';
import { agregarAlias } from './productos.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';

let ultimaBusqueda = '';

export const recordarBusqueda = (texto) => { ultimaBusqueda = (texto || '').trim(); };

/**
 * Se llama cuando un producto entra al carrito. Si lo que se escribió no se
 * parece al nombre del producto, es un sinónimo que vale la pena aprender.
 */
export async function aprenderDe(producto) {
  const busqueda = ultimaBusqueda;
  ultimaBusqueda = '';
  if (!busqueda || busqueda.length < 3) return;

  const q = normalizar(busqueda);
  const conocidos = [producto.nombreNorm || normalizar(producto.nombre), ...(producto.aliasNorm || [])];
  // Si ya lo encuentra bien, no hay nada que aprender.
  if (conocidos.some((c) => c.includes(q) || q.includes(c))) return;

  try {
    encolar(setDoc(ref('sinonimos_pendientes', `${producto.id}__${q}`.slice(0, 1400)), {
      productoId: producto.id,
      nombreProducto: producto.nombre,
      busqueda: busqueda,
      busquedaNorm: q,
      veces: 1,
      estado: 'pendiente',
      uid: usuarioActual()?.uid || null,
      ts: serverTimestamp(),
    }, { merge: true }), 'sinonimo');
  } catch (e) {
    console.warn('[sinonimos]', e?.code || e);
  }
}

export async function pendientes({ fuente = SERVIDOR } = {}) {
  const lista = await traer(query(
    col('sinonimos_pendientes'),
    where('estado', '==', 'pendiente')
  ), fuente);
  return lista.sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
}

/** El dueño aprueba: pasa a ser alias de verdad del producto. */
export async function aprobar(pendiente, aliasActuales = []) {
  await agregarAlias(pendiente.productoId, pendiente.busqueda, aliasActuales);
  encolar(deleteDoc(ref('sinonimos_pendientes', pendiente.id)), 'sinonimo-aprobado');
}

export const descartar = (id) => encolar(deleteDoc(ref('sinonimos_pendientes', id)), 'sinonimo-descartado');
