// buscador.js — "¿tenemos esto?" sin tener que vender.
// Es la pantalla que el empleado usa cuando el cliente pregunta por algo.
// Muestra existencia y precio; NUNCA el costo ni la ganancia.

import { registrar } from '../core/router.js';
import { el, esc, $ } from '../ui/html.js';
import { buscar, sinResultados } from '../data/busqueda.js';
import { recordarBusqueda } from '../data/sinonimos.js';
import { productos as catalogo, categorias } from '../data/catalogo.js';
import { pintarFoto } from '../data/fotos.js';
import { formatear, desdeUSD, MONEDAS } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { agregar } from './pos.js';
import { ir } from '../core/router.js';
import { avisarOk } from '../ui/avisos.js';

registrar('buscar', {
  titulo: 'Buscar', icono: '🔎', menu: true, soloEmpleado: true, orden: 20,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="buscador-pos">
        <input id="q" type="search" autocomplete="off" placeholder="🔎 ¿Qué está buscando el cliente?">
      </div>
      <div id="chips" class="fila" style="margin:.75rem 0;gap:.4rem"></div>
      <div id="res"></div>`;

    const q = $('#q', nodo);
    const chips = $('#chips', nodo);
    const res = $('#res', nodo);

    for (const c of categorias().slice(0, 8)) {
      chips.appendChild(el('button.btn.plano', {
        style: 'min-height:38px;padding:0 .9rem;font-size:.85rem;flex:0 0 auto',
        texto: c,
        onclick: () => { q.value = c; pintar(); },
      }));
    }

    function pintar() {
      const texto = q.value.trim();
      recordarBusqueda(texto);
      res.innerHTML = '';
      if (!texto) {
        res.appendChild(el('div.vacio', {}, [
          el('div', { style: 'font-size:2.5rem', texto: '🔎' }),
          el('p', { texto: 'Escribe como se te ocurra. Aunque esté mal escrito, aparece.' }),
        ]));
        return;
      }

      const lista = buscar(texto, catalogo(), { limite: 40 });
      if (sinResultados(lista)) {
        res.appendChild(el('div.tarjeta', { style: 'text-align:center' }, [
          el('p', { texto: `No hay nada con "${texto}".` }),
          el('p', { style: 'color:var(--texto-suave);font-size:.9rem', texto: 'Prueba con otra palabra: a veces el producto está con otro nombre.' }),
        ]));
        return;
      }

      const tasas = leer('tasas') || {};
      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const p of lista) {
        const img = el('img.miniatura', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        if (p.tieneFoto) pintarFoto(img, p.id);
        const otras = Object.keys(MONEDAS)
          .filter((m) => m !== 'USD' && tasas[m])
          .map((m) => formatear(desdeUSD(p.precioUSD, m, tasas[m]), m)).join(' · ');

        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.7rem;align-items:center;padding:.6rem;border-bottom:1px solid var(--borde)',
        }, [
          img,
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(p.nombre) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: esc(otras || p.categoria || '') }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div', { style: 'font-weight:700', texto: p.tipoPrecio === 'variable' ? 'Libre' : formatear(p.precioUSD) }),
            p.tipo === 'servicio'
              ? el('span.etiqueta.info', { texto: 'servicio' })
              : el('span', {
                  class: `etiqueta ${p.stock <= 0 ? 'mal' : p.stock <= (p.stockMinimo || 0) ? 'alerta' : 'ok'}`,
                  texto: p.stock <= 0 ? 'No hay' : `${p.stock} ${esc(p.unidad || 'u')}`,
                }),
          ]),
          el('button.btn.plano', {
            style: 'min-height:40px;padding:0 .8rem', texto: '➕',
            onclick: (ev) => {
              ev.stopPropagation();
              if (p.tipoPrecio === 'variable') return ir('vender');
              agregar(p);
              avisarOk(`${p.nombre} va al carrito`);
            },
          }),
        ]));
      }
      res.appendChild(tarjeta);
    }

    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(pintar, 120); });
    pintar();
    q.focus();
  },
});
