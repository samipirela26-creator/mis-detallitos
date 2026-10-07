// catalogo.js — una sola fuente de verdad del catálogo para toda la app.
//
// El DUEÑO lee `productos` (con costos). El EMPLEADO lee `productos_venta`,
// el espejo sin costos. Quien pida el catálogo no tiene que saber cuál es cuál.
// Además se guarda una copia en IndexedDB para que la app abra instantánea y
// sin señal.

import { col } from '../core/firebase.js';
import { onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { esDueno } from '../core/sesion.js';
import { escribir, leer } from '../core/estado.js';
import { guardar, leer as leerIdb, ALMACENES } from './idb.js';

let desuscribir = null;

export const coleccionDeLectura = () => (esDueno() ? 'productos' : 'productos_venta');

/** Arranca la sincronización del catálogo. Devuelve una función para parar. */
export async function sincronizarCatalogo() {
  parar();

  // 1) Pintar ya con lo que haya en el disco: la app no espera a la red.
  const guardado = await leerIdb(ALMACENES.CATALOGO, 'productos');
  if (Array.isArray(guardado) && guardado.length) escribir('productos', guardado);

  // 2) Y quedar escuchando los cambios.
  const q = query(col(coleccionDeLectura()), where('activo', '==', true));
  desuscribir = onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      escribir('productos', lista);
      guardar(ALMACENES.CATALOGO, 'productos', lista);
    },
    (e) => console.warn('[catalogo] error escuchando:', e?.code || e)
  );
  return parar;
}

export function parar() {
  if (desuscribir) { desuscribir(); desuscribir = null; }
}

export const productos = () => leer('productos') || [];
export const porId = (id) => productos().find((p) => p.id === id) || null;
export const categorias = () =>
  [...new Set(productos().map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
