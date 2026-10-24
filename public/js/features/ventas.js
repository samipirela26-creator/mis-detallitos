// ventas.js — LAS VENTAS, UNA POR UNA. La pantalla que faltaba.
//
// Reportes contesta "cuánto vendí" y "a qué le gano poco", que son preguntas de
// totales. Pero la pregunta del día es otra: "¿qué se hizo?". Y esa no la
// contesta ningún promedio — se contesta mirando la venta: a qué hora, quién la
// cobró, qué se llevó el cliente, con qué pagó, dónde quedó esa plata.
//
// Sin esta pantalla no había manera de:
//   - revisar lo que registró el empleado mientras no estabas;
//   - encontrar una venta para ANULARLA (el código estaba escrito en
//     data/ventas.js desde el principio y no lo llamaba nadie, así que una
//     venta mal cobrada se quedaba mal cobrada para siempre);
//   - atender lo que el empleado pidió anular (se guardaba en `anulaciones` y
//     esa colección no la leía ninguna pantalla);
//   - volver a mandar un recibo que el cliente perdió.
//
// Lo que se cobró NO se edita, y es a propósito. Las reglas de Firestore son
// casi de solo-agregar y las cuentas del dueño se rehacen sumando documentos:
// si una venta de ayer pudiera cambiar de monto, el arqueo de ayer dejaría de
// cuadrar y no habría rastro de quién lo movió. Para corregir hay un solo
// camino, el mismo del mostrador: se anula —el inventario y la deuda se
// deshacen con ella— y se vuelve a cobrar bien.

