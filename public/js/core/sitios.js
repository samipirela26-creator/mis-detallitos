// sitios.js — en qué sitio cae FÍSICAMENTE cada moneda.
//
// La regla la puso Samuel y no es un detalle de contabilidad, es cómo trabaja
// el mostrador:
//
//   Los BOLÍVARES nunca están en la gaveta. Entran por pago móvil —no son
//   billetes— y el que atiende no puede dar vuelto en bolívares. Van derecho a
//   la caja fuerte y de ahí solo se mueven a mano.
//
// Por qué esto importa tanto: el arqueo del turno pide contar lo que debería
// haber en la gaveta. Si una venta pagada en bolívares suma bolívares a la
// gaveta, al cerrar el turno la app reclama unos bolívares que NO están ahí
// (están en el teléfono) y canta un faltante que nadie puede explicar. Un
// faltante inventado tapa los de verdad, que es el problema que se vino
// arrastrando.
//
// Si algún día se reciben bolívares en efectivo, se cambia aquí y en un solo
// sitio: el arqueo, el conteo y las cuentas del dueño lo leen todos de aquí.

import { LUGARES, LUGAR_VENTAS, LUGAR_AFUERA } from './dinero.js';

const GUARDADO = LUGARES.find((l) => l !== LUGAR_VENTAS) || LUGAR_VENTAS;

/** Dónde cae el dinero de esta moneda cuando entra por una venta o un abono. */
export const LUGAR_DE_LA_MONEDA = {
  USD: LUGAR_VENTAS,
  COP: LUGAR_VENTAS,
  VES: GUARDADO,        // pago móvil: nunca pasa por la gaveta
};

/** El sitio donde cae esa moneda. Lo que no esté en la lista, a la gaveta. */
export const lugarDeLaMoneda = (moneda) => LUGAR_DE_LA_MONEDA[moneda] || LUGAR_VENTAS;

/** ¿Hay que contar esta moneda al cerrar la gaveta? */
export const entraALaGaveta = (moneda) => lugarDeLaMoneda(moneda) === LUGAR_VENTAS;

/**
 * Dónde cae ESTE pago, sabiendo dónde se hizo la venta.
 *
 * Una venta hecha fuera del negocio (sin caja abierta) deja el efectivo en el
 * bolsillo del que vendió, no en la gaveta: `lugarVenta` manda. Pero el pago
 * móvil no cambia de sitio por eso —los bolívares llegan al teléfono igual,
 * esté quien sea donde esté—, así que esos se quedan donde dice su moneda.
 */
export function lugarDelPago(moneda, lugarVenta) {
  const propio = lugarDeLaMoneda(moneda);
  if (propio !== LUGAR_VENTAS) return propio;          // pago móvil: no es billete
  if (!lugarVenta || !LUGARES.includes(lugarVenta)) return propio;
  return lugarVenta;
}

export { LUGAR_AFUERA };
