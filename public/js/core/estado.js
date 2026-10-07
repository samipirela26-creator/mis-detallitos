// estado.js — un almacén mínimo y observable. Sin framework.

const datos = {
  productos: [],        // catálogo cacheado (lo llena data/cache-local.js)
  carrito: [],
  tasas: {},            // { VES: 3650, COP: 4100 }  en unidades menores por USD
  tasaFecha: null,
  caja: null,           // turno abierto
  conexion: navigator.onLine,
  pendientes: 0,        // ventas en cola por subir
};

const oyentes = new Map();  // clave -> Set(fn)

export const leer = (clave) => datos[clave];

export function escribir(clave, valor) {
  datos[clave] = valor;
  for (const fn of oyentes.get(clave) || []) fn(valor);
}

export function observar(clave, fn, { inmediato = true } = {}) {
  if (!oyentes.has(clave)) oyentes.set(clave, new Set());
  oyentes.get(clave).add(fn);
  if (inmediato) fn(datos[clave]);
  return () => oyentes.get(clave).delete(fn);
}

addEventListener('online', () => escribir('conexion', true));
addEventListener('offline', () => escribir('conexion', false));
