// mi-dinero.js — las preguntas del dueño sobre la plata: cuánta hay y dónde
// está, cuánto gané, y sacar o meter dinero dejando escrito por qué.
//
// Dos cuentas distintas y a propósito separadas en la pantalla:
//
//  1. DINERO EN EL NEGOCIO: plata contante, histórica, repartida por sitio
//     (la gaveta y la caja fuerte). Lo fiado no cuenta: todavía no está.
//  2. CUÁNTO GANÉ: la ganancia del período, que es otra cosa. Se puede haber
//     ganado bien y tener poca plata en mano porque está en la calle.
//
// Solo el dueño: de aquí se deduce la ganancia y el empleado no la ve.

import { registrar } from '../core/router.js';
import { el, esc, $, $$, fecha, diaISO, sumarDias, primerDiaDelMes } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { CATEGORIAS as CAT_RETIRO, registrarRetiro, retirosEntre, borrarRetiro } from '../data/retiros.js';
import { CATEGORIAS as CAT_INGRESO, registrarIngreso, ingresosEntre, borrarIngreso } from '../data/ingresos.js';
import { registrarTraslado, trasladosEntre, borrarTraslado } from '../data/traslados.js';
import { ventasEntre } from '../data/ventas.js';
import { gastosEntre } from '../data/gastos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { MONEDAS, LUGARES, aMenores, aUSD, formatear } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { resumen, resumenRetiros, disponible, dineroPorLugar } from '../reports/analisis.js';
import { icono } from '../ui/iconos.js';

// La caja no se reinicia cada mes: para saber cuánta plata hay hay que sumar
// desde el principio. Esta fecha es anterior al negocio, así que lo abarca todo.
const INICIO = '2020-01-01';

const RANGOS = {
  mes: { titulo: 'Este mes', desde: () => primerDiaDelMes(), hasta: () => diaISO() },
  mes30: { titulo: '30 días', desde: () => sumarDias(diaISO(), -29), hasta: () => diaISO() },
  ano: { titulo: 'Este año', desde: () => `${diaISO().slice(0, 4)}-01-01`, hasta: () => diaISO() },
  todo: { titulo: 'Todo', desde: () => INICIO, hasta: () => diaISO() },
};

const opciones = (lista) => lista.map((x) => `<option>${esc(x)}</option>`).join('');
const opcionesMoneda = () => Object.values(MONEDAS)
  .map((m) => `<option value="${m.codigo}">${esc(m.nombre)}</option>`).join('');

registrar('mi-dinero', {
  titulo: 'Mi dinero', icono: 'wallet', soloDueno: true, orden: 48,
  montar: montarMiDinero,
});

