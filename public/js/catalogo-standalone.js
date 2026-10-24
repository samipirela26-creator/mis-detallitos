// catalogo-standalone.js — Módulo 100% independiente para clientes.
// No contiene código de inicio de sesión, ni panel de ventas, ni datos administrativos.

import { db, col, ref } from './core/firebase.js';
import { onSnapshot, query, where, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { el, esc, $, abrirDialogo, pegar } from './ui/html.js';
import { avisarOk } from './ui/avisos.js';
import { MONEDAS, desdeUSD, formatear } from './core/dinero.js';
import { normalizar } from './core/texto.js';

let productos = [];
let tasas = {};
let whatsappNumero = '';
let borradorPedido = [];
let catElegida = '';
const fotos = new Map();   // productoId -> dataURL (se piden una sola vez)

const contenedor = $('#contenido');

/* ---- Iconos (trazo, heredan el color del texto) ------------------------ */

const ICONO_FOTO = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 4.5-4.5 4 4L15 12l6 5.5"/><circle cx="9" cy="9" r="1.4"/></svg>';
const ICONO_FLECHA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="m12 5 7 7-7 7"/></svg>';
const ICONO_PAPELERA = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>';

/* ---- Arranque ---------------------------------------------------------- */

function iniciar() {
  contenedor.innerHTML = `
    <nav class="cat-lateral" aria-label="Categorías">
      <h2>Categorías</h2>
      <ul id="cats-lateral"></ul>
    </nav>
    <div class="cat-columna">
      <div id="cats-cat" class="chips-barra cat-categorias"></div>
      <div class="cat-encabezado-lista">
        <h2 id="titulo-lista">Todo el catálogo</h2>
        <span class="conteo" id="conteo-lista"></span>
      </div>
      <div id="grid-cat"><div class="cargando">Cargando productos…</div></div>
    </div>
    <div id="barra-pedido-flotante"></div>`;

  $('#q-cat').oninput = () => pintarProductos();
  $('#btn-pedido-cabecera').onclick = abrirModalPedido;

  pintarBarraFlotante();
  escucharProductos();
  escucharTasas();
  obtenerWhatsApp();
}

function escucharProductos() {
  const q = query(col('productos_venta'), where('activo', '==', true));
  onSnapshot(q, (snap) => {
    productos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      // Un precio en 0 es un dato que falta, no una oferta: no se le enseña al
      // cliente. Los de precio variable se acuerdan por WhatsApp, esos sí pasan.
      .filter((p) => p.precioUSD > 0 || p.tipoPrecio === 'variable');
    pintarCategorias();
    pintarProductos();
  }, (e) => console.warn('[catalogo] error:', e));
}

/**
 * Tasa del día, y si hoy todavía no se cargó, la última que exista.
 *
 * Antes se pedía solo `tasas/<hoy>`: cualquier día sin tasa cargada dejaba al
 * cliente sin ver bolívares ni pesos. Mejor una tasa de ayer que ninguna; el
 * monto final igual se confirma por WhatsApp.
 */
async function escucharTasas() {
  // Se piden los últimos días uno por uno, por su nombre de documento, en vez
  // de ordenar la colección: un `orderBy('__name__','desc')` exige un índice
  // compuesto que nadie creó, y la consulta reventaba siempre. El catálogo
  // quedó sin bolívares desde que se publicó, sin que se notara: el error solo
  // salía en la consola del navegador.
  //
  // Diez getDoc valen menos que un índice que mantener: casi siempre acierta
  // en el primero (la tasa de hoy), y ya estaban todos en caché.
  const dia = new Date();
  for (let i = 0; i < 10; i++) {
    const clave = new Date(dia.getTime() - i * 86400000).toISOString().slice(0, 10);
    try {
      const snap = await getDoc(ref('tasas', clave));
      if (snap.exists()) {
        tasas = snap.data() || {};
        pintarProductos();
        return;
      }
    } catch (e) {
      console.warn('[tasas] error:', e);
      return;
    }
  }
  console.warn('[tasas] no hay tasa de los últimos 10 días');
}

function obtenerWhatsApp() {
  getDoc(ref('config', 'whatsapp')).then((snap) => {
    if (snap.exists()) {
      whatsappNumero = (snap.data()?.numero || '').replace(/[^\d]/g, '');
      const enlace = $('#pie-whatsapp');
      if (enlace && whatsappNumero) enlace.href = `https://wa.me/${whatsappNumero}`;
    }
  }).catch((e) => console.warn('[whatsapp] error:', e));
}

/* ---- Fotos ------------------------------------------------------------- */

/** Pide la foto una sola vez por producto y la coloca cuando llega. */
function ponerFoto(caja, producto) {
  if (!producto.tieneFoto) return;

  const pintar = (datos) => {
    if (!datos) return;
    caja.innerHTML = '';
    caja.appendChild(el('img', { src: datos, alt: esc(producto.nombre) }));
  };

  if (fotos.has(producto.id)) {
    pintar(fotos.get(producto.id));
    return;
  }

  getDoc(ref('fotos', producto.id)).then((snap) => {
    const datos = snap.exists() ? snap.data()?.datos : null;
    fotos.set(producto.id, datos || null);
    pintar(datos);
  }).catch(() => fotos.set(producto.id, null));
}

function cajaFoto(producto, clase = 'foto') {
  const caja = el(`div.${clase}`, {}, [
    el('span.sin-foto', { html: ICONO_FOTO }),
  ]);
  ponerFoto(caja, producto);
  return caja;
}

/* ---- Categorías -------------------------------------------------------- */

function obtenerCategorias() {
  return [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function cuantosEn(cat) {
  return cat ? productos.filter((p) => (p.categoria || '') === cat).length : productos.length;
}

function elegirCategoria(cat) {
  catElegida = cat;
  pintarCategorias();
  pintarProductos();
}

function pintarCategorias() {
  const chipsCaja = $('#cats-cat', contenedor);
  const listaCaja = $('#cats-lateral', contenedor);
  if (!chipsCaja || !listaCaja) return;

  const cats = ['', ...obtenerCategorias()];
  chipsCaja.innerHTML = '';
  listaCaja.innerHTML = '';

  for (const cat of cats) {
    const nombre = cat || 'Todas';
    const activa = catElegida === cat ? 'true' : 'false';

    chipsCaja.appendChild(el('button.chip', {
      type: 'button',
      'aria-pressed': activa,
      texto: nombre,
      onclick: () => elegirCategoria(cat),
    }));

    listaCaja.appendChild(el('li', {}, [
      el('button', {
        type: 'button',
        'aria-pressed': activa,
        onclick: () => elegirCategoria(cat),
      }, [
        el('span', { texto: nombre }),
        el('span.cuantos', { texto: String(cuantosEn(cat)) }),
      ]),
    ]));
  }
}

/* ---- Rejilla de productos --------------------------------------------- */

/** Los equivalentes de un producto.
 *
 *  En pesos se muestra el precio GUARDADO, no el convertido: ese es el número
 *  que está escrito en la etiqueta del estante. Reconvertirlo desde los dólares
 *  lo corría unos pesos (un centavo de dólar son ~32 pesos, y en un producto de
 *  1.000 eso ya se nota), y el cliente ve una cifra distinta a la del anaquel. */
function equivalentes(producto) {
  const precioUSD = producto.precioUSD;
  return Object.keys(MONEDAS)
    .filter((m) => m !== 'USD' && tasas[m])
    .map((m) => (m === 'COP' && producto.precioCOP > 0)
      ? formatear(producto.precioCOP, 'COP')
      : formatear(desdeUSD(precioUSD, m, tasas[m]), m))
    .join(' · ');
}

function enPedido(productoId) {
  const item = borradorPedido.find((x) => x.productoId === productoId);
  return item ? item.cantidad : 0;
}

function agregar(producto) {
  const item = borradorPedido.find((x) => x.productoId === producto.id);
  if (item) {
    item.cantidad += 1;
  } else {
    borradorPedido.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad: 1,
      precioUSD: producto.precioUSD,
      unidad: producto.unidad || 'unidad',
    });
  }
  pintarProductos();
  pintarBarraFlotante();
}

function pintarProductos() {
  const gridCaja = $('#grid-cat', contenedor);
  if (!gridCaja) return;

  const q = normalizar($('#q-cat')?.value || '');
  let lista = productos;

  if (q) {
    lista = lista.filter((p) =>
      normalizar(p.nombre).includes(q) ||
      normalizar(p.categoria).includes(q) ||
      (p.aliasNorm || []).some((a) => a.includes(q))
    );
  }

  if (catElegida) {
    lista = lista.filter((p) => (p.categoria || '').toLowerCase() === catElegida.toLowerCase());
  }

  $('#titulo-lista', contenedor).textContent = catElegida || 'Todo el catálogo';
  $('#conteo-lista', contenedor).textContent =
    lista.length ? `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}` : '';

  gridCaja.innerHTML = '';
  if (!lista.length) {
    gridCaja.appendChild(el('div.vacio', {}, [
      el('p', { texto: productos.length ? 'No hay productos con este filtro.' : 'Todavía no hay productos publicados.' }),
    ]));
    return;
  }

  const rejilla = el('div.cat-rejilla');
  for (const p of lista) {
    const cant = enPedido(p.id);
    const eq = equivalentes(p);

    rejilla.appendChild(el('article.cat-producto', {}, [
      el('button.foto-boton', {
        type: 'button',
        'aria-label': `Ver ${esc(p.nombre)}`,
        onclick: () => abrirDetalle(p),
      }, [cajaFoto(p)]),

      el('div.datos', {}, [
        el('div', {}, [
          el('h3', { texto: p.nombre }),
          el('p.unidad', { texto: `${p.categoria || 'Papelería'} · ${p.unidad || 'unidad'}` }),
        ]),
        el('div', {}, [
          el('div.precio', { texto: formatear(p.precioUSD) }),
          eq ? el('div.equivalente', { texto: eq }) : null,
        ]),
        el('div.acciones', {}, [
          cant > 0
            ? el('div.cat-cantidad', {}, [
                el('button', {
                  type: 'button', 'aria-label': `Quitar una unidad de ${esc(p.nombre)}`, texto: '−',
                  onclick: () => cambiarCantidad(p.id, -1),
                }),
                el('span.valor', { texto: String(cant) }),
                el('button', {
                  type: 'button', 'aria-label': `Agregar una unidad de ${esc(p.nombre)}`, texto: '+',
                  onclick: () => cambiarCantidad(p.id, 1),
                }),
              ])
            : el('button.btn.acento.ancho', {
                type: 'button', texto: 'Agregar',
                onclick: () => agregar(p),
              }),
        ]),
      ]),
    ]));
  }
  gridCaja.appendChild(rejilla);
}

function cambiarCantidad(productoId, delta) {
  const idx = borradorPedido.findIndex((item) => item.productoId === productoId);
  if (idx === -1) return;
  borradorPedido[idx].cantidad += delta;
  if (borradorPedido[idx].cantidad <= 0) {
    borradorPedido.splice(idx, 1);
  }
  pintarProductos();
  pintarBarraFlotante();
}

/* ---- Detalle del producto --------------------------------------------- */

function abrirDetalle(producto) {
  const d = abrirDialogo('');
  d.className = 'cat-hoja';

  const eqRenglones = Object.keys(MONEDAS)
    .filter((m) => m !== 'USD' && tasas[m])
    .map((m) => el('div.renglon', {}, [
      el('span', { texto: `En ${MONEDAS[m].nombre.toLowerCase()}` }),
      el('span', { texto: (m === 'COP' && producto.precioCOP > 0)
        ? formatear(producto.precioCOP, 'COP')
        : formatear(desdeUSD(producto.precioUSD, m, tasas[m]), m) }),
    ]));

  pegar(d,
    cajaFoto(producto, 'foto-grande'),
    el('span.etiqueta.info', { texto: producto.categoria || 'Papelería' }),
    el('h2', { texto: producto.nombre }),
    producto.descripcion ? el('p', { style: 'margin:.35rem 0 0;color:var(--texto-suave);line-height:1.5', texto: producto.descripcion }) : null,

    el('div.bloque-precio', {}, [
      el('div', { style: 'display:flex;align-items:baseline;gap:.5rem' }, [
        el('span.grande', { texto: formatear(producto.precioUSD) }),
        el('span', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: `por ${producto.unidad || 'unidad'}` }),
      ]),
      ...eqRenglones,
      eqRenglones.length ? el('p.nota-tasa', { texto: 'Tasa del día. El monto final se confirma por WhatsApp.' }) : null,
    ]),

    el('button.btn.acento.grande.ancho', {
      type: 'button',
      texto: enPedido(producto.id) ? 'Agregar otra al pedido' : 'Agregar al pedido',
      onclick: () => { agregar(producto); avisarOk('Agregado a tu pedido'); d.close(); },
    }),
    el('button.btn.plano.ancho', {
      type: 'button', style: 'margin-top:.5rem', texto: 'Seguir viendo productos',
      onclick: () => d.close(),
    })
  );
}

