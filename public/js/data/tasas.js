// tasas.js — las tasas del día. Manda el dueño; la API solo sugiere.
//
// Se guarda una tasa por día (negocios/.../tasas/2026-10-07) y cada pago se
// lleva su tasa congelada. Jamás se recalcula el pasado.

import { ref, col } from '../core/firebase.js';
import { getDoc, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { escribir } from '../core/estado.js';

export const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Las tasas del día; si hoy no se han puesto, trae las últimas que haya. */
export async function cargarTasas() {
  const hoy = hoyISO();
  try {
    const snap = await getDoc(ref('tasas', hoy));
    if (snap.exists()) {
      const d = snap.data();
      escribir('tasas', { VES: d.VES, COP: d.COP });
      escribir('tasaFecha', hoy);
      return { ...d, fecha: hoy, deHoy: true };
    }
    // Las últimas que haya: se ordena por `ts`, no por el id del documento
    // (ordenar por __name__ exige un índice y Firestore lo rechaza).
    const ultimas = await getDocs(query(col('tasas'), orderBy('ts', 'desc'), limit(1)));
    if (!ultimas.empty) {
      const d = ultimas.docs[0];
      escribir('tasas', { VES: d.data().VES, COP: d.data().COP });
      escribir('tasaFecha', d.id);
      return { ...d.data(), fecha: d.id, deHoy: false };
    }
  } catch (e) {
    console.warn('[tasas]', e?.code || e);
  }
  return null;
}

/** Guarda las tasas de hoy. `VES` y `COP` vienen en unidades menores por USD. */
export async function guardarTasas({ VES, COP, fuente = 'manual' }) {
  const u = usuarioActual();
  const datos = { VES, COP, fuente, uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp() };
  await setDoc(ref('tasas', hoyISO()), datos);
  escribir('tasas', { VES, COP });
  escribir('tasaFecha', hoyISO());
  return datos;
}

/**
 * Sugerencia automática. Son APIs públicas y gratuitas; si fallan, no pasa
 * nada: el dueño escribe la tasa a mano, que es lo que manda igual.
 * Devuelve { VES, COP } en unidades menores por USD, o null.
 */
export async function sugerirTasas() {
  const salida = {};
  // Bolívar: tasa oficial del BCV.
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j?.promedio > 0) salida.VES = Math.round(j.promedio * 100);   // Bs -> céntimos
    }
  } catch (e) { /* sin internet o API caída: se escribe a mano */ }

  // Peso colombiano.
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=COP', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j?.rates?.COP > 0) salida.COP = Math.round(j.rates.COP);      // COP no tiene decimales
    }
  } catch (e) { /* idem */ }

  return Object.keys(salida).length ? salida : null;
}
