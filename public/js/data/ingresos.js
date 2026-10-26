// ingresos.js — la plata que ENTRA al negocio sin ser una venta.
//
// El primer dinero del negocio no viene de ninguna venta: se puso y ya. Sin
// registrarlo, la caja arranca en cero y todo cuadra mal para siempre. Eso es
// un ingreso: dinero que entró, con su fecha y su explicación.
//
// Igual que los retiros, las categorías son FIJAS.
import { col, refNuevo, ref } from '../core/firebase.js';
import {
  setDoc, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { LUGARES } from '../core/dinero.js';
import { anotar } from './auditoria.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';

// 'Ajuste de conteo' lo escribe el cuadre: se contó la plata y sobraba. Es la
// única forma honesta de dejar un sobrante anotado sin disfrazarlo de aporte.
export const CATEGORIAS = ['Dinero inicial', 'Aporte del dueño', 'Préstamo', 'Otro ingreso', 'Ajuste de conteo'];

export async function registrarIngreso({ categoria, lugar, montoUSD, moneda, monto, tasa, porque, paraQue = '' }) {
  if (!CATEGORIAS.includes(categoria)) throw new Error(`Categoría no permitida: ${categoria}`);
  if (!LUGARES.includes(lugar)) throw new Error(`Lugar no permitido: ${lugar}`);
  if (!montoUSD || montoUSD <= 0) throw new Error('El monto tiene que ser mayor que cero.');
  if (!String(porque || '').trim()) throw new Error('Falta escribir de dónde sale ese dinero.');

  const u = usuarioActual();
  const documento = refNuevo('ingresos');
  // Sin `await`: ver data/cola.js.
  encolar(setDoc(documento, {
    categoria, lugar, montoUSD, moneda, monto, tasa,
    porque: String(porque).trim(), paraQue: String(paraQue || '').trim(),
    uid: u.uid, nombreUsuario: u.nombre,
    ts: serverTimestamp(), dia: new Date().toISOString().slice(0, 10),
  }), 'ingreso');
  anotar('ingreso-registrado', { ingresoId: documento.id, categoria, lugar, montoUSD });
  return documento.id;
}

export async function ingresosEntre(desde, hasta, { fuente = SERVIDOR } = {}) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  return traer(query(col('ingresos'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')), fuente);
}

export async function borrarIngreso(id) {
  encolar(deleteDoc(ref('ingresos', id)), 'ingreso-borrado');
  anotar('ingreso-borrado', { ingresoId: id });
}
