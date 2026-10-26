// ventas.js — registrar una venta. Es la operación más delicada de la app.
//
// Dos cosas que no se negocian:
//  1) IDEMPOTENCIA: el id del documento se genera ANTES de escribir. Si no hay
//     señal y el reintento se repite, se escribe el MISMO documento: la venta
//     no se duplica.
//  2) ATOMICIDAD: la venta, sus movimientos de inventario y el descuento de
//     stock van en un solo writeBatch.
//
// Offline: no se espera al commit. Firestore lo encola y lo sube solo cuando
// vuelve la señal; la venta se da por hecha al instante (que es lo que necesita
// una caja registradora).

import { db, ref, refNuevo, col } from '../core/firebase.js';
import {
  writeBatch, serverTimestamp, getDoc, getDocs, setDoc, query, where, orderBy, limit,
  Timestamp, increment, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual, esDueno } from '../core/sesion.js';
import { registrarMovimientos } from './inventario.js';
import { totalesVenta, totalPagadoUSD, LUGAR_VENTAS, LUGAR_AFUERA } from '../core/dinero.js';
import { anotar } from './auditoria.js';
import { leer } from '../core/estado.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';

/**
 * lineas = [{ productoId, nombre, cantidad, precioUSD, costoUSD, precioEditado,
 *             autorizadoPor, esServicio }]
 * pagos  = [{ moneda, monto, tasa, montoUSD }]
 */
