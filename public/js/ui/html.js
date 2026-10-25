// html.js — ayudas mínimas para armar pantallas sin framework.

/** Escapa texto que venga de datos: nombres de productos, notas, etc. */
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * el('div.tarjeta', { onclick }, 'texto' | nodos)
 *
 * El `#id` del selector se entiende también: `el('input#buscar', …)`.
 *
 * Y es MÁS QUE UNA COMODIDAD. Antes solo se partía por el punto, así que
 * `'input#buscar'` entraba entero a `createElement` y el navegador —sin
 * quejarse ni lanzar error— devolvía un elemento llamado `<input#buscar>`: no
 * es un `<input>`, no se puede escribir en él, no tiene id y no se ve en la
 * pantalla. El buscador de Deudores llevaba así desde que se escribió: con más
 * de seis clientes el campo simplemente no aparecía y nadie sabía por qué.
 */
export function el(selector, props = {}, hijos = []) {
  const [cabeza, ...clases] = selector.split('.');
  const [etiqueta, id] = cabeza.split('#');
  const nodo = document.createElement(etiqueta || 'div');
  if (id) nodo.id = id;
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
//
// LA REGLA, de la que sale todo lo demás: el historial tiene UNA entrada por
// cada cuadro abierto. Nada más y nada menos.
const cuadrosAbiertos = [];

// Entradas que ya no tienen cuadro y hay que devolver. No se devuelven en el
// acto a propósito: ver `programarAjuste`.
let porDevolver = 0;
let ajusteAgendado = false;

// El "atrás" cierra los cuadros que quedaron POR ENCIMA de la profundidad que
// dice la entrada donde cayó el historial, no "el último que se abrió".
globalThis.addEventListener?.('popstate', () => {
  const profundidad = globalThis.history?.state?.cuadro || 0;
  // Sobre una copia: cerrar cada uno lo saca de `cuadrosAbiertos`.
  for (const d of cuadrosAbiertos.slice(profundidad)) {
    d.dataset.cerradoAtras = '1';
    d.close();
  }
});

/**
 * Devolver la entrada se deja para el final del turno, y si en ese turno se
 * abre otro cuadro, el nuevo SE QUEDA con la entrada del que se cerró en vez de
 * pedir otra.
 *
 * Esto es lo que arregla los botones que cierran un cuadro y abren otro —Editar,
 * Cobrarle, Abonar otra cantidad, Precio en el carrito—, que no hacían NADA.
 * Devolviéndola en el acto, `history.back()` no vuelve enseguida y, peor, se
 * queda apuntando a la entrada que había CUANDO SE PIDIÓ: el cuadro nuevo mete
 * la suya un instante después, el back cae por debajo de ella, y el "atrás" ve
 * un cuadro abierto que según el historial no debería estar y lo cierra. En la
 * pantalla era un parpadeo y nada más.
 *
 * Cancelándolo cuando hay relevo no hay nada que pedir ni nada que esperar: se
 * cerró uno, se abrió uno, y la cuenta ya estaba bien.
 */
function programarAjuste() {
  if (ajusteAgendado) return;
  ajusteAgendado = true;
  queueMicrotask(() => {
    ajusteAgendado = false;
    if (porDevolver <= 0) return;
    const cuantas = porDevolver;
    porDevolver = 0;
    history.go(-cuantas);
  });
}

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
  // La cuenta se actualiza AQUÍ Y AHORA, no cuando el navegador avise: `close()`
  // cierra en el acto pero deja el aviso de 'close' para después, y en ese rato
  // un botón ya abrió el cuadro siguiente. Si la cuenta esperara el aviso,
  // estaría mintiendo justo cuando se la consulta. Por eso el `close()` de este
  // cuadro pasa primero por nosotros. El oyente de 'close' se queda igual, para
  // los cierres que no pasan por ahí —la tecla Escape—, y de ahí que
  // `olvidarCuadro` aguante que lo llamen dos veces.
  if (!d.dataset.cuentaPropia) {
    d.dataset.cuentaPropia = '1';
    const cerrarDeVerdad = d.close.bind(d);
    d.close = (valor) => { olvidarCuadro(d); cerrarDeVerdad(valor); };
  }
  // Mientras hay un cuadro abierto, lo de atrás no se mueve: el dedo en el
  // teléfono arrastraba la pantalla de abajo y quedaba todo descolocado.
  document.documentElement.classList.add('con-cuadro');
  if (porDevolver > 0) {
    // Hay una entrada libre del cuadro que se acaba de cerrar: se reaprovecha.
    porDevolver -= 1;
    history.replaceState({ cuadro: cuadrosAbiertos.length }, '');
  } else {
    history.pushState({ cuadro: cuadrosAbiertos.length }, '');
  }
}

export function olvidarCuadro(d) {
  const i = cuadrosAbiertos.lastIndexOf(d);
  if (i < 0) return;                 // ya estaba olvidado: no se cuenta dos veces
  cuadrosAbiertos.splice(i, 1);
  if (!cuadrosAbiertos.length) document.documentElement.classList.remove('con-cuadro');
  // Si se cerró con el "atrás", la entrada ya la consumió el navegador. Si se
  // cerró con un botón, sobra una y hay que devolverla, o el "atrás" siguiente
  // no haría nada y habría que darle dos veces.
  if (d.dataset.cerradoAtras) delete d.dataset.cerradoAtras;
  else { porDevolver += 1; programarAjuste(); }
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
