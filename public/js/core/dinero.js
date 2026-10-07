// dinero.js — toda la plata del sistema pasa por aquí.
//
// REGLA DE ORO: nunca se guarda ni se suma dinero en decimales (float). Todo son
// ENTEROS en la unidad mínima de su moneda ("menores"):
//   USD -> centavos        (2 decimales)   $1,50  = 150
//   VES -> céntimos de Bs  (2 decimales)   Bs 36,50 = 3650
//   COP -> pesos           (0 decimales)   $4.100  = 4100
//
// La moneda de cuenta es USD: toda venta, costo y ganancia se guarda en centavos
// de dólar. Los bolívares y los pesos son formas de PAGO, y cada pago guarda la
// tasa que se usó en ese momento — las tasas jamás se recalculan hacia atrás.

export const MONEDAS = {
  USD: { codigo: 'USD', nombre: 'Dólares',  simbolo: '$',   decimales: 2, sep: ',' },
  VES: { codigo: 'VES', nombre: 'Bolívares', simbolo: 'Bs', decimales: 2, sep: ',' },
  COP: { codigo: 'COP', nombre: 'Pesos',    simbolo: '$',   decimales: 0, sep: ',' },
};

export const MONEDA_BASE = 'USD';

function cfg(moneda) {
  const c = MONEDAS[moneda];
  if (!c) throw new Error(`Moneda desconocida: ${moneda}`);
  return c;
}

const factor = (moneda) => Math.pow(10, cfg(moneda).decimales);

/** Redondeo al entero más cercano, simétrico para negativos (no el de Math.round). */
function redondear(n) {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * Lee un número escrito por una persona y devuelve unidades menores (entero).
 * Aguanta "1.234,56", "1,234.56", "1234,5", " 12 ", "Bs 36,50" y 12.5.
 * Devuelve null si no hay un número reconocible.
 */
export function aMenores(entrada, moneda = MONEDA_BASE) {
  if (entrada === null || entrada === undefined || entrada === '') return null;
  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada)) return null;
    return redondear(entrada * factor(moneda));
  }
  let s = String(entrada).trim().replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa > -1 && ultimoPunto > -1) {
    // El separador decimal es el que aparece más a la derecha.
    const dec = ultimaComa > ultimoPunto ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    s = s.split(mil).join('').replace(dec, '.');
  } else if (ultimaComa > -1) {
    // "1,234" puede ser mil o decimal: si deja 3 dígitos exactos, es millar.
    s = s.length - ultimaComa === 4 ? s.replace(',', '') : s.replace(',', '.');
  } else if (ultimoPunto > -1) {
    s = s.length - ultimoPunto === 4 ? s.replace('.', '') : s;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return redondear(n * factor(moneda));
}

/** Unidades menores -> número normal, para mostrar o exportar. */
export function aMayores(menores, moneda = MONEDA_BASE) {
  return (menores || 0) / factor(moneda);
}

/** Formatea para pantalla: formatear(3650, 'VES') -> "Bs 36,50" */
export function formatear(menores, moneda = MONEDA_BASE, { simbolo = true } = {}) {
  const c = cfg(moneda);
  const n = aMayores(menores, moneda);
  const texto = n.toLocaleString('es-VE', {
    minimumFractionDigits: c.decimales,
    maximumFractionDigits: c.decimales,
  });
  return simbolo ? `${c.simbolo} ${texto}` : texto;
}

// --- Tasas -------------------------------------------------------------------
// Una tasa se guarda como ENTERO: cuántas unidades MENORES de esa moneda vale
// 1 USD.  36,50 Bs/$ -> 3650.   4.100 COP/$ -> 4100.
// Así la conversión es aritmética entera y no se arrastra error.

/** Lee la tasa como la escribe el dueño ("36,50") y la deja entera. */
export function tasaAMenores(entrada, moneda) {
  const t = aMenores(entrada, moneda);
  return t && t > 0 ? t : null;
}

/** centavos USD -> unidades menores de `moneda`. */
export function desdeUSD(centavosUSD, moneda, tasaMenores) {
  if (moneda === MONEDA_BASE) return centavosUSD;
  if (!tasaMenores || tasaMenores <= 0) throw new Error(`Falta la tasa de ${moneda}`);
  return redondear((centavosUSD * tasaMenores) / 100);
}

