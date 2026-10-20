// caja.js — abrir turno, reporte X y cierre Z con arqueo por denominaciones.
//
// La idea: que el sistema compare, no la persona. El empleado cuenta billete
// por billete, la app dice qué debería haber, y la diferencia queda escrita tal
// cual (no se "corrige" para que cuadre).

import { registrar } from '../core/router.js';
import { el, esc, $, fecha, diaISO, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import {
  DENOMINACIONES, turnoAbierto, abrirTurno, reporteX, cerrarTurno, quienTieneLaCaja,
  turnosRecientes, sumarConteo,
} from '../data/caja.js';
import { MONEDAS, formatear, aMenores, aMayores } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { esDueno, usuarioActual } from '../core/sesion.js';

registrar('caja', {
  titulo: 'Mi caja', icono: '💵', menu: true, soloEmpleado: true, orden: 40,
  montar: montarCaja,
});
registrar('caja-dueno', { titulo: 'Caja', icono: '💵', montar: montarCaja });

/** Cuántos días lleva abierto un turno, contando por fecha y no por horas:
 *  un turno abierto anoche a las 11 ya es de ayer aunque no hayan pasado 24h. */
function diasAbierto(diaTurno) {
  if (!diaTurno) return 0;
  const hoy = new Date(`${diaISO()}T12:00:00`);
  const abierto = new Date(`${diaTurno}T12:00:00`);
  return Math.max(0, Math.round((hoy - abierto) / 86400000));
}

async function montarCaja(nodo) {
  nodo.innerHTML = '<div class="cargando">Revisando tu turno…</div>';
  let turno = null;
  try {
    turno = await turnoAbierto();
  } catch (e) {
    nodo.innerHTML = '';
    return nodo.appendChild(el('div.vacio', { texto: 'No se pudo leer la caja (¿sin internet?). Puedes seguir vendiendo igual.' }));
  }

  if (!turno) {
    // La gaveta es una sola: si otro la tiene abierta, no se muestra ni el
    // formulario. Enseñar los campos y fallar al final del llenado es peor que
    // decirlo de entrada.
    const otro = await quienTieneLaCaja();
    if (otro && otro.uid !== (usuarioActual()?.uid)) return pintarOcupada(otro);
    return pintarApertura();
  }

  const datos = await reporteX(turno).catch(() => null);
  // El cierre necesita saber qué debería haber para enseñarlo al lado de cada
  // campo: sin ese número, escribir lo que hay es puro papeleo.
  if (datos) turno.__esperado = datos.esperado;
  nodo.innerHTML = '';

  // Un turno que viene de días atrás es un turno que nadie cerró. El arqueo
  // deja de servir: mezcla las ventas de varios días contra un fondo de otro
  // día, y así fue como quedaron dos cajas abiertas a la vez en las pruebas.
  // Se dice fuerte, arriba de todo, y con los días que lleva.
  const dias = diasAbierto(turno.dia);
  if (dias >= 1) {
    nodo.appendChild(el('div.tarjeta', {
      style: 'background:var(--rojo-suave);border:1px solid var(--rojo);margin-bottom:1rem',
    }, [
      el('h2', { style: 'color:var(--rojo);margin-top:0', texto: dias === 1 ? 'Este turno quedó abierto desde ayer' : `Este turno lleva ${dias} días abierto` }),
      el('p', {
        style: 'margin:.3rem 0 0',
        texto: 'Mientras no se cierre, el arqueo mezcla las ventas de varios días contra el fondo '
             + 'de otro día y deja de cuadrar. Ciérralo abajo y abre uno nuevo con el fondo de hoy.',
      }),
    ]));
  }

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
      ...(datos.gastosUSD ? [kpi('Gastos del turno', formatear(datos.gastosUSD), 'malo')] : []),
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
    style: 'margin-top:1rem', texto: 'Cerrar caja (contar)',
    onclick: () => pintarCierre(turno),
  }));

  if (esDueno()) nodo.appendChild(await historial());

  // --- apertura ---
  /** Otro tiene la caja abierta: se dice quién y desde cuándo, y nada más. */
  function pintarOcupada(otro) {
    const hoy = otro.dia === diaISO();
    nodo.innerHTML = '';
    nodo.appendChild(el('div.tarjeta', { style: 'background:var(--ambar-suave);border:1px solid var(--ambar)' }, [
      el('h1', { style: 'margin-top:0', texto: 'La caja ya está abierta' }),
      el('p', { style: 'font-size:1.05rem', html: `<strong>${esc(otro.nombre || 'Otra persona')}</strong> la abrió ${hoy ? 'hoy' : `el ${esc(otro.dia || '')}`}.` }),
      el('p', {
        style: 'color:var(--texto-suave)',
        texto: 'No se puede abrir otra mientras tanto: la gaveta es una sola, y si dos turnos '
             + 'cuentan el mismo dinero, ninguno de los dos cuadra al cerrar. '
             + 'Hay que cerrar ese turno primero.',
      }),
      el('button.btn.plano.ancho', { texto: 'Volver a mirar', onclick: () => montarCaja(nodo) }),
    ]));
  }

  function pintarApertura() {
    nodo.innerHTML = '';
    nodo.appendChild(el('div.tarjeta', {}, [
      el('h1', { texto: 'Abrir la caja' }),
      el('p', { texto: '¿Con cuánto arrancas? Es el fondo para dar vuelto. Si no tienes nada, déjalo en cero.' }),
      ...Object.values(MONEDAS).map((m) =>
        el('div.campo', {}, [
          el('label', { texto: m.nombre }),
          el('input', { id: `f-${m.codigo}`, inputmode: 'decimal', placeholder: '0', value: '' }),
        ])),
      el('button.btn.principal.grande.ancho', {
        texto: 'Abrir turno',
        onclick: async (ev) => {
          // Dos clics seguidos abrían dos turnos. La transacción ya lo frena en
          // el servidor, pero el botón tampoco debe dejar intentarlo.
          const boton = ev.currentTarget;
          if (boton.disabled) return;
          boton.disabled = true;
          boton.textContent = 'Abriendo…';
          const fondo = {};
          for (const m of Object.values(MONEDAS)) {
            fondo[m.codigo] = aMenores($(`#f-${m.codigo}`, nodo).value, m.codigo) || 0;
          }
          try {
            await abrirTurno(fondo);
            avisarOk('Turno abierto');
            montarCaja(nodo);
          } catch (e) {
            avisarMal(e.message || 'No se pudo abrir el turno.');
            boton.disabled = false;
            boton.textContent = 'Abrir turno';
          }
        },
      }),
    ]));
  }

  // --- cierre con conteo por denominaciones ---
  function pintarCierre(turno) {
    const d = abrirDialogo('');
    const campos = {};
    const detalle = el('div');
    let porBilletes = false;
    const conteos = {};

    // Lo que debería haber, al lado de cada campo: es la única razón por la que
    // uno cuenta. Sin eso, escribir el número es papeleo.
    const esperado = (turno.__esperado) || {};

    /** La manera sencilla: un total por moneda y ya. */
    function pintarSimple() {
      detalle.innerHTML = '';
      for (const m of Object.values(MONEDAS)) {
        const esp = esperado[m.codigo] || 0;
        const campo = el('input', {
          inputmode: 'decimal', placeholder: 'déjalo vacío si no lo contaste',
          value: campos[m.codigo] ?? '',
          oninput: (ev) => { campos[m.codigo] = ev.target.value; },
        });
        detalle.appendChild(el('div.campo', { style: 'margin-bottom:.6rem' }, [
          el('label', { texto: m.nombre }),
          campo,
          el('small', {
            style: 'color:var(--texto-suave)',
            texto: esp ? `Debería haber ${formatear(esp, m.codigo)}` : 'No se movió en este turno',
          }),
        ]));
      }
    }

    /** La manera larga, para quien sí quiere contar billete por billete. */
    function pintarBilletes() {
      detalle.innerHTML = '';
      for (const m of Object.values(MONEDAS)) {
        conteos[m.codigo] = conteos[m.codigo] || {};
        const bloque = el('details', { open: m.codigo === 'USD' ? '' : null, style: 'margin-bottom:.5rem' });
        const total = el('strong.cifra', { texto: formatear(sumarConteo(conteos[m.codigo]), m.codigo) });
        bloque.appendChild(el('summary', { style: 'cursor:pointer;font-weight:700;padding:.4rem 0' }, [
          el('span', { texto: m.nombre + '  ' }), total,
        ]));
        for (const valor of [...DENOMINACIONES[m.codigo]].reverse()) {
          bloque.appendChild(el('div.fila', { style: 'align-items:center;margin-bottom:.35rem' }, [
            el('span', { style: 'flex:1', texto: formatear(valor, m.codigo) }),
            el('input', {
              type: 'number', min: '0', inputmode: 'numeric', placeholder: '0', style: 'flex:0 0 90px',
              oninput: (ev) => {
                conteos[m.codigo][valor] = Number(ev.target.value) || 0;
                const suma = sumarConteo(conteos[m.codigo]);
                campos[m.codigo] = String(aMayores(suma, m.codigo));
                total.textContent = formatear(suma, m.codigo);
              },
            }),
          ]));
        }
        detalle.appendChild(bloque);
      }
    }

    pintarSimple();

    const cambiar = el('button.btn.plano', {
      style: 'min-height:36px;font-size:.85rem',
      texto: 'Contar billete por billete',
      onclick: () => {
        porBilletes = !porBilletes;
        cambiar.textContent = porBilletes ? 'Volver a escribir el total' : 'Contar billete por billete';
        porBilletes ? pintarBilletes() : pintarSimple();
      },
    });

    pegar(d,
      el('h2', { texto: 'Cierre de caja' }),
      el('p', {
        style: 'color:var(--texto-suave);font-size:.9rem',
        texto: 'Escribe cuánto hay en la gaveta de cada moneda. Lo que no cuentes, déjalo vacío: no se toma como cero.',
      }),
      el('div', { style: 'max-height:52vh;overflow:auto' }, [detalle]),
      cambiar,
      el('div.campo', { style: 'margin-top:.75rem' }, [
        el('label', { texto: 'Nota (opcional)' }),
        el('input', { id: 'nota-cierre', placeholder: 'Ej: saqué 20$ para el flete' }),
      ]),
      el('div.fila', {}, [
        el('button.btn.plano', { texto: 'Cancelar', onclick: () => d.close() }),
        el('button.btn.principal', { texto: 'Cerrar caja', onclick: async () => {
          // Solo las monedas que de verdad se escribieron. Una vacía queda
          // fuera y el cierre la reporta como "no contada".
          const contado = {};
          for (const m of Object.values(MONEDAS)) {
            const texto = String(campos[m.codigo] ?? '').trim();
            if (texto === '') continue;
            contado[m.codigo] = aMenores(texto, m.codigo) || 0;
          }
          if (!Object.keys(contado).length) {
            return avisarMal('Escribe al menos una moneda, o cancela.');
          }
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
      if ((r.noContadas || []).includes(m.codigo)) {
        return el('tr', {
          html: `<td>${esc(m.nombre)}</td>
                 <td class="num">${formatear(r.esperado[m.codigo] || 0, m.codigo)}</td>
                 <td class="num" colspan="2" style="color:var(--texto-suave)">no se contó</td>`,
        });
      }
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
      el('h2', { texto: cuadra ? 'Caja cuadrada' : 'Cierre con diferencia' }),
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
