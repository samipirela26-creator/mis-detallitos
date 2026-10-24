// respaldo-formato.js — el formato del respaldo, SIN tocar Firestore.
//
// Está separado de `data/respaldo.js` a propósito: aquí vive lo único que de
// verdad se puede romper en silencio —convertir fechas, números y objetos
// anidados a JSON y de vuelta— y al no importar Firebase se puede probar en
// Node, sin emuladores. La prueba de ida y vuelta vive en
// `test/respaldo.test.mjs`.
//
// La regla que manda: **un respaldo que no se ha restaurado no es un
// respaldo.** Si esto pierde un centavo o una fecha, el archivo es un papel
// mojado y nadie se entera hasta el día que hace falta.

/** Sube cuando el formato cambie de forma incompatible. */
export const VERSION_FORMATO = 1;

/**
 * Qué se guarda y qué NO.
 *
 * Fuera quedan, a propósito:
 *  - `secretos`: llaves de API. Un respaldo se manda por WhatsApp sin pensarlo.
 *  - `equipo`: el hash del PIN y el marcador del turno abierto. Lo primero es
 *    una credencial; lo segundo es estado de ahora mismo, no historia.
 *  - `productos_venta`: es el espejo sin costos del catálogo. No se restaura,
 *    se RECONSTRUYE desde `productos`, que es la única fuente de verdad. Si se
 *    guardara, un respaldo viejo podría devolverle al empleado precios que ya
 *    no existen.
 */
export const COLECCIONES = [
  'productos', 'ventas', 'clientes', 'abonos', 'cajas',
  'gastos', 'ingresos', 'retiros', 'traslados', 'movimientos',
  'tasas', 'sinonimos_pendientes', 'config', 'auditoria',
];

/** Las fotos pesan ~50 KB cada una: van aparte y el dueño decide. */
export const COLECCION_FOTOS = 'fotos';

/** ¿Esto es una marca de tiempo de Firestore? Se reconoce por la forma. */
const esFecha = (v) => !!v && typeof v === 'object'
  && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number';

/**
 * Un valor de Firestore -> algo que JSON aguante.
 *
 * Las fechas se marcan con `__fecha` para poder devolverlas como Timestamp al
 * restaurar. Sin esto volverían como texto y `ventasFiadasDe` (que ordena por
 * `ts`) dejaría de funcionar sin dar error: solo saldrían desordenadas.
 */
export function aPlano(valor) {
  if (valor === null || valor === undefined) return null;
  if (esFecha(valor)) return { __fecha: { s: valor.seconds, n: valor.nanoseconds } };
  if (Array.isArray(valor)) return valor.map(aPlano);
  if (valor instanceof Date) return { __fecha: { s: Math.floor(valor.getTime() / 1000), n: 0 } };
  if (typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = aPlano(v);
    return salida;
  }
  return valor;
}

/**
 * Y de vuelta. `Timestamp` se pasa desde afuera para que este módulo siga sin
 * depender de Firebase; en las pruebas entra uno de mentira.
 */
export function aFirestore(valor, Timestamp) {
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) return valor.map((v) => aFirestore(v, Timestamp));
  if (typeof valor === 'object') {
    if (valor.__fecha) {
      const { s, n } = valor.__fecha;
      return Timestamp ? new Timestamp(s, n) : { seconds: s, nanoseconds: n };
    }
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = aFirestore(v, Timestamp);
    return salida;
  }
  return valor;
}

/** Arma el objeto que se baja. `datos` es { coleccion: [{id, ...campos}] }. */
export function armar(datos, { negocio = '', incluyeFotos = false } = {}) {
  const colecciones = {};
  let documentos = 0;
  for (const [nombre, filas] of Object.entries(datos)) {
    colecciones[nombre] = (filas || []).map((d) => {
      const { id, ...campos } = d;
      return { id, ...aPlano(campos) };
    });
    documentos += colecciones[nombre].length;
  }
  return {
    formato: VERSION_FORMATO,
    app: 'mis-detallitos',
    negocio,
    fecha: new Date().toISOString(),
    incluyeFotos,
    documentos,
    colecciones,
  };
}

/**
 * ¿Este archivo sirve para restaurar? Devuelve { ok, error, resumen }.
 *
 * Se valida ANTES de escribir nada. Restaurar a medias es peor que no
 * restaurar: deja la base con una mitad vieja y otra nueva.
 */
export function validar(datos) {
  if (!datos || typeof datos !== 'object') return { ok: false, error: 'El archivo no es un respaldo.' };
  if (datos.app !== 'mis-detallitos') return { ok: false, error: 'Ese respaldo no es de esta app.' };
  if (typeof datos.formato !== 'number') return { ok: false, error: 'Al archivo le falta el número de formato.' };
  if (datos.formato > VERSION_FORMATO) {
    return { ok: false, error: `El respaldo es de una versión más nueva (formato ${datos.formato}). Actualiza la app antes de restaurarlo.` };
  }
  if (!datos.colecciones || typeof datos.colecciones !== 'object') {
    return { ok: false, error: 'El respaldo no trae ninguna colección.' };
  }
  const desconocidas = Object.keys(datos.colecciones)
    .filter((c) => c !== COLECCION_FOTOS && !COLECCIONES.includes(c));
  const resumen = Object.entries(datos.colecciones)
    .map(([nombre, filas]) => ({ nombre, cuantos: Array.isArray(filas) ? filas.length : 0 }))
    .filter((r) => r.cuantos > 0)
    .sort((a, b) => b.cuantos - a.cuantos);
  if (!resumen.length) return { ok: false, error: 'El respaldo está vacío.' };
  const sinId = Object.entries(datos.colecciones)
    .find(([, filas]) => Array.isArray(filas) && filas.some((d) => !d || !d.id));
  if (sinId) return { ok: false, error: `Hay documentos sin id en "${sinId[0]}". El archivo está dañado.` };
  return { ok: true, resumen, desconocidas, total: resumen.reduce((t, r) => t + r.cuantos, 0) };
}

/** Nombre del archivo: que se entienda cuál es el más nuevo sin abrirlo. */
export function nombreArchivo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `respaldo-detallitos-${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
    + `-${p(fecha.getHours())}${p(fecha.getMinutes())}.json`;
}
