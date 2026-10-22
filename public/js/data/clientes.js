// clientes.js — los fiados. Saldo en USD, abonos en cualquier moneda.
import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, setDoc, getDocs, query, orderBy, serverTimestamp, increment, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { normalizar } from '../core/texto.js';
import { LUGAR_VENTAS } from '../core/dinero.js';
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

/**
 * Las ventas que este cliente se llevó fiadas.
 *
 * Sin esto, la ficha del deudor solo mostraba un número: "debe $12" y nada
 * más. Lo primero que se pregunta cuando alguien discute una deuda es QUÉ se
 * llevó y CUÁNDO, y eso estaba en la base pero no se veía en ninguna pantalla.
 */
export async function ventasFiadasDe(clienteId) {
  const snap = await getDocs(query(col('ventas'), where('clienteId', '==', clienteId), orderBy('ts', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.estado !== 'anulada');
}

/** Suma a la deuda del cliente (lo llama la venta fiada). */
export function sumarDeuda(lote, clienteId, montoUSD) {
  lote.set(ref('clientes', clienteId), { saldoUSD: increment(montoUSD) }, { merge: true });
}

/**
 * Abono: baja la deuda y deja constancia de en qué moneda pagó.
 *
 * Lleva `dia` y `lugar` porque esto es PLATA QUE ENTRA, igual que una venta:
 * sin el día no se puede buscar por rango (y el arqueo del turno no lo veía),
 * y sin el lugar no se sabe a qué gaveta entró. Un fiado cobrado y no contado
 * es un sobrante que nadie puede explicar al cerrar la caja.
 */
export async function registrarAbono({ clienteId, montoUSD, pagos, nota = '', lugar = LUGAR_VENTAS }) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(refNuevo('abonos'), {
    clienteId, montoUSD, pagos, nota, lugar,
    uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
    dia: new Date().toISOString().slice(0, 10),
  });
  lote.set(ref('clientes', clienteId), { saldoUSD: increment(-montoUSD) }, { merge: true });
  await lote.commit();
  anotar('abono', { clienteId, montoUSD });
}

/** Abonos de un rango de días, para el arqueo y las cuentas del dueño. */
export async function abonosEntre(desde, hasta) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const snap = await getDocs(query(col('abonos'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

export async function abonosDe(clienteId) {
  const snap = await getDocs(query(col('abonos'), where('clienteId', '==', clienteId), orderBy('ts', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
