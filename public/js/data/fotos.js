// fotos.js — fotos de productos SIN Cloud Storage (que exige plan de pago).
//
// Cada foto va comprimida a ~800px WebP (~40-70 KB) dentro de su propio
// documento `fotos/{productoId}`. Firestore aguanta 1 MB por documento, así que
// cabe de sobra, y al estar en una colección aparte el catálogo sigue siendo
// liviano: la foto solo se lee cuando se va a mostrar.
//
// Además se guarda copia en IndexedDB: una foto ya vista no se vuelve a leer
// de Firestore nunca más (y las lecturas son lo que se cobra).

import { db, ref } from '../core/firebase.js';
import { getDoc, writeBatch, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { guardar, leer as leerIdb, borrar as borrarIdb, ALMACENES } from './idb.js';
import { marcarFoto } from './productos.js';
import { aWebp } from './webp.js';
import { encolar } from './cola.js';

export const LADO_MAX = 800;
export const CALIDAD = 0.72;

/** Comprime un File/Blob de la cámara y devuelve un dataURL WebP.
 *
 *  `encajar`: la foto YA viene encuadrada a mano (pasó por el recorte), así que
 *  cortarle otro cuadrado al centro se comería justo lo que el dueño acomodó.
 *  En ese caso se mete completa en el cuadrado y lo que sobra se rellena de
 *  blanco — nunca se estira, que es lo que haría ver chuecos los productos. */
export function comprimir(archivo, { lado = LADO_MAX, calidad = CALIDAD, encajar = false } = {}) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lienzo = document.createElement('canvas');
      const ctx = lienzo.getContext('2d');
      if (encajar) {
        lienzo.width = lienzo.height = Math.min(lado, Math.max(img.width, img.height));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        const escala = Math.min(lienzo.width / img.width, lienzo.height / img.height);
        const w = img.width * escala;
        const h = img.height * escala;
        ctx.drawImage(img, (lienzo.width - w) / 2, (lienzo.height - h) / 2, w, h);
      } else {
        // Recorte cuadrado centrado: todas las fotos se ven parejas en la lista.
        const corte = Math.min(img.width, img.height);
        const x = (img.width - corte) / 2;
        const y = (img.height - corte) / 2;
        lienzo.width = lienzo.height = Math.min(lado, corte);
        ctx.drawImage(img, x, y, corte, corte, 0, 0, lienzo.width, lienzo.height);
      }
      // WebP siempre que se pueda, con el codificador propio si el navegador
      // del teléfono no sabe (el iPhone no sabe). Pesa ~5 veces menos que JPEG.
      aWebp(lienzo, { calidad }).then(({ datos, via }) => {
        if (via === 'jpeg') console.warn('[fotos] se guardó en JPEG: pesará más de lo normal');
        ok(datos);
      }).catch(mal);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/**
 * Guarda la foto y marca el producto como "ya tiene foto".
 *
 * Las tres escrituras van en UN lote: si fueran sueltas y fallara la segunda,
 * la foto quedaría guardada con el producto marcado "sin foto", y el Estudio
 * de Fotos te lo volvería a pedir para siempre.
 */
export async function guardarFoto(productoId, dataUrl) {
  const bytes = Math.round((dataUrl.length * 3) / 4);
  if (bytes > 900 * 1024) throw new Error('La foto quedó muy pesada. Repítela.');
  const campos = { tieneFoto: true, fotoPendiente: false };
  const lote = writeBatch(db);
  lote.set(ref('fotos', productoId), { datos: dataUrl, bytes, ts: serverTimestamp() });
  lote.set(ref('productos', productoId), campos, { merge: true });
  lote.set(ref('productos_venta', productoId), campos, { merge: true });
  // Sin `await`: ver data/cola.js. En el disco del teléfono sí se espera, que
  // es de donde la pantalla la va a leer en el renglón siguiente.
  encolar(lote.commit(), 'foto');
  await guardar(ALMACENES.FOTOS, productoId, dataUrl);
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
  encolar(deleteDoc(ref('fotos', productoId)), 'foto-borrada');
  await borrarIdb(ALMACENES.FOTOS, productoId);
  await marcarFoto(productoId, false);
}

/** Pinta la foto dentro de un <img> en cuanto esté disponible. */
export function pintarFoto(img, productoId) {
  if (!productoId) return;
  obtenerFoto(productoId).then((datos) => { if (datos) img.src = datos; });
}
