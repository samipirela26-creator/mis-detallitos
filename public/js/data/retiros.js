// retiros.js — la plata que SALE del negocio para el dueño o sus compromisos.
//
// No es lo mismo que un gasto. Un gasto es del negocio (la luz, el flete, la
// mercancía) y se descuenta de la ganancia. Un retiro es dinero que ya se ganó
// y se saca de la caja: el sueldo del que ayuda, los insumos que se compran,
// el diezmo. Por eso vive en su propia colección y se lee aparte.
//
// Las categorías son FIJAS a propósito: si cada retiro se puede llamar como
// uno quiera, a fin de mes no se sabe en qué se fue la plata.
import { col, refNuevo, ref } from '../core/firebase.js';
import {
  setDoc, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { LUGARES } from '../core/dinero.js';
import { anotar } from './auditoria.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';

// "Personal / familia" existe porque en un negocio familiar la plata sale así y
// hay que poder anotarlo sin disfrazarlo de otra cosa: si se mete como "compra
// de insumos", el reporte de gastos miente y nadie sabe cuánto se llevó la casa.
// 'Ajuste de conteo' es el otro lado del cuadre: se contó y faltaba. No se
// esconde como gasto ni como retiro personal, porque no se sabe a dónde fue:
// se anota como lo que es, un faltante con su fecha y su explicación.
export const CATEGORIAS = ['Pago de trabajador', 'Compra de insumos', 'Personal / familia', 'Diezmo', 'Ajuste de conteo'];

/**
 * `porque` es el motivo (qué pasó) y `paraQue` el destino (a qué va a parar).
 * El motivo es obligatorio: un retiro sin explicación es un hueco en la caja.
 */
export async function registrarRetiro({ categoria, lugar, montoUSD, moneda, monto, tasa, porque, paraQue = '' }) {
  if (!CATEGORIAS.includes(categoria)) throw new Error(`Categoría no permitida: ${categoria}`);
  if (!LUGARES.includes(lugar)) throw new Error(`Lugar no permitido: ${lugar}`);
  if (!montoUSD || montoUSD <= 0) throw new Error('El monto tiene que ser mayor que cero.');
  if (!String(porque || '').trim()) throw new Error('Falta escribir por qué se saca el dinero.');

  const u = usuarioActual();
  const documento = refNuevo('retiros');
  // Sin `await`: ver data/cola.js.
  encolar(setDoc(documento, {
    categoria, lugar, montoUSD, moneda, monto, tasa,
    porque: String(porque).trim(), paraQue: String(paraQue || '').trim(),
    uid: u.uid, nombreUsuario: u.nombre,
    ts: serverTimestamp(), dia: new Date().toISOString().slice(0, 10),
  }), 'retiro');
  anotar('retiro-registrado', { retiroId: documento.id, categoria, lugar, montoUSD });
  return documento.id;
}

export async function retirosEntre(desde, hasta, { fuente = SERVIDOR } = {}) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  return traer(query(col('retiros'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')), fuente);
}

export async function borrarRetiro(id) {
  encolar(deleteDoc(ref('retiros', id)), 'retiro-borrado');
  anotar('retiro-borrado', { retiroId: id });
}
