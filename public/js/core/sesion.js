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
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

let usuario = null;        // { uid, email, nombre, rol }
const oyentes = new Set();
let releerUsuario = null;  // lo arma iniciar(); sirve para refrescar sin recargar

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
/** Entró bien, pero el dueño todavía no lo ha habilitado. */
export const enEspera = () => !!usuario && !usuario.activo;
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

/**
 * Registro por invitación: el que recibe el link se crea su propia cuenta.
 * Nace APAGADA (`activo: false`) y no ve nada hasta que el dueño la encienda.
 * Esa es la razón de que se pueda repartir el link sin miedo.
 */
export async function crearCuenta(nombre, email, clave) {
  const cuenta = await createUserWithEmailAndPassword(auth, email.trim(), clave);
  await updateProfile(cuenta.user, { displayName: nombre.trim() }).catch(() => {});
  await setDoc(ref('usuarios', cuenta.user.uid), {
    nombre: nombre.trim(),
    email: cuenta.user.email,
    rol: 'empleado',
    activo: false,
    creado: serverTimestamp(),
  });
  // La sesión se activa en cuanto se crea la cuenta, o sea ANTES de que exista
  // el documento. Sin este refresco, la pantalla de espera saluda con el
  // pedazo del correo en vez del nombre que la persona acaba de escribir.
  await refrescarUsuario();
  return cuenta.user;
}

/** Vuelve a leer el documento del usuario y avisa a quien esté escuchando.
 *  Lo usa el registro, y el botón "Ya me habilitaron, revisar". */
export async function refrescarUsuario() {
  if (releerUsuario) await releerUsuario();
}

export function cerrarSesion() {
  return signOut(auth);
}

/** Arranca la vigilancia de sesión. Devuelve una promesa del primer estado. */
export function iniciar() {
  return new Promise((resolver) => {
    let primera = true;
    const armar = async (cuenta) => {
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
          nombre: datos.nombre || cuenta.displayName || cuenta.email?.split('@')[0] || 'Usuario',
          // Sin doc o sin rol se asume el rol MENOS privilegiado.
          rol: datos.rol === 'dueno' ? 'dueno' : 'empleado',
          // Sin documento todavía (o apagado) = en espera de aprobación.
          activo: datos.rol === 'dueno' ? true : datos.activo === true,
          sinDocumento: !datos.rol,
        };
      }
    };

    onAuthStateChanged(auth, async (cuenta) => {
      releerUsuario = () => armar(auth.currentUser).then(avisar);
      await armar(cuenta);
      avisar();
      if (primera) { primera = false; resolver(usuario); }
    });
  });
}
