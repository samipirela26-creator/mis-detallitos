// analisis.js — las cuentas del negocio. Funciones puras: entran ventas y
// gastos, salen los números. Separado de la pantalla para poder probarlo.
//
// EL DETALLE DEL COSTO: el empleado no puede leer costos (por diseño), así que
// las ventas que él registra guardan costoUSD en 0. Para que la ganancia no
// salga inflada, todas estas funciones aceptan un mapa `costos`
// { productoId: costoUSD } que el dueño sí tiene, y lo usan cuando la línea
// venía sin costo. La línea manda si lo trae: así una venta vieja conserva el
// costo que tenía ese día aunque el proveedor haya subido el precio después.

import { margenPct, LUGARES, LUGAR_VENTAS } from '../core/dinero.js';

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
//   sale:   los gastos del negocio + los retiros
//   y los traslados no cambian el total: mueven de un sitio al otro.
//
// Los gastos y lo cobrado en ventas se le cargan a `Caja`: ahí caen las ventas
// y de ahí sale lo del día. Lo guardado aparte solo se mueve a mano.

/** Lo que de verdad entró por ventas: el total menos lo que quedó fiado. */
export const cobradoDeVentas = (ventas = []) =>
  ventas.reduce((t, v) => t + ((v.totalUSD || 0) - Math.max(0, v.saldoUSD || 0)), 0);

/**
 * Cuánta plata hay y en qué sitio. Son totales HISTÓRICOS: una caja no se
 * reinicia cada mes.
 */
export function dineroPorLugar({ ingresos = [], retiros = [], traslados = [], ventas = [], gastos = [] } = {}) {
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
  sumar(LUGAR_VENTAS, cobradoDeVentas(ventas));
  for (const g of gastos) sumar(LUGAR_VENTAS, -(g.montoUSD || 0));

  const totalUSD = Object.values(saldos).reduce((t, x) => t + x, 0);
  return {
    totalUSD,
    porLugar: Object.entries(saldos).map(([lugar, montoUSD]) => ({ lugar, montoUSD })),
    saldos,
  };
}
