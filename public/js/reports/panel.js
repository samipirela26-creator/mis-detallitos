// panel.js — el tablero del dueño. Responde las preguntas que motivaron la app:
// cuánto vendí, cuánto me costó, cuánto gané, a qué le estoy ganando poco,
// y quién vendió más.

import { registrar, ir } from '../core/router.js';
import { el, esc, $, diaISO, sumarDias, primerDiaDelMes } from '../ui/html.js';
import { avisar, avisarMal } from '../ui/avisos.js';
import { ventasEntre } from '../data/ventas.js';
import { gastosEntre } from '../data/gastos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { bajoMinimo } from '../data/inventario.js';
import { formatear } from '../core/dinero.js';
import {
  resumen, porProducto, porVendedor, porDia, margenFlojo, descuentos,
  proyeccionQuiebre, costosEstimados,
} from './analisis.js';

const RANGOS = {
  hoy: { titulo: 'Hoy', desde: () => diaISO(), hasta: () => diaISO() },
  semana: { titulo: '7 días', desde: () => sumarDias(diaISO(), -6), hasta: () => diaISO() },
  mes: { titulo: 'Este mes', desde: () => primerDiaDelMes(), hasta: () => diaISO() },
  mes30: { titulo: '30 días', desde: () => sumarDias(diaISO(), -29), hasta: () => diaISO() },
};

registrar('reportes', {
  titulo: 'Reportes', icono: '📊', menu: true, soloDueno: true, orden: 45,
  montar: montarReportes,
});