export async function registrarVenta({
  lineas, pagos, vuelto = null, ajusteUSD = 0, ajustadoPor = null, totalCOP = null,
  clienteId = null, fiado = false, nota = '', sinTurno = false,
}) {
  const u = usuarioActual();
  if (!lineas?.length) throw new Error('La venta no tiene productos.');

  const documento = refNuevo('ventas');           // id estable ANTES de escribir
  const totales = totalesVenta(lineas);
  const ajuste = Math.round(ajusteUSD || 0);
  const pagadoUSD = totalPagadoUSD(pagos);

  const venta = {
    numero: Date.now(),
    lineas: lineas.map((l) => ({
      productoId: l.productoId || null,
      nombre: l.nombre,
      cantidad: Number(l.cantidad),
      precioUSD: Math.round(l.precioUSD),
      // El precio de la etiqueta, en pesos. Sirve para la deuda del fiado y
      // para poder releer la venta sin depender de la tasa de hoy.
      precioCOP: Math.round(l.precioCOP || 0),
      costoUSD: Math.round(l.costoUSD || 0),
      precioEditado: !!l.precioEditado,
      precioOriginalUSD: Math.round(l.precioOriginalUSD || l.precioUSD),
      autorizadoPor: l.autorizadoPor || null,
      // Si esta línea mueve stock o no. Se guarda porque al ANULAR hay que
      // devolver al inventario lo que se descontó, y una fotocopia no
      // descontó nada: sin la marca, anular una venta con servicios le
      // inventaba stock a un producto que no lleva stock.
      esServicio: !!l.esServicio,
      // Venta libre: no salió del catálogo y su ganancia la estimó el dueño a
      // ojo. Queda escrito en la venta para poder separarlas en los reportes:
      // sin la marca, un mes con muchas ventas libres parece un mes de margen
      // real y no lo es.
      fueraDeCatalogo: !!l.fueraDeCatalogo,
      gananciaEstimada: !!l.fueraDeCatalogo,
    })),
    // El total puede venir AJUSTADO: los precios caen en números que no se
    // pueden dar con monedas ($ 1.520) y se redondean al cobrar. El ajuste se
    // guarda aparte en vez de tocar los precios de las líneas, porque el
    // producto no cambió de precio: se redondeó esta venta. Así el reporte por
    // producto sigue diciendo la verdad y se puede ver cuánto se fue en
    // redondeos y quién los autorizó.
    totalUSD: totales.totalUSD + ajuste,
    totalCOP: totalCOP || 0,
    ajusteUSD: ajuste,
    ajustadoPor: ajuste ? ajustadoPor : null,
    costoTotalUSD: totales.costoUSD,
    gananciaUSD: totales.gananciaUSD + ajuste,
    pagos,
    pagadoUSD,
    // El cambio que se le dio al cliente, con la moneda en que salió. SALE de
    // la misma gaveta: sin esto, el arqueo esperaba el billete completo con que
    // pagaron y el faltante era del tamaño del vuelto.
    vuelto: vuelto ? { moneda: vuelto.moneda, monto: vuelto.monto, montoUSD: vuelto.montoUSD } : null,
    vueltoUSD: vuelto?.montoUSD || 0,
    saldoUSD: totales.totalUSD + ajuste - pagadoUSD,   // > 0 = quedó debiendo
    fiado: !!fiado,
    // Se vendió sin caja abierta: queda escrito en la venta para poder
    // encontrarlas después. Sin esta marca son invisibles.
    sinTurno: !!sinTurno,
    // Y DÓNDE QUEDÓ ESA PLATA. Vender con la caja cerrada es normal —las
    // ventas rápidas de la calle se hacen así y no se puede contar una gaveta
    // que no está abierta—, pero entonces el efectivo no está en el mostrador.
    //
    // Quién vende decide dónde cae, y no es un tecnicismo: son dos situaciones
    // distintas. El DUEÑO sin caja abierta está vendiendo afuera, con la plata
    // en el bolsillo: cargársela a la gaveta hace que el siguiente arqueo
    // reclame un dinero que no está ahí. El EMPLEADO está en el mostrador —la
    // gaveta la tiene al lado, abierta o no—, así que su plata sí cae en la
    // caja; marcarla como "conmigo" sería mandarla a un sitio que él no puede
    // mover, porque Mi dinero es del dueño.
    //
    // Lo que queda Conmigo se entrega con un traslado desde Mi dinero, y
    // mientras tanto ningún arqueo lo pide.
    lugar: sinTurno && esDueno() ? LUGAR_AFUERA : LUGAR_VENTAS,
    clienteId,
    nota,
    estado: 'ok',
    uid: u.uid,
    nombreUsuario: u.nombre,
    ts: serverTimestamp(),
    dia: new Date().toISOString().slice(0, 10),
  };

  const lote = writeBatch(db);
  lote.set(documento, venta);

  // Solo descuentan stock los productos reales; los servicios (fotocopias) no.
  const conStock = lineas.filter((l) => l.productoId && !l.esServicio);
  if (conStock.length) {
    await registrarMovimientos(
      conStock.map((l) => ({
        productoId: l.productoId,
        nombre: l.nombre,
        tipo: 'venta',
        cantidad: l.cantidad,
        costoUnitUSD: l.costoUSD,
      })),
      { lote, ventaId: documento.id }
    );
  }

  // Fiado: lo que quedó debiendo se suma al saldo del cliente, en el mismo lote.
  //
  // En PESOS, que es como se fija una deuda (ver clientes.js). El peso sale de
  // los precios de la etiqueta que traen las líneas; lo que no tenga precio en
  // pesos —una venta libre, un precio acordado a mano— se convierte con la
  // tasa de hoy, que es la que se usó para cobrar.
  if (fiado && clienteId && venta.saldoUSD > 0) {
    lote.set(ref('clientes', clienteId), {
      saldoCOP: increment(deudaEnPesos(venta)),
      saldoUSD: increment(venta.saldoUSD),
      ultimaCompra: serverTimestamp(),
    }, { merge: true });
  }

  // No se espera: si no hay señal, Firestore la encola y la sube después.
  const subida = encolar(lote.commit(), 'venta');

  if (ajuste) {
    anotar('total-ajustado-en-venta', {
      ventaId: documento.id,
      antes: totales.totalUSD, despues: venta.totalUSD,
      ajusteUSD: ajuste, autorizadoPor: ajustadoPor,
    });
  }

  for (const l of venta.lineas) {
    if (l.precioEditado) {
      anotar('precio-editado-en-venta', {
        ventaId: documento.id, producto: l.nombre,
        antes: l.precioOriginalUSD, despues: l.precioUSD,
        autorizadoPor: l.autorizadoPor,
      });
    }
  }

  return { id: documento.id, venta, subida };
}

/**
 * Lo que quedó debiendo, en pesos.
 *
 * Se exporta porque la pantalla de ventas tiene que MOSTRAR esa misma deuda:
 * si la calculara por su cuenta, el número de la ficha y el que se le sumó al
 * cliente podrían no coincidir, y entonces no hay cuál creerle.
 *
 * Se suman los precios de etiqueta de las líneas; si la venta se pagó en parte,
 * se cobra la misma proporción que en dólares. Una línea sin precio en pesos se
 * convierte con la tasa del día.
 */
