// pos.js — VENDER. La pantalla que más se usa y la que no se puede trabar.
//
// Decisiones que vienen del mostrador real:
//  - El cursor arranca en el buscador y vuelve al buscador después de cada
//    producto: se vende escribiendo, sin tocar menús.
//  - Precio fijo entra solo; precio variable abre el teclado y pide el monto.
//  - Las escalas por cantidad recalculan el precio al cambiar la cantidad
//    (200 fotocopias salen más baratas sin que nadie tenga que acordarse).
//  - Si el precio queda por debajo del mínimo, la línea se marca y pide PIN.
//  - Se puede cobrar en dólares, pesos y bolívares, mezclados.

import { registrar, ir } from '../core/router.js';
import { el, esc, $, abrirDialogo, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { pedirMonto, pedirCantidad } from '../ui/teclado.js';
import { pedirAutorizacion } from '../ui/pin.js';
import { buscar, sinResultados } from '../data/busqueda.js';
import { recordarBusqueda, aprenderDe } from '../data/sinonimos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { pintarFoto } from '../data/fotos.js';
import { registrarVenta } from '../data/ventas.js';
import { listarClientes, guardarCliente } from '../data/clientes.js';
import { leer, escribir, observar } from '../core/estado.js';
import {
  MONEDAS, formatear, desdeUSD, crearPago, totalPagadoUSD, saldoPago,
  precioPorCantidad, totalesVenta, requiereAutorizacion, vueltoEnMonedas,
} from '../core/dinero.js';
import { recibo } from '../reports/recibo.js';

// --- carrito (vive en el estado, así sobrevive a cambiar de pantalla) -------
const carrito = () => leer('carrito') || [];
const ponerCarrito = (lineas) => escribir('carrito', lineas);

function agregar(producto, { cantidad = 1, precioUSD = null } = {}) {
  const lineas = [...carrito()];
  const i = lineas.findIndex((l) => l.productoId === producto.id && !l.precioEditado);
  if (i >= 0 && precioUSD === null) {
    lineas[i] = { ...lineas[i], cantidad: lineas[i].cantidad + cantidad };
    lineas[i].precioUSD = lineas[i].tipoPrecio === 'variable'
      ? lineas[i].precioUSD
      : precioPorCantidad(producto, lineas[i].cantidad);
  } else {
    const base = precioUSD ?? precioPorCantidad(producto, cantidad);
    lineas.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad,
      precioUSD: base,
      precioOriginalUSD: producto.precioUSD || base,
      costoUSD: producto.costoUSD || 0,
      tipoPrecio: producto.tipoPrecio,
      escalas: producto.escalas || [],
      unidad: producto.unidad,
      esServicio: producto.tipo === 'servicio',
      precioEditado: precioUSD !== null && precioUSD !== (producto.precioUSD || 0),
      autorizadoPor: null,
    });
  }
  ponerCarrito(lineas);
  aprenderDe(producto);
}

const quitar = (i) => ponerCarrito(carrito().filter((_, j) => j !== i));
const vaciar = () => ponerCarrito([]);

