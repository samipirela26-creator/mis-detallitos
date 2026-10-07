// firebase.js — único punto donde se inicializa Firebase.
//
// El caché local se configura con `persistentSingleTabManager` A PROPÓSITO.
// Con el manejador multi-pestaña hay un problema conocido de facturación: las
// pestañas en segundo plano reanudan los listeners con un token viejo y Firestore
// vuelve a cobrar cada consulta como nueva (hay casos reportados de millones de
// lecturas al mes sin nadie usando la app). Una sola pestaña nos sobra: esto es
// una caja registradora, no un panel de muchas ventanas.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
  collection,
  doc,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import {
  getAuth,
  connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getStorage,
  connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js';

import { firebaseConfig, NEGOCIO_ID, USAR_EMULADORES } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(),
    cacheSizeBytes: 100 * 1024 * 1024,
  }),
});

export const auth = getAuth(app);
export const storage = getStorage(app);
export const negocioId = NEGOCIO_ID;

const enLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const usandoEmuladores = enLocal && USAR_EMULADORES;
if (usandoEmuladores) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.info('[firebase] usando emuladores locales');
}

/** Ruta corta a una colección del negocio: col('productos') */
export const col = (nombre) => collection(db, 'negocios', negocioId, nombre);
/** Ruta corta a un documento: ref('productos', id) */
export const ref = (nombre, id) => doc(db, 'negocios', negocioId, nombre, id);
/** Documento con id automático, para poder conocer el id ANTES de escribir
 *  (así una venta reintentada no se duplica: mismo id, misma venta). */
export const refNuevo = (nombre) => doc(col(nombre));
