// favoritos.js — los productos que de verdad se venden aquí, aprendidos solos.
//
// Antes los chips de la pantalla de vender estaban escritos a mano en el HTML
// ("Fotocopia B/N", "Impresión"). Eso sirve el primer día y después miente:
// cada negocio y cada temporada vende otra cosa (en agosto, útiles; en
// diciembre, papel de regalo).
//
// Cómo se decide: se cuenta cuántas veces se agregó cada producto al carrito,
// con MÁS peso a lo reciente. Es un contador local (IndexedDB), no toca
// Firestore: se lee en el render, tiene que ser instantáneo y gratis.
//
// El peso reciente se consigue a la vieja usanza: cada cierto número de usos
// todos los contadores se dividen entre dos. Así lo de hace un mes se va
// apagando sin tener que guardar la fecha de cada toque.

import { guardar, leer as leerIdb, ALMACENES } from './idb.js';

const CLAVE = 'favoritos';
const CADA_CUANTO_SE_OLVIDA = 300;   // usos totales entre cada división
const MAXIMO_RECORDADO = 60;         // productos que se guardan, no más

let mapa = new Map();   // productoId -> { n, nombre }
let usosDesdeElOlvido = 0;
let listo = false;
let guardarPendiente = null;

/** Trae el contador del disco. Se llama una vez al abrir la app. */
export async function cargarFavoritos() {
  if (listo) return;
  listo = true;
  const crudo = await leerIdb(ALMACENES.VARIOS, CLAVE);
  if (crudo?.items) {
    mapa = new Map(crudo.items.map((x) => [x.id, { n: x.n, nombre: x.nombre }]));
    usosDesdeElOlvido = crudo.usos || 0;
  }
}

function guardarLuego() {
  // Se agrupa: en una venta de diez líneas no tiene sentido escribir diez veces.
  clearTimeout(guardarPendiente);
  guardarPendiente = setTimeout(() => {
    const items = [...mapa.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.n - a.n)
      .slice(0, MAXIMO_RECORDADO);
    mapa = new Map(items.map((x) => [x.id, { n: x.n, nombre: x.nombre }]));
    guardar(ALMACENES.VARIOS, CLAVE, { items, usos: usosDesdeElOlvido });
  }, 1500);
}

/** Se llama cada vez que un producto entra al carrito. */
export function contarUso(producto) {
  if (!producto?.id) return;   // el producto suelto no tiene id: no se cuenta
  const actual = mapa.get(producto.id) || { n: 0, nombre: producto.nombre };
  mapa.set(producto.id, { n: actual.n + 1, nombre: producto.nombre });

  if (++usosDesdeElOlvido >= CADA_CUANTO_SE_OLVIDA) {
    usosDesdeElOlvido = 0;
    for (const [id, v] of mapa) {
      const n = Math.floor(v.n / 2);
      if (n > 0) mapa.set(id, { ...v, n });
      else mapa.delete(id);     // lo que se vendió una vez hace meses, fuera
    }
  }
  guardarLuego();
}

/**
 * Los más usados que todavía existen en el catálogo, listos para pintar.
 * Es síncrono porque lo usa el render del POS.
 */
export function favoritos(productos = [], limite = 6) {
  if (!mapa.size) return [];
  const porId = new Map(productos.map((p) => [p.id, p]));
  return [...mapa.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id]) => porId.get(id))
    .filter((p) => p && (p.tipo === 'servicio' || p.stock > 0))
    .slice(0, limite);
}

/** Para la primera semana, cuando todavía no hay nada aprendido. */
export const hayFavoritos = () => mapa.size > 0;
