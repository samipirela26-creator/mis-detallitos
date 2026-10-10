// catalogo-publico.js — Catálogo Digital para clientes y pedidos por WhatsApp.
//
// Los clientes pueden explorar productos, filtrar por categoría, ver precios en USD/Bs/COP,
// armar un borrador de su pedido y enviarlo por WhatsApp a la tienda en 1 clic.

import { registrar } from '../core/router.js';
import { el, esc, $, abrirDialogo, pegar } from '../ui/html.js';
import { avisar, avisarOk } from '../ui/avisos.js';
import { productos as catalogo, categorias } from '../data/catalogo.js';
import { pintarFoto } from '../data/fotos.js';
import { buscar } from '../data/busqueda.js';
import { MONEDAS, desdeUSD, formatear, aMayores } from '../core/dinero.js';
import { leer } from '../core/estado.js';

let borradorPedido = [];   // [{ productoId, nombre, cantidad, precioUSD, unidad, fotoPendiente, tieneFoto }]

registrar('catalogo', {
  titulo: 'Catálogo Digital', icono: '🛍️',
  montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta" style="margin-bottom:1rem;background:var(--marca);color:var(--sobre-marca-fuerte);border-radius:var(--r-bloque)">
        <h1 style="font-size:2rem;margin-bottom:.25rem;color:var(--sobre-marca-fuerte)">Mis Detallitos G&M C.A.</h1>
        <p style="color:var(--sobre-marca);margin:0;font-weight:500">Catálogo Digital de Productos · Haz tu pedido por WhatsApp</p>
      </div>

      <div class="fila" style="margin-bottom:.75rem">
        <input id="q-cat" type="search" placeholder="🔎 Buscar producto en el catálogo…" style="flex:3">
      </div>
      <div id="cats-cat" class="chips-barra" style="margin-bottom:1rem"></div>

      <div id="grid-cat"></div>
      <div id="barra-pedido-flotante"></div>`;

    const qInput = $('#q-cat', nodo);
    const catsCaja = $('#cats-cat', nodo);
    const gridCaja = $('#grid-cat', nodo);
    const barraCaja = $('#barra-pedido-flotante', nodo);

    let catElegida = '';

    // Filtros por categoría
    const pintarCategorias = () => {
      const listaCats = categorias();
      catsCaja.innerHTML = '';
      const chipTodas = el('button.chip', {
        'aria-pressed': catElegida === '' ? 'true' : 'false',
        texto: 'Todas',
        onclick: () => { catElegida = ''; pintarCategorias(); pintarProductos(); },
      });
      catsCaja.appendChild(chipTodas);

      for (const cat of listaCats) {
        catsCaja.appendChild(el('button.chip', {
          'aria-pressed': catElegida === cat ? 'true' : 'false',
          texto: cat,
          onclick: () => { catElegida = cat; pintarCategorias(); pintarProductos(); },
        }));
      }
    };

    const pintarProductos = () => {
      const q = qInput.value.trim();
      let lista = catalogo().filter((p) => p.activo !== false);
      const tasas = leer('tasas') || {};

      if (q) lista = buscar(q, lista, { limite: 200 });
      if (catElegida) lista = lista.filter((p) => (p.categoria || '').toLowerCase() === catElegida.toLowerCase());

      gridCaja.innerHTML = '';
      if (!lista.length) {
        gridCaja.appendChild(el('div.vacio', {}, [
          el('p', { texto: 'No hay productos disponibles con este filtro.' }),
        ]));
        return;
      }

      const rejilla = el('div.rejilla.dos');
      for (const p of lista) {
        const enPedido = borradorPedido.find((item) => item.productoId === p.id);
        const cantEnPedido = enPedido ? enPedido.cantidad : 0;

        const img = el('img.miniatura', {
          alt: '',
          style: 'width:64px;height:64px;border-radius:var(--r-chico);object-fit:cover;flex:0 0 auto',
          src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        });
        if (p.tieneFoto) pintarFoto(img, p.id);

        const conversionesBsCop = Object.keys(MONEDAS)
          .filter((m) => m !== 'USD' && tasas[m])
          .map((m) => formatear(desdeUSD(p.precioUSD, m, tasas[m]), m))
          .join('   ·   ');

        const tarjeta = el('div.tarjeta', {
          style: 'display:flex;flex-direction:column;justify-space-between;gap:.6rem;padding:.9rem',
        }, [
          el('div', { style: 'display:flex;gap:.75rem;align-items:flex-start' }, [
            img,
            el('div', { style: 'flex:1;min-width:0' }, [
              el('div', { style: 'font-weight:700;font-size:.95rem', html: esc(p.nombre) }),
              el('div', { style: 'font-size:.78rem;color:var(--texto-suave);margin-top:.15rem' }, [
                el('span', { texto: p.categoria || 'Papelería' }),
                el('span', { texto: ` · ${p.unidad || 'unidad'}` }),
              ]),
              el('div', { style: 'margin-top:.4rem;display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem' }, [
                el('span.cifra', { style: 'font-weight:700;font-size:1.2rem;color:var(--texto)', texto: formatear(p.precioUSD) }),
                conversionesBsCop ? el('span', { style: 'font-size:.78rem;color:var(--texto-suave)', texto: conversionesBsCop }) : null,
              ]),
            ]),
          ]),
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:.25rem' }, [
            cantEnPedido > 0
              ? el('div.fila', { style: 'align-items:center;gap:.4rem' }, [
                  el('button.btn.plano', {
                    style: 'min-height:36px;padding:0 .75rem', texto: '−',
                    onclick: () => cambiarCantidadItem(p.id, -1, pintarProductos, pintarBarraFlotante),
                  }),
                  el('span', { style: 'font-weight:700;font-size:1rem', texto: String(cantEnPedido) }),
                  el('button.btn.plano', {
                    style: 'min-height:36px;padding:0 .75rem', texto: '+',
                    onclick: () => cambiarCantidadItem(p.id, 1, pintarProductos, pintarBarraFlotante),
                  }),
                ])
              : el('button.btn.principal.ancho', {
                  style: 'min-height:38px;font-size:.85rem', texto: 'Agregar al Pedido',
                  onclick: () => {
                    borradorPedido.push({
                      productoId: p.id,
                      nombre: p.nombre,
                      cantidad: 1,
                      precioUSD: p.precioUSD,
                      unidad: p.unidad || 'unidad',
                    });
                    pintarProductos();
                    pintarBarraFlotante();
                  },
                }),
          ]),
        ]);
        rejilla.appendChild(tarjeta);
      }
      gridCaja.appendChild(rejilla);
    };

    const pintarBarraFlotante = () => {
      barraCaja.innerHTML = '';
      if (!borradorPedido.length) return;

      const totalUSD = borradorPedido.reduce((acc, item) => acc + item.precioUSD * item.cantidad, 0);
      const totalCant = borradorPedido.reduce((acc, item) => acc + item.cantidad, 0);

      const bar = el('div', {
        style: `
          position: fixed; z-index: 25;
          left: 50%; transform: translateX(-50%);
          bottom: calc(1rem + env(safe-area-inset-bottom));
          width: min(92vw, 440px);
          padding: .75rem 1.15rem;
          background: #1e6f4e; color: #ffffff;
          border-radius: var(--pildora);
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 12px 30px rgba(0,0,0,0.3);
          cursor: pointer;
        `,
        onclick: () => abrirModalPedido(pintarProductos, pintarBarraFlotante),
      }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:1.05rem', texto: `Mi Pedido (${totalCant})` }),
          el('div', { style: 'font-size:.8rem;opacity:.9', texto: `Total: ${formatear(totalUSD)}` }),
        ]),
        el('button.btn', {
          style: 'background:#ffffff;color:#1e6f4e;border:0;font-weight:700;padding:0 1rem;min-height:38px',
          texto: 'Ver Pedido 📲',
        }),
      ]);
      barraCaja.appendChild(bar);
    };

    qInput.oninput = pintarProductos;
    pintarCategorias();
    pintarProductos();
    pintarBarraFlotante();
  },
});

function cambiarCantidadItem(productoId, delta, cb1, cb2) {
  const idx = borradorPedido.findIndex((item) => item.productoId === productoId);
  if (idx === -1) return;
  borradorPedido[idx].cantidad += delta;
  if (borradorPedido[idx].cantidad <= 0) {
    borradorPedido.splice(idx, 1);
  }
  if (cb1) cb1();
  if (cb2) cb2();
}

function abrirModalPedido(cb1, cb2) {
  if (!borradorPedido.length) return;
  const d = abrirDialogo('');
  const tasas = leer('tasas') || {};
  const totalUSD = borradorPedido.reduce((acc, item) => acc + item.precioUSD * item.cantidad, 0);

  const totalBs = tasas['VES'] ? desdeUSD(totalUSD, 'VES', tasas['VES']) : null;
  const totalCop = tasas['COP'] ? desdeUSD(totalUSD, 'COP', tasas['COP']) : null;

  const inputNombre = el('input', { placeholder: 'Tu nombre completo (ej: María Pérez)', style: 'margin-bottom:.6rem' });
  const inputNota = el('textarea', { placeholder: 'Nota o dirección de entrega (opcional)', style: 'min-height:60px;margin-bottom:1rem' });

  const listaEl = el('div', { style: 'max-height:35vh;overflow:auto;margin:1rem 0;border-top:1px solid var(--borde)' });

  const pintarModalContenido = () => {
    listaEl.innerHTML = '';
    borradorPedido.forEach((item) => {
      listaEl.appendChild(el('div', {
        style: 'display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--borde)',
      }, [
        el('div', { style: 'flex:1;min-width:0;padding-right:.5rem' }, [
          el('div', { style: 'font-weight:600;font-size:.9rem', html: esc(item.nombre) }),
          el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', texto: `${formatear(item.precioUSD)} c/u` }),
        ]),
        el('div.fila', { style: 'align-items:center;gap:.4rem;flex:0 0 auto' }, [
          el('button.btn.plano', {
            style: 'min-height:32px;padding:0 .6rem', texto: '−',
            onclick: () => {
              cambiarCantidadItem(item.productoId, -1, cb1, cb2);
              if (!borradorPedido.length) d.close();
              else pintarModalContenido();
            },
          }),
          el('span', { style: 'font-weight:700', texto: String(item.cantidad) }),
          el('button.btn.plano', {
            style: 'min-height:32px;padding:0 .6rem', texto: '+',
            onclick: () => {
              cambiarCantidadItem(item.productoId, 1, cb1, cb2);
              pintarModalContenido();
            },
          }),
        ]),
      ]));
    });
  };

  pintarModalContenido();

  const botonEnviarWhatsApp = el('button.btn.exito.grande.ancho', {
    style: 'font-size:1rem;margin-top:.75rem',
    texto: 'Enviar Pedido por WhatsApp 💬',
    onclick: () => {
      const whatsappNumero = (leer('config_whatsapp') || '').replace(/[^\d]/g, '');
      const nombreCliente = inputNombre.value.trim() || 'Cliente';
      const notaCliente = inputNota.value.trim();

      let texto = `*Nuevo Pedido - Mis Detallitos*\n`;
      texto += `👤 *Cliente*: ${nombreCliente}\n`;
      if (notaCliente) texto += `📝 *Nota*: ${notaCliente}\n`;
      texto += `\n*Detalle del pedido*:\n`;

      for (const item of borradorPedido) {
        const subtotal = item.precioUSD * item.cantidad;
        texto += `• ${item.cantidad}x ${item.nombre} (${formatear(item.precioUSD)} c/u) = ${formatear(subtotal)}\n`;
      }

      texto += `\n💰 *TOTAL*: ${formatear(totalUSD)}`;
      if (totalBs) texto += ` (aprox. ${formatear(totalBs, 'VES')})`;
      if (totalCop) texto += ` (aprox. ${formatear(totalCop, 'COP')})`;

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
    el('h2', { texto: 'Resumen de tu Pedido' }),
    inputNombre,
    inputNota,
    listaEl,
    el('div', { style: 'text-align:right;font-weight:700;font-size:1.15rem;margin-top:.5rem' }, [
      el('span', { texto: `Total: ${formatear(totalUSD)}` }),
    ]),
    botonEnviarWhatsApp,
    el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Seguir viendo productos', onclick: () => d.close() })
  );
}
