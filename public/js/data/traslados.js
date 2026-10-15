// traslados.js — mover plata de un sitio a otro sin que entre ni salga del
// negocio. Sacar de la gaveta para guardarlo en la caja fuerte no es un gasto
// ni un retiro: el dinero sigue siendo del negocio, solo cambió de sitio.
//
// Se registra una sola vez y resta de un lado y suma del otro, para que la
// cuenta de cada sitio cuadre sin tener que escribir dos movimientos.
import { col, refNuevo, ref } from '../core/firebase.js';
import {
  setDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { LUGARES } from '../core/dinero.js';
import { anotar } from './auditoria.js';

export async function registrarTraslado({ desde, hacia, montoUSD, moneda, monto, tasa, porque = '' }) {
  if (!LUGARES.includes(desde) || !LUGARES.includes(hacia)) throw new Error('Lugar no permitido.');
  if (desde === hacia) throw new Error('El dinero tiene que ir a otro sitio.');
  if (!montoUSD || montoUSD <= 0) throw new Error('El monto tiene que ser mayor que cero.');

  const u = usuarioActual();
  const documento = refNuevo('traslados');
  await setDoc(documento, {
    desde, hacia, montoUSD, moneda, monto, tasa,
    porque: String(porque || '').trim(),
    uid: u.uid, nombreUsuario: u.nombre,
    ts: serverTimestamp(), dia: new Date().toISOString().slice(0, 10),
  });
  anotar('traslado-registrado', { trasladoId: documento.id, desde, hacia, montoUSD });
  return documento.id;
}

export async function trasladosEntre(desde, hasta) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const snap = await getDocs(query(col('traslados'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

export async function borrarTraslado(id) {
  await deleteDoc(ref('traslados', id));
  anotar('traslado-borrado', { trasladoId: id });
}
