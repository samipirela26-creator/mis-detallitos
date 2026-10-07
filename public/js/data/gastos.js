// gastos.js — todo lo que sale. Se guarda en USD con la tasa del momento.
import { col, refNuevo, ref } from '../core/firebase.js';
import {
  setDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { anotar } from './auditoria.js';

export const CATEGORIAS = [
  'Mercancía', 'Servicios (luz, agua, internet)', 'Alquiler', 'Sueldos',
  'Transporte / flete', 'Mantenimiento', 'Impuestos', 'Otros',
];

export async function registrarGasto({ categoria, montoUSD, moneda, monto, tasa, nota = '', foto = null }) {
  const u = usuarioActual();
  const documento = refNuevo('gastos');
  await setDoc(documento, {
    categoria, montoUSD, moneda, monto, tasa, nota, foto,
    uid: u.uid, nombreUsuario: u.nombre,
    ts: serverTimestamp(), dia: new Date().toISOString().slice(0, 10),
  });
  anotar('gasto-registrado', { gastoId: documento.id, categoria, montoUSD });
  return documento.id;
}

export async function gastosEntre(desde, hasta) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const snap = await getDocs(query(col('gastos'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

export async function borrarGasto(id) {
  await deleteDoc(ref('gastos', id));
  anotar('gasto-borrado', { gastoId: id });
}
