// clientes.js — los fiados.
//
// LA DEUDA SE FIJA EN PESOS, igual que los precios (ver `precioCOP` en
// productos.js). El dólar se deriva con la tasa del día.
//
// Por qué: una deuda se contrae en la moneda de la etiqueta. Si se guarda solo
// en dólares, cuando el peso se mueve la deuda se mueve con él: Yenifer debía
// 20.000 pesos y con el dólar a 4.000 le tocaría pagar 25.200. Nadie acepta
// eso, y con razón. El peso guardado es el número que las dos personas
// acordaron; el dólar es solo para los reportes del dueño.
//
// `saldoUSD` se sigue escribiendo para los clientes de antes de este cambio y
// para poder ordenar sin tener la tasa a mano, pero el que manda es `saldoCOP`.
import { db, col, ref, refNuevo } from '../core/firebase.js';
import {
  writeBatch, setDoc, query, orderBy, serverTimestamp, increment, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { normalizar } from '../core/texto.js';
import { LUGAR_VENTAS, debe } from '../core/dinero.js';
import { anotar } from './auditoria.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';

export async function guardarCliente({ nombre, telefono = '', nota = '' }, id = null) {
  const documento = id ? ref('clientes', id) : refNuevo('clientes');
  // Sin `await`: ver data/cola.js. El cuadro se cierra en el acto.
  encolar(setDoc(documento, {
    nombre: nombre.trim(),
    nombreNorm: normalizar(nombre),
    telefono: telefono.trim(),
    nota,
    ...(id ? {} : { saldoUSD: 0, creado: serverTimestamp() }),
  }, { merge: true }), 'cliente');
  return documento.id;
}

export async function listarClientes({ fuente = SERVIDOR } = {}) {
  return traer(query(col('clientes'), orderBy('nombre')), fuente);
}

// `deudaDe` y `debe` viven en core/dinero.js: son aritmética pura y aquí
// quedaban detrás del SDK de Firebase, que no se puede cargar en los tests. Se
// reexportan para que quien piensa en clientes las encuentre donde las busca.
export { deudaDe, debe } from '../core/dinero.js';

export const conDeuda = (clientes) => clientes.filter(debe);

/**
 * Las ventas que este cliente se llevó fiadas.
 *
 * Sin esto, la ficha del deudor solo mostraba un número: "debe $12" y nada
 * más. Lo primero que se pregunta cuando alguien discute una deuda es QUÉ se
 * llevó y CUÁNDO, y eso estaba en la base pero no se veía en ninguna pantalla.
 */
export async function ventasFiadasDe(clienteId, { fuente = SERVIDOR } = {}) {
  const todas = await traer(query(col('ventas'), where('clienteId', '==', clienteId), orderBy('ts', 'desc')), fuente);
  return todas.filter((v) => v.estado !== 'anulada');
}

/** Suma a la deuda del cliente (lo llama la venta fiada). */
export function sumarDeuda(lote, clienteId, { montoUSD = 0, montoCOP = 0 } = {}) {
  lote.set(ref('clientes', clienteId), {
    saldoCOP: increment(montoCOP),
    saldoUSD: increment(montoUSD),
  }, { merge: true });
}

/**
 * Abono: baja la deuda y deja constancia de en qué moneda pagó.
 *
 * Lleva `dia` y `lugar` porque esto es PLATA QUE ENTRA, igual que una venta:
 * sin el día no se puede buscar por rango (y el arqueo del turno no lo veía),
 * y sin el lugar no se sabe a qué gaveta entró. Un fiado cobrado y no contado
 * es un sobrante que nadie puede explicar al cerrar la caja.
 */
export async function registrarAbono({
  clienteId, montoUSD, montoCOP = 0, pagos, nota = '', lugar = LUGAR_VENTAS,
}) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(refNuevo('abonos'), {
    clienteId, montoUSD, montoCOP, pagos, nota, lugar,
    uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
    dia: new Date().toISOString().slice(0, 10),
  });
  // Baja en las dos monedas: el peso es el que manda, el dólar queda para los
  // reportes y para los clientes viejos.
  lote.set(ref('clientes', clienteId), {
    saldoCOP: increment(-montoCOP),
    saldoUSD: increment(-montoUSD),
  }, { merge: true });
  encolar(lote.commit(), 'abono');
  anotar('abono', { clienteId, montoUSD, montoCOP });
}

/** Abonos de un rango de días, para el arqueo y las cuentas del dueño. */
export async function abonosEntre(desde, hasta, { fuente = SERVIDOR } = {}) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  return traer(query(col('abonos'), where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')), fuente);
}

export async function abonosDe(clienteId, { fuente = SERVIDOR } = {}) {
  return traer(query(col('abonos'), where('clienteId', '==', clienteId), orderBy('ts', 'desc')), fuente);
}
