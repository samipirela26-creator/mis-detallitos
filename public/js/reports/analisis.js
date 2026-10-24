// analisis.js — las cuentas del negocio. Funciones puras: entran ventas y
// gastos, salen los números. Separado de la pantalla para poder probarlo.
//
// EL DETALLE DEL COSTO: el empleado no puede leer costos (por diseño), así que
// las ventas que él registra guardan costoUSD en 0. Para que la ganancia no
// salga inflada, todas estas funciones aceptan un mapa `costos`
// { productoId: costoUSD } que el dueño sí tiene, y lo usan cuando la línea
// venía sin costo. La línea manda si lo trae: así una venta vieja conserva el
// costo que tenía ese día aunque el proveedor haya subido el precio después.

import { margenPct, LUGARES, LUGAR_VENTAS, MONEDAS } from '../core/dinero.js';
import { lugarDeLaMoneda, lugarDelPago } from '../core/sitios.js';

/** Costo de una línea: el que guardó la venta, o el del catálogo si faltaba. */
export function costoLinea(l, costos = {}) {
  const unitario = l.costoUSD || costos[l.productoId] || 0;
  return Math.round(l.cantidad * unitario);
}

/** ¿Hay ventas cuyo costo hubo que completar con el catálogo? */
export const costosEstimados = (ventas = []) =>
  ventas.some((v) => (v.lineas || []).some((l) => !l.costoUSD && l.productoId));

export function resumen(ventas = [], gastos = [], costos = {}) {
  const vendidoUSD = ventas.reduce((t, v) => t + (v.totalUSD || 0), 0);
  const costoUSD = ventas.reduce((t, v) =>
    t + (v.lineas || []).reduce((s, l) => s + costoLinea(l, costos), 0), 0);
  const gananciaBrutaUSD = vendidoUSD - costoUSD;
  const gastosUSD = gastos.reduce((t, g) => t + (g.montoUSD || 0), 0);
  const porCobrarUSD = ventas.reduce((t, v) => t + Math.max(0, v.saldoUSD || 0), 0);
  return {
    cantidad: ventas.length,
    vendidoUSD,
    costoUSD,
    gananciaBrutaUSD,
    gastosUSD,
    gananciaNetaUSD: gananciaBrutaUSD - gastosUSD,
    porCobrarUSD,
    margenPct: margenPct(vendidoUSD, costoUSD),
    ticketPromedioUSD: ventas.length ? Math.round(vendidoUSD / ventas.length) : 0,
  };
}

/** Ganancia producto por producto. Es LA pregunta del dueño. */
export function porProducto(ventas = [], costos = {}) {
  const mapa = new Map();
  for (const v of ventas) {
    for (const l of v.lineas || []) {
      const clave = l.productoId || l.nombre;
      const a = mapa.get(clave) || {
        productoId: l.productoId, nombre: l.nombre,
        unidades: 0, vendidoUSD: 0, costoUSD: 0, veces: 0, bajoCosto: 0,
      };
      const total = Math.round(l.cantidad * l.precioUSD);
      const costo = costoLinea(l, costos);
      const costoUnit = l.costoUSD || costos[l.productoId] || 0;
      a.unidades += l.cantidad;
      a.vendidoUSD += total;
      a.costoUSD += costo;
      a.veces += 1;
      if (costoUnit && l.precioUSD < costoUnit) a.bajoCosto += 1;
      mapa.set(clave, a);
    }
  }
  return [...mapa.values()]
    .map((a) => ({ ...a, gananciaUSD: a.vendidoUSD - a.costoUSD, margenPct: margenPct(a.vendidoUSD, a.costoUSD) }))
    .sort((a, b) => b.gananciaUSD - a.gananciaUSD);
}

/** Ranking de quién vendió. Lo pidió el dueño tal cual. */
export function porVendedor(ventas = [], costos = {}) {
  const mapa = new Map();
  const total = ventas.reduce((t, v) => t + (v.totalUSD || 0), 0);
  for (const v of ventas) {
    const a = mapa.get(v.uid) || { uid: v.uid, nombre: v.nombreUsuario || '—', ventas: 0, vendidoUSD: 0, gananciaUSD: 0, descuentos: 0 };
    a.ventas += 1;
    a.vendidoUSD += v.totalUSD || 0;
    a.gananciaUSD += (v.totalUSD || 0) - (v.lineas || []).reduce((s, l) => s + costoLinea(l, costos), 0);
    a.descuentos += (v.lineas || []).filter((l) => l.precioEditado).length;
    mapa.set(v.uid, a);
  }
  return [...mapa.values()]
    .map((a) => ({
      ...a,
      pct: total ? (a.vendidoUSD / total) * 100 : 0,
      ticketUSD: a.ventas ? Math.round(a.vendidoUSD / a.ventas) : 0,
    }))
    .sort((a, b) => b.vendidoUSD - a.vendidoUSD);
}

