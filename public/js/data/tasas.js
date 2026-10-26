// tasas.js — las tasas del día. Manda el dueño; la API solo ayuda.
//
// Se guarda una tasa por día (negocios/.../tasas/2026-10-07) y cada pago se
// lleva su tasa congelada. Jamás se recalcula el pasado.
//
// El bolívar sale del BCV. El BCV publica dos tasas y aquí se elige cuál usar:
//   - euro  (por defecto): es la que usa este negocio para cobrar en Bs.
//   - dólar: la oficial del dólar, para quien prefiera esa.
// La elección se guarda en config/general.baseBs y vale para todos los equipos.

import { ref, col } from '../core/firebase.js';
import { getDoc, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual, esDueno } from '../core/sesion.js';
import { escribir } from '../core/estado.js';
import { encolar } from './cola.js';

export const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Las dos tasas del BCV, con nombre y fuente para mostrarlas tal cual. */
export const BASES_BS = {
  EUR: { base: 'EUR', nombre: 'Euro del BCV',  fuente: 'bcv-eur', url: 'https://ve.dolarapi.com/v1/euros/oficial' },
  USD: { base: 'USD', nombre: 'Dólar del BCV', fuente: 'bcv-usd', url: 'https://ve.dolarapi.com/v1/dolares/oficial' },
};
const BASE_POR_DEFECTO = 'EUR';

/** Cuál de las dos tasas del BCV usa el negocio para el bolívar. */
export async function baseBs() {
  try {
    const snap = await getDoc(ref('config', 'general'));
    const b = snap.data()?.baseBs;
    if (BASES_BS[b]) return BASES_BS[b];
  } catch { /* sin permiso o sin internet: se usa la de siempre */ }
  return BASES_BS[BASE_POR_DEFECTO];
}

export async function guardarBaseBs(base) {
  if (!BASES_BS[base]) throw new Error(`Base desconocida: ${base}`);
  // Sin `await`: ver data/cola.js.
  encolar(setDoc(ref('config', 'general'), { baseBs: base }, { merge: true }), 'base-bs');
  return BASES_BS[base];
}

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

/**
 * Las tasas que el dueño decidió DEJAR FIJAS.
 *
 * El peso no se compra en una casa de cambio: el dueño vende a la tasa que él
 * fija, y esa es la que está en las etiquetas del estante. Pero cada mañana el
 * automático escribía la del mercado encima, y al día siguiente los precios ya
 * no eran los suyos. Ahora lo que él fija manda, hasta que lo suelte.
 */
export async function tasasFijas() {
  try {
    const snap = await getDoc(ref('config', 'general'));
    return (snap.exists() ? snap.data().tasasFijas : null) || {};
  } catch {
    return {};
  }
}

export async function fijarTasa(moneda, valorMenores) {
  const actuales = await tasasFijas();
  const nuevas = { ...actuales };
  if (valorMenores > 0) nuevas[moneda] = valorMenores;
  else delete nuevas[moneda];
  encolar(setDoc(ref('config', 'general'), { tasasFijas: nuevas }, { merge: true }), 'tasa-fija');
  return nuevas;
}

/** Guarda las tasas de hoy. `VES` y `COP` vienen en unidades menores por USD. */
export async function guardarTasas({ VES, COP, fuente = 'manual' }) {
  const u = usuarioActual();
  const datos = { VES, COP, fuente, uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp() };
  encolar(setDoc(ref('tasas', hoyISO()), datos), 'tasas-del-dia');
  escribir('tasas', { VES, COP });
  escribir('tasaFecha', hoyISO());

  // Los precios de la etiqueta están en pesos: cuando el peso se mueve, el
  // precio en dólares que cobra la app tiene que moverse con él. Si esto falla
  // (sin internet a mitad del lote), la tasa igual quedó guardada: se reintenta
  // la próxima vez que se cargue una.
  try {
    const { productos } = await import('./catalogo.js');
    const { recalcularPrecios } = await import('./productos.js');
    const r = await recalcularPrecios(productos(), COP);
    if (r.cambiados) console.info(`[tasas] ${r.cambiados} precios recalculados con la tasa nueva`);
    datos.preciosRecalculados = r.cambiados;
  } catch (e) {
    console.warn('[tasas] no se pudieron recalcular los precios:', e?.message || e);
  }
  return datos;
}

const numero = async (url, saca) => {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const n = saca(await r.json());
    return n > 0 ? n : null;
  } catch { return null; }   // sin internet o API caída: se escribe a mano
};

/**
 * Consulta las tasas de hoy. Son APIs públicas y gratuitas; si fallan, no pasa
 * nada: el dueño escribe la tasa a mano, que es lo que manda igual.
 *
 * Devuelve { VES, COP, bcv: { EUR, USD }, base, fuente, fechaBCV } con los
 * montos en unidades menores por USD, o null si no se consiguió ninguna.
 */
export async function sugerirTasas() {
  const elegida = await baseBs();
  const [eur, usd, cop] = await Promise.all([
    // El BCV publica las dos; se traen juntas para poder mostrarlas y comparar.
    numero(BASES_BS.EUR.url, (j) => j?.promedio),
    numero(BASES_BS.USD.url, (j) => j?.promedio),
    // El peso no lo publica el BCV; sale de un cambio internacional.
    numero('https://open.er-api.com/v6/latest/USD', (j) => j?.rates?.COP),
  ]);

  const bcv = {};
  if (eur) bcv.EUR = Math.round(eur * 100);   // Bs -> céntimos
  if (usd) bcv.USD = Math.round(usd * 100);

  const salida = { bcv, base: elegida.base, fuente: elegida.fuente };
  if (bcv[elegida.base]) salida.VES = bcv[elegida.base];
  else if (bcv.EUR || bcv.USD) {
    // Si justo falló la que usa el negocio, se ofrece la otra, pero diciéndolo.
    const otra = bcv.EUR ? 'EUR' : 'USD';
    salida.VES = bcv[otra];
    salida.base = otra;
    salida.fuente = BASES_BS[otra].fuente;
  }
  if (cop) salida.COP = Math.round(cop);      // el peso no tiene decimales

  return (salida.VES || salida.COP) ? salida : null;
}

/**
 * Actualización diaria automática: al abrir la app, si hoy nadie puso la tasa,
 * se trae la del BCV y se guarda sola. Si el dueño ya la puso a mano hoy, no se
 * toca nada — lo que escribe el dueño siempre gana.
 *
 * Solo corre para el dueño: es el único que puede escribir en `tasas`.
 */
export async function actualizarTasasAuto() {
  if (!esDueno()) return null;
  try {
    const hoy = await getDoc(ref('tasas', hoyISO()));
    if (hoy.exists()) return null;

    const s = await sugerirTasas();
    if (!s?.VES) return null;

    // Lo que el dueño fijó no se toca: es la tasa a la que vende.
    const fijas = await tasasFijas();

    let VES = fijas.VES || s.VES;
    let COP = fijas.COP || s.COP;
    // El peso se arrastra de la última tasa si hoy el cambio no respondió.
    if (!COP) {
      const ultimas = await getDocs(query(col('tasas'), orderBy('ts', 'desc'), limit(1)));
      COP = ultimas.empty ? 0 : (ultimas.docs[0].data().COP || 0);
    }
    const fuente = (fijas.VES && fijas.COP) ? 'fija' : s.fuente;
    return await guardarTasas({ VES, COP, fuente });
  } catch (e) {
    console.warn('[tasas] auto', e?.code || e);
    return null;
  }
}
