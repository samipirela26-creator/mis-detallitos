// trabajador.js — ¿cubre lo que genera una persona lo que se le paga?
// Funciones puras: entran ventas, retiros y costos, salen las semanas.
//
// Una semana va de lunes a domingo. Se cuenta la GANANCIA (lo vendido menos lo
// que costó), no lo vendido: vender $100 con $90 de costo no paga un sueldo.
//
// Lo que NO cuenta, y hay que decirlo donde se muestre: limpiar, abrir, atender
// mientras el dueño hace otra cosa. Eso vale, pero no está en ninguna venta.
import { costoLinea } from './analisis.js';
import { diaSemana } from '../core/pendientes-dia.js';

export const PAGO_TRABAJADOR = 'Pago de trabajador';

const sumar = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** El lunes de la semana de esa fecha. */
export const lunesDe = (iso) => sumar(iso, -((diaSemana(iso) + 6) % 7));

/** Día local de una venta o retiro: el `ts` manda; `dia` guarda UTC y a las 8 pm ya es mañana. */
export function diaLocal(x) {
  const d = x?.ts?.toDate ? x.ts.toDate() : x?.ts ? new Date(x.ts) : null;
  if (d && !Number.isNaN(d.getTime())) {
    const l = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return l.toISOString().slice(0, 10);
  }
  return x?.dia || null;
}

/**
 * @param {object} o
 * @param {Array} o.ventas   ventas (se ignoran las anuladas)
 * @param {Array} o.retiros  retiros; cuentan los de 'Pago de trabajador' con `paraQue` = nombre
 * @param {string} o.uid     de quién son las ventas
 * @param {string} o.nombre  a quién se le pagó
 * @param {object} o.costos  { productoId: costoUSD }
 * @param {number} o.sueldoUSD  sueldo semanal en centavos
 * @param {string} o.hoy     'YYYY-MM-DD' local
 * @param {number} o.semanas cuántas mirar hacia atrás
 * @returns semanas, la más reciente primero. Las anteriores a la primera venta se omiten.
 */
export function porSemana({ ventas = [], retiros = [], uid, nombre = '', costos = {}, sueldoUSD = 0, hoy, semanas = 8 }) {
  const mias = ventas.filter((v) => v.estado !== 'anulada' && v.uid === uid);
  const nom = nombre.trim().toLowerCase();
  const pagos = retiros.filter((r) => r.categoria === PAGO_TRABAJADOR
    && String(r.paraQue || '').trim().toLowerCase() === nom);

  const lunesHoy = lunesDe(hoy);
  const primera = mias.map(diaLocal).filter(Boolean).sort()[0];
  const primerLunes = primera ? lunesDe(primera) : lunesHoy;

  const filas = [];
  for (let i = 0; i < semanas; i++) {
    const desde = sumar(lunesHoy, -7 * i);
    if (desde < primerLunes) break;
    const hasta = sumar(desde, 6);
    const enSemana = (x) => { const d = diaLocal(x); return d >= desde && d <= hasta; };
    const v = mias.filter(enSemana);
    const vendidoUSD = v.reduce((t, x) => t + (x.totalUSD || 0), 0);
    const costoUSD = v.reduce((t, x) => t + (x.lineas || []).reduce((s, l) => s + costoLinea(l, costos), 0), 0);
    const gananciaUSD = vendidoUSD - costoUSD;
    filas.push({
      desde, hasta, ventas: v.length, vendidoUSD, gananciaUSD,
      pagadoUSD: pagos.filter(enSemana).reduce((t, r) => t + (r.montoUSD || 0), 0),
      sueldoUSD,
      cubre: gananciaUSD >= sueldoUSD,
      enCurso: i === 0,
    });
  }
  return filas;
}

/** Totales de las semanas ya cerradas (la que corre no se juzga: no ha terminado). */
export function veredicto(filas) {
  const cerradas = filas.filter((s) => !s.enCurso);
  const gananciaUSD = cerradas.reduce((t, s) => t + s.gananciaUSD, 0);
  const sueldoUSD = cerradas.reduce((t, s) => t + s.sueldoUSD, 0);
  return {
    semanas: cerradas.length,
    cubiertas: cerradas.filter((s) => s.cubre).length,
    gananciaUSD, sueldoUSD,
    cubre: cerradas.length > 0 && gananciaUSD >= sueldoUSD,
  };
}
