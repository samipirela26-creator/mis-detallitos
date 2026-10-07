// gastos.js — lo que sale. Sencillo a propósito: categoría, monto y listo.
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, diaISO, primerDiaDelMes } from '../ui/html.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { CATEGORIAS, registrarGasto, gastosEntre, borrarGasto } from '../data/gastos.js';
import { MONEDAS, aMenores, formatear, aUSD } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { esDueno } from '../core/sesion.js';

registrar('gastos', {
  titulo: 'Gastos', icono: '📤', menu: true, soloEmpleado: true, orden: 50,
  montar: montarGastos,
});
registrar('gastos-dueno', { titulo: 'Gastos', icono: '📤', montar: montarGastos });

async function montarGastos(nodo) {
  nodo.innerHTML = `
    <div class="tarjeta">
      <h2>Registrar un gasto</h2>
      <form id="f">
        <div class="campo"><label>¿En qué?</label>
          <select name="categoria">${CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="fila">
          <div class="campo"><label>Moneda</label>
            <select name="moneda">${Object.values(MONEDAS).map((m) => `<option value="${m.codigo}">${esc(m.nombre)}</option>`).join('')}</select></div>
          <div class="campo" style="flex:2"><label>Monto</label>
            <input name="monto" inputmode="decimal" required placeholder="0,00"></div>
        </div>
        <div class="campo"><label>Nota</label><input name="nota" placeholder="opcional"></div>
        <button class="btn principal ancho" type="submit">Guardar gasto</button>
      </form>
    </div>
    <div class="seccion"><h2>Este mes</h2></div>
    <div id="lista"><div class="cargando">Cargando…</div></div>`;

  const f = $('#f', nodo);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const moneda = f.moneda.value;
    const monto = aMenores(f.monto.value, moneda);
    if (!monto) return avisarMal('Escribe el monto.');
    const tasas = leer('tasas') || {};
    if (moneda !== 'USD' && !tasas[moneda]) return avisarMal(`Falta la tasa de hoy para ${MONEDAS[moneda].nombre}.`);
    try {
      await registrarGasto({
        categoria: f.categoria.value,
        moneda, monto,
        tasa: moneda === 'USD' ? 100 : tasas[moneda],
        montoUSD: aUSD(monto, moneda, moneda === 'USD' ? null : tasas[moneda]),
        nota: f.nota.value,
      });
      f.reset();
      avisarOk('Gasto registrado');
      cargar();
    } catch (e) {
      avisarMal('No se pudo guardar: ' + (e.message || e));
    }
  });

  async function cargar() {
    const caja = $('#lista', nodo);
    try {
      const lista = await gastosEntre(primerDiaDelMes(), diaISO());
      const total = lista.reduce((t, g) => t + (g.montoUSD || 0), 0);
      caja.innerHTML = '';
      caja.appendChild(el('div.kpi.malo', { style: 'margin-bottom:1rem' }, [
        el('div.rotulo', { texto: 'Gastado este mes' }),
        el('div.valor', { texto: formatear(total) }),
      ]));
      if (!lista.length) return caja.appendChild(el('div.vacio', { texto: 'Sin gastos este mes.' }));

      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const g of lista) {
        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.55rem;border-bottom:1px solid var(--borde)',
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(g.categoria) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: `${fecha(g.ts)} · ${esc(g.nombreUsuario || '')} ${g.nota ? '· ' + esc(g.nota) : ''}` }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div.cifra', { style: 'font-weight:700', texto: formatear(g.montoUSD) }),
            g.moneda !== 'USD' ? el('div', { style: 'font-size:.78rem;color:var(--texto-suave)', texto: formatear(g.monto, g.moneda) }) : null,
          ]),
          esDueno() ? el('button.btn.plano', {
            style: 'min-height:34px;padding:0 .5rem', texto: '🗑️',
            onclick: async () => {
              if (!await confirmar('¿Borrar este gasto?', { peligro: true, aceptar: 'Borrar' })) return;
              await borrarGasto(g.id);
              cargar();
            },
          }) : null,
        ]));
      }
      caja.appendChild(tarjeta);
    } catch (e) {
      caja.innerHTML = '';
      caja.appendChild(el('div.vacio', { texto: 'No se pudieron cargar los gastos (¿sin internet?).' }));
    }
  }
  cargar();
}