// --- pantalla ---------------------------------------------------------------
registrar('vender', {
  titulo: 'Vender', icono: '🧾', menu: true, orden: 30,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="buscador-pos">
        <input id="q" type="search" inputmode="search" autocomplete="off" enterkeyhint="search"
               placeholder="🔎 Busca el producto o pasa el código…">
      </div>
      <div id="resultados"></div>
      <div id="carrito"></div>`;

    const q = $('#q', nodo);
    const cajaResultados = $('#resultados', nodo);
    const cajaCarrito = $('#carrito', nodo);

    // --- buscar mientras escribe ---
    let temporizador;
    q.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => pintarResultados(q.value), 120);
    });
    q.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const r = buscar(q.value, catalogo());
        if (r.length) { elegir(r[0]); ev.preventDefault(); }
      }
      if (ev.key === 'Escape') { q.value = ''; pintarResultados(''); }
    });

    function pintarResultados(texto) {
      recordarBusqueda(texto);
      const r = buscar(texto, catalogo());
      cajaResultados.innerHTML = '';
      if (!texto.trim()) return;

      if (sinResultados(r)) {
        cajaResultados.appendChild(el('div.tarjeta', { style: 'margin-top:.75rem;text-align:center' }, [
          el('p', { texto: `No encontré nada con "${texto}".` }),
          el('p', {
            style: 'font-size:.9rem;color:var(--texto-suave)',
            texto: 'Prueba con otra palabra, o véndelo como producto suelto.',
          }),
          el('button.btn.acento', { texto: '✏️ Vender producto suelto', onclick: () => productoSuelto(texto) }),
        ]));
        return;
      }

      const lista = el('ul.resultados');
      for (const p of r) {
        const img = el('img.miniatura', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        if (p.tieneFoto) pintarFoto(img, p.id);
        const agotado = p.tipo !== 'servicio' && p.stock <= 0;
        lista.appendChild(el('li', { onclick: () => elegir(p) }, [
          img,
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(p.nombre) }),
            el('div', {
              style: 'font-size:.82rem;color:var(--texto-suave)',
              html: `${esc(p.categoria || 'Sin categoría')}${p.tipo === 'servicio' ? '' : ` · ${p.stock} ${esc(p.unidad || 'u')}`}`,
            }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div', { style: 'font-weight:700', texto: p.tipoPrecio === 'variable' ? 'Precio libre' : formatear(p.precioUSD) }),
            agotado ? el('span.etiqueta.mal', { texto: 'Sin stock' }) : null,
          ]),
        ]));
      }
      cajaResultados.appendChild(lista);
    }

    async function elegir(p) {
      if (p.tipo !== 'servicio' && p.stock <= 0) {
        const seguir = await confirmar('Ese producto está en cero', {
          detalle: 'El inventario dice que no queda ninguno. ¿Lo vendes igual? El stock quedará en negativo y se verá en el reporte.',
          aceptar: 'Venderlo igual', cancelar: 'No',
        });
        if (!seguir) return;
      }

      if (p.tipoPrecio === 'variable') {
        const monto = await pedirMonto({
          titulo: p.nombre,
          nota: p.precioUSD ? `Lo normal es ${formatear(p.precioUSD)}` : 'Escribe el precio acordado',
          inicial: p.precioUSD || 0,
          aceptar: 'Agregar',
        });
        if (monto === null) return;
        let autorizado = null;
        if (requiereAutorizacion(p, monto)) {
          autorizado = await pedirAutorizacion(`${p.nombre} a ${formatear(monto)} está por debajo del mínimo.`);
          if (!autorizado) return avisarMal('Sin autorización no se puede poner ese precio.');
        }
        agregar(p, { precioUSD: monto });
        const l = carrito();
        l[l.length - 1].autorizadoPor = autorizado;
        l[l.length - 1].precioEditado = monto !== p.precioUSD;
        ponerCarrito(l);
      } else {
        agregar(p);
      }
      q.value = '';
      cajaResultados.innerHTML = '';
      q.focus();
    }

    async function productoSuelto(nombreSugerido) {
      const monto = await pedirMonto({ titulo: nombreSugerido || 'Producto suelto', aceptar: 'Agregar' });
      if (!monto) return;
      const lineas = [...carrito(), {
        productoId: null, nombre: nombreSugerido || 'Producto suelto', cantidad: 1,
        precioUSD: monto, precioOriginalUSD: monto, costoUSD: 0,
        tipoPrecio: 'variable', escalas: [], esServicio: true, precioEditado: true,
        autorizadoPor: null,
      }];
      ponerCarrito(lineas);
      q.value = '';
      cajaResultados.innerHTML = '';
      q.focus();
    }

    // --- carrito ---
    function pintarCarrito() {
      const lineas = carrito();
      cajaCarrito.innerHTML = '';
      if (!lineas.length) {
        cajaCarrito.appendChild(el('div.vacio', {}, [
          el('div', { style: 'font-size:2.5rem', texto: '🧾' }),
          el('p', { texto: 'Busca un producto para empezar la venta.' }),
        ]));
        return;
      }

      const t = totalesVenta(lineas);
      const tasas = leer('tasas') || {};
      const tabla = el('div.tarjeta', { style: 'margin-top:1rem' });

      lineas.forEach((l, i) => {
        tabla.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--borde)',
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(l.nombre) }),
            el('div', { style: 'font-size:.82rem;color:var(--texto-suave)' }, [
              el('span', { texto: `${l.cantidad} × ${formatear(l.precioUSD)}` }),
              l.precioEditado ? el('span.etiqueta.alerta', { style: 'margin-left:.4rem', texto: 'precio cambiado' }) : null,
            ]),
          ]),
          el('div.cifra', { style: 'font-weight:700', texto: formatear(Math.round(l.cantidad * l.precioUSD)) }),
          el('button.btn.plano', {
            style: 'min-height:38px;padding:0 .7rem', texto: '✏️',
            onclick: () => editarLinea(i),
          }),
          el('button.btn.plano', {
            style: 'min-height:38px;padding:0 .7rem', texto: '🗑️',
            onclick: () => quitar(i),
          }),
        ]));
      });

      tabla.appendChild(el('div', { style: 'padding-top:.9rem' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, [
          el('span', { style: 'color:var(--texto-suave);font-weight:600', texto: 'TOTAL' }),
          el('span.cifra-gigante', { texto: formatear(t.totalUSD) }),
        ]),
        el('div', {
          style: 'color:var(--texto-suave);font-size:.95rem;text-align:right',
          texto: Object.keys(MONEDAS)
            .filter((m) => m !== 'USD' && tasas[m])
            .map((m) => formatear(desdeUSD(t.totalUSD, m, tasas[m]), m))
            .join('   ·   ') || 'Pon las tasas del día para ver bolívares y pesos',
        }),
      ]));

      cajaCarrito.appendChild(tabla);
      cajaCarrito.appendChild(el('div.fila', { style: 'margin-top:1rem' }, [
        el('button.btn.plano', { texto: 'Vaciar', onclick: async () => {
          if (await confirmar('¿Vaciar la venta?', { aceptar: 'Sí, vaciar', peligro: true })) vaciar();
        } }),
        el('button.btn.principal.grande', { style: 'flex:2', texto: `Cobrar ${formatear(t.totalUSD)}`, onclick: cobrar }),
      ]));
    }

    async function editarLinea(i) {
      const lineas = [...carrito()];
      const l = lineas[i];
      const d = abrirDialogo('');
      pegar(d, 
        el('h2', { html: esc(l.nombre) }),
        el('div.fila', { style: 'margin:1rem 0' }, [
          el('button.btn.plano', { texto: '🔢 Cantidad', onclick: async () => {
            d.close();
            const c = await pedirCantidad({ titulo: l.nombre, inicial: l.cantidad, unidad: l.unidad });
            if (c === null || c <= 0) return;
            l.cantidad = c;
            if (l.tipoPrecio !== 'variable' && !l.precioEditado) {
              // Escalas: 200 copias cuestan menos que 10, sin que nadie se acuerde.
              const nuevo = precioPorCantidad({ precioUSD: l.precioOriginalUSD, escalas: l.escalas }, c);
              if (nuevo !== l.precioUSD) {
                l.precioUSD = nuevo;
                avisar(`Precio por cantidad: ${formatear(nuevo)} c/u`);
              }
            }
            lineas[i] = l;
            ponerCarrito(lineas);
          } }),
          el('button.btn.plano', { texto: '💲 Precio', onclick: async () => {
            d.close();
            const p = await pedirMonto({ titulo: `Precio de ${l.nombre}`, inicial: l.precioUSD });
            if (p === null) return;
            const producto = catalogo().find((x) => x.id === l.productoId) || { costoUSD: l.costoUSD };
            if (requiereAutorizacion(producto, p)) {
              const quien = await pedirAutorizacion(`${l.nombre} a ${formatear(p)} está por debajo del mínimo.`);
              if (!quien) return avisarMal('Sin autorización no se puede poner ese precio.');
              l.autorizadoPor = quien;
            }
            l.precioUSD = p;
            l.precioEditado = p !== l.precioOriginalUSD;
            lineas[i] = l;
            ponerCarrito(lineas);
          } }),
        ]),
        el('button.btn.plano.ancho', { texto: 'Cerrar', onclick: () => d.close() })
      );
    }

    const dejarDeObservar = observar('carrito', pintarCarrito);
    q.focus();
    return dejarDeObservar;
  },
});

// --- cobrar ------------------------------------------------------------------
async function cobrar() {
  const lineas = carrito();
  if (!lineas.length) return;
  const t = totalesVenta(lineas);
  const tasas = leer('tasas') || {};
  let pagos = [];
  let clienteId = null;
  let fiado = false;

  const d = abrirDialogo('');
  const resumen = el('div');
  const botonesMoneda = el('div.fila', { style: 'margin:.75rem 0' });
  const listaPagos = el('div');
  const acciones = el('div.fila', { style: 'margin-top:1rem' });

  for (const codigo of Object.keys(MONEDAS)) {
    if (codigo !== 'USD' && !tasas[codigo]) continue;
    botonesMoneda.appendChild(el('button.btn.plano', {
      texto: `${MONEDAS[codigo].simbolo} ${MONEDAS[codigo].nombre}`,
      onclick: async () => {
        const falta = Math.max(0, -saldoPago(t.totalUSD, pagos));
        const sugerido = codigo === 'USD' ? falta : desdeUSD(falta, codigo, tasas[codigo]);
        const monto = await pedirMonto({
          titulo: `Recibido en ${MONEDAS[codigo].nombre}`,
          moneda: codigo, inicial: sugerido, aceptar: 'Agregar',
        });
        if (!monto) return;
        pagos = [...pagos, crearPago(codigo, monto, tasas)];
        pintar();
      },
    }));
  }

  function pintar() {
    const saldo = saldoPago(t.totalUSD, pagos);
    resumen.innerHTML = '';
    pegar(resumen, 
      el('div', { style: 'text-align:center' }, [
        el('div', { style: 'color:var(--texto-suave);font-size:.85rem', texto: 'TOTAL A COBRAR' }),
        el('div.cifra-gigante', { texto: formatear(t.totalUSD) }),
      ])
    );

    listaPagos.innerHTML = '';
    for (const [i, p] of pagos.entries()) {
      listaPagos.appendChild(el('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--borde)',
      }, [
        el('span', { texto: `${formatear(p.monto, p.moneda)}` }),
        el('span', { style: 'color:var(--texto-suave);font-size:.85rem', texto: `= ${formatear(p.montoUSD)}` }),
        el('button.btn.plano', {
          style: 'min-height:34px;padding:0 .6rem', texto: '✕',
          onclick: () => { pagos = pagos.filter((_, j) => j !== i); pintar(); },
        }),
      ]));
    }

    if (pagos.length) {
      const vuelto = vueltoEnMonedas(Math.max(0, saldo), tasas);
      listaPagos.appendChild(el('div', { style: 'padding-top:.6rem' }, [
        el('div', {
          style: `font-weight:700;color:${saldo < 0 ? 'var(--rojo)' : 'var(--verde)'}`,
          texto: saldo < 0 ? `Faltan ${formatear(-saldo)}` : saldo > 0 ? `Vuelto ${formatear(saldo)}` : 'Justo, sin vuelto',
        }),
        saldo > 0 ? el('div', {
          style: 'color:var(--texto-suave);font-size:.9rem',
          texto: Object.entries(vuelto)
            .filter(([m]) => m !== 'USD')
            .map(([m, v]) => `o ${formatear(v, m)}`).join('  ·  '),
        }) : null,
      ]));
    }

    acciones.innerHTML = '';
    pegar(acciones, 
      el('button.btn.plano', { texto: 'Cancelar', onclick: () => d.close() }),
      el('button.btn.principal.grande', {
        style: 'flex:2',
        texto: saldo < 0 && !fiado ? 'Falta plata' : 'Cobrar',
        disabled: saldo < 0 && !fiado ? '' : null,
        onclick: terminar,
      })
    );
  }

  async function terminar() {
    try {
      const { id, venta } = await registrarVenta({ lineas, pagos, clienteId, fiado });
      d.close();
      vaciar();
      avisarOk('Venta registrada');
      recibo({ id, venta, tasas });
    } catch (e) {
      avisarMal(e.message || 'No se pudo registrar la venta.');
    }
  }

  pegar(d, 
    el('h2', { texto: 'Cobrar' }),
    resumen,
    el('p', { style: 'color:var(--texto-suave);font-size:.85rem;margin-top:1rem', texto: '¿Con qué paga?' }),
    botonesMoneda,
    listaPagos,
    el('button.btn.plano.ancho', {
      style: 'margin-top:.75rem', texto: '🤝 Dejarlo fiado',
      onclick: async () => {
        const elegido = await elegirCliente();
        if (!elegido) return;
        clienteId = elegido.id;
        fiado = true;
        avisar(`Queda fiado a ${elegido.nombre}`);
        pintar();
      },
    }),
    acciones
  );
  pintar();
}

/** Elegir (o crear al vuelo) el cliente del fiado. */
function elegirCliente() {
  return new Promise(async (resolver) => {
    const clientes = await listarClientes().catch(() => []);
    const d = abrirDialogo('');
    const entrada = el('input', { placeholder: 'Nombre del cliente' });
    const lista = el('div', { style: 'max-height:40vh;overflow:auto;margin:.75rem 0' });
    const pintar = (filtro = '') => {
      lista.innerHTML = '';
      for (const c of clientes.filter((c) => c.nombre.toLowerCase().includes(filtro.toLowerCase()))) {
        lista.appendChild(el('button.btn.plano.ancho', {
          style: 'justify-content:space-between;margin-bottom:.4rem',
          onclick: () => { d.close(); resolver(c); },
        }, [
          el('span', { html: esc(c.nombre) }),
          el('span', { style: 'color:var(--texto-suave)', texto: c.saldoUSD ? formatear(c.saldoUSD) : '' }),
        ]));
      }
    };
    entrada.addEventListener('input', () => pintar(entrada.value));
    pintar();
    pegar(d, 
      el('h2', { texto: 'Fiado — ¿a quién?' }),
      entrada, lista,
      el('div.fila', {}, [
        el('button.btn.plano', { texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { texto: 'Crear cliente', onclick: async () => {
          const nombre = entrada.value.trim();
          if (!nombre) return;
          const id = await guardarCliente({ nombre });
          d.close();
          resolver({ id, nombre, saldoUSD: 0 });
        } }),
      ])
    );
    entrada.focus();
  });
}

export { agregar, carrito, vaciar };
