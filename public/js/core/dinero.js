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

// --- Dónde está la plata ------------------------------------------------------
// El dinero del negocio no está todo en la gaveta: una parte se guarda aparte.
// Cada entrada y cada salida dice de qué sitio sale o a qué sitio entra, y por
// eso la caja del turno NO tiene que coincidir con el total del negocio.
//
// `Caja` es la gaveta del día: ahí caen las ventas en efectivo y de ahí salen
// los gastos. `Caja fuerte` es lo guardado.
//
// Y `Conmigo` es la plata que anda en el bolsillo del que vendió. No es un
// invento contable: Samuel hace ventas rápidas fuera del negocio, con la caja
// cerrada, y esa plata existe —está con él— pero NO está en la gaveta. Antes
// se le cargaba a la gaveta igual, así que el arqueo la reclamaba como si
// estuviera en el mostrador y el cierre cantaba un faltante del tamaño de todo
// lo que se vendió afuera. Cuando llega al negocio, se pasa a la caja o a la
// caja fuerte con un traslado, que es lo que de verdad pasó.
export const LUGARES = ['Caja', 'Caja fuerte', 'Conmigo'];
export const LUGAR_VENTAS = 'Caja';
export const LUGAR_AFUERA = 'Conmigo';


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
    // Y si hay DOS o más, no puede ser decimal: son todas de millar. Ojo con
    // `replace`, que cambia solo la primera: "1,500,000" quedaba en "1500,000"
    // y de ahí en 1.500. Un alquiler entraba mil veces más barato sin avisar.
    s = s.split(',').length > 2 || s.length - ultimaComa === 4
      ? s.split(',').join('')
      : s.replace(',', '.');
  } else if (ultimoPunto > -1) {
    s = s.split('.').length > 2 || s.length - ultimoPunto === 4
      ? s.split('.').join('')
      : s;
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
export function crearPago(moneda, montoMenores, tasas, { montoUSD = null } = {}) {
  const tasa = moneda === MONEDA_BASE ? 100 : (tasas || {})[moneda];
  return {
    moneda,
    monto: montoMenores,
    tasa: tasa ?? null,
    // `montoUSD` se puede fijar cuando se sabe que este pago CUBRE la venta.
    // Sin eso, pagar 3.000 pesos de tres cosas de 1.000 podía dar 73 centavos
    // mientras las líneas suman 72: cada precio se redondea a centavos por su
    // lado y los restos no se cancelan. Quedaba un saldo de un centavo a favor
    // del cliente en una venta que se pagó completa.
    montoUSD: montoUSD ?? aUSD(montoMenores, moneda, moneda === MONEDA_BASE ? null : tasa),
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

// --- Deudas ------------------------------------------------------------------
// LA DEUDA SE FIJA EN PESOS, igual que los precios. Una deuda se contrae en la
// moneda de la etiqueta: si se guarda solo en dólares, cuando el peso se mueve
// la deuda se mueve con él —20.000 pesos con el dólar a 4.000 se vuelven 25.200
// a cobrar— y eso nadie lo acepta, con razón. El peso guardado es el número que
// las dos personas acordaron; el dólar se deriva para los reportes del dueño.

/** ¿Este cliente debe algo? El peso si lo tiene; el dólar en los de antes. */
export const debe = (c) =>
  (c?.saldoCOP === undefined || c?.saldoCOP === null ? (c?.saldoUSD || 0) : c.saldoCOP) > 0;

/**
 * Cuánto debe, en las dos monedas.
 *
 * `enPesos: false` avisa que ese cliente es de antes del cambio y su deuda solo
 * existe en dólares: el peso que se muestre es una conversión de HOY, no lo que
 * se acordó. Se arregla con `scripts/deudas-en-pesos.mjs`.
 */
export function deudaDe(cliente, tasas = {}) {
  const usd = cliente?.saldoUSD || 0;
  const cop = cliente?.saldoCOP;
  if (cop === undefined || cop === null) {
    return { USD: usd, COP: tasas.COP ? desdeUSD(usd, 'COP', tasas.COP) : null, enPesos: false };
  }
  return { COP: cop, USD: tasas.COP ? aUSD(cop, 'COP', tasas.COP) : usd, enPesos: true };
}

/**
 * Cuántos PESOS le baja un abono a la deuda.
 *
 * El peso es el número que las dos personas acordaron, así que el abono tiene
 * que bajarlo EN PESOS y no en dólares convertidos de vuelta. Lo que pagó en
 * pesos baja peso por peso; lo que entró en otra moneda se pasa a pesos con la
 * tasa de hoy, que es lo mejor que se puede hacer con un billete que no es de
 * la moneda de la deuda.
 *
 * Y si paga TODO, la deuda en pesos se cierra en el número exacto que se
 * acordó: sumar conversiones dejaría tres pesos colgando, y un cliente que
 * debe tres pesos sigue saliendo en la lista de deudores como si debiera algo.
 *
 * Vive aquí, y no en la pantalla, porque es aritmética pura y es la que decide
 * cuánto se le perdona a alguien: tiene que poder probarse sin abrir un cuadro.
 */
export function abonoEnPesos(pagos = [], deuda = { USD: 0, COP: 0 }, tasas = {}) {
  if (deuda.COP && totalPagadoUSD(pagos) >= deuda.USD) return deuda.COP;
  const enPesos = pagos
    .filter((p) => p.moneda === 'COP')
    .reduce((t, p) => t + (p.monto || 0), 0);
  const restoUSD = pagos
    .filter((p) => p.moneda !== 'COP')
    .reduce((t, p) => t + (p.montoUSD || 0), 0);
  return enPesos + (tasas.COP && restoUSD ? desdeUSD(restoUSD, 'COP', tasas.COP) : 0);
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

/**
 * El tramo que le toca a esa cantidad, en PESOS. Mismo recorrido que
 * `precioPorCantidad`, pero sobre el peso, que es el número de la etiqueta.
 *
 * Devuelve null cuando no se puede saber: una escala vieja sin `precioCOP`
 * guardado. Null es "no sé", y quien llama tiene que notar la diferencia entre
 * eso y un cero.
 */
export function precioCOPPorCantidad(producto, cantidad) {
  const base = producto.precioCOP || 0;
  const escalas = (producto.escalas || [])
    .filter((e) => Number.isFinite(e.desdeCant) && e.precioCOP > 0)
    .sort((a, b) => a.desdeCant - b.desdeCant);
  let precio = base;
  for (const e of escalas) {
    if (cantidad >= e.desdeCant) precio = e.precioCOP;
  }
  return precio > 0 ? precio : null;
}

/**
 * Devuelve una COPIA de la línea con la cantidad nueva y el precio que le
 * toca. No muta: el carrito compara objetos para saber si repintar.
 *
 * Dos casos en los que la escala NO manda, y son los que cuestan plata si se
 * equivocan:
 *  - precioEditado: el cajero acordó un precio con el cliente. Si la escala lo
 *    pisara al subir la cantidad, el cliente pagaría otra cosa de la hablada.
 *  - tipoPrecio 'variable': el precio ES el que se tecleó (una impresión a
 *    medida); no hay precio de lista que escalar.
 *
 * El precio base para recalcular es precioOriginalUSD, no precioUSD: si se
 * usara el actual, bajar la cantidad dejaría clavado el precio del tramo alto.
 */
export function conCantidad(linea, cantidad) {
  const nueva = { ...linea, cantidad };
  if (linea.precioEditado || linea.tipoPrecio === 'variable') return nueva;

  const base = Number.isFinite(linea.precioOriginalUSD)
    ? linea.precioOriginalUSD
    : linea.precioUSD;
  nueva.precioOriginalUSD = base;
  nueva.precioUSD = precioPorCantidad({ precioUSD: base, escalas: linea.escalas }, cantidad);
  // El peso sigue al dólar por el MISMO tramo. Si se quedara en el precio
  // base, 200 fotocopias se cobrarían al peso de una sola: el tramo movía el
  // dólar y el peso —que es el que se le muestra al cliente— no se enteraba.
  nueva.precioCOP = precioCOPPorCantidad(
    { precioCOP: linea.precioCOPOriginal ?? linea.precioCOP, escalas: linea.escalas }, cantidad,
  ) || 0;
  return nueva;
}

// --- Billetes ----------------------------------------------------------------

/** Billetes y monedas que de verdad circulan, de menor a mayor. */
export const DENOMINACIONES = {
  USD: [100, 200, 500, 1000, 2000, 5000, 10000],
  COP: [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
  VES: [500, 1000, 2000, 5000, 10000, 20000],
};

/**
 * Con qué se paga normalmente cuando todavía no se debe nada. No es
 * simplemente "los cuatro más chicos": el billete de 2 dólares existe pero
 * nadie paga con él, y ofrecerlo gasta un botón de los cuatro que caben.
 */
const COMUNES = {
  USD: [100, 500, 1000, 2000],
  COP: [1000, 2000, 5000, 10000],
  VES: [1000, 2000, 5000, 10000],
};

/**
 * Los billetes que conviene ofrecer para cubrir lo que falta, de menor a
 * mayor y como mucho cuatro (son botones en el teléfono, no una lista).
 *
 * La idea: el que CUBRE lo que falta de un golpe, un par de los de abajo para
 * completar con lo que el cliente traiga suelto, y el siguiente hacia arriba
 * por si paga con uno más grande. Si falta más que el billete mayor, se
 * ofrece ese mayor: es con lo que se empieza a juntar.
 */
export function denominacionesSugeridas(moneda, faltanMenores = 0) {
  const todas = DENOMINACIONES[moneda];
  if (!todas) return [];

  const falta = Math.max(0, redondear(faltanMenores || 0));
  if (falta <= 0) return [...(COMUNES[moneda] || todas.slice(0, 4))];

  const cubre = todas.find((d) => d >= falta) ?? todas[todas.length - 1];
  const debajo = todas.filter((d) => d < falta).slice(-2);
  const encima = todas.filter((d) => d > cubre).slice(0, 1);

  return [...new Set([...debajo, cubre, ...encima])]
    .sort((a, b) => a - b)
    .slice(0, 4);
}

/** Totales de una línea del carrito. Cantidad puede ser decimal (metros, kilos). */
export function totalesLinea({ cantidad, precioUSD, costoUSD = 0 }) {
  const total = redondear(cantidad * precioUSD);
  const costo = redondear(cantidad * costoUSD);
  return { totalUSD: total, costoUSD: costo, gananciaUSD: total - costo };
}

/**
 * El total, y además el total EXACTO en pesos (`totalCOP`) cuando se puede.
 *
 * Por qué hace falta un número aparte y no basta con convertir `totalUSD`: el
 * dólar se guarda en centavos, y 20.000 pesos no caben en centavos sin resto.
 * Al volver salen 20.008. Son 8 pesos, pero el cliente mira la etiqueta que
 * dice 20.000 y la pantalla le dice otra cosa, y esa discusión no la gana
 * nadie. Sumando el peso de cada línea —que viaja con ella desde la etiqueta—
 * el total es el de la etiqueta, exacto.
 *
 * `totalCOP` es null si UNA sola línea no sabe su peso (precio acordado a mano,
 * producto viejo sin `precioCOP`). Sumar las que sí y convertir las que no
 * daría un total que no es ni lo uno ni lo otro; mejor decir "no sé" y que
 * quien llama convierta el total entero, como se hacía antes.
 */
export function totalesVenta(lineas = []) {
  return lineas.reduce(
    (acc, l) => {
      const t = totalesLinea(l);
      acc.totalUSD += t.totalUSD;
      acc.costoUSD += t.costoUSD;
      acc.gananciaUSD += t.gananciaUSD;
      if (acc.totalCOP !== null) {
        if (l.precioCOP > 0) {
          acc.totalCOP += redondear(l.cantidad * l.precioCOP);
        } else if (l.precioUSD === 0 && (l.precioCOP === 0 || l.precioCOP === undefined || l.precioCOP === null)) {
          acc.totalCOP += 0; // Regalo / gratis: 0 pesos
        } else {
          acc.totalCOP = null; // No sabe su peso (precioCOP es 0 pero tiene precio en dólares)
        }
      }
      return acc;
    },
    { totalUSD: 0, costoUSD: 0, gananciaUSD: 0, totalCOP: 0 }
  );
}

/** Margen sobre el precio de venta, en porcentaje (null si no se vendió nada). */
export function margenPct(totalUSD, costoUSD) {
  if (!totalUSD) return null;
  return ((totalUSD - costoUSD) / totalUSD) * 100;
}

/** Por debajo de esto el margen se considera flojo y se marca en ámbar. */
export const MARGEN_FLOJO = 15;

/**
 * En qué estado está un margen. Devuelve el NOMBRE del estado, no un color:
 * el color lo pone el CSS (`.estado-*`), que es quien sabe de temas.
 *
 * Antes esto era el mismo ternario escrito a mano en dos sitios de
 * productos-crud.js, cada uno con su copia del 15. Cambiar el umbral obligaba
 * a acordarse de los dos, y no había forma de probarlo.
 */
export function estadoMargen(pct, flojo = MARGEN_FLOJO) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'sin-dato';
  if (pct < 0) return 'perdida';
  if (pct < flojo) return 'flojo';
  return 'bueno';
}

/** ¿Esta línea necesita autorización del dueño? */
export function requiereAutorizacion(producto, precioUSD, { permitirBajoMinimo = false } = {}) {
  if (permitirBajoMinimo) return false;
  const minimo = producto.precioMinimoUSD || producto.costoUSD || 0;
  return minimo > 0 && precioUSD < minimo;
}

// --- Costo por paquete -------------------------------------------------------
// Quien compra no piensa en unidades: piensa "la docena de lápices me costó
// 1,80". Si ese 1,80 se guarda como costo unitario, la ganancia de cada venta,
// los reportes y el valor del inventario quedan inflados 12 veces, y nada
// avisa. (Pasó: el Lapiz Kores decía costar 1,80 cuando la unidad cuesta 0,15.)
//
// Entonces el costo se puede escribir de las dos maneras, igual que el
// mayoreo: "0,15" (unitario) o "12 por 1,80" (el paquete completo).

/**
 * Lee un costo escrito como unitario o como paquete.
 *   "0,15"        -> { costoUSD: 15, paquete: null }
 *   "12 por 1,80" -> { costoUSD: 15, paquete: { unidades: 12, totalUSD: 180 } }
 * Devuelve `costoUSD: null` si no se entiende nada.
 */
export function parsearCosto(entrada) {
  const texto = String(entrada ?? '').trim();
  if (!texto) return { costoUSD: null, paquete: null };

  // Un costo negativo no existe: antes "-5" entraba como -500 y envenenaba el
  // margen y el valor del inventario.
  if (/^\s*-/.test(texto)) return { costoUSD: null, paquete: null };

  // "12 1,80" (se le olvidó el "por") se leía como 121,80: aMenores borra lo
  // que no es dígito y pega los dos números. Un costo de $121,80 en un lápiz
  // deja al empleado pidiendo PIN en cada venta. Dos números sueltos = nulo.
  if (/^\d[\d.,]*\s+[\d.,]+$/.test(texto)) return { costoUSD: null, paquete: null };

  const separador = /\s(?:por|x)\b|[=:]/i;
  // Las unidades admiten el punto de millar: el papel se compra "1.000 por 12,50".
  const m = texto.match(/^(\d[\d.]*)\s*(?:por|x|=|:)\s*([\d.,]+)$/i);
  if (!m && separador.test(texto)) {
    // Dijo "paquete" pero quedó a medias ("12 por", "12 por mil"). Antes esto
    // se leía como 12 dólares la unidad, que es justo el error que se quiere
    // evitar. Mejor nada: el formulario lo marca incompleto y se ve.
    return { costoUSD: null, paquete: null };
  }
  if (m) {
    const unidades = Number(m[1].replace(/\./g, ''));
    const totalUSD = aMenores(m[2]);
    // "1 por 5" es un unitario escrito raro, no un paquete: no vale guardarlo.
    if (!unidades || !totalUSD || totalUSD <= 0) return { costoUSD: null, paquete: null };
    if (unidades === 1) return { costoUSD: totalUSD, paquete: null };
    return {
      costoUSD: redondear(totalUSD / unidades),
      paquete: { unidades, totalUSD },
    };
  }

  return { costoUSD: aMenores(texto), paquete: null };
}

/** Cómo se le muestra al dueño lo que guardó, para que lo pueda volver a editar. */
export function escribirCosto(costoUSD, paquete) {
  // Con `formatear` y sin símbolo: "1,80" y no "1.8", que es como lo escribe
  // y lo lee el dueño.
  const n = (c) => formatear(c, MONEDA_BASE, { simbolo: false });
  if (paquete?.unidades > 1 && paquete?.totalUSD > 0) {
    return `${paquete.unidades} por ${n(paquete.totalUSD)}`;
  }
  return costoUSD ? n(costoUSD) : '';
}