/* ---- Barra de pedido fija --------------------------------------------- */

function totalPedidoUSD() {
  return borradorPedido.reduce((acc, item) => acc + item.precioUSD * item.cantidad, 0);
}

function unidadesPedido() {
  return borradorPedido.reduce((acc, item) => acc + item.cantidad, 0);
}

function pintarBarraFlotante() {
  const barraCaja = $('#barra-pedido-flotante', contenedor);
  const btnCabecera = $('#btn-pedido-cabecera');
  const contador = $('#contador-pedido');
  if (!barraCaja) return;

  const totalCant = unidadesPedido();
  if (btnCabecera) btnCabecera.hidden = totalCant === 0;
  if (contador) contador.textContent = String(totalCant);

  barraCaja.innerHTML = '';
  if (!totalCant) return;

  barraCaja.appendChild(el('button.cat-barra-pedido', {
    type: 'button',
    onclick: abrirModalPedido,
  }, [
    el('span.resumen', {}, [
      el('span.cuantos', { style: 'display:block', texto: `${totalCant} ${totalCant === 1 ? 'producto' : 'productos'} en tu pedido` }),
      el('span.total', { style: 'display:block', texto: formatear(totalPedidoUSD()) }),
    ]),
    el('span.llamada', {}, [
      el('span', { texto: 'Ver pedido' }),
      el('span', { html: ICONO_FLECHA, style: 'display:flex' }),
    ]),
  ]));
}

