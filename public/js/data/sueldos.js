// sueldos.js — cuánto se le paga a quien trabaja, y los pagos.
//
// Un pago de sueldo es un RETIRO (ver data/retiros.js): la ganancia ya estaba
// hecha y la plata sale de la caja. Va con la categoría 'Pago de trabajador' y
// el nombre en `paraQue`, que es de donde lee su historia la tarjeta Trabajador.
// El dueño que se paga a sí mismo cae en 'Personal / familia'.
import { ref, col } from '../core/firebase.js';
import { setDoc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { encolar } from './cola.js';
import { registrarRetiro } from './retiros.js';
import { PAGO_TRABAJADOR } from '../reports/trabajador.js';

export const SUELDO_SEMANAL_DEF = 2000;   // $20.00, en centavos

export async function sueldoSemanal() {
  try {
    const n = (await getDoc(ref('config', 'general'))).data()?.sueldoSemanalUSD;
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* sin internet: el de siempre */ }
  return SUELDO_SEMANAL_DEF;
}

export function guardarSueldoSemanal(centavos) {
  if (!Number.isFinite(centavos) || centavos <= 0) throw new Error('El sueldo tiene que ser mayor que cero.');
  encolar(setDoc(ref('config', 'general'), { sueldoSemanalUSD: centavos }, { merge: true }), 'sueldo-semanal');
}

/** Quién puede cobrar sueldo: el equipo activo y el dueño. */
export async function personas() {
  const snap = await getDocs(col('usuarios'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.activo !== false && u.nombre)
    .sort((a, b) => (a.rol === 'dueno') - (b.rol === 'dueno') || a.nombre.localeCompare(b.nombre, 'es'));
}

export function pagarSueldo({ persona, esDueno, ...plata }) {
  return registrarRetiro({
    ...plata,
    categoria: esDueno ? 'Personal / familia' : PAGO_TRABAJADOR,
    porque: esDueno ? 'Sueldo propio' : `Sueldo de ${persona}`,
    paraQue: persona,
  });
}
