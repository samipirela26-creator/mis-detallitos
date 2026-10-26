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
import { abonosEntre } from '../data/clientes.js';
import { gastosEntre } from '../data/gastos.js';
import { pasadas, CACHE } from '../data/lectura.js';
import { productos as catalogo } from '../data/catalogo.js';
import { MONEDAS, LUGARES, LUGAR_VENTAS, LUGAR_AFUERA, aMenores, aUSD, formatear } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { resumen, resumenRetiros, disponible, dineroPorLugar, efectivoPorLugar } from '../reports/analisis.js';
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
        <p style="color:var(--texto-suave);font-size:var(--t-cuerpo);margin-top:0">
          Cuenta los billetes y escribe cuánto hay DE VERDAD en cada moneda. La app
          te dice cuánto debería haber y anota <strong>solo la diferencia</strong>,
          con su explicación. Así cuadrar no borra ni duplica nada.
        </p>
        <div class="campo"><label>¿Dónde contaste?</label>
          <select name="lugar">${opciones(LUGARES)}</select></div>
        <div id="contar-monedas"></div>
        <div id="contar-total" style="font-weight:700;margin:.2rem 0 .9rem"></div>
        <div class="campo"><label>¿Qué pasó? (queda escrito en el ajuste)</label>
          <input name="porque" required value="Cuadre: conté la plata que hay"></div>
        <button class="btn principal ancho" type="submit">Cuadrar con lo que conté</button>
        <p style="color:var(--texto-suave);font-size:var(--t-pie);margin-bottom:0">
          La moneda que dejes en blanco no se toca. Escribir 0 sí significa
          "no hay nada de eso".
        </p>
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
        <p style="font-size:var(--t-cuerpo);color:var(--texto-suave);margin-top:0">
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
  const FORMS = [['contar', 'Cuadrar lo contado'], ['meter', 'Meter'], ['sacar', 'Sacar'], ['mover', 'Mover de sitio']];
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
      'data-f': clave, style: 'min-height:40px;font-size:var(--t-cuerpo)', texto: titulo,
      onclick: () => { formActivo = clave; marcarForm(); },
    }));
  }
  marcarForm();

  // --- rangos de la ganancia ---
  const barraRangos = $('#rangos', nodo);
  for (const [clave, r] of Object.entries(RANGOS)) {
    barraRangos.appendChild(el('button.btn.plano', {
      'data-r': clave, style: 'min-height:40px;font-size:var(--t-cuerpo)', texto: r.titulo,
      onclick: () => { rango = clave; marcarRango(); pasadas(cargar); },
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
      // Lo que la app cree que hay, debajo del campo: sin este número el dueño
      // no tiene contra qué comparar y vuelve a cargar el conteo completo.
      el('small', { id: `esperado-${m.codigo}`, style: 'color:var(--texto-suave)' }),
    ]));
  }

  // Lo que debería haber en el sitio elegido, moneda por moneda. Lo llena
  // `cargar()` con el histórico completo.
  let efectivo = {};
  const esperadoDe = (moneda) => (efectivo[fContar.lugar.value] || {})[moneda] || 0;

  function pintarEsperado() {
    for (const m of Object.values(MONEDAS)) {
      const nota = $(`#esperado-${m.codigo}`, cajaMonedas);
      if (!nota) continue;
      nota.textContent = `Debería haber ${formatear(esperadoDe(m.codigo), m.codigo)}`;
    }
    pintarTotalContado();
  }
  fContar.lugar.addEventListener('change', pintarEsperado);

  /**
   * Lo contado contra lo esperado, moneda por moneda.
   *
   * Un campo en blanco NO es un cero: es "esa moneda no la conté", y se deja
   * quieta. Escribir 0 sí dice que no hay nada. Confundir las dos cosas es lo
   * que hacía aparecer faltantes del tamaño de todos los bolívares del mes.
   */
  function loContado() {
    const tasas = leer('tasas') || {};
    const partes = [];
    const sinTasa = [];
    for (const campo of $$('[data-moneda]', cajaMonedas)) {
      const moneda = campo.dataset.moneda;
      const contado = aMenores(campo.value, moneda);
      if (contado === null) continue;                 // no la contó
      if (moneda !== 'USD' && !tasas[moneda]) { sinTasa.push(MONEDAS[moneda].nombre); continue; }
      const tasa = moneda === 'USD' ? 100 : tasas[moneda];
      const esperado = esperadoDe(moneda);
      const diferencia = contado - esperado;
      partes.push({
        moneda, tasa, contado, esperado, diferencia,
        monto: Math.abs(diferencia),
        montoUSD: Math.abs(aUSD(Math.abs(diferencia), moneda, moneda === 'USD' ? null : tasa)),
      });
    }
    return { partes, sinTasa };
  }

  const pintarTotalContado = () => {
    const { partes, sinTasa } = loContado();
    const caja = $('#contar-total', fContar);
    caja.innerHTML = '';
    if (sinTasa.length) {
      caja.style.color = 'var(--ambar)';
      caja.textContent = `Falta la tasa de hoy para ${sinTasa.join(' y ')}: eso no se puede cuadrar todavía.`;
      return;
    }
    const descuadres = partes.filter((x) => x.diferencia !== 0);
    caja.style.color = '';
    if (!partes.length) return;
    if (!descuadres.length) {
      caja.style.color = 'var(--verde)';
      caja.textContent = 'Cuadra exacto. No hay nada que ajustar.';
      return;
    }
    for (const x of descuadres) {
      caja.appendChild(el('div', {
        style: `font-weight:600;color:${x.diferencia > 0 ? 'var(--verde)' : 'var(--rojo)'}`,
        texto: `${MONEDAS[x.moneda].nombre}: ${x.diferencia > 0 ? 'sobran' : 'faltan'} `
             + `${formatear(x.monto, x.moneda)} (contaste ${formatear(x.contado, x.moneda)}, `
             + `debería haber ${formatear(x.esperado, x.moneda)})`,
      }));
    }
  };
  cajaMonedas.addEventListener('input', pintarTotalContado);

  fContar.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { partes, sinTasa } = loContado();
    if (sinTasa.length) return avisarMal(`Falta la tasa de hoy para ${sinTasa.join(' y ')}.`);
    if (!partes.length) return avisarMal('Escribe cuánto hay de al menos una moneda.');

    const descuadres = partes.filter((x) => x.diferencia !== 0);
    if (!descuadres.length) return avisarOk('Ya cuadraba: no hay nada que ajustar.');

    const lugar = fContar.lugar.value;
    const detalle = descuadres
      .map((x) => `${MONEDAS[x.moneda].nombre}: ${x.diferencia > 0 ? '+' : '−'}${formatear(x.monto, x.moneda)}`)
      .join('   ·   ');
    // Se confirma con el detalle delante porque esto SÍ mueve la plata del
    // negocio: un sobrante entra y un faltante sale, y queda escrito para
    // siempre con el motivo que se escriba arriba.
    const seguro = await confirmar(`¿Anotar el ajuste en ${lugar}?`, {
      detalle: `${detalle}. Solo se anota la diferencia, no el conteo completo. `
             + 'Queda como "Ajuste de conteo" en los movimientos, con tu explicación.',
      aceptar: 'Sí, cuadrar',
    });
    if (!seguro) return;

    try {
      for (const x of descuadres) {
        const comun = {
          moneda: x.moneda, monto: x.monto, tasa: x.tasa, montoUSD: x.montoUSD,
          categoria: 'Ajuste de conteo',
          lugar,
          porque: fContar.porque.value,
          paraQue: `Conté ${formatear(x.contado, x.moneda)} y la app esperaba `
                 + `${formatear(x.esperado, x.moneda)}`,
        };
        if (x.diferencia > 0) await registrarIngreso(comun);
        else await registrarRetiro(comun);
      }
      for (const campo of $$('[data-moneda]', cajaMonedas)) campo.value = '';
      avisarOk('Ajuste anotado: la cuenta quedó igual a lo que contaste.');
      pasadas(cargar);
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
        pasadas(cargar);
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

  /**
   * `fuente` la pone `pasadas` (ver data/lectura.js): las cuentas salen al
   * instante con lo que ya está en el teléfono y se rehacen cuando contesta el
   * servidor. Son seis consultas: esperarlas todas era lo que hacía que tocar
   * un rango se sintiera trancado.
   */
  async function cargar(fuente) {
    const cajaNodo = $('#caja', nodo);
    const cuentas = $('#cuentas', nodo);
    const lista = $('#lista', nodo);
    if (fuente !== CACHE) {
      cuentas.innerHTML = '<div class="cargando">Sacando las cuentas…</div>';
      lista.innerHTML = '<div class="cargando">Cargando…</div>';
    }

    const desde = RANGOS[rango].desde();
    const hasta = RANGOS[rango].hasta();
    const hoy = diaISO();

    let todo, delPeriodo;
    try {
      // La plata que hay es histórica; la ganancia, del período elegido.
      [todo, delPeriodo] = await Promise.all([
        Promise.all([
          ingresosEntre(INICIO, hoy, { fuente }), retirosEntre(INICIO, hoy, { fuente }),
          trasladosEntre(INICIO, hoy, { fuente }),
          ventasEntre(INICIO, hoy, { fuente }), gastosEntre(INICIO, hoy, { fuente }),
          // Los fiados cobrados son plata que entró: sin ellos el total del
          // negocio salía por debajo de lo que de verdad había en la gaveta.
          abonosEntre(INICIO, hoy, { fuente }).catch(() => []),
        ]),
        Promise.all([
          ventasEntre(desde, hasta, { fuente }), gastosEntre(desde, hasta, { fuente }),
          retirosEntre(desde, hasta, { fuente }), ingresosEntre(desde, hasta, { fuente }),
          trasladosEntre(desde, hasta, { fuente }),
        ]),
      ]);
    } catch (e) {
      if (fuente === CACHE) return false;   // la caché no sabe: que conteste el servidor
      cajaNodo.innerHTML = '';
      cuentas.innerHTML = '';
      lista.innerHTML = '';
      cajaNodo.appendChild(el('div.vacio', { texto: 'No se pudieron cargar las cuentas (¿sin internet?).' }));
      return;
    }
    // Una caché sin NADA del negocio entero no es un negocio en cero: es que
    // no sabe. Mejor el "Sacando las cuentas…" que un cero que asusta.
    if (fuente === CACHE && !todo.some((x) => x.length)) return false;

    const [ingTodo, retTodo, traTodo, venTodo, gasTodo, aboTodo] = todo;
    const [ventas, gastos, retiros, ingresos, traslados] = delPeriodo;

    // --- cuánta plata hay y dónde ---
    // Lo que debería haber en billetes, para el cuadre de arriba.
    efectivo = efectivoPorLugar({
      ingresos: ingTodo, retiros: retTodo, traslados: traTodo, ventas: venTodo, gastos: gasTodo,
      abonos: aboTodo,
    });
    pintarEsperado();

    const caja = dineroPorLugar({
      ingresos: ingTodo, retiros: retTodo, traslados: traTodo, ventas: venTodo, gastos: gasTodo,
      abonos: aboTodo,
    });
    cajaNodo.innerHTML = '';
    cajaNodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Dinero en el negocio' })]));
    cajaNodo.appendChild(el('div.kpis', {}, [
      kpi('HAY EN TOTAL', formatear(caja.totalUSD), caja.totalUSD >= 0 ? 'bueno' : 'malo'),
      ...caja.porLugar.map((l) => kpi(l.lugar, formatear(l.montoUSD), l.montoUSD < 0 ? 'malo' : '')),
    ]));
    // La plata de las ventas de la calle: existe, está en el bolsillo, y si no
    // se entrega se queda ahí hasta que nadie se acuerde. El botón lleva al
    // traslado ya apuntado, porque el trabajo es entregarla, no buscar la
    // pantalla.
    const conmigo = (efectivo[LUGAR_AFUERA] || {});
    const algoConmigo = Object.values(conmigo).some((x) => x > 0);
    if (algoConmigo) {
      const linea = Object.entries(conmigo)
        .filter(([, monto]) => monto > 0)
        .map(([moneda, monto]) => formatear(monto, moneda)).join('  ·  ');
      cajaNodo.appendChild(el('div.tarjeta', {
        style: 'background:var(--ambar-suave);border:1px solid var(--ambar);margin-top:.75rem',
      }, [
        el('strong', { texto: 'Andas cargando plata de ventas con la caja cerrada' }),
        el('div', { style: 'font-weight:700;margin:.3rem 0 .5rem', texto: linea }),
        el('div', {
          style: 'font-size:var(--t-pie);color:var(--texto-suave);margin-bottom:.6rem',
          texto: 'Mientras esté aquí no se le pide a ningún arqueo. Pásala a la caja o a la '
               + 'caja fuerte cuando la entregues, y las cuentas quedan en su sitio.',
        }),
        el('button.btn.principal', {
          texto: 'Pasarla a la caja',
          onclick: () => {
            formActivo = 'mover';
            marcarForm();
            const f = $('#f-mover', nodo);
            f.desde.value = LUGAR_AFUERA;
            f.hacia.value = LUGAR_VENTAS;
            // Apuntado a la moneda que más se cargó: es la que se va a entregar.
            const mayor = Object.entries(conmigo).filter(([, x]) => x > 0)
              .sort((a, b) => b[1] - a[1])[0];
            if (mayor) {
              f.moneda.value = mayor[0];
              f.monto.value = String(mayor[1] / Math.pow(10, MONEDAS[mayor[0]].decimales));
            }
            f.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
        }),
      ]));
    }

    const porCobrar = venTodo.reduce((t, v) => t + Math.max(0, v.saldoUSD || 0), 0);
    cajaNodo.appendChild(el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-pie);margin-top:.75rem',
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
        el('p', { style: 'font-size:var(--t-cuerpo);margin:0', texto: 'Sacaste más de lo que ganó el negocio en este período: esa diferencia sale del dinero que ya había.' }),
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
            el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: `${c.cantidad} ${c.cantidad === 1 ? 'retiro' : 'retiros'}` }),
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
          m.porque ? el('div', { style: 'font-size:var(--t-cuerpo)', html: esc(m.porque) }) : null,
          el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: `${fecha(m.ts)} · ${esc(sitio)}${m.paraQue ? ' · ' + esc(m.paraQue) : ''}` }),
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div.cifra', { style: `font-weight:700;color:${color}`, texto: `${signo}${formatear(m.montoUSD)}` }),
          m.moneda !== 'USD' ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: formatear(m.monto, m.moneda) }) : null,
        ]),
        el('button.btn.plano', {
          style: 'min-height:34px;padding:0 .5rem', html: icono('trash'), 'aria-label': 'Borrar movimiento',
          onclick: async () => {
            if (!await confirmar('¿Borrar este movimiento?', { detalle: 'Las cuentas de la plata se recalculan.', peligro: true, aceptar: 'Borrar' })) return;
            const borrar = { ingreso: borrarIngreso, retiro: borrarRetiro, traslado: borrarTraslado }[m.tipo];
            await borrar(m.id);
            pasadas(cargar);
          },
        }),
      ]));
    }
    lista.appendChild(tarjeta);
  }

  pasadas(cargar);
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { texto: valor }),
  ]);
}

export { montarMiDinero };
