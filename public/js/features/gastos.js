// gastos.js — TODO LO QUE SALE DE LA CAJA, en una sola pantalla.
//
// Hay dos clases de salida y la app las guarda en sitios distintos a propósito:
//
//   GASTO   — es del negocio (mercancía, la luz, una herramienta) y BAJA la
//             ganancia. Vive en `gastos`.
//   RETIRO  — la ganancia ya está hecha y la plata se saca: el pago del que
//             ayuda, lo que se lleva la casa, el diezmo. NO baja la ganancia,
//             porque no es un costo de vender: es a dónde se fue lo ganado.
//             Vive en `retiros` y por eso sale en "Mi dinero".
//
// Esa separación es correcta y se mantiene. Lo que estaba mal era OBLIGAR a
// saberla de antemano: el dueño venía a "Gastos" a anotar el pago de un
// trabajador o lo que saca para él, no lo encontraba en el desplegable, y lo
// metía en "Otros" — que lo contaba como gasto del negocio y le hundía la
// ganancia del mes.
//
// Ahora el desplegable trae las dos listas, en grupos que dicen cuál baja la
// ganancia y cuál no, y la app guarda cada cosa donde va. Al empleado solo se
// le muestran los gastos: los retiros son del dueño (y las reglas de Firestore
// no le dejarían escribirlos).
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, diaISO, primerDiaDelMes } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { CATEGORIAS, registrarGasto, gastosEntre, borrarGasto } from '../data/gastos.js';
import { pasadas, CACHE } from '../data/lectura.js';
import {
  CATEGORIAS as CAT_RETIRO, registrarRetiro, retirosEntre, borrarRetiro,
} from '../data/retiros.js';
import { MONEDAS, LUGARES, aMenores, formatear, aUSD } from '../core/dinero.js';
import { lugarDeLaMoneda } from '../core/sitios.js';
import { leer } from '../core/estado.js';
import { esDueno } from '../core/sesion.js';

// 'Ajuste de conteo' no se ofrece aquí: ese lo escribe solo el cuadre de
// "Mi dinero", y a mano sería una puerta para tapar un faltante.
const RETIROS_A_MANO = CAT_RETIRO.filter((c) => c !== 'Ajuste de conteo');

registrar('gastos', {
  titulo: 'Gastos', icono: '📤', menu: true, soloEmpleado: true, orden: 50,
  montar: montarGastos,
});
registrar('gastos-dueno', { titulo: 'Gastos y salidas', icono: '📤', montar: montarGastos });

