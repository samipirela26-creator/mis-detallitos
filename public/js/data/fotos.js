// fotos.js — fotos de productos SIN Cloud Storage (que exige plan de pago).
//
// Cada foto va comprimida a ~800px WebP (~40-70 KB) dentro de su propio
// documento `fotos/{productoId}`. Firestore aguanta 1 MB por documento, así que
// cabe de sobra, y al estar en una colección aparte el catálogo sigue siendo
// liviano: la foto solo se lee cuando se va a mostrar.
//
// Además se guarda copia en IndexedDB: una foto ya vista no se vuelve a leer
// de Firestore nunca más (y las lecturas son lo que se cobra).

import { ref } from '../core/firebase.js';
import { getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { guardar, leer as leerIdb, borrar as borrarIdb, ALMACENES } from './idb.js';
import { marcarFoto } from './productos.js';

export const LADO_MAX = 800;
export const CALIDAD = 0.72;

/** Comprime un File/Blob de la cámara y devuelve un dataURL WebP. */
export function comprimir(archivo, { lado = LADO_MAX, calidad = CALIDAD } = {}) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Recorte cuadrado centrado: todas las fotos se ven parejas en la lista.
      const corte = Math.min(img.width, img.height);
      const x = (img.width - corte) / 2;
      const y = (img.height - corte) / 2;
      const lienzo = document.createElement('canvas');
      lienzo.width = lienzo.height = Math.min(lado, corte);
      const ctx = lienzo.getContext('2d');
      ctx.drawImage(img, x, y, corte, corte, 0, 0, lienzo.width, lienzo.height);
      let datos = lienzo.toDataURL('image/webp', calidad);
      if (!datos.startsWith('data:image/webp')) datos = lienzo.toDataURL('image/jpeg', calidad);
      ok(datos);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/** Guarda la foto y marca el producto como "ya tiene foto". */
export async function guardarFoto(productoId, dataUrl) {
  const bytes = Math.round((dataUrl.length * 3) / 4);
  if (bytes > 900 * 1024) throw new Error('La foto quedó muy pesada. Repítela.');
  await setDoc(ref('fotos', productoId), { datos: dataUrl, bytes, ts: serverTimestamp() });
  await guardar(ALMACENES.FOTOS, productoId, dataUrl);
  await marcarFoto(productoId, true);
}

/** Trae la foto: primero del disco, y solo si no está, de Firestore. */
export async function obtenerFoto(productoId) {
  const local = await leerIdb(ALMACENES.FOTOS, productoId);
  if (local) return local;
  try {
    const snap = await getDoc(ref('fotos', productoId));
    if (!snap.exists()) return null;
    const datos = snap.data().datos;
    await guardar(ALMACENES.FOTOS, productoId, datos);
    return datos;
  } catch (e) {
    return null;
  }
}

export async function borrarFoto(productoId) {
  await deleteDoc(ref('fotos', productoId));
  await borrarIdb(ALMACENES.FOTOS, productoId);
  await marcarFoto(productoId, false);
}

/** Pinta la foto dentro de un <img> en cuanto esté disponible. */
export function pintarFoto(img, productoId) {
  if (!productoId) return;
  obtenerFoto(productoId).then((datos) => { if (datos) img.src = datos; });
}
