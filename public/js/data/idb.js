// idb.js — IndexedDB mínimo, sin librerías.
//
// Para qué: el caché de Firestore solo guarda lo que ya se leyó, y queremos que
// la app ABRA con el catálogo completo y el buscador listo aunque no haya señal.
// Aquí guardamos una copia del catálogo y de las fotos.

const BASE = 'detallitos';
const VERSION = 1;
export const ALMACENES = { CATALOGO: 'catalogo', FOTOS: 'fotos', VARIOS: 'varios' };

let promesaBase = null;

function abrir() {
  if (promesaBase) return promesaBase;
  promesaBase = new Promise((ok, mal) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nombre of Object.values(ALMACENES)) {
        if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre);
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
  return promesaBase;
}

async function tx(almacen, modo, fn) {
  try {
    const db = await abrir();
    return await new Promise((ok, mal) => {
      const t = db.transaction(almacen, modo);
      const req = fn(t.objectStore(almacen));
      t.oncomplete = () => ok(req?.result);
      t.onerror = () => mal(t.error);
    });
  } catch (e) {
    // Navegación privada, cuota llena, Safari raro: la app debe seguir
    // funcionando aunque el caché local no esté disponible.
    console.warn('[idb] sin caché local:', e?.message || e);
    return null;
  }
}

export const guardar = (almacen, clave, valor) => tx(almacen, 'readwrite', (s) => s.put(valor, clave));
export const leer = (almacen, clave) => tx(almacen, 'readonly', (s) => s.get(clave));
export const borrar = (almacen, clave) => tx(almacen, 'readwrite', (s) => s.delete(clave));
export const leerTodo = (almacen) => tx(almacen, 'readonly', (s) => s.getAll());
export const vaciar = (almacen) => tx(almacen, 'readwrite', (s) => s.clear());
