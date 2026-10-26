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
  pantallas.set(id, { id, menu: false, soloDueno: false, soloEmpleado: false, seccion: '', orden: 99, ...def });
}

/** Si el que entró puede abrirla. */
const alcanza = (p) => (!p.soloDueno || esDueno()) && (!p.soloEmpleado || !esDueno());

/** Las ACCIONES de la barra de abajo: lo que se toca a cada rato.
 *  Son tres o cuatro a propósito. Lo demás no se esconde: vive en la hoja de
 *  Todo (`pantallasDeTodo`), que sí tiene sitio para las doce. */
export const pantallasDeMenu = () =>
  [...pantallas.values()]
    .filter((p) => p.menu && alcanza(p))
    .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));

/**
 * TODAS las pantallas que el que entró puede abrir, agrupadas por sección.
 *
 * Esto es lo que arregla el problema de fondo: antes una pantalla sin
 * `menu: true` no tenía botón en ninguna parte y solo se llegaba si alguien se
 * acordaba de que existía (Mi dinero, Caja, Deudores y Gastos solo se abrían
 * desde los atajos del Panel; Mis ventas, desde dentro de Mi caja). Aquí sale
 * el registro completo, así que una pantalla nueva aparece por el solo hecho
 * de registrarse con su `seccion`.
 */
export function pantallasDeTodo() {
  const grupos = new Map();
  for (const p of [...pantallas.values()].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))) {
    if (!p.seccion || !p.titulo || !alcanza(p)) continue;
    if (!grupos.has(p.seccion)) grupos.set(p.seccion, []);
    grupos.get(p.seccion).push(p);
  }
  return [...grupos.entries()].map(([seccion, items]) => ({ seccion, items }));
}

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
  const u = usuarioActual();
  if (!u) return 'entrar';
  return esDueno() ? 'panel' : 'vender';
}

async function pintar() {
  if (!contenedor) return;
  const { id, params } = parsear();
  const p = pantallas.get(id);
  const u = usuarioActual();

  if (!p) return ir(inicioSegunRol());
  if (!u && !p.publico) return;
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