async function montarReportes(nodo) {
  let rango = 'mes';
  nodo.innerHTML = `
    <div class="fila" id="rangos" style="margin-bottom:1rem"></div>
    <div id="cuerpo"><div class="cargando">Sacando las cuentas…</div></div>`;

  const barraRangos = $('#rangos', nodo);
  for (const [clave, r] of Object.entries(RANGOS)) {
    barraRangos.appendChild(el('button.btn.plano', {
      'data-r': clave, style: 'min-height:40px;font-size:.9rem',
      texto: r.titulo,
      onclick: () => { rango = clave; marcar(); cargar(); },
    }));
  }
  const marcar = () => {
    barraRangos.querySelectorAll('button').forEach((b) => {
      const activo = b.dataset.r === rango;
      b.classList.toggle('principal', activo);
      b.classList.toggle('plano', !activo);
    });
  };
  marcar();

  async function cargar() {
    const caja = $('#cuerpo', nodo);
    caja.innerHTML = '<div class="cargando">Sacando las cuentas…</div>';
    const desde = RANGOS[rango].desde();
    const hasta = RANGOS[rango].hasta();

    let ventas = [], gastos = [];
    try {
      [ventas, gastos] = await Promise.all([ventasEntre(desde, hasta), gastosEntre(desde, hasta)]);
    } catch (e) {
      caja.innerHTML = '';
      return caja.appendChild(el('div.vacio', { texto: 'No se pudieron cargar los reportes (¿sin internet?).' }));
    }

    // El empleado no guarda costos en sus ventas (no los puede leer): aquí se
    // completan con el costo actual del catálogo, que el dueño sí tiene.
    const costos = Object.fromEntries(catalogo().map((p) => [p.id, p.costoUSD || 0]));
    const estimado = costosEstimados(ventas);

    const r = resumen(ventas, gastos, costos);
    const productos = porProducto(ventas, costos);
    const vendedores = porVendedor(ventas, costos);
    const dias = porDia(ventas, gastos, costos);
    const flojos = margenFlojo(productos, 15);
    const regalado = descuentos(ventas);

    caja.innerHTML = '';

    // --- lo grande ---
    caja.appendChild(el('div.kpis', {}, [
      kpi('Vendido', formatear(r.vendidoUSD)),
      kpi('Ganancia bruta', formatear(r.gananciaBrutaUSD), 'bueno'),
      kpi('Gastos', formatear(r.gastosUSD), r.gastosUSD ? 'malo' : ''),
      kpi('GANANCIA NETA', formatear(r.gananciaNetaUSD), r.gananciaNetaUSD >= 0 ? 'bueno' : 'malo'),
    ]));
    caja.appendChild(el('div.kpis', { style: 'margin-top:.85rem' }, [
      kpi('Ventas', String(r.cantidad)),
      kpi('Ticket promedio', formatear(r.ticketPromedioUSD)),
      kpi('Margen', r.margenPct === null ? '—' : `${r.margenPct.toFixed(0)}%`),
      kpi('Por cobrar', formatear(r.porCobrarUSD), r.porCobrarUSD ? 'acento' : ''),
    ]));

    if (!ventas.length) {
      caja.appendChild(el('div.vacio', { texto: 'No hay ventas en este período.' }));
      return;
    }

    if (estimado) {
      caja.appendChild(el('p', {
        style: 'color:var(--texto-suave);font-size:.82rem;margin-top:.75rem',
        texto: 'Nota: algunas ventas las registró un empleado, que no ve los costos. Para esas, la ganancia se calcula con el costo que tiene hoy el producto en el inventario.',
      }));
    }

    // --- gráfico diario ---
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Cómo va día por día' })]));
    const lienzo1 = el('canvas', { height: '220' });
    caja.appendChild(el('div.tarjeta', { style: 'height:280px' }, [lienzo1]));
    import('./graficos.js').then((g) => g.lineaDiaria(lienzo1, dias)).catch(() => {});

    // --- lo que de verdad deja plata ---
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Lo que más ganancia deja' })]));
    const lienzo2 = el('canvas', { height: '240' });
    caja.appendChild(el('div.tarjeta', { style: 'height:300px' }, [lienzo2]));
    import('./graficos.js').then((g) => g.barrasProductos(lienzo2, productos)).catch(() => {});

    // --- margen flojo: el reporte que pidió el dueño ---
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: '⚠️ A esto le estás ganando poco' })]));
    if (!flojos.length) {
      caja.appendChild(el('div.tarjeta.marca', { texto: 'Nada por debajo del 15% de margen. Bien ahí.' }));
    } else {
      const t = el('table');
      t.appendChild(el('thead', { html: '<tr><th>Producto</th><th class="num">Vendido</th><th class="num">Ganancia</th><th class="num">Margen</th></tr>' }));
      const cuerpo = el('tbody');
      for (const p of flojos.slice(0, 15)) {
        const color = p.margenPct < 0 ? 'var(--rojo)' : 'var(--ambar)';
        cuerpo.appendChild(el('tr', {
          html: `<td>${esc(p.nombre)}${p.bajoCosto ? ' <span class="etiqueta mal">bajo costo</span>' : ''}</td>
                 <td class="num">${formatear(p.vendidoUSD)}</td>
                 <td class="num" style="color:${color}">${formatear(p.gananciaUSD)}</td>
                 <td class="num" style="color:${color};font-weight:700">${p.margenPct.toFixed(0)}%</td>`,
        }));
      }
      t.appendChild(cuerpo);
      caja.appendChild(el('div.tarjeta', { style: 'overflow:auto' }, [t]));
    }

    // --- quién vendió ---
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Quién vendió más' })]));
    const lienzo3 = el('canvas', { height: '200' });
    const tablaV = el('table');
    tablaV.appendChild(el('thead', { html: '<tr><th>Vendedor</th><th class="num">Ventas</th><th class="num">Vendido</th><th class="num">%</th><th class="num">Ticket</th></tr>' }));
    const cuerpoV = el('tbody');
    for (const v of vendedores) {
      cuerpoV.appendChild(el('tr', {
        html: `<td>${esc(v.nombre)}${v.descuentos ? ` <span class="etiqueta alerta">${v.descuentos} precios cambiados</span>` : ''}</td>
               <td class="num">${v.ventas}</td>
               <td class="num">${formatear(v.vendidoUSD)}</td>
               <td class="num"><strong>${v.pct.toFixed(0)}%</strong></td>
               <td class="num">${formatear(v.ticketUSD)}</td>`,
      }));
    }
    tablaV.appendChild(cuerpoV);
    caja.appendChild(el('div.tarjeta', {}, [
      el('div', { style: 'height:220px' }, [lienzo3]),
      el('div', { style: 'overflow:auto;margin-top:.75rem' }, [tablaV]),
    ]));
    import('./graficos.js').then((g) => g.donaVendedores(lienzo3, vendedores)).catch(() => {});

    // --- descuentos ---
    if (regalado.length) {
      const total = regalado.reduce((t, d) => t + d.regaladoUSD, 0);
      caja.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Descuentos dados' })]));
      caja.appendChild(el('div.tarjeta.amarilla', {}, [
        el('p', { html: `Se dejaron de ganar <strong>${formatear(total)}</strong> en ${regalado.length} líneas con el precio cambiado.` }),
        el('details', {}, [
          el('summary', { style: 'cursor:pointer;font-weight:600', texto: 'Ver cuáles' }),
          el('div', {
            style: 'font-size:.85rem;max-height:30vh;overflow:auto;margin-top:.5rem',
            html: regalado.slice(0, 30).map((d) =>
              `${d.dia} · ${esc(d.producto)} — ${formatear(d.regaladoUSD)} · ${esc(d.vendedor)}${d.autorizadoPor ? ` (autorizó ${esc(d.autorizadoPor)})` : ''}`
            ).join('<br>'),
          }),
        ]),
      ]));
    }

    // --- stock ---
    const bajos = bajoMinimo(catalogo());
    if (bajos.length) {
      caja.appendChild(el('div.seccion', {}, [el('h2', { texto: '📦 Se está acabando' })]));
      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const p of bajos.slice(0, 20)) {
        const dias = proyeccionQuiebre(p, ventas, Math.max(1, diferenciaDias(desde, hasta)));
        tarjeta.appendChild(el('div', {
          style: 'display:flex;justify-content:space-between;align-items:center;padding:.5rem;border-bottom:1px solid var(--borde);cursor:pointer',
          onclick: () => ir('inventario'),
        }, [
          el('div', {}, [
            el('div', { style: 'font-weight:600', html: esc(p.nombre) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', texto: dias !== null ? `Alcanza para ~${dias} días` : 'No se ha vendido en este período' }),
          ]),
          el('span', { class: `etiqueta ${p.stock <= 0 ? 'mal' : 'alerta'}`, texto: `${p.stock} ${esc(p.unidad || 'u')}` }),
        ]));
      }
      caja.appendChild(tarjeta);
    }

    // --- exportar ---
    caja.appendChild(el('div.fila', { style: 'margin-top:1.5rem' }, [
      el('button.btn.plano', { texto: '📤 Excel', onclick: async () => {
        try {
          const { exportarVentas } = await import('./export-excel.js');
          await exportarVentas(ventas, { desde, hasta, porProducto: productos, porVendedor: vendedores });
        } catch (e) { avisarMal('No se pudo exportar: ' + (e.message || e)); }
      } }),
      el('button.btn.plano', { texto: '🖨️ PDF', onclick: async () => {
        try {
          const { reportePDF } = await import('./export-pdf.js');
          await reportePDF({ desde, hasta, resumen: r, porProducto: productos, porVendedor: vendedores });
        } catch (e) { avisarMal('No se pudo generar el PDF: ' + (e.message || e)); }
      } }),
    ]));
  }

  cargar();
}

function diferenciaDias(desde, hasta) {
  return Math.round((new Date(`${hasta}T12:00`) - new Date(`${desde}T12:00`)) / 86400000) + 1;
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { texto: valor }),
  ]);
}

export { montarReportes };
