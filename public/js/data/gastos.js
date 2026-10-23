// gastos.js — todo lo que sale. Se guarda en USD con la tasa del momento.
import { col, refNuevo, ref } from '../core/firebase.js';
import {
  setDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual, esDueno } from '../core/sesion.js';
import { LUGARES, LUGAR_VENTAS } from '../core/dinero.js';
import { anotar } from './auditoria.js';

// Las palabras son las que usa Samuel, no las de un plan de cuentas: busca
// "pago de trabajador" y "herramienta", y si el desplegable dice "Sueldos" y
// "Otros" no las encuentra y acaba metiendo todo en "Otros".
export const CATEGORIAS = [
  'Mercancía', 'Herramientas o artículos para el negocio',
  'Servicios (luz, agua, internet)', 'Alquiler', 'Sueldos / pago de trabajador',
  'Transporte / flete', 'Mantenimiento', 'Impuestos', 'Otros',
];

/**
 * `lugar` es DE DÓNDE salió la plata: la gaveta o la caja fuerte. Faltaba, y
 * sin él todo gasto se le cobraba a la gaveta — también el que se pagó por
 * pago móvil en bolívares, que nunca estuvo ahí. Al cerrar el turno la app
 * reclamaba un dinero que jamás pasó por la gaveta y cantaba un faltante
 * inventado; y un faltante inventado tapa los de verdad.
 *
 * Los gastos viejos no lo traen: el arqueo y "Mi dinero" los siguen leyendo
 * como de la gaveta (`x.lugar || 'Caja'`), que es donde estaban antes.
 */
export async function registrarGasto({ categoria, lugar = LUGAR_VENTAS, montoUSD, moneda, monto, tasa, nota = '', foto = null }) {
  if (!LUGARES.includes(lugar)) throw new Error(`Lugar no permitido: ${lugar}`);
  const u = usuarioActual();
  const documento = refNuevo('gastos');
  await setDoc(documento, {
    categoria, lugar, montoUSD, moneda, monto, tasa, nota, foto,
    uid: u.uid, nombreUsuario: u.nombre,
    ts: serverTimestamp(), dia: new Date().toISOString().slice(0, 10),
  });
  anotar('gasto-registrado', { gastoId: documento.id, categoria, lugar, montoUSD });
  return documento.id;
}

/** Igual que las ventas: el empleado solo puede pedir los suyos, o la consulta
 *  se rechaza entera y el arqueo de su turno se cae sin decir por qué. */
export async function gastosEntre(desde, hasta) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const u = usuarioActual();
  const soloMios = !esDueno() && u?.uid ? [where('uid', '==', u.uid)] : [];
  const snap = await getDocs(query(
    col('gastos'), ...soloMios, where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

export async function borrarGasto(id) {
  await deleteDoc(ref('gastos', id));
  anotar('gasto-borrado', { gastoId: id });
}