/** unidades menores de `moneda` -> centavos USD. */
export function aUSD(menores, moneda, tasaMenores) {
  if (moneda === MONEDA_BASE) return menores;
  if (!tasaMenores || tasaMenores <= 0) throw new Error(`Falta la tasa de ${moneda}`);
  return redondear((menores * 100) / tasaMenores);
}

// --- Pagos -------------------------------------------------------------------
// pago = { moneda, monto (menores), tasa (menores por USD), montoUSD (centavos) }

/** Arma un pago dejando congelada la tasa usada. */
export function crearPago(moneda, montoMenores, tasas) {
  const tasa = moneda === MONEDA_BASE ? 100 : (tasas || {})[moneda];
  return {
    moneda,
    monto: montoMenores,
    tasa: tasa ?? null,
    montoUSD: aUSD(montoMenores, moneda, moneda === MONEDA_BASE ? null : tasa),
  };
}

export function totalPagadoUSD(pagos = []) {
  return pagos.reduce((suma, p) => suma + (p.montoUSD || 0), 0);
}

/**
 * Cuánto falta o cuánto hay que devolver, en centavos USD.
 *   > 0  sobra  -> es el vuelto
 *   < 0  falta
 *   = 0  justo
 */
export function saldoPago(totalUSD, pagos = []) {
  return totalPagadoUSD(pagos) - totalUSD;
}

/** El vuelto expresado en cada moneda, para que el vendedor elija cómo darlo. */
export function vueltoEnMonedas(vueltoUSD, tasas = {}) {
  const salida = {};
  for (const codigo of Object.keys(MONEDAS)) {
    if (codigo === MONEDA_BASE) { salida[codigo] = vueltoUSD; continue; }
    const t = tasas[codigo];
    if (t) salida[codigo] = desdeUSD(vueltoUSD, codigo, t);
  }
  return salida;
}

// --- Precios -----------------------------------------------------------------

/**
 * Precio unitario que corresponde según la cantidad.
 * `escalas` es [{ desdeCant, precioUSD }, ...] y se aplica el tramo más alto
 * que la cantidad alcance. Esto es lo que abarata la fotocopia al que pide 200.
 */
export function precioPorCantidad(producto, cantidad) {
  const base = producto.precioUSD || 0;
  const escalas = (producto.escalas || [])
    .filter((e) => Number.isFinite(e.desdeCant) && Number.isFinite(e.precioUSD))
    .sort((a, b) => a.desdeCant - b.desdeCant);
  let precio = base;
  for (const e of escalas) {
    if (cantidad >= e.desdeCant) precio = e.precioUSD;
  }
  return precio;
}

/** Totales de una línea del carrito. Cantidad puede ser decimal (metros, kilos). */
export function totalesLinea({ cantidad, precioUSD, costoUSD = 0 }) {
  const total = redondear(cantidad * precioUSD);
  const costo = redondear(cantidad * costoUSD);
  return { totalUSD: total, costoUSD: costo, gananciaUSD: total - costo };
}

export function totalesVenta(lineas = []) {
  return lineas.reduce(
    (acc, l) => {
      const t = totalesLinea(l);
      acc.totalUSD += t.totalUSD;
      acc.costoUSD += t.costoUSD;
      acc.gananciaUSD += t.gananciaUSD;
      return acc;
    },
    { totalUSD: 0, costoUSD: 0, gananciaUSD: 0 }
  );
}

/** Margen sobre el precio de venta, en porcentaje (null si no se vendió nada). */
export function margenPct(totalUSD, costoUSD) {
  if (!totalUSD) return null;
  return ((totalUSD - costoUSD) / totalUSD) * 100;
}

/** ¿Esta línea necesita autorización del dueño? */
export function requiereAutorizacion(producto, precioUSD, { permitirBajoMinimo = false } = {}) {
  if (permitirBajoMinimo) return false;
  const minimo = producto.precioMinimoUSD || producto.costoUSD || 0;
  return minimo > 0 && precioUSD < minimo;
}