export function deudaEnPesos(venta) {
  const tasaCOP = (leer('tasas') || {}).COP || 0;
  // Si la venta se cobró en pesos, ese es el número que se acordó —ya
  // redondeado— y no hay nada que recalcular.
  if (venta.totalCOP > 0) {
    if (venta.saldoUSD >= venta.totalUSD) return venta.totalCOP;
    return Math.round((venta.totalCOP * venta.saldoUSD) / (venta.totalUSD || 1));
  }
  let pesos = 0;
  for (const l of venta.lineas) {
    if (l.precioCOP > 0) pesos += Math.round(l.cantidad * l.precioCOP);
    else if (tasaCOP) pesos += Math.round((l.cantidad * l.precioUSD * tasaCOP) / 100);
  }
  if (!pesos) return 0;
  if (venta.saldoUSD >= venta.totalUSD) return pesos;        // nada pagado
  return Math.round((pesos * venta.saldoUSD) / venta.totalUSD);
}

/**
 * CORREGIR UNA VENTA YA COBRADA. Solo el dueño.
 *
 * Hasta ahora el único camino para arreglar una venta mal cobrada era anularla
 * y volver a cobrarla. Eso está bien cuando el cliente devolvió la mercancía,
 * pero no es lo que pasa casi siempre: lo que pasa es que el precio quedó mal
 * —se cobraron 10.000 y eran 6.000— y la mercancía sí se la llevó. Anular eso
 * le devuelve al inventario dos llaveros que no están en la gaveta, y obliga a
 * rehacer la venta entera con el cliente ya en la calle.
 *
 * Entonces se corrige en su sitio, pero NADA se borra:
 *  - las líneas de antes quedan guardadas en `correcciones`, con quién y
 *    cuándo, para que el arqueo de ese día se pueda explicar;
 *  - si cambió la cantidad, el inventario se mueve con un `ajuste` que deja su
 *    propio renglón en el ledger;
 *  - lo que se le había sumado al cliente por fiado se corrige por la
 *    diferencia, no se vuelve a escribir desde cero.
 *
 * El pago se reescribe cuando la venta se pagó COMPLETA de un solo golpe: lo
 * que de verdad entró a la gaveta son los 6.000, no los 10.000, y si el pago se
 * quedara como estaba el arqueo cantaría un faltante de 4.000 todos los días.
 * Si hubo varios pagos o quedó algo debiendo, los pagos se dejan quietos y la
 * diferencia aparece como saldo: ahí no se puede adivinar qué billete volvió.
 */
