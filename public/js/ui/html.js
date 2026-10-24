// html.js — ayudas mínimas para armar pantallas sin framework.

/** Escapa texto que venga de datos: nombres de productos, notas, etc. */
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** el('div.tarjeta', { onclick }, 'texto' | nodos) */
export function el(selector, props = {}, hijos = []) {
  const [etiqueta, ...clases] = selector.split('.');
  const nodo = document.createElement(etiqueta || 'div');
  if (clases.length) nodo.className = clases.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k === 'html') nodo.innerHTML = v;
    else if (k === 'texto') nodo.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) nodo.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) {
    if (h) nodo.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return nodo;
}

/** Agrega hijos ignorando los nulos.
 *  `nodo.append(null)` escribe literalmente "null" en la pantalla, y eso ya se
 *  nos coló una vez en el recibo. Con esto no vuelve a pasar. */
export function pegar(nodo, ...hijos) {
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) nodo.append(h);
  return nodo;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// El "atrás" del teléfono (el botón o el gesto desde el borde) tiene que cerrar
// el cuadro que está encima, no sacar al dueño de la pantalla. Cada cuadro que
// se abre deja una entrada en el historial; al volver atrás la consumimos y lo
// cerramos, igual que si hubiera tocado Cancelar.
const cuadrosAbiertos = [];

globalThis.addEventListener?.('popstate', () => {
  const d = cuadrosAbiertos[cuadrosAbiertos.length - 1];
  if (!d) return;
  d.dataset.cerradoAtras = '1';
  d.close();
});

/** Abre un <dialog> con contenido y devuelve el nodo (se borra al cerrar). */
export function abrirDialogo(contenidoHTML, { alAbrir } = {}) {
  const d = el('dialog', { html: contenidoHTML });
  d.addEventListener('close', () => { d.remove(); olvidarCuadro(d); });
  document.body.appendChild(d);
  d.showModal();
  recordarCuadro(d);
  alAbrir?.(d);
  return d;
}

export function recordarCuadro(d) {
  cuadrosAbiertos.push(d);
  // Mientras hay un cuadro abierto, lo de atrás no se mueve: el dedo en el
  // teléfono arrastraba la pantalla de abajo y quedaba todo descolocado.
  document.documentElement.classList.add('con-cuadro');
  history.pushState({ cuadro: cuadrosAbiertos.length }, '');
}

export function olvidarCuadro(d) {
  const i = cuadrosAbiertos.lastIndexOf(d);
  if (i >= 0) cuadrosAbiertos.splice(i, 1);
  if (!cuadrosAbiertos.length) document.documentElement.classList.remove('con-cuadro');
  // Si se cerró con un botón, devolvemos la entrada que habíamos metido; si no,
  // el "atrás" siguiente no haría nada y habría que darle dos veces.
  if (d.dataset.cerradoAtras) delete d.dataset.cerradoAtras;
  else history.back();
}

/** Fecha corta legible: "7 oct, 2:15 pm" */
export function fecha(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null;
  if (!d) return '—';
  return d.toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export const diaISO = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return diaISO(d);
}

export const primerDiaDelMes = () => diaISO().slice(0, 8) + '01';
