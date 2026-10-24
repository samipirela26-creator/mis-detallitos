// cambio-moneda.js — leer un descuadre y ver si en realidad fue un cambio.
//
// El caso es de todos los días: la venta es en pesos, el cliente paga con un
// billete de dólar y el vuelto sale en pesos. La gaveta termina con un dólar
// más y con los pesos de menos, pero NO perdió plata: la cambió de forma.
//
// La app no anota el billete con que pagaron (ver pos.js: pedirlo era un
// estorbo), así que el arqueo no tiene manera de saberlo por adelantado. Lo que
// sí puede hacer es leer el resultado: si sobra en una moneda y falta en otra
// casi lo mismo a la tasa de hoy, eso es un cambio y hay que decirlo con esas
// palabras. Si no, el cierre reporta un faltante de pesos y un sobrante de
// dólares, y a quien atendió le queda cara de que se quedó con algo.
//
// Nada de esto toca la diferencia que se guarda: esa queda tal cual. Esto es
// solo una lectura de lo que ya pasó.

import { MONEDAS, MONEDA_BASE, aUSD, desdeUSD } from './dinero.js';

/** Hasta aquí el resto de un cambio es redondeo y no un faltante (centavos USD). */
export const RESTO_TOLERADO = 50;

/**
 * ¿Este descuadre se explica con cambios de moneda?
 *
 * `diferencia` = { USD: 500, COP: -20300 } en unidades menores, tal como la
 * devuelve el cierre. `tasas` = { COP: 4100, VES: 3650 }.
 *
 * Devuelve:
 *   pares        [{ sobra:{moneda,monto}, falta:{moneda,monto}, usd }]
 *   sobranteUSD  lo que sobra y NO se explica con ningún cambio
 *   faltanteUSD  lo que falta y NO se explica con ningún cambio
 *   sinTasa      monedas que no se pudieron convertir (no hay tasa cargada)
 *   hayCambio    hubo al menos un par
 *   soloCambio   todo el descuadre fue cambio, salvo el redondeo
 */
export function detectarCambioDeMoneda(diferencia = {}, tasas = {}) {
  const sobras = [];
  const faltas = [];
  const sinTasa = [];

  for (const [moneda, dif] of Object.entries(diferencia)) {
    if (!dif || !MONEDAS[moneda]) continue;
    const tasa = moneda === MONEDA_BASE ? null : (tasas || {})[moneda];
    // Sin tasa no se compara contra nada: se dice que quedó fuera en vez de
    // inventarle una conversión.
    if (moneda !== MONEDA_BASE && !tasa) { sinTasa.push(moneda); continue; }
    const monto = Math.abs(dif);
    const fila = { moneda, tasa, monto, usd: Math.abs(aUSD(monto, moneda, tasa)), resta: 0 };
    fila.resta = fila.usd;
    (dif > 0 ? sobras : faltas).push(fila);
  }

  // De mayor a menor: el cambio grande se empareja con el grande, que es lo
  // que de verdad pasó en la gaveta.
  sobras.sort((a, b) => b.usd - a.usd);
  faltas.sort((a, b) => b.usd - a.usd);

  /** Qué parte del monto de esa moneda entra en este par. */
  const trozo = (fila, usd) => (usd >= fila.usd
    ? fila.monto
    : (fila.moneda === MONEDA_BASE ? usd : desdeUSD(usd, fila.moneda, fila.tasa)));

  const pares = [];
  let a = 0;
  let b = 0;
  while (a < sobras.length && b < faltas.length) {
    const s = sobras[a];
    const f = faltas[b];
    const usd = Math.min(s.resta, f.resta);
    if (usd > 0) {
      pares.push({
        sobra: { moneda: s.moneda, monto: trozo(s, usd) },
        falta: { moneda: f.moneda, monto: trozo(f, usd) },
        usd,
      });
    }
    s.resta -= usd;
    f.resta -= usd;
    if (s.resta <= 0) a += 1;
    if (f.resta <= 0) b += 1;
  }

  const suma = (lista) => lista.reduce((t, x) => t + Math.max(0, x.resta), 0);
  const sobranteUSD = suma(sobras);
  const faltanteUSD = suma(faltas);

  return {
    pares,
    sobranteUSD,
    faltanteUSD,
    sinTasa,
    hayCambio: pares.length > 0,
    soloCambio: pares.length > 0 && !sinTasa.length
      && sobranteUSD <= RESTO_TOLERADO && faltanteUSD <= RESTO_TOLERADO,
  };
}