import { registrar } from '../core/router.js';
import { el, esc, $, fecha, diaISO, sumarDias, primerDiaDelMes, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import {
  ventasEntre, ventaPorId, anularVenta, pedirAnulacion,
  anulacionesPendientes, resolverAnulacion,
} from '../data/ventas.js';
import { listarClientes } from '../data/clientes.js';
import { productos as catalogo } from '../data/catalogo.js';
import { formatear, MONEDAS } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { esDueno, puede } from '../core/sesion.js';
import { normalizar } from '../core/texto.js';
import { costoLinea, vueltoDeVenta } from '../reports/analisis.js';

const RANGOS = {
  hoy: { titulo: 'Hoy', desde: () => diaISO(), hasta: () => diaISO() },
  ayer: { titulo: 'Ayer', desde: () => sumarDias(diaISO(), -1), hasta: () => sumarDias(diaISO(), -1) },
  semana: { titulo: '7 días', desde: () => sumarDias(diaISO(), -6), hasta: () => diaISO() },
  mes: { titulo: 'Este mes', desde: () => primerDiaDelMes(), hasta: () => diaISO() },
};

// Al empleado se le llama "Mis ventas" porque es literalmente lo que ve: las
// reglas solo le dejan leer las suyas (y la consulta las filtra por su uid).
// Llamarla "Ventas" le haría creer que está viendo las del negocio.
registrar('ventas', {
  titulo: 'Ventas', icono: 'cart', montar: montarVentas,
});
registrar('mis-ventas', {
  titulo: 'Mis ventas', icono: 'cart', menu: true, soloEmpleado: true, orden: 45,
  montar: montarVentas,
});

async function montarVentas(nodo, params = {}) {
  let rango = RANGOS[params.rango] ? params.rango : 'hoy';
  let dia = null;             // un día exacto elegido en el calendario
  let filtro = '';
  let ventas = [];
  let pedidos = [];           // anulaciones que el empleado pidió
  let clientes = new Map();

  nodo.innerHTML = `
    <div class="chips-barra" id="rangos"></div>
    <div id="cabeza"></div>
    <div id="pedidos"></div>
    <div id="lista"><div class="cargando">Buscando las ventas…</div></div>`;

  // --- barra de rangos + día exacto ---
  const barra = $('#rangos', nodo);
  for (const [clave, r] of Object.entries(RANGOS)) {
    barra.appendChild(el('button.chip', {
      'data-r': clave, type: 'button', 'aria-pressed': 'false', texto: r.titulo,
      onclick: () => { rango = clave; dia = null; marcar(); cargar(); },
    }));
  }
  // El calendario no es un lujo: "¿qué se vendió el día que vino el proveedor?"
  // no se contesta con chips de "hoy" y "7 días".
  const calendario = el('input', {
    type: 'date', max: diaISO(),
    style: 'flex:0 0 auto;width:auto;min-height:var(--toque);padding:0 .6rem;font-size:var(--t-pie)',
    onchange: (ev) => {
      dia = ev.target.value || null;
      if (dia) { marcar(); cargar(); }
    },
  });
  barra.appendChild(calendario);

  const marcar = () => {
    barra.querySelectorAll('.chip').forEach((b) => {
      b.setAttribute('aria-pressed', String(!dia && b.dataset.r === rango));
    });
    if (!dia) calendario.value = '';
  };
  marcar();

  const limites = () => (dia
    ? { desde: dia, hasta: dia }
    : { desde: RANGOS[rango].desde(), hasta: RANGOS[rango].hasta() });

  async function cargar() {
    const caja = $('#lista', nodo);
    caja.innerHTML = '<div class="cargando">Buscando las ventas…</div>';
    const { desde, hasta } = limites();
    try {
      // CON las anuladas: una venta anulada es justo la que hay que poder
      // mirar cuando el día no cuadra.
      ventas = await ventasEntre(desde, hasta, { incluirAnuladas: true });
    } catch (e) {
      caja.innerHTML = '';
      return caja.appendChild(el('div.vacio', { texto: 'No se pudieron cargar las ventas (¿sin internet?).' }));
    }
    // Los nombres de los fiados, solo si hace falta. Son del equipo, así que el
    // empleado también los puede leer.
    if (ventas.some((v) => v.clienteId) && !clientes.size) {
      try {
        clientes = new Map((await listarClientes()).map((c) => [c.id, c.nombre]));
      } catch { /* sin nombres se ve el "fiado" y ya; no es para tanto */ }
    }
    pintar();
    if (esDueno()) cargarPedidos();
  }

  /** Lo que el empleado pidió anular. Si esto no se mira, no sirve de nada. */
  async function cargarPedidos() {
    const caja = $('#pedidos', nodo);
    if (!caja) return;
    try { pedidos = await anulacionesPendientes(); } catch { return; }
    caja.innerHTML = '';
    if (!pedidos.length) return;
    caja.appendChild(el('div.tarjeta.amarilla', { style: 'margin-bottom:1rem' }, [
      el('h2', { texto: pedidos.length === 1 ? 'Te pidieron anular una venta' : `Te pidieron anular ${pedidos.length} ventas` }),
      ...pedidos.map((p) => el('div', {
        style: 'display:flex;gap:.5rem;align-items:center;justify-content:space-between;padding:.45rem 0;border-top:1px solid rgba(0,0,0,.12)',
      }, [
        el('div', { style: 'min-width:0' }, [
          el('div', { style: 'font-weight:600;font-size:var(--t-cuerpo)', html: esc(p.motivo || 'Sin motivo escrito') }),
          el('div', { style: 'font-size:var(--t-pie)', texto: `${p.nombreUsuario || 'alguien'} · ${fecha(p.ts)}` }),
        ]),
        el('button.btn.callado', {
          style: 'flex:0 0 auto;min-height:36px;padding:0 .8rem;font-size:var(--t-pie)',
          texto: 'Ver la venta',
          onclick: async () => {
            const v = ventas.find((x) => x.id === p.ventaId) || await ventaPorId(p.ventaId).catch(() => null);
            if (!v) return avisarMal('Esa venta ya no está.');
            detalle(v, p);
          },
        }),
      ])),
    ]));
  }

  // --- el filtro de la lista -------------------------------------------------
  // Busca por producto, por quién vendió, por el código del recibo y por el
  // nombre del fiado: son las cuatro cosas con las que alguien llega a
  // preguntar ("la venta de los cuadernos", "lo de Yenifer", "el recibo 4F2A1C").
  function coincide(v) {
    if (!filtro) return true;
    const aguja = normalizar(filtro);
    const paja = normalizar([
      ...(v.lineas || []).map((l) => l.nombre),
      v.nombreUsuario,
      v.nota,
      clientes.get(v.clienteId) || '',
      codigo(v),
    ].filter(Boolean).join(' '));
    return paja.includes(aguja);
  }

  function pintar() {
    const caja = $('#lista', nodo);
    const cabeza = $('#cabeza', nodo);
    const visibles = ventas.filter(coincide);

    // Los KPI salen de TODAS las del rango, filtre o no: el día vendió lo que
    // vendió aunque estés buscando una venta sola.
    const vivas = ventas.filter((v) => v.estado !== 'anulada');
    const anuladas = ventas.length - vivas.length;
    const cobradoUSD = vivas.reduce((t, v) => t + ((v.totalUSD || 0) - Math.max(0, v.saldoUSD || 0)), 0);
    const fiadoUSD = vivas.reduce((t, v) => t + Math.max(0, v.saldoUSD || 0), 0);

    cabeza.innerHTML = '';
    pegar(cabeza,
      el('div.kpis', { style: 'margin:.85rem 0' }, [
        kpi('Ventas', String(vivas.length)),
        kpi('Cobrado', formatear(cobradoUSD)),
        ...(fiadoUSD ? [kpi('Quedó fiado', formatear(fiadoUSD), 'acento')] : []),
        ...(anuladas ? [kpi('Anuladas', String(anuladas), 'malo')] : []),
      ]),
      ventas.length > 4 ? el('input#buscar-venta', {
        type: 'search', autocomplete: 'off', value: filtro,
        placeholder: 'Producto, quién vendió, recibo…',
        style: 'margin-bottom:1rem',
        oninput: (ev) => { filtro = ev.target.value; pintar(); },
      }) : null
    );

    caja.innerHTML = '';
    if (!ventas.length) {
      return caja.appendChild(el('div.vacio', {}, [
        el('p', { texto: 'No hay ventas en estos días.' }),
        el('p', {
          style: 'font-size:var(--t-cuerpo)',
          texto: esDueno()
            ? 'Prueba otro rango, o el calendario para un día exacto.'
            : 'Aquí van quedando las ventas que cobres tú.',
        }),
      ]));
    }
    if (!visibles.length) {
      return caja.appendChild(el('div.vacio', { texto: `Ninguna venta coincide con "${filtro}".` }));
    }

    // Agrupadas por día, con el total del día al lado: así se ve de una si el
    // sábado vendió más que el lunes sin tener que ir chip por chip.
    const porDia = new Map();
    for (const v of visibles) {
      const d = v.dia || diaISO(v.ts?.toDate?.() || new Date());
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(v);
    }
    for (const [d, delDia] of porDia) {
      const vivasDelDia = delDia.filter((v) => v.estado !== 'anulada');
      const totalDia = vivasDelDia.reduce((t, v) => t + (v.totalUSD || 0), 0);
      caja.appendChild(el('div.seccion', {}, [
        el('h2', { texto: comoSeDiceElDia(d) }),
        el('span', {
          style: 'font-size:var(--t-pie);color:var(--texto-suave);font-weight:600',
          texto: `${vivasDelDia.length} ${vivasDelDia.length === 1 ? 'venta' : 'ventas'} · ${formatear(totalDia)}`,
        }),
      ]));
      const tarjeta = el('div.tarjeta', { style: 'padding:.35rem' });
      for (const v of delDia) tarjeta.appendChild(fila(v));
      caja.appendChild(tarjeta);
    }

    // `pintar` rehace el campo de búsqueda, así que sin esto se pierde el foco
    // a cada tecla y solo se puede escribir una letra.
    if (filtro) {
      const campo = $('#buscar-venta', nodo);
      if (campo && document.activeElement !== campo) {
        campo.focus();
        campo.setSelectionRange(campo.value.length, campo.value.length);
      }
    }
  }

  /** Una venta en la lista: hora, qué se llevó, cuánto, y qué tiene de raro. */
  function fila(v) {
    const anulada = v.estado === 'anulada';
    const quePaso = (v.lineas || [])
      .map((l) => `${l.cantidad} ${l.nombre}`).join(' · ') || 'Sin productos';

    return el('div', {
      style: 'display:flex;gap:.6rem;align-items:flex-start;padding:.6rem .5rem;'
           + 'border-bottom:1px solid var(--borde);cursor:pointer'
           + (anulada ? ';opacity:.6' : ''),
      onclick: () => detalle(v),
    }, [
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', {
          style: `font-weight:600;font-size:var(--t-cuerpo)${anulada ? ';text-decoration:line-through' : ''}`,
          html: esc(quePaso),
        }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave);margin-top:.1rem' }, [
          el('span', { texto: soloHora(v.ts) }),
          esDueno() ? el('span', { html: ` · ${esc(v.nombreUsuario || '—')}` }) : null,
        ]),
        el('div', { style: 'display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.25rem' }, marcas(v)),
      ]),
      el('div', { style: 'text-align:right;flex:0 0 auto' }, [
        el('div.cifra', {
          style: `font-weight:700${anulada ? ';text-decoration:line-through' : ''}`,
          texto: enSuMoneda(v),
        }),
        v.totalCOP
          ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: formatear(v.totalUSD || 0) })
          : null,
      ]),
    ]);
  }

  /** Las etiquetas de una venta. Solo las que piden mirar algo. */
  function marcas(v) {
    const m = [];
    const eti = (clase, texto) => el(`span.etiqueta.${clase}`, { texto });
    if (v.estado === 'anulada') m.push(eti('mal', 'anulada'));
    if (pedidos.some((p) => p.ventaId === v.id)) m.push(eti('alerta', 'piden anularla'));
    if ((v.saldoUSD || 0) > 0) {
      const quien = clientes.get(v.clienteId);
      m.push(eti('acento', quien ? `fiado · ${quien}` : 'fiado'));
    }
    if ((v.lineas || []).some((l) => l.precioEditado)) m.push(eti('alerta', 'precio cambiado'));
    if (v.ajusteUSD) m.push(eti('alerta', 'total ajustado'));
    if ((v.lineas || []).some((l) => l.fueraDeCatalogo)) m.push(eti('info', 'venta libre'));
    // Dónde quedó la plata solo se dice cuando NO fue en la gaveta: decirlo en
    // todas las ventas normales sería ruido.
    if (v.lugar && v.lugar !== 'Caja') m.push(eti('info', v.lugar.toLowerCase()));
    else if (v.sinTurno) m.push(eti('info', 'sin caja abierta'));
    return m;
  }

  // --- la ficha de la venta --------------------------------------------------
  function detalle(v, pedido = null) {
    const anulada = v.estado === 'anulada';
    const d = abrirDialogo('');
    const vuelto = vueltoDeVenta(v);
    const costos = Object.fromEntries(catalogo().map((p) => [p.id, p.costoUSD || 0]));
    const costoUSD = (v.lineas || []).reduce((t, l) => t + costoLinea(l, costos), 0);
    const gananciaUSD = (v.totalUSD || 0) - costoUSD;
    const estimada = (v.lineas || []).some((l) => !l.costoUSD && l.productoId)
      || (v.lineas || []).some((l) => l.gananciaEstimada);

    pegar(d,
      el('h2', { style: 'margin-bottom:.1rem', texto: `Recibo ${codigo(v)}` }),
      el('p', {
        style: 'margin:0 0 .75rem;color:var(--texto-suave);font-size:var(--t-cuerpo)',
        html: `${esc(fecha(v.ts))}${esDueno() ? ` · la cobró ${esc(v.nombreUsuario || '—')}` : ''}`,
      }),

      anulada ? el('div.tarjeta', {
        style: 'background:var(--rojo-suave);border:1px solid var(--rojo);margin-bottom:1rem',
      }, [
        el('div', { style: 'font-weight:700;color:var(--rojo)', texto: 'Esta venta está anulada' }),
        el('div', { style: 'font-size:var(--t-cuerpo);margin-top:.2rem', html:
          `${esc(v.motivoAnulacion || 'Sin motivo escrito')}<br>`
          + `La anuló ${esc(v.anuladaPor || '—')} · ${esc(fecha(v.anuladaTs))}` }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave);margin-top:.35rem', texto:
          'No cuenta en ningún reporte y el inventario ya la deshizo.' }),
      ]) : null,

      pedido ? el('div.tarjeta.amarilla', { style: 'margin-bottom:1rem' }, [
        el('div', { style: 'font-weight:700', html: `${esc(pedido.nombreUsuario || 'El empleado')} pidió anularla` }),
        el('div', { style: 'font-size:var(--t-cuerpo);margin-top:.2rem', html: esc(pedido.motivo || 'Sin motivo escrito') }),
      ]) : null,

      el('div.cifra-gigante', {
        style: `text-align:center;margin:.25rem 0${anulada ? ';text-decoration:line-through' : ''}`,
        texto: enSuMoneda(v),
      }),
      v.totalCOP ? el('p', {
        style: 'text-align:center;margin:-.4rem 0 0;color:var(--texto-suave)',
        texto: formatear(v.totalUSD || 0),
      }) : null,

      // --- qué se llevó ---
      el('div.seccion', {}, [el('h2', { texto: 'Qué se llevó' })]),
      el('div', {}, (v.lineas || []).map((l) => lineaDeVenta(l, v))),

      v.ajusteUSD ? el('p', {
        style: 'display:flex;justify-content:space-between;gap:.5rem;margin:.6rem 0 0;font-size:var(--t-cuerpo)',
        html: `<span>Se ajustó el total${v.ajustadoPor ? ` · autorizó ${esc(v.ajustadoPor)}` : ''}</span>`
            + `<strong class="cifra" style="color:${v.ajusteUSD < 0 ? 'var(--ambar)' : 'var(--texto)'}">`
            + `${v.ajusteUSD > 0 ? '+' : '−'}${esc(formatear(Math.abs(v.ajusteUSD)))}</strong>`,
      }) : null,

      // --- cómo pagó ---
      el('div.seccion', {}, [el('h2', { texto: 'Cómo pagó' })]),
      el('div', {}, [
        ...(v.pagos || []).map((p) => renglon(
          MONEDAS[p.moneda]?.nombre || p.moneda, formatear(p.monto, p.moneda))),
        ...(!(v.pagos || []).length ? [el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-cuerpo);margin:.2rem 0',
          texto: 'No pagó nada en el momento: quedó todo fiado.',
        })] : []),
        vuelto ? renglon(
          `Vuelto${vuelto.reconstruido ? ' (calculado)' : ''}`,
          `− ${formatear(vuelto.monto, vuelto.moneda)}`, 'var(--texto-suave)') : null,
        (v.saldoUSD || 0) > 0 ? renglon(
          clientes.get(v.clienteId) ? `Quedó debiendo · ${clientes.get(v.clienteId)}` : 'Quedó debiendo',
          formatear(v.saldoUSD), 'var(--rojo)') : null,
      ]),
      el('p', {
        style: 'font-size:var(--t-pie);color:var(--texto-suave);margin:.5rem 0 0',
        texto: v.lugar && v.lugar !== 'Caja'
          ? `Esa plata NO entró a la gaveta: quedó en "${v.lugar}".`
          : v.sinTurno
            ? 'Se cobró sin caja abierta, pero el efectivo entró a la gaveta.'
            : 'El efectivo entró a la gaveta.',
      }),

      v.nota ? el('p', {
        style: 'margin:.75rem 0 0;font-size:var(--t-cuerpo)',
        html: `<strong>Nota:</strong> ${esc(v.nota)}`,
      }) : null,

      // La ganancia es del dueño y de nadie más.
      puede('verGanancias') && !anulada ? el('div.tarjeta', { style: 'margin-top:1rem;padding:.75rem' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:.5rem' }, [
          el('span', { style: 'font-size:var(--t-cuerpo)', texto: estimada ? 'Ganancia (aproximada)' : 'Te dejó de ganancia' }),
          el('strong.cifra', {
            style: `color:${gananciaUSD >= 0 ? 'var(--verde)' : 'var(--rojo)'}`,
            texto: formatear(gananciaUSD),
          }),
        ]),
        estimada ? el('div', {
          style: 'font-size:var(--t-pie);color:var(--texto-suave);margin-top:.25rem',
          texto: 'Alguna línea no guardó su costo (la registró un empleado, o fue una venta libre): se usó el costo que tiene hoy el producto.',
        }) : null,
      ]) : null,

      // --- qué se puede hacer ---
      el('div.fila', { style: 'margin-top:1.25rem' }, [
        el('button.btn.callado', { texto: 'Compartir recibo', onclick: () => compartirRecibo(v) }),
        el('button.btn.callado', { texto: 'Imprimir', onclick: () => imprimirRecibo(v) }),
      ]),
      anulada ? null : el('button.btn.peligro.ancho', {
        style: 'margin-top:.55rem',
        texto: puede('anularVentas') ? 'Anular esta venta' : 'Pedir que la anulen',
        onclick: () => anular(v, pedido, d),
      }),
      el('button.btn.plano.ancho', { style: 'margin-top:.55rem', texto: 'Cerrar', onclick: () => d.close() })
    );
  }

  /** Una línea de la venta, con lo que se le cambió a mano si se le cambió. */
  function lineaDeVenta(l, v) {
    const enPesos = l.precioCOP > 0;
    const total = enPesos
      ? formatear(Math.round(l.cantidad * l.precioCOP), 'COP')
      : formatear(Math.round(l.cantidad * l.precioUSD));
    const unidad = enPesos ? formatear(l.precioCOP, 'COP') : formatear(l.precioUSD);
    const avisos = [];
    if (l.precioEditado) {
      avisos.push(`precio cambiado: era ${formatear(l.precioOriginalUSD)}`
        + (l.autorizadoPor ? ` · autorizó ${esc(l.autorizadoPor)}` : ''));
    }
    if (l.fueraDeCatalogo) avisos.push('venta libre: no salió del catálogo');
    return el('div', {
      style: 'display:flex;justify-content:space-between;gap:.5rem;padding:.45rem 0;'
           + 'border-bottom:1px solid var(--borde);font-size:var(--t-cuerpo)',
    }, [
      el('div', { style: 'min-width:0' }, [
        el('div', { html: `${l.cantidad} × ${esc(l.nombre)}` }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: `${unidad} cada uno` }),
        ...avisos.map((a) => el('div', { style: 'font-size:var(--t-pie);color:var(--ambar)', html: a })),
      ]),
      el('strong.cifra', { texto: total }),
    ]);
  }

  // --- anular ----------------------------------------------------------------
  // Dos caminos distintos y hay que decirlo claro: el dueño la anula y se
  // deshace de verdad; el empleado solo la PIDE, y mientras nadie la atienda la
  // venta sigue contando. Prometerle lo contrario sería mentirle.
  function anular(v, pedido, cuadroDetalle) {
    const soyElDueno = puede('anularVentas');
    const d = abrirDialogo('');
    let motivo = '';
    const campo = el('input', {
      placeholder: 'Por qué se anula', value: '',
      oninput: (ev) => { motivo = ev.target.value; },
    });
    // Los motivos de siempre, en botones: con el cliente enfrente nadie escribe
    // una frase en el teléfono, y un motivo vacío no explica nada después.
    const MOTIVOS = ['El cliente devolvió', 'Se cobró de más', 'Se cobró dos veces', 'Me equivoqué de producto'];

    pegar(d,
      el('h2', { texto: soyElDueno ? 'Anular esta venta' : 'Pedir que la anulen' }),
      el('p', {
        style: 'font-size:var(--t-cuerpo);color:var(--texto-suave)',
        texto: soyElDueno
          ? 'La mercancía vuelve al inventario y, si fue fiada, la deuda se borra. '
            + 'La venta no se borra: queda marcada como anulada, con tu nombre y el motivo.'
          : 'El dueño la tiene que anular. Hasta que lo haga, la venta sigue contando y la mercancía sigue descontada.',
      }),
      el('div.fila', { style: 'margin:.5rem 0' }, MOTIVOS.map((m) => el('button.chip', {
        type: 'button', style: 'flex:0 1 auto', texto: m,
        onclick: () => { motivo = m; campo.value = m; },
      }))),
      el('div.campo', {}, [el('label', { texto: 'Motivo' }), campo]),
      el('div.fila', {}, [
        el('button.btn.callado', { texto: 'Mejor no', onclick: () => d.close() }),
        el('button.btn.peligro', {
          texto: soyElDueno ? 'Anular' : 'Pedirlo',
          onclick: async () => {
            motivo = (motivo || campo.value || '').trim();
            if (!motivo) return avisarMal('Escribe por qué se anula.');
            if (soyElDueno && !await confirmar(`¿Anular ${enSuMoneda(v)}?`, {
              detalle: 'Esto no se puede deshacer. Si la venta era buena, habría que cobrarla otra vez.',
              aceptar: 'Sí, anular', cancelar: 'No', peligro: true,
            })) return;
            try {
              if (soyElDueno) {
                await anularVenta(v.id, motivo, v);
                if (pedido) await resolverAnulacion(pedido.id, 'aprobada').catch(() => {});
                avisarOk('Anulada. La mercancía volvió al inventario.');
              } else {
                await pedirAnulacion(v.id, motivo);
                avisarOk('Pedido enviado. La venta sigue contando hasta que el dueño la anule.');
              }
              d.close();
              cuadroDetalle?.close();
              cargar();
            } catch (e) {
              avisarMal('No se pudo: ' + (e?.message || e));
            }
          },
        }),
      ])
    );
  }

  // --- recibo ----------------------------------------------------------------
  // Se carga a demanda: el recibo arrastra el formateo de monedas y casi nadie
  // reimprime uno, así que no tiene por qué pesar en el arranque.
  async function compartirRecibo(v) {
    const { textoRecibo, compartir } = await import('../reports/recibo.js');
    compartir(textoRecibo({ id: v.id, venta: v, tasas: leer('tasas') || {} }));
  }
  async function imprimirRecibo(v) {
    const { textoRecibo, imprimir } = await import('../reports/recibo.js');
    imprimir(textoRecibo({ id: v.id, venta: v, tasas: leer('tasas') || {} }));
  }

  cargar();
}

// --- cositas -----------------------------------------------------------------

/** El código que lleva el recibo impreso: los últimos 6 del id. */
const codigo = (v) => String(v.id || '').slice(-6).toUpperCase();

/** El total en la moneda en que se cobró, que es la que la gente reconoce. */
const enSuMoneda = (v) => (v.totalCOP ? formatear(v.totalCOP, 'COP') : formatear(v.totalUSD || 0));

function soloHora(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return 'sin hora';
  return d.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });
}

/** "Hoy", "Ayer" o "martes 21 de octubre". */
function comoSeDiceElDia(iso) {
  if (iso === diaISO()) return 'Hoy';
  if (iso === sumarDias(diaISO(), -1)) return 'Ayer';
  const d = new Date(`${iso}T12:00:00`);
  const texto = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function renglon(izq, der, color = '') {
  return el('div', {
    style: 'display:flex;justify-content:space-between;gap:.5rem;padding:.35rem 0;font-size:var(--t-cuerpo)',
  }, [
    el('span', { html: esc(izq) }),
    el('strong.cifra', { style: color ? `color:${color}` : '', texto: der }),
  ]);
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { texto: valor }),
  ]);
}

export { montarVentas };
