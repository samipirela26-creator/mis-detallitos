// Datos del proyecto de Firebase.
//
// SÍ va en el repo, a propósito. Estas claves NO son secretas: cualquiera que
// abra la app en el navegador las puede ver (es así en toda app web con
// Firebase, no es un descuido). Lo que protege los datos son las reglas de
// `firestore.rules`, que están probadas en `test/reglas.test.mjs`.
//
// Lo que sí hay que cuidar: que las reglas estén publicadas en el proyecto. Sin
// reglas buenas, estas claves sí alcanzarían para leer todo.
export const firebaseConfig = {
  apiKey: 'AIzaSyDc2oWUXdlC3ZqlsSus7JEy7Olix6XWZ-k',
  authDomain: 'mis-detallitos.firebaseapp.com',
  projectId: 'mis-detallitos',
  storageBucket: 'mis-detallitos.firebasestorage.app',
  messagingSenderId: '86672494720',
  appId: '1:86672494720:web:232112f3d83c2da8665665',
};

// Id del negocio dentro de Firestore. Con un solo local, se deja así.
export const NEGOCIO_ID = 'mis-detallitos';

// En localhost usa los emuladores (datos de mentira, no toca lo real).
// Publicado en mis-detallitos.web.app usa Firebase de verdad. Esto se decide
// solo mirando la dirección, así que no hay que acordarse de cambiarlo.
export const USAR_EMULADORES = true;
