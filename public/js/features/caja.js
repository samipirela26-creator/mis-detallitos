// caja.js — abrir turno, reporte X y cierre Z con arqueo por denominaciones.
//
// La idea: que el sistema compare, no la persona. El empleado cuenta billete
// por billete, la app dice qué debería haber, y la diferencia queda escrita tal
// cual (no se "corrige" para que cuadre).

import { registrar } from '../core/router.js';
import { el, esc, $, fecha, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import {
  DENOMINACIONES, turnoAbierto, abrirTurno, reporteX, cerrarTurno,
  turnosRecientes, sumarConteo,
} from '../data/caja.js';
import { MONEDAS, formatear, aMenores } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { esDueno } from '../core/sesion.js';

registrar('caja', {
  titulo: 'Mi caja', icono: '💵', menu: true, soloEmpleado: true, orden: 40,
  montar: montarCaja,
});
registrar('caja-dueno', { titulo: 'Caja', icono: '💵', montar: montarCaja });

async function montarCaja(nodo) {
  nodo.innerHTML = '<div class="cargando">Revisando tu turno…</div>';
  let turno = null;
  try {
    turno = await turnoAbierto();
  } catch (e) {
    nodo.innerHTML = '';
    return nodo.appendChild(el('div.vacio', { texto: 'No se pudo leer la caja (¿sin internet?). Puedes seguir vendiendo igual.' }));
  }

  if (!turno) return pintarApertura();

  const datos = await reporteX(turno).catch(() => null);
  nodo.innerHTML = '';
  nodo.appendChild(el('div.tarjeta.marca', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
      el('div', {}, [
        el('h2', { texto: 'Turno abierto' }),
        el('div', { style: 'color:var(--texto-suave);font-size:.9rem', texto: `Desde ${fecha(turno.apertura)}` }),
      ]),
      el('span.etiqueta.ok', { texto: turno.nombreUsuario }),
    ]),
  ]));

  if (datos) {
    nodo.appendChild(el('div.kpis', { style: 'margin:1rem 0' }, [
      kpi('Ventas del turno', String(datos.cantidad)),
      kpi('Cobrado', formatear(datos.totalUSD)),
      ...(esDueno() ? [kpi('Ganancia', formatear(datos.gananciaUSD), 'bueno')] : []),
    ]));

    const tarjeta = el('div.tarjeta', {}, [el('h2', { texto: 'Debería haber en la gaveta' })]);
    for (const [moneda, monto] of Object.entries(datos.esperado)) {
      if (!monto) continue;
      tarjeta.appendChild(el('div', {
        style: 'display:flex;justify-content:space-between;padding:.45rem 0;border-bottom:1px solid var(--borde)',
      }, [
        el('span', { texto: MONEDAS[moneda]?.nombre || moneda }),
        el('strong.cifra', { texto: formatear(monto, moneda) }),
      ]));
    }
    tarjeta.appendChild(el('p', {
      style: 'color:var(--texto-suave);font-size:.85rem;margin-top:.75rem',
      texto: 'Incluye el fondo con el que abriste. Esto es el reporte X: míralo las veces que quieras, no cierra nada.',
    }));
    nodo.appendChild(tarjeta);
  }

  nodo.appendChild(el('button.btn.principal.grande.ancho', {
    style: 'margin-top:1rem', texto: '🔒 Cerrar caja (contar)',
    onclick: () => pintarCierre(turno),
  }));

  if (esDueno()) nodo.appendChild(await historial());

  // --- apertura ---
  function pintarApertura() {
    nodo.innerHTML = '';
    nodo.appendChild(el('div.tarjeta', {}, [
      el('h1', { texto: '💵 Abrir la caja' }),
      el('p', { texto: '¿Con cuánto arrancas? Es el fondo para dar vuelto. Si no tienes nada, déjalo en cero.' }),
      ...Object.values(MONEDAS).map((m) =>
        el('div.campo', {}, [
          el('label', { texto: m.nombre }),
          el('input', { id: `f-${m.codigo}`, inputmode: 'decimal', placeholder: '0', value: '' }),
        ])),
      el('button.btn.principal.grande.ancho', {
        texto: 'Abrir turno',
        onclick: async () => {
          const fondo = {};
          for (const m of Object.values(MONEDAS)) {
            fondo[m.codigo] = aMenores($(`#f-${m.codigo}`, nodo).value, m.codigo) || 0;
          }
          try {
            await abrirTurno(fondo);
            avisarOk('Turno abierto');
            montarCaja(nodo);
          } catch (e) {
            avisarMal('No se pudo abrir el turno: ' + (e.message || e));
          }
        },
      }),
    ]));
  }

  // --- cierre con conteo por denominaciones ---
  function pintarCierre(turno) {
    const conteos = {};
    const d = abrirDialogo('');
    const totales = el('div');

    const pintarTotales = () => {
      totales.innerHTML = '';
      for (const m of Object.values(MONEDAS)) {
        totales.appendChild(el('div', {
          style: 'display:flex;justify-content:space-between;padding:.3rem 0',
        }, [
          el('span', { texto: m.nombre }),
          el('strong.cifra', { texto: formatear(sumarConteo(conteos[m.codigo] || {}), m.codigo) }),
        ]));
      }
    };

    const cuerpo = el('div', { style: 'max-height:52vh;overflow:auto' });
    for (const m of Object.values(MONEDAS)) {
      conteos[m.codigo] = {};
      const bloque = el('details', { open: m.codigo === 'USD' ? '' : null, style: 'margin-bottom:.5rem' });
      bloque.appendChild(el('summary', { style: 'cursor:pointer;font-weight:700;padding:.4rem 0', texto: m.nombre }));
      for (const valor of DENOMINACIONES[m.codigo]) {
        bloque.appendChild(el('div.fila', { style: 'align-items:center;margin-bottom:.35rem' }, [
          el('span', { style: 'flex:1', texto: formatear(valor, m.codigo) }),
          el('input', {
            type: 'number', min: '0', inputmode: 'numeric', placeholder: '0', style: 'flex:0 0 90px',
            oninput: (ev) => { conteos[m.codigo][valor] = Number(ev.target.value) || 0; pintarTotales(); },
          }),
        ]));
      }
      cuerpo.appendChild(bloque);
    }
    pintarTotales();

    pegar(d, 
      el('h2', { texto: 'Cierre de caja' }),
      el('p', { style: 'color:var(--texto-suave);font-size:.9rem', texto: 'Cuenta lo que hay en la gaveta, billete por billete. Después la app compara.' }),
      cuerpo,
      el('div', { style: 'border-top:2px solid var(--borde);padding-top:.6rem;margin-top:.6rem' }, [totales]),
      el('div.campo', { style: 'margin-top:.75rem' }, [
        el('label', { texto: 'Nota (opcional)' }),
        el('input', { id: 'nota-cierre', placeholder: 'Ej: saqué 20$ para el flete' }),
      ]),
      el('div.fila', {}, [
        el('button.btn.plano', { texto: 'Cancelar', onclick: () => d.close() }),
        el('button.btn.principal', { texto: 'Cerrar caja', onclick: async () => {
          const contado = {};
          for (const m of Object.values(MONEDAS)) contado[m.codigo] = sumarConteo(conteos[m.codigo]);
          try {
            const r = await cerrarTurno(turno, contado, { nota: $('#nota-cierre', d).value });
            d.close();
            mostrarZ(r, turno);
          } catch (e) {
            avisarMal('No se pudo cerrar: ' + (e.message || e));
          }
        } }),
      ])
    );
  }

  function mostrarZ(r, turno) {
    const d = abrirDialogo('');
    const filas = Object.values(MONEDAS).map((m) => {
      const dif = r.diferencia[m.codigo] || 0;
      if (!r.esperado[m.codigo] && !r.contado[m.codigo]) return null;
      return el('tr', {
        html: `<td>${esc(m.nombre)}</td>
               <td class="num">${formatear(r.esperado[m.codigo] || 0, m.codigo)}</td>
               <td class="num">${formatear(r.contado[m.codigo] || 0, m.codigo)}</td>
               <td class="num" style="color:${dif === 0 ? 'var(--verde)' : dif > 0 ? 'var(--ambar)' : 'var(--rojo)'};font-weight:700">
                 ${dif > 0 ? '+' : ''}${formatear(dif, m.codigo)}</td>`,
      });
    }).filter(Boolean);

    const cuadra = Object.values(r.diferencia).every((x) => x === 0);
    pegar(d, 
      el('h2', { texto: cuadra ? '✅ Caja cuadrada' : '⚠️ Cierre con diferencia' }),
      el('p', { style: 'color:var(--texto-suave)', texto: `${r.cantidad} ventas · ${formatear(r.totalUSD)} cobrado` }),
      el('table', { style: 'margin:.75rem 0' }, [
        el('thead', { html: '<tr><th>Moneda</th><th class="num">Debería</th><th class="num">Contado</th><th class="num">Dif.</th></tr>' }),
        el('tbody', {}, filas),
      ]),
      cuadra ? null : el('p', {
        style: 'font-size:.88rem;color:var(--texto-suave)',
        texto: 'Antes de pensar mal: vuelve a contar, y revisa si hubo una venta repetida, una devolución sin registrar o plata sacada de la gaveta.',
      }),
      el('button.btn.principal.ancho', { texto: 'Listo', onclick: () => { d.close(); montarCaja(nodo); } })
    );
  }

  async function historial() {
    const caja = el('div', { style: 'margin-top:1.5rem' });
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Cierres anteriores' })]));
    const lista = await turnosRecientes(10).catch(() => []);
    const cerrados = lista.filter((t) => t.estado === 'cerrada');
    if (!cerrados.length) {
      caja.appendChild(el('div.vacio', { texto: 'Todavía no hay cierres.' }));
      return caja;
    }
    const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
    for (const t of cerrados) {
      const difUSD = t.diferencia?.USD || 0;
      tarjeta.appendChild(el('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;padding:.55rem;border-bottom:1px solid var(--borde)',
      }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600', texto: t.nombreUsuario }),
          el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', texto: fecha(t.cierre) }),
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div.cifra', { style: 'font-weight:700', texto: formatear(t.ventasUSD || 0) }),
          el('span', {
            class: `etiqueta ${Object.values(t.diferencia || {}).every((x) => !x) ? 'ok' : 'alerta'}`,
            texto: Object.values(t.diferencia || {}).every((x) => !x) ? 'cuadró' : `dif ${formatear(difUSD)}`,
          }),
        ]),
      ]));
    }
    caja.appendChild(tarjeta);
    return caja;
  }
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { style: 'font-size:1.4rem', texto: valor }),
  ]);
}
