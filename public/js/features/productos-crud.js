// productos-crud.js — INVENTARIO. Lo que ve y edita el dueño.
//
// La lista muestra lo que de verdad importa para decidir: precio, costo y
// MARGEN. Un producto con margen bajo o negativo se ve de lejos, en rojo.

import { registrar, ir } from '../core/router.js';
import { el, esc, $, abrirDialogo } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { productos as catalogo, categorias } from '../data/catalogo.js';
import { guardarProducto, desactivarProducto } from '../data/productos.js';
import { registrarMovimientos, bajoMinimo, TIPOS } from '../data/inventario.js';
import { pintarFoto } from '../data/fotos.js';
import { buscar } from '../data/busqueda.js';
import { observar, leer } from '../core/estado.js';
import { aMenores, formatear, margenPct, aMayores, parsearCosto, escribirCosto, aUSD } from '../core/dinero.js';

const MARGEN_FLOJO = 15;   // por debajo de esto, se marca en amarillo

registrar('inventario', {
  titulo: 'Inventario', icono: '📦', menu: true, soloDueno: true, orden: 20,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="campo" style="margin-bottom:.6rem">
        <label for="q">Buscar producto</label>
        <div class="buscador">
          <span class="buscador-icono" aria-hidden="true">🔎</span>
          <input id="q" type="search" autocomplete="off" enterkeyhint="search"
                 placeholder="Ej: lápiz, teipe, carpeta…">
          <button type="button" class="buscador-limpiar" id="limpiar" hidden
                  aria-label="Borrar lo escrito">&times;</button>
        </div>
        <p id="cuenta" class="pista-busqueda" aria-live="polite"></p>
        <p style="color:var(--texto-suave);font-size:.85rem;margin:.3rem 0 0">
          Desde la computadora puedes arrastrar una foto encima de cualquier producto de la lista y queda puesta.
        </p>
      </div>
      <div class="fila" style="margin-bottom:.75rem">
        <select id="filtro">
          <option value="">Todos</option>
          <option value="bajo">Stock bajo</option>
          <option value="sinfoto">Sin foto</option>
          <option value="incompleto">Sin precio o sin costo</option>
          <option value="flojo">Margen flojo</option>
        </select>
      </div>
      <div class="fila" style="margin-bottom:1rem">
        <button class="btn principal" id="nuevo">Producto nuevo</button>
        <button class="btn plano" id="importar">Importar Excel</button>
        <button class="btn plano" id="exportar">Exportar</button>
      </div>
      <div id="resumen"></div>
      <div id="lista"></div>`;

    $('#nuevo', nodo).onclick = () => formulario();
    $('#importar', nodo).onclick = () => ir('importar');
    $('#exportar', nodo).onclick = async () => {
      const { exportarInventario } = await import('../reports/export-excel.js');
      exportarInventario(catalogo());
    };

    const pintar = () => {
      const q = $('#q', nodo).value.trim();
      const filtro = $('#filtro', nodo).value;
      let lista = catalogo();

      if (q) lista = buscar(q, lista, { limite: 200 });
      if (filtro === 'bajo') lista = bajoMinimo(lista);
      if (filtro === 'sinfoto') lista = lista.filter((p) => !p.tieneFoto);
      if (filtro === 'incompleto') lista = lista.filter((p) => !p.precioUSD || !p.costoUSD);
      if (filtro === 'flojo') lista = lista.filter((p) => {
        const m = margenPct(p.precioUSD, p.costoUSD);
        return p.precioUSD && m !== null && m < MARGEN_FLOJO;
      });
      lista = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      const todos = catalogo();
      // Decirle cuántos quedaron: sin esto, con 156 productos no se sabe si la
      // búsqueda hizo algo o si la lista de abajo es la de siempre.
      $('#limpiar', nodo).hidden = !q;
      $('#cuenta', nodo).textContent = q
        ? (lista.length ? `${lista.length} de ${todos.length} productos` : 'Ningún producto con ese nombre')
        : '';
      $('#resumen', nodo).innerHTML = '';
      $('#resumen', nodo).appendChild(el('div.kpis', { style: 'margin-bottom:1rem' }, [
        tarjetaKpi('Productos', String(todos.length)),
        tarjetaKpi('Sin foto', String(todos.filter((p) => !p.tieneFoto).length), 'acento'),
        tarjetaKpi('Stock bajo', String(bajoMinimo(todos).length), bajoMinimo(todos).length ? 'malo' : ''),
        tarjetaKpi(
          todos.some((p) => p.costoEstimado) ? 'Valor del inventario (aprox.)' : 'Valor del inventario',
          formatear(todos.reduce((t, p) => t + (p.costoUSD || 0) * (p.stock || 0), 0))),
      ]));

      const caja = $('#lista', nodo);
      caja.innerHTML = '';
      if (!lista.length) {
        caja.appendChild(el('div.vacio', {}, [
          el('p', { texto: todos.length ? 'Nada con ese filtro.' : 'Todavía no hay productos.' }),
          todos.length ? null : el('button.btn.principal', { texto: 'Importar mi Excel', onclick: () => ir('importar') }),
        ]));
        return;
      }

      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const p of lista) {
        const m = p.precioUSD ? margenPct(p.precioUSD, p.costoUSD) : null;
        const colorMargen = m === null ? 'var(--texto-suave)' : m < 0 ? 'var(--rojo)' : m < MARGEN_FLOJO ? 'var(--ambar)' : 'var(--verde)';
        const img = el('img.miniatura', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        if (p.tieneFoto) pintarFoto(img, p.id);

        const fila = el('div', {
          style: 'display:flex;gap:.7rem;align-items:center;padding:.55rem;border-bottom:1px solid var(--borde);cursor:pointer',
          onclick: () => formulario(p),
        }, [
          img,
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(p.nombre) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)' }, [
              el('span', { html: esc(p.categoria || 'Sin categoría') }),
              p.tipoPrecio === 'variable' ? el('span.etiqueta.info', { style: 'margin-left:.4rem', texto: 'precio libre' }) : null,
              (!p.precioUSD || !p.costoUSD) ? el('span.etiqueta.alerta', { style: 'margin-left:.4rem', texto: 'incompleto' }) : null,
              p.costoEstimado ? el('span.etiqueta.info', { style: 'margin-left:.4rem', texto: 'costo estimado' }) : null,
            ]),
          ]),
          el('div', { style: 'text-align:right;font-size:.85rem' }, [
            el('div.cifra', { style: 'font-weight:700;font-size:1rem', texto: formatear(p.precioUSD) }),
            el('div', { style: `color:${colorMargen};font-weight:600`, texto: m === null ? 'sin costo' : `${m.toFixed(0)}% margen` }),
            el('div', { style: 'color:var(--texto-suave)', texto: p.tipo === 'servicio' ? 'servicio' : `${p.stock} ${esc(p.unidad || 'u')}` }),
          ]),
        ]);
        soltarFotoEn(fila, p);
        tarjeta.appendChild(fila);
      }
      caja.appendChild(tarjeta);
    };

    $('#q', nodo).addEventListener('input', pintar);
    $('#filtro', nodo).addEventListener('change', pintar);
    $('#limpiar', nodo).addEventListener('click', () => {
      const campo = $('#q', nodo);
      campo.value = '';
      campo.focus();       // devolver el cursor: lo normal es volver a escribir
      pintar();
    });
    return observar('productos', pintar);
  },
});

/**
 * Deja caer una foto encima del producto y queda puesta.
 *
 * En la computadora es el camino más corto que hay: el dueño tiene la carpeta
 * de fotos abierta al lado, arrastra una a su fila y listo. Con el selector de
 * archivos hay que entrar al producto, buscar el botón y navegar la carpeta
 * entera por cada foto.
 */
function soltarFotoEn(fila, producto) {
  const normal = fila.getAttribute('style');
  const resaltar = (si) => fila.setAttribute('style', si
    ? `${normal};outline:3px dashed var(--marca);outline-offset:-3px;background:var(--marca-suave)`
    : normal);

  fila.addEventListener('dragover', (ev) => { ev.preventDefault(); resaltar(true); });
  fila.addEventListener('dragleave', () => resaltar(false));
  fila.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();        // que no se abra además la ficha del producto
    resaltar(false);

    const archivo = [...(ev.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!archivo) return avisarMal('Eso no es una imagen.');

    try {
      const { ponerFoto } = await import('./estudio-fotos.js');
      const puesta = await ponerFoto(producto, archivo);
      if (puesta) avisarOk(`Foto de ${producto.nombre}`);
    } catch (e) {
      avisarMal(e.message || 'No se pudo guardar la foto');
    }
  });
}

function tarjetaKpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { style: 'font-size:1.35rem', texto: valor }),
  ]);
}

/** Formulario de producto. Sin `p` es uno nuevo. */
export function formulario(p = null) {
  const esNuevo = !p;
  const d = abrirDialogo(`
    <h2>${esNuevo ? 'Producto nuevo' : 'Editar producto'}</h2>
    <form id="f">
      <div class="campo"><label>Nombre</label>
        <input name="nombre" required value="${esc(p?.nombre || '')}" placeholder="Lápiz Mongol Nº2"></div>

      <div class="campo"><label>Otros nombres (sinónimos, separados por coma)</label>
        <input name="alias" value="${esc((p?.alias || []).join(', '))}" placeholder="mongol, lapis, lápiz negro">
        <small style="color:var(--texto-suave)">Esto es lo que hace que aparezca aunque lo escriban mal o le digan de otra forma.</small></div>

      <div class="fila">
        <div class="campo" style="flex:2"><label>Categoría</label>
          <input name="categoria" list="cats" value="${esc(p?.categoria || '')}">
          <datalist id="cats">${categorias().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="campo"><label>Tipo</label>
          <select name="tipo">
            <option value="producto" ${p?.tipo !== 'servicio' ? 'selected' : ''}>Producto (lleva stock)</option>
            <option value="servicio" ${p?.tipo === 'servicio' ? 'selected' : ''}>Servicio (no lleva stock)</option>
          </select></div>
      </div>

      <div class="campo"><label>Precio</label>
        <select name="tipoPrecio">
          <option value="fijo" ${p?.tipoPrecio !== 'variable' ? 'selected' : ''}>Fijo — siempre vale lo mismo</option>
          <option value="variable" ${p?.tipoPrecio === 'variable' ? 'selected' : ''}>Variable — se pide al vender</option>
        </select></div>

      <div class="fila">
        <div class="campo"><label>Precio al cliente (pesos)</label>
          <input name="precioCop" inputmode="numeric" value="${p?.precioCOP ? aMayores(p.precioCOP, 'COP') : ''}" placeholder="10.000">
          <small id="enDolares" style="color:var(--texto-suave)"></small></div>
        <div class="campo"><label>Lo que te cuesta a ti (USD)</label>
          <input name="costo" value="${p ? escribirCosto(p.costoUSD, p.costoPaquete) : ''}" placeholder="0,30">
          <small style="color:var(--texto-suave)">Si lo compraste por paquete, escríbelo así: <strong>12 por 1,80</strong>. La app saca lo que cuesta cada uno.</small></div>
      </div>
      <div id="margen" style="margin:-.4rem 0 .9rem;font-weight:600"></div>

      <div class="fila">
        <div class="campo"><label>Precio mínimo al cliente (USD)</label>
          <input name="minimo" inputmode="decimal" value="${p && p.precioMinimoUSD ? aMayores(p.precioMinimoUSD) : ''}" placeholder="opcional">
          <small style="color:var(--texto-suave)">Si alguien quiere cobrar menos que esto, le pide tu PIN.</small></div>
        <div class="campo"><label>Unidad</label>
          <input name="unidad" value="${esc(p?.unidad || 'unidad')}"></div>
      </div>

      <div class="fila">
        <div class="campo"><label>Stock</label>
          <input name="stock" inputmode="decimal" value="${p?.stock ?? 0}" ${esNuevo ? '' : 'readonly'}>
          ${esNuevo ? '' : '<small style="color:var(--texto-suave)">Se cambia con "Ajustar stock".</small>'}</div>
        <div class="campo"><label>Avisar cuando baje de</label>
          <input name="stockMinimo" inputmode="decimal" value="${p?.stockMinimo ?? 0}"></div>
      </div>

      <div class="fila">
        <div class="campo"><label>Código de barras</label>
          <input name="codigoBarras" inputmode="numeric" value="${esc(p?.codigoBarras || '')}"></div>
        <div class="campo"><label>SKU</label>
          <input name="sku" value="${esc(p?.sku || '')}"></div>
      </div>

      <details style="margin-bottom:1rem">
        <summary style="cursor:pointer;font-weight:600;color:var(--texto-suave)">Precios por cantidad (fotocopias, mayor)</summary>
        <div id="escalas" style="margin-top:.6rem"></div>
        <button type="button" class="btn plano" id="mas-escala">Agregar tramo</button>
      </details>

      <div class="fila">
        <button type="button" class="btn plano" id="cancelar">Cancelar</button>
        ${esNuevo ? '' : '<button type="button" class="btn plano" id="ajustar">Ajustar stock</button>'}
        <button type="submit" class="btn principal">Guardar</button>
      </div>
      ${esNuevo ? '' : '<button type="button" class="btn plano ancho" id="borrar" style="margin-top:.6rem;color:var(--rojo)">Desactivar producto</button>'}
    </form>`);

  const f = $('#f', d);
  const cajaEscalas = $('#escalas', d);

  // El tramo se escribe en PESOS, igual que el precio de la etiqueta. Pedirlo
  // en dólares era la otra mitad del desfase: el dueño pone 10.000 arriba y
  // 300 abajo pensando en lo mismo, y la app guardaba uno en peso y otro en
  // dólar.
  const filaEscala = (e = { desdeCant: '', precioCOP: '' }) => {
    const fila = el('div.fila', { style: 'margin-bottom:.4rem' }, [
      el('input', { type: 'number', min: '1', placeholder: 'Desde cantidad', value: e.desdeCant || '', 'data-k': 'cant' }),
      el('input', { inputmode: 'numeric', placeholder: 'Precio c/u (pesos)', value: e.precioCOP ? aMayores(e.precioCOP, 'COP') : '', 'data-k': 'precio' }),
      el('button.btn.plano', { type: 'button', texto: '×', 'aria-label': 'Quitar este tramo', title: 'Quitar', style: 'flex:0 0 52px;font-size:1.2rem', onclick: () => fila.remove() }),
    ]);
    cajaEscalas.appendChild(fila);
  };
  (p?.escalas || []).forEach(filaEscala);
  $('#mas-escala', d).onclick = () => filaEscala();

  const pintarMargen = () => {
    const tasaCop = (leer('tasas') || {}).COP || 0;
    const enPesos = aMenores(f.precioCop.value, 'COP') || 0;
    const precio = enPesos && tasaCop ? aUSD(enPesos, 'COP', tasaCop) : (p?.precioUSD || 0);
    // Debajo del campo: cuánto es eso en dólares hoy, que es lo que cobra la app.
    const nota = $('#enDolares', d);
    if (nota) {
      nota.textContent = !tasaCop
        ? 'Carga la tasa del día para ver a cuánto equivale.'
        : enPesos ? `Hoy son ${formatear(precio)} · tasa ${aMayores(tasaCop, 'COP')}`
                  : 'El precio de la etiqueta, en pesos.';
    }
    const { costoUSD: costo, paquete } = parsearCosto(f.costo.value);
    const m = precio ? margenPct(precio, costo) : null;
    const caja = $('#margen', d);
    if (m === null || !costo) { caja.textContent = ''; return; }
    const ganancia = precio - costo;
    caja.style.color = m < 0 ? 'var(--rojo)' : m < MARGEN_FLOJO ? 'var(--ambar)' : 'var(--verde)';
    // Con paquete se dice primero el unitario: es el número que el dueño no
    // tenía y la razón por la que puede escribirlo como lo compró.
    const porPaquete = paquete ? `Cada uno te cuesta ${formatear(costo)}. ` : '';
    // Si el costo vino de la fórmula del Excel, el margen que se ve es humo.
    if (p?.costoEstimado) {
      caja.style.color = 'var(--ambar)';
      caja.textContent = `${porPaquete}Este costo es estimado (salió del Excel, no de una factura): el ${m.toFixed(0)}% de margen no es real.`;
      return;
    }
    caja.textContent = m < 0
      ? `${porPaquete}Estás vendiendo con pérdida: ${formatear(ganancia)} por unidad`
      : `${porPaquete}Ganas ${formatear(ganancia)} por unidad — ${m.toFixed(0)}% de margen`;
  };
  f.precioCop.addEventListener('input', pintarMargen);
  f.costo.addEventListener('input', pintarMargen);
  pintarMargen();

  $('#cancelar', d).onclick = () => d.close();

  if (!esNuevo) {
    $('#borrar', d).onclick = async () => {
      if (!await confirmar(`¿Desactivar "${p.nombre}"?`, {
        detalle: 'No se borra: deja de aparecer al vender, pero las ventas viejas siguen cuadrando.',
        aceptar: 'Desactivar', peligro: true,
      })) return;
      await desactivarProducto(p.id);
      d.close();
      avisarOk('Producto desactivado');
    };
    $('#ajustar', d).onclick = () => { d.close(); ajustarStock(p); };
  }

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tasaEscalas = (leer('tasas') || {}).COP || 0;
    const escalas = [...cajaEscalas.querySelectorAll('.fila')].map((fila) => {
      const cop = aMenores(fila.querySelector('[data-k="precio"]').value, 'COP') || 0;
      return {
        desdeCant: Number(fila.querySelector('[data-k="cant"]').value),
        precioCOP: cop,
        precioUSD: cop && tasaEscalas ? aUSD(cop, 'COP', tasaEscalas) : 0,
      };
    }).filter((e) => e.desdeCant > 0);

    const costo = parsearCosto(f.costo.value);
    const precioCop = aMenores(f.precioCop.value, 'COP') || 0;
    const tasaCop = (leer('tasas') || {}).COP || 0;

    try {
      await guardarProducto({
        nombre: f.nombre.value,
        alias: f.alias.value.split(',').map((s) => s.trim()).filter(Boolean),
        categoria: f.categoria.value,
        tipo: f.tipo.value,
        tipoPrecio: f.tipoPrecio.value,
        precioCOP: precioCop,
        // El dólar sale del peso con la tasa de hoy. Si no hay tasa cargada o
        // el producto no tiene precio en pesos, se conserva el que tenía: no se
        // le pone 0 a un producto por no haber cargado la tasa.
        precioUSD: precioCop && tasaCop ? aUSD(precioCop, 'COP', tasaCop) : (p?.precioUSD || 0),
        costoUSD: costo.costoUSD || 0,
        // Se guarda cómo lo compró, no solo el unitario: así la próxima vez ve
        // "12 por 1,80" y no un 0,15 que no reconoce.
        costoPaquete: costo.paquete,
        precioMinimoUSD: aMenores(f.minimo.value) || 0,
        unidad: f.unidad.value,
        stock: esNuevo ? Number(f.stock.value) || 0 : p.stock,
        stockMinimo: Number(f.stockMinimo.value) || 0,
        codigoBarras: f.codigoBarras.value,
        sku: f.sku.value,
        escalas,
        tieneFoto: p?.tieneFoto || false,
        activo: true,
      }, p?.id || null);
      d.close();
      avisarOk(esNuevo ? 'Producto creado' : 'Producto actualizado');
    } catch (e) {
      avisarMal('No se pudo guardar: ' + (e.message || e));
    }
  });
}

/** Ajuste de stock: entra siempre por el ledger, nunca a mano sobre el número. */
export function ajustarStock(p) {
  const d = abrirDialogo(`
    <h2>Ajustar stock</h2>
    <p style="color:var(--texto-suave)">${esc(p.nombre)} — ahora hay <strong>${p.stock}</strong></p>
    <form id="f">
      <div class="campo"><label>¿Qué pasó?</label>
        <select name="tipo">
          <option value="compra">Llegó mercancía (compra)</option>
          <option value="merma">Se dañó o se perdió (merma)</option>
          <option value="devolucion">Devolución de un cliente</option>
          <option value="ajuste">Conteo físico (dejarlo en…)</option>
        </select></div>
      <div class="campo"><label id="lbl">Cantidad</label>
        <input name="cantidad" inputmode="decimal" required autofocus></div>
      <div class="campo" id="caja-costo"><label>Costo por unidad (USD)</label>
        <input name="costo" inputmode="decimal" value="${aMayores(p.costoUSD)}"></div>
      <div class="campo"><label>Nota</label><input name="nota" placeholder="opcional"></div>
      <div class="fila">
        <button type="button" class="btn plano" id="cancelar">Cancelar</button>
        <button type="submit" class="btn principal">Guardar</button>
      </div>
    </form>`);
  const f = $('#f', d);
  const refrescar = () => {
    $('#lbl', d).textContent = f.tipo.value === 'ajuste' ? 'Dejar el stock en…' : 'Cantidad';
    $('#caja-costo', d).style.display = f.tipo.value === 'compra' ? '' : 'none';
  };
  f.tipo.addEventListener('change', refrescar);
  refrescar();
  $('#cancelar', d).onclick = () => d.close();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cantidad = Number(f.cantidad.value);
    const tipo = f.tipo.value;
    try {
      await registrarMovimientos([{
        productoId: p.id,
        nombre: p.nombre,
        tipo,
        // En el conteo físico se guarda la DIFERENCIA, para que el ledger cuadre.
        cantidad: tipo === 'ajuste' ? cantidad - (p.stock || 0) : cantidad,
        costoUnitUSD: tipo === 'compra' ? (aMenores(f.costo.value) || 0) : p.costoUSD,
        nota: f.nota.value,
      }]);
      if (tipo === 'compra') {
        const nuevoCosto = aMenores(f.costo.value) || 0;
        if (nuevoCosto && nuevoCosto !== p.costoUSD) {
          // El costoPaquete viejo se va con él: es el costo de OTRA compra, y
          // si se queda, el formulario lo muestra con prioridad y revierte este.
          await guardarProducto({ ...p, costoUSD: nuevoCosto, costoPaquete: null }, p.id);
        }
      }
      d.close();
      avisarOk(`${TIPOS[tipo].etiqueta} registrada`);
    } catch (e) {
      avisarMal('No se pudo ajustar: ' + (e.message || e));
    }
  });
}