export async function corregirVenta(ventaId, venta, { lineas, motivo = '' }) {
  const u = usuarioActual();
  if (!esDueno()) throw new Error('Solo el dueño puede corregir una venta.');
  if (!lineas?.length) throw new Error('La venta corregida se quedó sin productos.');
  if (venta?.estado === 'anulada') throw new Error('Esa venta está anulada: no hay nada que corregir.');

  const totales = totalesVenta(lineas);
  const nuevas = lineas.map((l) => ({
    productoId: l.productoId || null,
    nombre: l.nombre,
    cantidad: Number(l.cantidad),
    precioUSD: Math.round(l.precioUSD),
    precioCOP: Math.round(l.precioCOP || 0),
    costoUSD: Math.round(l.costoUSD || 0),
    precioEditado: !!l.precioEditado,
    precioOriginalUSD: Math.round(l.precioOriginalUSD || l.precioUSD),
    autorizadoPor: l.autorizadoPor || null,
    esServicio: !!l.esServicio,
    fueraDeCatalogo: !!l.fueraDeCatalogo,
    gananciaEstimada: !!l.fueraDeCatalogo,
  }));

  // El ajuste de redondeo de la venta vieja deja de valer: era el redondeo de
  // unos precios que ya no son estos. Si no se quitara, la corrección
  // arrastraría una rebaja que nadie volvió a autorizar.
  const pagosViejos = venta.pagos || [];
  const pagabaTodo = pagosViejos.length === 1 && !venta.fiado
    && (venta.saldoUSD || 0) === 0;
  const pagos = pagabaTodo
    ? [{
        ...pagosViejos[0],
        monto: pagosViejos[0].moneda === 'COP' && totales.totalCOP != null
          ? totales.totalCOP
          : Math.round((totales.totalUSD * (pagosViejos[0].tasa || 100)) / 100),
        montoUSD: totales.totalUSD,
      }]
    : pagosViejos;
  const pagadoUSD = totalPagadoUSD(pagos);

  const corregida = {
    lineas: nuevas,
    totalUSD: totales.totalUSD,
    totalCOP: totales.totalCOP != null ? totales.totalCOP : 0,
    ajusteUSD: 0,
    ajustadoPor: null,
    costoTotalUSD: totales.costoUSD,
    gananciaUSD: totales.gananciaUSD,
    pagos,
    pagadoUSD,
    saldoUSD: totales.totalUSD - pagadoUSD,
  };

  const lote = writeBatch(db);
  lote.set(ref('ventas', ventaId), {
    ...corregida,
    corregida: true,
    corregidaPor: u.nombre,
    corregidaTs: serverTimestamp(),
    // El antes completo, para que el día se pueda volver a cuadrar.
    correcciones: arrayUnion({
      motivo,
      por: u.nombre,
      uid: u.uid,
      cuando: Timestamp.now(),
      antes: {
        lineas: venta.lineas || [],
        totalUSD: venta.totalUSD || 0,
        totalCOP: venta.totalCOP || 0,
        ajusteUSD: venta.ajusteUSD || 0,
        pagos: pagosViejos,
        saldoUSD: venta.saldoUSD || 0,
      },
    }),
  }, { merge: true });

  // Inventario: solo lo que cambió de cantidad, y solo lo que lleva stock.
  const servicios = new Set((leer('productos') || [])
    .filter((p) => p.tipo === 'servicio').map((p) => p.id));
  const antesPorId = new Map();
  for (const l of venta.lineas || []) {
    if (!l.productoId) continue;
    antesPorId.set(l.productoId, (antesPorId.get(l.productoId) || 0) + Number(l.cantidad || 0));
  }
  const ahoraPorId = new Map();
  for (const l of nuevas) {
    if (!l.productoId) continue;
    ahoraPorId.set(l.productoId, (ahoraPorId.get(l.productoId) || 0) + Number(l.cantidad || 0));
  }
  const movimientos = [];
  for (const id of new Set([...antesPorId.keys(), ...ahoraPorId.keys()])) {
    const linea = nuevas.find((l) => l.productoId === id)
      || (venta.lineas || []).find((l) => l.productoId === id);
    if (linea?.esServicio || servicios.has(id)) continue;
    const devuelve = (antesPorId.get(id) || 0) - (ahoraPorId.get(id) || 0);
    if (!devuelve) continue;
    movimientos.push({
      productoId: id,
      nombre: linea?.nombre || '',
      tipo: 'ajuste',                    // el signo lo trae la cantidad
      cantidad: devuelve,
      costoUnitUSD: linea?.costoUSD || 0,
      nota: `Corrección de venta: ${motivo || 'sin motivo escrito'}`,
    });
  }
  if (movimientos.length) await registrarMovimientos(movimientos, { lote, ventaId });

  // Fiado: la deuda del cliente se mueve por la DIFERENCIA. Reescribirla
  // completa pisaría los abonos que ya haya hecho.
  if (venta.fiado && venta.clienteId) {
    const antesCOP = deudaEnPesos(venta);
    const despuesCOP = deudaEnPesos({ ...venta, ...corregida });
    const difCOP = despuesCOP - antesCOP;
    const difUSD = corregida.saldoUSD - (venta.saldoUSD || 0);
    if (difCOP || difUSD) {
      lote.set(ref('clientes', venta.clienteId), {
        saldoCOP: increment(difCOP),
        saldoUSD: increment(difUSD),
      }, { merge: true });
    }
  }

  encolar(lote.commit(), 'correccion-de-venta');
  anotar('venta-corregida', {
    ventaId, motivo,
    antesUSD: venta.totalUSD || 0, despuesUSD: corregida.totalUSD,
    antesCOP: venta.totalCOP || 0, despuesCOP: corregida.totalCOP,
  });
  return corregida;
}