/* ---- Hoja del pedido --------------------------------------------------- */

function abrirModalPedido() {
  if (!borradorPedido.length) return;
  const d = abrirDialogo('');
  d.className = 'cat-hoja';

  const inputNombre = el('input', { id: 'cat-nombre', type: 'text', placeholder: 'Para identificar tu pedido' });
  const inputNota = el('textarea', { id: 'cat-nota', placeholder: 'Nota o dirección de entrega (opcional)', style: 'min-height:62px' });

  const listaEl = el('div', { style: 'max-height:38vh;overflow:auto;margin-top:.75rem' });
  const totalEl = el('div.cat-total');

  const pintarContenido = () => {
    listaEl.innerHTML = '';
    for (const item of borradorPedido) {
      const producto = productos.find((p) => p.id === item.productoId);
      listaEl.appendChild(el('div.cat-renglon', {}, [
        producto ? cajaFoto(producto, 'mini') : el('div.mini', { html: ICONO_FOTO }),
        el('div.texto', {}, [
          el('div.nom', { texto: item.nombre }),
          el('div.det', { texto: `${item.cantidad} × ${item.unidad} · ${formatear(item.precioUSD)} c/u` }),
        ]),
        el('span.monto', { texto: formatear(item.precioUSD * item.cantidad) }),
        el('button.quitar', {
          type: 'button', 'aria-label': `Quitar ${esc(item.nombre)} del pedido`, html: ICONO_PAPELERA,
          onclick: () => {
            borradorPedido = borradorPedido.filter((x) => x.productoId !== item.productoId);
            pintarProductos();
            pintarBarraFlotante();
            if (!borradorPedido.length) d.close();
            else pintarContenido();
          },
        }),
      ]));
    }

    const totalUSD = totalPedidoUSD();
    const otras = Object.keys(MONEDAS)
      .filter((m) => m !== 'USD' && tasas[m])
      .map((m) => formatear(desdeUSD(totalUSD, m, tasas[m]), m))
      .join(' · ');

    totalEl.innerHTML = '';
    pegar(totalEl,
      el('span.rotulo', { texto: 'Total estimado' }),
      el('div.cifras', {}, [
        el('div.usd', { texto: formatear(totalUSD) }),
        otras ? el('div.otras', { texto: otras }) : null,
      ])
    );
  };

  pintarContenido();

  const enviar = el('button.btn.exito.grande.ancho', {
    type: 'button',
    style: 'margin-top:.9rem',
    texto: 'Enviar pedido por WhatsApp',
    onclick: () => {
      const nombreCliente = inputNombre.value.trim() || 'Cliente';
      const notaCliente = inputNota.value.trim();
      const totalUSD = totalPedidoUSD();

      let texto = `*Nuevo Pedido - Mis Detallitos*\n`;
      texto += `👤 *Cliente*: ${nombreCliente}\n`;
      if (notaCliente) texto += `📝 *Nota*: ${notaCliente}\n`;
      texto += `\n*Detalle del pedido*:\n`;

      for (const item of borradorPedido) {
        const subtotal = item.precioUSD * item.cantidad;
        texto += `• ${item.cantidad}x ${item.nombre} (${formatear(item.precioUSD)} c/u) = ${formatear(subtotal)}\n`;
      }

      texto += `\n💰 *TOTAL*: ${formatear(totalUSD)}`;
      for (const m of Object.keys(MONEDAS)) {
        if (m !== 'USD' && tasas[m]) texto += ` (aprox. ${formatear(desdeUSD(totalUSD, m, tasas[m]), m)})`;
      }

      texto += `\n\n¡Quedo a la espera de su confirmación!`;

      const linkWa = whatsappNumero
        ? `https://wa.me/${whatsappNumero}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/?text=${encodeURIComponent(texto)}`;

      window.open(linkWa, '_blank');
      avisarOk('Pedido listo para enviar por WhatsApp');
      d.close();
    },
  });

  pegar(d,
    el('h2', { texto: 'Tu pedido' }),
    el('p', { style: 'margin:.1rem 0 0;font-size:var(--t-pie);color:var(--texto-suave)', texto: `${unidadesPedido()} ${unidadesPedido() === 1 ? 'producto' : 'productos'}` }),
    listaEl,
    totalEl,
    el('div', { style: 'margin-top:1rem;display:flex;flex-direction:column;gap:.35rem' }, [
      el('label', { for: 'cat-nombre', style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: 'Nombre y apellido' }),
      inputNombre,
      el('label', { for: 'cat-nota', style: 'font-size:var(--t-pie);color:var(--texto-suave);margin-top:.4rem', texto: 'Nota para el pedido' }),
      inputNota,
    ]),
    enviar,
    el('p', { style: 'margin:.5rem 0 0;text-align:center;font-size:var(--t-pie);color:var(--texto-suave)', texto: 'Confirmamos disponibilidad y el monto final antes de cobrar.' }),
    el('button.btn.plano.ancho', { type: 'button', style: 'margin-top:.6rem', texto: 'Seguir viendo productos', onclick: () => d.close() })
  );
}

iniciar();
