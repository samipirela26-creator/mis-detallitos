// clientes.js — los fiados. Saldo en USD, abonos en cualquier moneda.
import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, setDoc, getDocs, query, orderBy, serverTimestamp, increment, where,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { normalizar } from '../core/texto.js';
import { anotar } from './auditoria.js';

export async function guardarCliente({ nombre, telefono = '', nota = '' }, id = null) {
  const documento = id ? ref('clientes', id) : refNuevo('clientes');
  await setDoc(documento, {
    nombre: nombre.trim(),
    nombreNorm: normalizar(nombre),
    telefono: telefono.trim(),
    nota,
    ...(id ? {} : { saldoUSD: 0, creado: serverTimestamp() }),
  }, { merge: true });
  return documento.id;
}

export async function listarClientes() {
  const snap = await getDocs(query(col('clientes'), orderBy('nombre')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const conDeuda = (clientes) => clientes.filter((c) => (c.saldoUSD || 0) > 0);

/** Suma a la deuda del cliente (lo llama la venta fiada). */
export function sumarDeuda(lote, clienteId, montoUSD) {
  lote.set(ref('clientes', clienteId), { saldoUSD: increment(montoUSD) }, { merge: true });
}

/** Abono: baja la deuda y deja constancia de en qué moneda pagó. */
export async function registrarAbono({ clienteId, montoUSD, pagos, nota = '' }) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(refNuevo('abonos'), {
    clienteId, montoUSD, pagos, nota,
    uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
  });
  lote.set(ref('clientes', clienteId), { saldoUSD: increment(-montoUSD) }, { merge: true });
  await lote.commit();
  anotar('abono', { clienteId, montoUSD });
}

export async function abonosDe(clienteId) {
  const snap = await getDocs(query(col('abonos'), where('clienteId', '==', clienteId), orderBy('ts', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