/** Anular: el dueño lo hace directo; el empleado solo puede pedirlo. */
export async function anularVenta(ventaId, motivo, venta) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(ref('ventas', ventaId), {
    estado: 'anulada',
    motivoAnulacion: motivo,
    anuladaPor: u.nombre,
    anuladaTs: serverTimestamp(),
  }, { merge: true });

  // Si era fiada, la deuda se va con ella. Sin esto, anular una venta fiada
  // dejaba al cliente debiendo una mercancía que devolvió.
  if (venta?.fiado && venta?.clienteId && (venta?.saldoUSD || 0) > 0) {
    lote.set(ref('clientes', venta.clienteId), {
      saldoCOP: increment(-deudaEnPesos(venta)),
      saldoUSD: increment(-venta.saldoUSD),
    }, { merge: true });
  }

  // Devolver al inventario lo que se había descontado. Solo eso: los servicios
  // no descontaron stock al vender (`registrarVenta`), así que devolvérselo les
  // pondría unidades encima a algo que no lleva ninguna. Las ventas viejas no
  // traen la marca `esServicio`, así que para esas se mira el catálogo.
  const servicios = new Set((leer('productos') || [])
    .filter((p) => p.tipo === 'servicio').map((p) => p.id));
  const conStock = (venta?.lineas || []).filter((l) => l.productoId
    && !l.esServicio && !servicios.has(l.productoId));
  if (conStock.length) {
    await registrarMovimientos(
      conStock.map((l) => ({
        productoId: l.productoId, nombre: l.nombre, tipo: 'devolucion',
        cantidad: l.cantidad, costoUnitUSD: l.costoUSD,
        nota: `Anulación de venta: ${motivo}`,
      })),
      { lote, ventaId }
    );
  }
  encolar(lote.commit(), 'anulacion');
  anotar('venta-anulada', { ventaId, motivo });
}

export async function pedirAnulacion(ventaId, motivo) {
  const u = usuarioActual();
  const lote = writeBatch(db);
  lote.set(refNuevo('anulaciones'), {
    ventaId, motivo, estado: 'pendiente',
    uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
  });
  encolar(lote.commit(), 'pedido-de-anulacion');
}

/**
 * Ventas de un rango de días (YYYY-MM-DD, inclusive).
 *
 * Al empleado se le filtra por su uid, y no por gusto: las reglas de Firestore
 * solo le dejan leer SUS ventas, y una consulta que pida más se rechaza
 * COMPLETA. Sin este filtro, el empleado no podía ver su reporte X ni cerrar
 * su propio turno: el arqueo fallaba entero y en silencio.
 *
 * Las anuladas se van por omisión: ninguna cuenta las puede sumar. Pero la
 * pantalla de ventas las pide (`incluirAnuladas`), porque una venta anulada es
 * justo lo que hay que poder mirar cuando algo no cuadra — si desaparece de la
 * lista, no hay manera de saber qué se deshizo ni quién lo deshizo.
 */
export async function ventasEntre(desde, hasta, { incluirAnuladas = false, fuente = SERVIDOR } = {}) {
  const d = Timestamp.fromDate(new Date(`${desde}T00:00:00`));
  const h = Timestamp.fromDate(new Date(`${hasta}T23:59:59.999`));
  const u = usuarioActual();
  const soloMias = !esDueno() && u?.uid ? [where('uid', '==', u.uid)] : [];
  const todas = await traer(query(
    col('ventas'), ...soloMias, where('ts', '>=', d), where('ts', '<=', h), orderBy('ts', 'desc')), fuente);
  return incluirAnuladas ? todas : todas.filter((v) => v.estado !== 'anulada');
}

export async function ultimasVentas(cuantas = 20) {
  const snap = await getDocs(query(col('ventas'), orderBy('ts', 'desc'), limit(cuantas)));
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}

/** Una venta sola. Sirve para abrir la que menciona una solicitud de anulación,
 *  que casi nunca es de los días que están en pantalla. */
export async function ventaPorId(id) {
  const s = await getDoc(ref('ventas', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/**
 * Lo que el empleado pidió anular y nadie ha mirado.
 *
 * Sin esta consulta, `pedirAnulacion` escribía en una colección que no leía
 * nadie: el empleado veía "pedido enviado" y el pedido no llegaba a ninguna
 * pantalla. Se ordena en memoria a propósito: filtrar por `estado` y ordenar
 * por `ts` en Firestore pediría un índice compuesto, y son cuatro documentos.
 */
export async function anulacionesPendientes({ fuente = SERVIDOR } = {}) {
  const lista = await traer(query(col('anulaciones'), where('estado', '==', 'pendiente')), fuente);
  return lista.sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
}

/** Cerrar el pedido: 'aprobada' si se anuló, 'rechazada' si la venta se queda. */
export async function resolverAnulacion(id, estado) {
  const u = usuarioActual();
  encolar(setDoc(ref('anulaciones', id), {
    estado, resueltaPor: u?.nombre || '', resueltaTs: serverTimestamp(),
  }, { merge: true }), 'anulacion-resuelta');
  anotar('anulacion-' + estado, { anulacionId: id });
}

export const hoyISO = () => new Date().toISOString().slice(0, 10);
