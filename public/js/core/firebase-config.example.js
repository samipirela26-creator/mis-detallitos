// Copia este archivo como `firebase-config.js` y pega los datos que te da la
// consola de Firebase en:  Configuración del proyecto > Tus apps > Web.
// `firebase-config.js` está en .gitignore a propósito: no se sube al repo.
export const firebaseConfig = {
  apiKey: 'PEGAR_AQUI',
  authDomain: 'mis-detallitos.firebaseapp.com',
  projectId: 'mis-detallitos',
  storageBucket: 'mis-detallitos.firebasestorage.app',
  messagingSenderId: 'PEGAR_AQUI',
  appId: 'PEGAR_AQUI',
};

// Id del negocio dentro de Firestore. Con un solo local, se deja así.
export const NEGOCIO_ID = 'mis-detallitos';

// Usar los emuladores cuando se abre en localhost (no toca los datos reales).
export const USAR_EMULADORES = true;