/** Ventas y ganancia día por día, para la gráfica. */
export function porDia(ventas = [], gastos = [], costos = {}) {
  const mapa = new Map();
  const tocar = (dia) => {
    if (!mapa.has(dia)) mapa.set(dia, { dia, vendidoUSD: 0, gananciaUSD: 0, gastosUSD: 0 });
    return mapa.get(dia);
  };
  for (const v of ventas) {
    const d = tocar(v.dia || (v.ts?.toDate?.().toISOString().slice(0, 10)) || '—');
    d.vendidoUSD += v.totalUSD || 0;
    d.gananciaUSD += (v.totalUSD || 0) - (v.lineas || []).reduce((s, l) => s + costoLinea(l, costos), 0);
  }
  for (const g of gastos) {
    tocar(g.dia || '—').gastosUSD += g.montoUSD || 0;
  }
  return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Los que te están haciendo perder plata o casi. */
export function margenFlojo(productosVendidos, umbral = 15) {
  return productosVendidos
    .filter((p) => p.margenPct !== null && p.margenPct < umbral)
    .sort((a, b) => a.margenPct - b.margenPct);
}

/** Cuánta ganancia se regaló en descuentos, y quién los dio. */
export function descuentos(ventas = []) {
  const salida = [];
  for (const v of ventas) {
    for (const l of v.lineas || []) {
      if (!l.precioEditado) continue;
      const regalado = Math.round(l.cantidad * ((l.precioOriginalUSD || l.precioUSD) - l.precioUSD));
      if (regalado > 0) {
        salida.push({
          ventaId: v.id, producto: l.nombre, vendedor: v.nombreUsuario,
          autorizadoPor: l.autorizadoPor, regaladoUSD: regalado,
          dia: v.dia, cantidad: l.cantidad,
        });
      }
    }
  }
  return salida.sort((a, b) => b.regaladoUSD - a.regaladoUSD);
}

/** Días que faltan para que se acabe, según lo que se vendió. */
export function proyeccionQuiebre(producto, ventas, dias = 30) {
  const unidades = ventas.reduce((t, v) =>
    t + (v.lineas || []).filter((l) => l.productoId === producto.id).reduce((s, l) => s + l.cantidad, 0), 0);
  const porDia = unidades / dias;
  if (porDia <= 0) return null;
  return Math.floor((producto.stock || 0) / porDia);
}

// --- Retiros ------------------------------------------------------------------
// Lo que el dueño saca de la caja. No es un gasto del negocio: la ganancia ya
// está hecha, esto es a dónde se fue. Por eso se resta aparte y no toca el
// margen ni la ganancia neta.

/** Total y desglose por categoría, de mayor a menor. */
export function resumenRetiros(retiros = []) {
  const mapa = new Map();
  let totalUSD = 0;
  for (const r of retiros) {
    const monto = r.montoUSD || 0;
    totalUSD += monto;
    const a = mapa.get(r.categoria) || { categoria: r.categoria || '—', totalUSD: 0, cantidad: 0 };
    a.totalUSD += monto;
    a.cantidad += 1;
    mapa.set(r.categoria, a);
  }
  return {
    totalUSD,
    cantidad: retiros.length,
    porCategoria: [...mapa.values()].sort((a, b) => b.totalUSD - a.totalUSD),
  };
}

/**
 * Lo que queda por sacar: la ganancia neta del período menos lo ya retirado.
 * Puede salir negativo, y entonces hay que verlo: se sacó más de lo que entró.
 */
export function disponible(resumenPeriodo, retiros = []) {
  return (resumenPeriodo?.gananciaNetaUSD || 0) - resumenRetiros(retiros).totalUSD;
}

// --- Dinero de verdad ---------------------------------------------------------
// La ganancia y el dinero en mano no son lo mismo, y confundirlos es lo que
// hace que "gané 300" y la gaveta tenga 80. Aquí se cuenta PLATA:
//
//   entra:  los ingresos (el dinero inicial, aportes, préstamos)
//         + lo COBRADO de las ventas (lo fiado no está en la caja)
//         + los abonos de los fiados (la deuda que te pagaron sí está)
//   sale:   los gastos del negocio + los retiros
//   y los traslados no cambian el total: mueven de un sitio al otro.
//
// Los gastos y lo cobrado en ventas se le cargan a `Caja`: ahí caen las ventas
// y de ahí sale lo del día. Lo guardado aparte solo se mueve a mano.

/** Lo que de verdad entró por ventas: el total menos lo que quedó fiado. */
export const cobradoDeVentas = (ventas = []) =>
  ventas.reduce((t, v) => t + ((v.totalUSD || 0) - Math.max(0, v.saldoUSD || 0)), 0);

/**
 * ¿Esta venta dejó una deuda de verdad?
 *
 * `saldoUSD > 0` por sí solo NO sirve, y es un error fácil de cometer: una
 * venta cobrada en pesos se paga convirtiendo el total a pesos y volviendo a
 * dólares, y ese viaje de ida y vuelta deja uno o dos centavos colgando. Con
 * solo mirar el saldo, media lista de ventas sale marcada "fiado" por un
 * centavo que nadie va a cobrar nunca.
 *
 * La deuda que existe de verdad es la que `registrarVenta` le sumó al cliente,
 * y eso pasa cuando quien cobró eligió FIADO. Esa es la marca que se mira.
 */
export const quedoDebiendo = (venta) => !!venta?.fiado && (venta.saldoUSD || 0) > 0;

/**
 * Lo que le falta (o le sobra) a la suma de las líneas para dar el total
 * cobrado, en pesos. Cero cuando cuadra, que es lo normal.
 *
 * No es un error: el total se convierte del dólar con la tasa del día y se
 * redondea, mientras que cada línea lleva el peso de su etiqueta. Pero unas
 * líneas que no suman el total es lo que hace desconfiar de toda la pantalla,
 * así que hay que poder decirlo.
 *
 * Solo aplica a las ventas cobradas en pesos y sin ajuste a mano: si el total
 * se ajustó, lo que no cuadra ya lo explica el ajuste, y decirlo dos veces
 * confunde más que callarlo.
 */
export function redondeoDeLaConversion(venta) {
  if (!venta?.totalCOP || venta.ajusteUSD) return 0;
  const lineas = venta.lineas || [];
  if (!lineas.length || lineas.some((l) => !(l.precioCOP > 0))) return 0;
  const suma = lineas.reduce((t, l) => t + Math.round(l.cantidad * l.precioCOP), 0);
  return venta.totalCOP - suma;
}

/**
 * El vuelto de una venta, en la moneda en que salió de la gaveta.
 *
 * Las ventas nuevas lo traen escrito. Las viejas no, y ahí se reconstruye: si
 * pagaron más que el total, la diferencia se devolvió, y se devolvió en la
 * moneda con que pagaron. Sin esto, una venta de $0,79 pagada con un billete
 * de 5.000 pesos deja esperando los 5.000 completos en la gaveta y el arqueo
 * acusa un faltante que nunca existió.
 */
export function vueltoDeVenta(venta) {
  if (venta?.vuelto?.moneda) return venta.vuelto;
  const sobra = (venta?.pagadoUSD || 0) - (venta?.totalUSD || 0);
  const pagos = venta?.pagos || [];
  if (sobra <= 0 || !pagos.length) return null;
  const mayor = [...pagos].sort((a, b) => (b.montoUSD || 0) - (a.montoUSD || 0))[0];
  const tasa = mayor.tasa || 100;
  return {
    moneda: mayor.moneda,
    monto: mayor.moneda === 'USD' ? sobra : Math.round((sobra * tasa) / 100),
    montoUSD: sobra,
    reconstruido: true,
  };
}

/**
 * EFECTIVO DE VERDAD: cuántos billetes de cada moneda debería haber en cada
 * sitio. Es la cuenta que se compara con la mano contando.
 *
 * Va aparte de `dineroPorLugar` (que da el valor en dólares) porque son dos
 * preguntas distintas y confundirlas es lo que impide cuadrar: el total en
 * dólares usa la tasa del día en que entró cada billete, así que no se puede
 * comparar contra un montón de pesos sobre el mostrador. Los pesos se cuadran
 * con pesos.
 */
export function efectivoPorLugar({ ingresos = [], retiros = [], traslados = [], ventas = [], gastos = [], abonos = [] } = {}) {
  const vacio = () => Object.fromEntries(Object.keys(MONEDAS).map((m) => [m, 0]));
  const saldos = Object.fromEntries(LUGARES.map((l) => [l, vacio()]));
  const mover = (lugar, moneda, monto) => {
    if (!moneda || !monto) return;
    const l = saldos[lugar] ? lugar : LUGAR_VENTAS;
    saldos[l][moneda] = (saldos[l][moneda] || 0) + monto;
  };

  for (const i of ingresos) mover(i.lugar || LUGAR_VENTAS, i.moneda, i.monto || 0);
  for (const r of retiros) mover(r.lugar || LUGAR_VENTAS, r.moneda, -(r.monto || 0));
  for (const g of gastos) mover(g.lugar || LUGAR_VENTAS, g.moneda, -(g.monto || 0));
  for (const a of abonos) {
    for (const p of a.pagos || []) mover(a.lugar || lugarDeLaMoneda(p.moneda), p.moneda, p.monto || 0);
  }
  for (const t of traslados) {
    mover(t.desde, t.moneda, -(t.monto || 0));
    mover(t.hacia, t.moneda, t.monto || 0);
  }
  for (const v of ventas) {
    // Cada moneda a su sitio: los bolívares entran por pago móvil y nunca
    // pasan por la gaveta, y lo que se vendió afuera se queda con quien vendió
    // (ver core/sitios.js).
    for (const p of v.pagos || []) mover(lugarDelPago(p.moneda, v.lugar), p.moneda, p.monto || 0);
    const vuelto = vueltoDeVenta(v);
    if (vuelto) mover(lugarDelPago(vuelto.moneda, v.lugar), vuelto.moneda, -(vuelto.monto || 0));
  }

  return saldos;
}

/**
 * Cuánta plata hay y en qué sitio. Son totales HISTÓRICOS: una caja no se
 * reinicia cada mes.
 */
export function dineroPorLugar({ ingresos = [], retiros = [], traslados = [], ventas = [], gastos = [], abonos = [] } = {}) {
  const saldos = Object.fromEntries(LUGARES.map((l) => [l, 0]));
  const sumar = (lugar, monto) => {
    if (saldos[lugar] === undefined) saldos[lugar] = 0;
    saldos[lugar] += monto;
  };

  for (const i of ingresos) sumar(i.lugar || LUGAR_VENTAS, i.montoUSD || 0);
  for (const r of retiros) sumar(r.lugar || LUGAR_VENTAS, -(r.montoUSD || 0));
  for (const t of traslados) {
    sumar(t.desde, -(t.montoUSD || 0));
    sumar(t.hacia, t.montoUSD || 0);
  }
  // Lo cobrado va al sitio de SU moneda, no todo a la gaveta: los bolívares
  // entran por pago móvil y se quedan guardados (ver core/sitios.js). Si la
  // venta no trae el detalle de los pagos, se le carga a la gaveta, que es
  // donde cae el día a día.
  for (const v of ventas) {
    const pagos = v.pagos || [];
    if (!pagos.length) {
      sumar(v.lugar || LUGAR_VENTAS, (v.totalUSD || 0) - Math.max(0, v.saldoUSD || 0));
      continue;
    }
    for (const p of pagos) sumar(lugarDelPago(p.moneda, v.lugar), p.montoUSD || 0);
    const vuelto = vueltoDeVenta(v);
    if (vuelto) sumar(lugarDelPago(vuelto.moneda, v.lugar), -(vuelto.montoUSD || 0));
  }
  // Los abonos de los fiados son PLATA QUE ENTRA. Faltaban: una deuda cobrada
  // no aparecía en ninguna parte y el total del negocio salía por debajo de lo
  // que había en la gaveta (el clásico "sobra y no sé de dónde salió").
  for (const a of abonos) sumar(a.lugar || LUGAR_VENTAS, a.montoUSD || 0);
  for (const g of gastos) sumar(g.lugar || LUGAR_VENTAS, -(g.montoUSD || 0));

  const totalUSD = Object.values(saldos).reduce((t, x) => t + x, 0);
  return {
    totalUSD,
    porLugar: Object.entries(saldos).map(([lugar, montoUSD]) => ({ lugar, montoUSD })),
    saldos,
  };
}
