// router.js — navegación por hash, sin dependencias.
// Cada pantalla se registra con su rol mínimo; si no alcanza, no aparece ni se abre.

import { puede, esDueno, usuarioActual } from './sesion.js';

const pantallas = new Map();
let contenedor = null;
let actual = null;

/**
 * registrar('vender', { titulo, icono, menu: true, soloDueno: false, montar(nodo) })
 * `montar` puede devolver una función de limpieza.
 */
export function registrar(id, def) {
  pantallas.set(id, { id, menu: false, soloDueno: false, soloEmpleado: false, orden: 99, ...def });
}

/** Las pantallas del menú de abajo, ya filtradas por rol y en su orden.
 *  Se dejan en 5 como máximo: una barra con más botones deja de ser cómoda. */
export const pantallasDeMenu = () =>
  [...pantallas.values()]
    .filter((p) => p.menu
      && (!p.soloDueno || esDueno())
      && (!p.soloEmpleado || !esDueno()))
    .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));

export function ir(id, params = {}) {
  const query = new URLSearchParams(params).toString();
  location.hash = query ? `#/${id}?${query}` : `#/${id}`;
}

function parsear() {
  const crudo = location.hash.replace(/^#\/?/, '');
  const [id, query] = crudo.split('?');
  return { id: id || inicioSegunRol(), params: Object.fromEntries(new URLSearchParams(query || '')) };
}

function inicioSegunRol() {
  return esDueno() ? 'panel' : 'vender';
}

async function pintar() {
  if (!contenedor) return;
  const { id, params } = parsear();
  const p = pantallas.get(id);
  if (!p) return ir(inicioSegunRol());
  if (p.soloDueno && !esDueno()) return ir(inicioSegunRol());

  if (actual?.limpiar) { try { actual.limpiar(); } catch (e) { console.warn(e); } }
  contenedor.innerHTML = '';
  contenedor.dataset.pantalla = id;
  document.title = p.titulo ? `${p.titulo} · Mis Detallitos` : 'Mis Detallitos';
  const limpiar = await p.montar(contenedor, params);
  actual = { id, limpiar: typeof limpiar === 'function' ? limpiar : null };
  document.dispatchEvent(new CustomEvent('pantalla-cambiada', { detail: { id } }));
}

export function iniciarRouter(nodo) {
  contenedor = nodo;
  addEventListener('hashchange', pintar);
  pintar();
}

export const refrescar = pintar;
export { puede, usuarioActual };