async function montarGastos(nodo) {
  const dueno = esDueno();
  // El valor lleva escrito de qué clase es, para que al guardar no haya que
  // adivinarlo comparando textos contra dos listas.
  const opcionesGasto = CATEGORIAS.map((c) => `<option value="gasto:${esc(c)}">${esc(c)}</option>`).join('');
  const opcionesRetiro = RETIROS_A_MANO.map((c) => `<option value="retiro:${esc(c)}">${esc(c)}</option>`).join('');

  nodo.innerHTML = `
    <div class="tarjeta">
      <h2>${dueno ? 'Anotar una salida de dinero' : 'Registrar un gasto'}</h2>
      <form id="f">
        <div class="campo"><label>¿Qué fue?</label>
          <select name="categoria">
            ${dueno ? `<optgroup label="Gasto del negocio (baja la ganancia)">${opcionesGasto}</optgroup>
                       <optgroup label="Sale de la caja pero no es gasto (no baja la ganancia)">${opcionesRetiro}</optgroup>`
                    : opcionesGasto}
          </select>
          <small id="explica" style="color:var(--texto-suave)"></small></div>
        <div class="campo"><label>¿De dónde sale el dinero?</label>
          <select name="lugar">${LUGARES.map((l) => `<option>${esc(l)}</option>`).join('')}</select>
          <small id="explica-lugar" style="color:var(--texto-suave)"></small></div>
        <div class="fila">
          <div class="campo"><label>Moneda</label>
            <select name="moneda">${Object.values(MONEDAS).map((m) => `<option value="${m.codigo}">${esc(m.nombre)}</option>`).join('')}</select></div>
          <div class="campo" style="flex:2"><label>Monto</label>
            <input name="monto" inputmode="decimal" required placeholder="0,00"></div>
        </div>
        <div class="campo"><label id="lbl-nota">Nota</label>
          <input name="nota" placeholder="opcional"></div>
        <button class="btn principal ancho" type="submit" id="guardar">Guardar gasto</button>
      </form>
    </div>
    <div class="seccion"><h2>Este mes</h2></div>
    <div id="lista"><div class="cargando">Cargando…</div></div>`;

  const f = $('#f', nodo);
  const elegido = () => {
    const [clase, ...resto] = f.categoria.value.split(':');
    return { clase, categoria: resto.join(':') };
  };

  /** Dice en voz alta qué va a pasar con esa plata. Es lo que evita el error. */
  function refrescar() {
    const { clase } = elegido();
    const esRetiro = clase === 'retiro';
    $('#guardar', nodo).textContent = esRetiro ? 'Registrar el retiro' : 'Guardar gasto';
    $('#lbl-nota', nodo).textContent = esRetiro ? '¿Por qué? (hace falta)' : 'Nota';
    f.nota.placeholder = esRetiro ? 'Quincena de Yoli' : 'opcional';
    $('#explica', nodo).textContent = esRetiro
      ? 'Esto NO baja tu ganancia: la ganancia ya estaba hecha y esta plata sale de la caja. Aparece en "Mi dinero".'
      : 'Esto es un costo del negocio y baja la ganancia del mes.';
  }
  f.categoria.addEventListener('change', refrescar);

  /**
   * De dónde sale la plata. Antes solo se preguntaba en los retiros, y el gasto
   * se le cargaba entero a la gaveta: un gasto pagado en bolívares por pago
   * móvil —que nunca estuvo en la gaveta— dejaba la gaveta faltando al cerrar.
   *
   * El sitio se propone por la moneda (los bolívares viven en la caja fuerte,
   * ver core/sitios.js) y se puede cambiar: el billete de a dólar lo mismo sale
   * de la gaveta que de lo guardado.
   */
  function proponerLugar() {
    f.lugar.value = lugarDeLaMoneda(f.moneda.value);
    $('#explica-lugar', nodo).textContent = f.moneda.value === 'VES'
      ? 'Los bolívares entran por pago móvil: nunca están en la gaveta.'
      : '';
  }
  f.moneda.addEventListener('change', proponerLugar);
  f.lugar.addEventListener('change', () => { $('#explica-lugar', nodo).textContent = ''; });
  proponerLugar();
  refrescar();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { clase, categoria } = elegido();
    const moneda = f.moneda.value;
    const monto = aMenores(f.monto.value, moneda);
    if (!monto) return avisarMal('Escribe el monto.');
    const tasas = leer('tasas') || {};
    if (moneda !== 'USD' && !tasas[moneda]) return avisarMal(`Falta la tasa de hoy para ${MONEDAS[moneda].nombre}.`);
    const plata = {
      categoria, moneda, monto,
      tasa: moneda === 'USD' ? 100 : tasas[moneda],
      montoUSD: aUSD(monto, moneda, moneda === 'USD' ? null : tasas[moneda]),
    };
    try {
      if (clase === 'retiro') {
        // El motivo es obligatorio en un retiro: un hueco en la caja sin
        // explicación es exactamente lo que no se puede volver a tener.
        if (!f.nota.value.trim()) return avisarMal('Escribe por qué sacas ese dinero.');
        await registrarRetiro({ ...plata, lugar: f.lugar.value, porque: f.nota.value });
      } else {
        await registrarGasto({ ...plata, lugar: f.lugar.value, nota: f.nota.value });
      }
      f.reset();
      proponerLugar();
      refrescar();
      avisarOk(clase === 'retiro' ? 'Retiro registrado' : 'Gasto registrado');
      pasadas(cargar);
    } catch (e) {
      avisarMal('No se pudo guardar: ' + (e.message || e));
    }
  });

  /** `fuente` la pone `pasadas`: ver data/lectura.js. */
  async function cargar(fuente) {
    const caja = $('#lista', nodo);
    try {
      // Las dos clases de salida, juntas y en orden: si se anota un retiro y la
      // lista de abajo solo trae gastos, parece que no se guardó nada.
      const [gastos, retiros] = await Promise.all([
        gastosEntre(primerDiaDelMes(), diaISO(), { fuente }),
        dueno ? retirosEntre(primerDiaDelMes(), diaISO(), { fuente }).catch(() => []) : [],
      ]);
      // Caché vacía no es "no hubo salidas": es que no sabe.
      if (fuente === CACHE && !gastos.length && !retiros.length) return false;
      const lista = [
        ...gastos.map((x) => ({ ...x, clase: 'gasto' })),
        ...retiros.map((x) => ({ ...x, clase: 'retiro', nota: x.porque })),
      ].sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));

      const totalGastos = gastos.reduce((t, g) => t + (g.montoUSD || 0), 0);
      const totalRetiros = retiros.reduce((t, r) => t + (r.montoUSD || 0), 0);
      caja.innerHTML = '';
      caja.appendChild(el('div.kpis', { style: 'margin-bottom:1rem' }, [
        el('div.kpi.malo', {}, [
          el('div.rotulo', { texto: 'Gastos del negocio' }),
          el('div.valor', { texto: formatear(totalGastos) }),
        ]),
        ...(dueno ? [el('div.kpi.acento', {}, [
          el('div.rotulo', { texto: 'Retirado' }),
          el('div.valor', { texto: formatear(totalRetiros) }),
        ])] : []),
      ]));
      if (!lista.length) return caja.appendChild(el('div.vacio', { texto: 'Sin salidas este mes.' }));

      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const g of lista) {
        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.55rem;border-bottom:1px solid var(--borde)',
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600' }, [
              el('span', { html: esc(g.categoria) }),
              g.clase === 'retiro'
                ? el('span.etiqueta.info', { style: 'margin-left:.4rem', texto: 'retiro' })
                : null,
            ]),
            el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: `${fecha(g.ts)} · ${esc(g.nombreUsuario || '')} · ${esc(g.lugar || 'Caja')} ${g.nota ? '· ' + esc(g.nota) : ''}` }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div.cifra', { style: 'font-weight:700', texto: formatear(g.montoUSD) }),
            g.moneda !== 'USD' ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: formatear(g.monto, g.moneda) }) : null,
          ]),
          esDueno() ? el('button.btn.plano', {
            style: 'min-height:38px;min-width:44px;padding:0', texto: '×', 'aria-label': 'Quitar', title: 'Quitar',
            onclick: async () => {
              const que = g.clase === 'retiro' ? 'retiro' : 'gasto';
              if (!await confirmar(`¿Borrar este ${que}?`, { peligro: true, aceptar: 'Borrar' })) return;
              if (g.clase === 'retiro') await borrarRetiro(g.id);
              else await borrarGasto(g.id);
              pasadas(cargar);
            },
          }) : null,
        ]));
      }
      caja.appendChild(tarjeta);
    } catch (e) {
      if (fuente === CACHE) return false;   // la caché no sabe: que conteste el servidor
      caja.innerHTML = '';
      caja.appendChild(el('div.vacio', { texto: 'No se pudieron cargar los gastos (¿sin internet?).' }));
    }
  }
  pasadas(cargar);
}
