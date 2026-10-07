// sesion.js — quién está usando la app y qué le está permitido ver.
//
// El rol vive en Firestore (negocios/{id}/usuarios/{uid}), no en el cliente.
// Lo que se decide aquí es solo para ARMAR LA PANTALLA; la seguridad de verdad
// está en firestore.rules. Si esto se saltara, el empleado seguiría sin poder
// leer costos porque la colección `productos` no la puede leer.

import { auth, ref } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

let usuario = null;        // { uid, email, nombre, rol }
const oyentes = new Set();

export const PERMISOS = {
  dueno: {
    verCostos: true, verGanancias: true, verReportes: true, verAuditoria: true,
    editarCatalogo: true, importar: true, anularVentas: true, configurar: true,
    fijarTasas: true, aprobarSinonimos: true,
  },
  empleado: {
    verCostos: false, verGanancias: false, verReportes: false, verAuditoria: false,
    editarCatalogo: false, importar: false, anularVentas: false, configurar: false,
    fijarTasas: false, aprobarSinonimos: false,
  },
};

export const usuarioActual = () => usuario;
export const esDueno = () => usuario?.rol === 'dueno';
export const puede = (permiso) => !!PERMISOS[usuario?.rol]?.[permiso];

export function alCambiarSesion(fn) {
  oyentes.add(fn);
  if (usuario !== null) fn(usuario);
  return () => oyentes.delete(fn);
}

function avisar() {
  for (const fn of oyentes) fn(usuario);
}

export function iniciarSesion(email, clave) {
  return signInWithEmailAndPassword(auth, email.trim(), clave);
}

export function cerrarSesion() {
  return signOut(auth);
}

/** Arranca la vigilancia de sesión. Devuelve una promesa del primer estado. */
export function iniciar() {
  return new Promise((resolver) => {
    let primera = true;
    onAuthStateChanged(auth, async (cuenta) => {
      if (!cuenta) {
        usuario = null;
      } else {
        // El doc de usuario puede venir del caché: la app abre offline.
        let datos = {};
        try {
          const snap = await getDoc(ref('usuarios', cuenta.uid));
          datos = snap.exists() ? snap.data() : {};
        } catch (e) {
          console.warn('[sesion] no se pudo leer el usuario, se asume empleado', e);
        }
        usuario = {
          uid: cuenta.uid,
          email: cuenta.email,
          nombre: datos.nombre || cuenta.email?.split('@')[0] || 'Usuario',
          // Sin doc o sin rol se asume el rol MENOS privilegiado.
          rol: datos.rol === 'dueno' ? 'dueno' : 'empleado',
          activo: datos.activo !== false,
        };
      }
      avisar();
      if (primera) { primera = false; resolver(usuario); }
    });
  });
}
