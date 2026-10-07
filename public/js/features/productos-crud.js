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
import { observar } from '../core/estado.js';
import { aMenores, formatear, margenPct, aMayores } from '../core/dinero.js';

const MARGEN_FLOJO = 15;   // por debajo de esto, se marca en amarillo

registrar('inventario', {
  titulo: 'Inventario', icono: '📦', menu: true, soloDueno: true, orden: 20,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="fila" style="margin-bottom:.75rem">
        <input id="q" type="search" placeholder="🔎 Buscar en el inventario…" style="flex:3">
        <select id="filtro" style="flex:1">
          <option value="">Todos</option>
          <option value="bajo">Stock bajo</option>
          <option value="sinfoto">Sin foto</option>
          <option value="incompleto">Sin precio o sin costo</option>
          <option value="flojo">Margen flojo</option>
        </select>
      </div>
      <div class="fila" style="margin-bottom:1rem">
        <button class="btn principal" id="nuevo">➕ Producto nuevo</button>
        <button class="btn plano" id="importar">📥 Importar Excel</button>
        <button class="btn plano" id="exportar">📤 Exportar</button>
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
      $('#resumen', nodo).innerHTML = '';
      $('#resumen', nodo).appendChild(el('div.kpis', { style: 'margin-bottom:1rem' }, [
        tarjetaKpi('Productos', String(todos.length)),
        tarjetaKpi('Sin foto', String(todos.filter((p) => !p.tieneFoto).length), 'acento'),
        tarjetaKpi('Stock bajo', String(bajoMinimo(todos).length), bajoMinimo(todos).length ? 'malo' : ''),
        tarjetaKpi('Valor del inventario', formatear(todos.reduce((t, p) => t + (p.costoUSD || 0) * (p.stock || 0), 0))),
      ]));

      const caja = $('#lista', nodo);
      caja.innerHTML = '';
      if (!lista.length) {
        caja.appendChild(el('div.vacio', {}, [
          el('p', { texto: todos.length ? 'Nada con ese filtro.' : 'Todavía no hay productos.' }),
          todos.length ? null : el('button.btn.principal', { texto: '📥 Importar mi Excel', onclick: () => ir('importar') }),
        ]));
        return;
      }

      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const p of lista) {
        const m = p.precioUSD ? margenPct(p.precioUSD, p.costoUSD) : null;
        const colorMargen = m === null ? 'var(--texto-suave)' : m < 0 ? 'var(--rojo)' : m < MARGEN_FLOJO ? 'var(--ambar)' : 'var(--verde)';
        const img = el('img.miniatura', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        if (p.tieneFoto) pintarFoto(img, p.id);

        tarjeta.appendChild(el('div', {
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
            ]),
          ]),
          el('div', { style: 'text-align:right;font-size:.85rem' }, [
            el('div.cifra', { style: 'font-weight:700;font-size:1rem', texto: formatear(p.precioUSD) }),
            el('div', { style: `color:${colorMargen};font-weight:600`, texto: m === null ? 'sin costo' : `${m.toFixed(0)}% margen` }),
            el('div', { style: 'color:var(--texto-suave)', texto: p.tipo === 'servicio' ? 'servicio' : `${p.stock} ${esc(p.unidad || 'u')}` }),
          ]),
        ]));
      }
      caja.appendChild(tarjeta);
    };

    $('#q', nodo).addEventListener('input', pintar);
    $('#filtro', nodo).addEventListener('change', pintar);
    return observar('productos', pintar);
  },
});

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
        <div class="campo"><label>Precio de venta (USD)</label>
          <input name="precio" inputmode="decimal" value="${p ? aMayores(p.precioUSD) : ''}" placeholder="0,50"></div>
        <div class="campo"><label>Costo (USD)</label>
          <input name="costo" inputmode="decimal" value="${p ? aMayores(p.costoUSD) : ''}" placeholder="0,30"></div>
      </div>
      <div id="margen" style="margin:-.4rem 0 .9rem;font-weight:600"></div>

      <div class="fila">
        <div class="campo"><label>Precio mínimo (USD)</label>
          <input name="minimo" inputmode="decimal" value="${p && p.precioMinimoUSD ? aMayores(p.precioMinimoUSD) : ''}" placeholder="opcional">
          <small style="color:var(--texto-suave)">Por debajo de esto pide tu PIN.</small></div>
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
        <button type="button" class="btn plano" id="mas-escala">➕ Agregar tramo</button>
      </details>

      <div class="fila">
        <button type="button" class="btn plano" id="cancelar">Cancelar</button>
        ${esNuevo ? '' : '<button type="button" class="btn plano" id="ajustar">📊 Ajustar stock</button>'}
        <button type="submit" class="btn principal">Guardar</button>
      </div>
      ${esNuevo ? '' : '<button type="button" class="btn plano ancho" id="borrar" style="margin-top:.6rem;color:var(--rojo)">Desactivar producto</button>'}
    </form>`);

  const f = $('#f', d);
  const cajaEscalas = $('#escalas', d);

  const filaEscala = (e = { desdeCant: '', precioUSD: '' }) => {
    const fila = el('div.fila', { style: 'margin-bottom:.4rem' }, [
      el('input', { type: 'number', min: '1', placeholder: 'Desde cantidad', value: e.desdeCant || '', 'data-k': 'cant' }),
      el('input', { inputmode: 'decimal', placeholder: 'Precio c/u', value: e.precioUSD ? aMayores(e.precioUSD) : '', 'data-k': 'precio' }),
      el('button.btn.plano', { type: 'button', texto: '✕', style: 'flex:0 0 52px', onclick: () => fila.remove() }),
    ]);
    cajaEscalas.appendChild(fila);
  };
  (p?.escalas || []).forEach(filaEscala);
  $('#mas-escala', d).onclick = () => filaEscala();

  const pintarMargen = () => {
    const precio = aMenores(f.precio.value) || 0;
    const costo = aMenores(f.costo.value) || 0;
    const m = precio ? margenPct(precio, costo) : null;
    const caja = $('#margen', d);
    if (m === null || !costo) { caja.textContent = ''; return; }
    const ganancia = precio - costo;
    caja.style.color = m < 0 ? 'var(--rojo)' : m < MARGEN_FLOJO ? 'var(--ambar)' : 'var(--verde)';
    caja.textContent = m < 0
      ? `⚠️ Estás vendiendo con pérdida: ${formatear(ganancia)} por unidad`
      : `Ganas ${formatear(ganancia)} por unidad — ${m.toFixed(0)}% de margen`;
  };
  f.precio.addEventListener('input', pintarMargen);
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
    const escalas = [...cajaEscalas.querySelectorAll('.fila')].map((fila) => ({
      desdeCant: Number(fila.querySelector('[data-k="cant"]').value),
      precioUSD: aMenores(fila.querySelector('[data-k="precio"]').value) || 0,
    })).filter((e) => e.desdeCant > 0);

    try {
      await guardarProducto({
        nombre: f.nombre.value,
        alias: f.alias.value.split(',').map((s) => s.trim()).filter(Boolean),
        categoria: f.categoria.value,
        tipo: f.tipo.value,
        tipoPrecio: f.tipoPrecio.value,
        precioUSD: aMenores(f.precio.value) || 0,
        costoUSD: aMenores(f.costo.value) || 0,
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
          await guardarProducto({ ...p, costoUSD: nuevoCosto }, p.id);
        }
      }
      d.close();
      avisarOk(`${TIPOS[tipo].etiqueta} registrada`);
    } catch (e) {
      avisarMal('No se pudo ajustar: ' + (e.message || e));
    }
  });
}