async function montarMiDinero(nodo) {
  let rango = 'mes';

  nodo.innerHTML = `
    <div id="caja"><div class="cargando">Contando la plata…</div></div>

    <div class="seccion"><h2>Movimientos de dinero</h2></div>
    <div class="fila" id="pestanas" style="margin-bottom:.6rem"></div>

    <div class="tarjeta" data-form="contar">
      <form id="f-contar">
        <p style="color:var(--texto-suave);font-size:.9rem;margin-top:0">
          Contaste la plata y la vas a cargar. Escribe cuánto hay de cada moneda
          en un sitio; lo que esté en cero se ignora. Cada moneda queda anotada
          aparte, con la tasa de hoy.
        </p>
        <div class="campo"><label>¿Dónde está ese dinero?</label>
          <select name="lugar">${opciones(LUGARES)}</select></div>
        <div id="contar-monedas"></div>
        <div id="contar-total" style="font-weight:700;margin:.2rem 0 .9rem"></div>
        <div class="campo"><label>¿Qué es ese dinero?</label>
          <input name="porque" required value="Conteo de la plata que hay"></div>
        <button class="btn principal ancho" type="submit">Cargar lo que conté</button>
      </form>
    </div>

    <div class="tarjeta" data-form="meter">
      <form id="f-meter">
        <div class="campo"><label>¿Qué dinero es?</label>
          <select name="categoria">${opciones(CAT_INGRESO)}</select></div>
        <div class="campo"><label>¿Dónde lo vas a guardar?</label>
          <select name="lugar">${opciones(LUGARES)}</select></div>
        <div class="fila">
          <div class="campo"><label>Moneda</label>
            <select name="moneda">${opcionesMoneda()}</select></div>
          <div class="campo" style="flex:2"><label>Monto</label>
            <input name="monto" inputmode="decimal" required placeholder="0,00"></div>
        </div>
        <div class="campo"><label>¿De dónde sale?</label>
          <input name="porque" required placeholder="Dinero con el que arranca el negocio"></div>
        <div class="campo"><label>¿Para qué? <span style="color:var(--texto-suave);font-weight:400">(opcional)</span></label>
          <input name="paraQue" placeholder="Comprar la primera mercancía"></div>
        <button class="btn principal ancho" type="submit">Meter el dinero</button>
      </form>
    </div>

    <div class="tarjeta" data-form="sacar" style="display:none">
      <form id="f-sacar">
        <div class="campo"><label>¿Para qué categoría?</label>
          <select name="categoria">${opciones(CAT_RETIRO)}</select></div>
        <div class="campo"><label>¿De dónde lo sacas?</label>
          <select name="lugar">${opciones(LUGARES)}</select></div>
        <div class="fila">
          <div class="campo"><label>Moneda</label>
            <select name="moneda">${opcionesMoneda()}</select></div>
          <div class="campo" style="flex:2"><label>Monto</label>
            <input name="monto" inputmode="decimal" required placeholder="0,00"></div>
        </div>
        <div class="campo"><label>¿Por qué?</label>
          <input name="porque" required placeholder="Quincena de Yoli"></div>
        <div class="campo"><label>¿Para qué? <span style="color:var(--texto-suave);font-weight:400">(opcional)</span></label>
          <input name="paraQue" placeholder="Su pago del 1 al 15"></div>
        <button class="btn principal ancho" type="submit">Registrar el retiro</button>
      </form>
    </div>

    <div class="tarjeta" data-form="mover" style="display:none">
      <form id="f-mover">
        <p style="font-size:.9rem;color:var(--texto-suave);margin-top:0">
          El dinero no sale del negocio: solo cambia de sitio. El total no se mueve.</p>
        <div class="fila">
          <div class="campo"><label>De</label>
            <select name="desde">${opciones(LUGARES)}</select></div>
          <div class="campo"><label>A</label>
            <select name="hacia">${opciones([...LUGARES].reverse())}</select></div>
        </div>
        <div class="fila">
          <div class="campo"><label>Moneda</label>
            <select name="moneda">${opcionesMoneda()}</select></div>
          <div class="campo" style="flex:2"><label>Monto</label>
            <input name="monto" inputmode="decimal" required placeholder="0,00"></div>
        </div>
        <div class="campo"><label>Nota <span style="color:var(--texto-suave);font-weight:400">(opcional)</span></label>
          <input name="porque" placeholder="Lo del fin de semana, a guardar"></div>
        <button class="btn principal ancho" type="submit">Mover el dinero</button>
      </form>
    </div>

    <div class="seccion"><h2>Cuánto gané</h2></div>
    <div class="fila" id="rangos" style="margin-bottom:1rem"></div>
    <div id="cuentas"><div class="cargando">Sacando las cuentas…</div></div>

    <div class="seccion"><h2>Lo que entró y salió</h2></div>
    <div id="lista"><div class="cargando">Cargando…</div></div>`;

  // --- pestañas de los tres formularios ---
  const pestanas = $('#pestanas', nodo);
  const FORMS = [['contar', 'Conté mi dinero'], ['meter', 'Meter'], ['sacar', 'Sacar'], ['mover', 'Mover de sitio']];
  let formActivo = 'contar';
  const marcarForm = () => {
    $$('[data-form]', nodo).forEach((c) => { c.style.display = c.dataset.form === formActivo ? '' : 'none'; });
    $$('button', pestanas).forEach((b) => {
      const activo = b.dataset.f === formActivo;
      b.classList.toggle('principal', activo);
      b.classList.toggle('plano', !activo);
    });
  };
  for (const [clave, titulo] of FORMS) {
    pestanas.appendChild(el('button.btn.plano', {
      'data-f': clave, style: 'min-height:40px;font-size:.9rem', texto: titulo,
      onclick: () => { formActivo = clave; marcarForm(); },
    }));
  }
  marcarForm();

  // --- rangos de la ganancia ---
  const barraRangos = $('#rangos', nodo);
  for (const [clave, r] of Object.entries(RANGOS)) {
    barraRangos.appendChild(el('button.btn.plano', {
      'data-r': clave, style: 'min-height:40px;font-size:.9rem', texto: r.titulo,
      onclick: () => { rango = clave; marcarRango(); cargar(); },
    }));
  }
  const marcarRango = () => {
    $$('button', barraRangos).forEach((b) => {
      const activo = b.dataset.r === rango;
      b.classList.toggle('principal', activo);
      b.classList.toggle('plano', !activo);
    });
  };
  marcarRango();

  // --- conteo de las tres monedas de una vez ---------------------------------
  //
  // El formulario de "Meter" toma una moneda por vez, y quien acaba de contar
  // toda su plata tiene tres montones delante: dólares, bolívares y pesos.
  // Hacerlo en tres pasadas invita a olvidar uno.
  const fContar = $('#f-contar', nodo);
  const cajaMonedas = $('#contar-monedas', fContar);
  for (const m of Object.values(MONEDAS)) {
    cajaMonedas.appendChild(el('div.campo', {}, [
      el('label', { for: `contar-${m.codigo}`, texto: `${m.nombre} (${m.simbolo})` }),
      el('input', { id: `contar-${m.codigo}`, 'data-moneda': m.codigo, inputmode: 'decimal', placeholder: '0' }),
    ]));
  }

  /** Lo contado, moneda por moneda, con la tasa del día. */
  function loContado() {
    const tasas = leer('tasas') || {};
    const partes = [];
    const sinTasa = [];
    for (const campo of $$('[data-moneda]', cajaMonedas)) {
      const moneda = campo.dataset.moneda;
      const monto = aMenores(campo.value, moneda);
      if (!monto || monto <= 0) continue;
      if (moneda !== 'USD' && !tasas[moneda]) { sinTasa.push(MONEDAS[moneda].nombre); continue; }
      const tasa = moneda === 'USD' ? 100 : tasas[moneda];
      partes.push({ moneda, monto, tasa, montoUSD: aUSD(monto, moneda, moneda === 'USD' ? null : tasa) });
    }
    return { partes, sinTasa };
  }

  const pintarTotalContado = () => {
    const { partes, sinTasa } = loContado();
    const caja = $('#contar-total', fContar);
    const total = partes.reduce((t, x) => t + x.montoUSD, 0);
    caja.style.color = sinTasa.length ? 'var(--ambar)' : 'var(--texto)';
    caja.textContent = sinTasa.length
      ? `Falta la tasa de hoy para ${sinTasa.join(' y ')}: ese monto no se puede cargar todavía.`
      : total ? `En total son ${formatear(total)}` : '';
  };
  cajaMonedas.addEventListener('input', pintarTotalContado);

  fContar.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { partes, sinTasa } = loContado();
    if (sinTasa.length) return avisarMal(`Falta la tasa de hoy para ${sinTasa.join(' y ')}.`);
    if (!partes.length) return avisarMal('Escribe cuánto hay de al menos una moneda.');

    const total = partes.reduce((t, x) => t + x.montoUSD, 0);
    const detalle = partes.map((x) => formatear(x.monto, x.moneda)).join(' + ');
    // Cargar dos veces el mismo conteo duplica la plata del negocio, y eso no
    // se ve a simple vista: por eso se confirma con el detalle delante.
    const seguro = await confirmar(`¿Cargar ${formatear(total)}?`, {
      detalle: `${detalle}, en ${fContar.lugar.value}. Si ya habías cargado este mismo dinero antes, se sumaría dos veces.`,
      aceptar: 'Sí, cargarlo',
    });
    if (!seguro) return;

    try {
      for (const parte of partes) {
        await registrarIngreso({
          ...parte,
          categoria: 'Dinero inicial',
          lugar: fContar.lugar.value,
          porque: fContar.porque.value,
        });
      }
      for (const campo of $$('[data-moneda]', cajaMonedas)) campo.value = '';
      pintarTotalContado();
      avisarOk(`Cargado: ${formatear(total)}`);
      cargar();
    } catch (e) {
      avisarMal('No se pudo guardar: ' + (e.message || e));
    }
  });

  /** Lee moneda y monto de un formulario y los deja en centavos de dólar. */
  function plataDelForm(f) {
    const moneda = f.moneda.value;
    const monto = aMenores(f.monto.value, moneda);
    if (!monto || monto <= 0) { avisarMal('Escribe el monto.'); return null; }
    const tasas = leer('tasas') || {};
    if (moneda !== 'USD' && !tasas[moneda]) {
      avisarMal(`Falta la tasa de hoy para ${MONEDAS[moneda].nombre}.`);
      return null;
    }
    const tasa = moneda === 'USD' ? 100 : tasas[moneda];
    return { moneda, monto, tasa, montoUSD: aUSD(monto, moneda, moneda === 'USD' ? null : tasa) };
  }

  function alGuardar(f, guardar, exito) {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const plata = plataDelForm(f);
      if (!plata) return;
      try {
        await guardar(plata);
        f.reset();
        avisarOk(exito);
        cargar();
      } catch (e) {
        avisarMal('No se pudo guardar: ' + (e.message || e));
      }
    });
  }

  const fMeter = $('#f-meter', nodo);
  alGuardar(fMeter, (plata) => registrarIngreso({
    ...plata, categoria: fMeter.categoria.value, lugar: fMeter.lugar.value,
    porque: fMeter.porque.value, paraQue: fMeter.paraQue.value,
  }), 'Dinero registrado');

  const fSacar = $('#f-sacar', nodo);
  alGuardar(fSacar, (plata) => registrarRetiro({
    ...plata, categoria: fSacar.categoria.value, lugar: fSacar.lugar.value,
    porque: fSacar.porque.value, paraQue: fSacar.paraQue.value,
  }), 'Retiro registrado');

  const fMover = $('#f-mover', nodo);
  alGuardar(fMover, (plata) => registrarTraslado({
    ...plata, desde: fMover.desde.value, hacia: fMover.hacia.value, porque: fMover.porque.value,
  }), 'Dinero movido');

  async function cargar() {
    const cajaNodo = $('#caja', nodo);
    const cuentas = $('#cuentas', nodo);
    const lista = $('#lista', nodo);
    cuentas.innerHTML = '<div class="cargando">Sacando las cuentas…</div>';
    lista.innerHTML = '<div class="cargando">Cargando…</div>';

    const desde = RANGOS[rango].desde();
    const hasta = RANGOS[rango].hasta();
    const hoy = diaISO();

    let todo, delPeriodo;
    try {
      // La plata que hay es histórica; la ganancia, del período elegido.
      [todo, delPeriodo] = await Promise.all([
        Promise.all([
          ingresosEntre(INICIO, hoy), retirosEntre(INICIO, hoy), trasladosEntre(INICIO, hoy),
          ventasEntre(INICIO, hoy), gastosEntre(INICIO, hoy),
        ]),
        Promise.all([
          ventasEntre(desde, hasta), gastosEntre(desde, hasta),
          retirosEntre(desde, hasta), ingresosEntre(desde, hasta), trasladosEntre(desde, hasta),
        ]),
      ]);
    } catch (e) {
      cajaNodo.innerHTML = '';
      cuentas.innerHTML = '';
      lista.innerHTML = '';
      cajaNodo.appendChild(el('div.vacio', { texto: 'No se pudieron cargar las cuentas (¿sin internet?).' }));
      return;
    }

    const [ingTodo, retTodo, traTodo, venTodo, gasTodo] = todo;
    const [ventas, gastos, retiros, ingresos, traslados] = delPeriodo;

    // --- cuánta plata hay y dónde ---
    const caja = dineroPorLugar({
      ingresos: ingTodo, retiros: retTodo, traslados: traTodo, ventas: venTodo, gastos: gasTodo,
    });
    cajaNodo.innerHTML = '';
    cajaNodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Dinero en el negocio' })]));
    cajaNodo.appendChild(el('div.kpis', {}, [
      kpi('HAY EN TOTAL', formatear(caja.totalUSD), caja.totalUSD >= 0 ? 'bueno' : 'malo'),
      ...caja.porLugar.map((l) => kpi(l.lugar, formatear(l.montoUSD), l.montoUSD < 0 ? 'malo' : '')),
    ]));
    const porCobrar = venTodo.reduce((t, v) => t + Math.max(0, v.saldoUSD || 0), 0);
    cajaNodo.appendChild(el('p', {
      style: 'color:var(--texto-suave);font-size:.82rem;margin-top:.75rem',
      texto: porCobrar
        ? `Esto es plata en mano. Aparte hay ${formatear(porCobrar)} fiados, que todavía no están aquí.`
        : 'Esto es plata en mano: lo que entró menos lo que salió. Lo fiado no cuenta hasta que se cobre.',
    }));

    // --- cuánto gané en el período ---
    // El empleado no guarda costos en sus ventas: se completan con el costo
    // que tiene hoy el producto, igual que en Reportes.
    const costos = Object.fromEntries(catalogo().map((p) => [p.id, p.costoUSD || 0]));
    const r = resumen(ventas, gastos, costos);
    const rr = resumenRetiros(retiros);
    const queda = disponible(r, retiros);

    cuentas.innerHTML = '';
    cuentas.appendChild(el('div.kpis', {}, [
      kpi('Vendido', formatear(r.vendidoUSD)),
      kpi('Gastos del negocio', formatear(r.gastosUSD), r.gastosUSD ? 'malo' : ''),
      kpi('GANÉ (neto)', formatear(r.gananciaNetaUSD), r.gananciaNetaUSD >= 0 ? 'bueno' : 'malo'),
    ]));
    cuentas.appendChild(el('div.kpis', { style: 'margin-top:.85rem' }, [
      kpi('Saqué', formatear(rr.totalUSD), rr.totalUSD ? 'acento' : ''),
      kpi('ME QUEDA DE LA GANANCIA', formatear(queda), queda >= 0 ? 'bueno' : 'malo'),
    ]));
    if (queda < 0) {
      cuentas.appendChild(el('div.tarjeta.amarilla', { style: 'margin-top:.85rem' }, [
        el('p', { style: 'font-size:.92rem;margin:0', texto: 'Sacaste más de lo que ganó el negocio en este período: esa diferencia sale del dinero que ya había.' }),
      ]));
    }
    if (rr.porCategoria.length) {
      const porCat = el('div.tarjeta', { style: 'padding:.5rem;margin-top:.85rem' });
      for (const c of rr.porCategoria) {
        porCat.appendChild(el('div', {
          style: 'display:flex;justify-content:space-between;align-items:center;padding:.5rem;border-bottom:1px solid var(--borde)',
        }, [
          el('div', {}, [
            el('div', { style: 'font-weight:600', html: esc(c.categoria) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', texto: `${c.cantidad} ${c.cantidad === 1 ? 'retiro' : 'retiros'}` }),
          ]),
          el('div.cifra', { style: 'font-weight:700', texto: formatear(c.totalUSD) }),
        ]));
      }
      cuentas.appendChild(porCat);
    }

    // --- movimientos del período, todos revueltos y en orden ---
    const movimientos = [
      ...ingresos.map((x) => ({ ...x, tipo: 'ingreso' })),
      ...retiros.map((x) => ({ ...x, tipo: 'retiro' })),
      ...traslados.map((x) => ({ ...x, tipo: 'traslado' })),
    ].sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));

    lista.innerHTML = '';
    if (!movimientos.length) {
      lista.appendChild(el('div.vacio', { texto: 'No hubo movimientos de dinero en este período.' }));
      return;
    }

    const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
    for (const m of movimientos) {
      const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'retiro' ? '−' : '';
      const color = m.tipo === 'ingreso' ? 'var(--verde)' : m.tipo === 'retiro' ? 'var(--rojo)' : 'var(--texto-suave)';
      const titulo = m.tipo === 'traslado' ? `${m.desde} → ${m.hacia}` : m.categoria;
      const sitio = m.tipo === 'traslado' ? 'Cambió de sitio' : `en ${m.lugar || 'Caja'}`;
      tarjeta.appendChild(el('div', {
        style: 'display:flex;gap:.6rem;align-items:center;padding:.55rem;border-bottom:1px solid var(--borde)',
      }, [
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'font-weight:600', html: esc(titulo) }),
          m.porque ? el('div', { style: 'font-size:.88rem', html: esc(m.porque) }) : null,
          el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: `${fecha(m.ts)} · ${esc(sitio)}${m.paraQue ? ' · ' + esc(m.paraQue) : ''}` }),
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div.cifra', { style: `font-weight:700;color:${color}`, texto: `${signo}${formatear(m.montoUSD)}` }),
          m.moneda !== 'USD' ? el('div', { style: 'font-size:.78rem;color:var(--texto-suave)', texto: formatear(m.monto, m.moneda) }) : null,
        ]),
        el('button.btn.plano', {
          style: 'min-height:34px;padding:0 .5rem', html: icono('trash'), 'aria-label': 'Borrar movimiento',
          onclick: async () => {
            if (!await confirmar('¿Borrar este movimiento?', { detalle: 'Las cuentas de la plata se recalculan.', peligro: true, aceptar: 'Borrar' })) return;
            const borrar = { ingreso: borrarIngreso, retiro: borrarRetiro, traslado: borrarTraslado }[m.tipo];
            await borrar(m.id);
            cargar();
          },
        }),
      ]));
    }
    lista.appendChild(tarjeta);
  }

  cargar();
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { texto: valor }),
  ]);
}

export { montarMiDinero };
