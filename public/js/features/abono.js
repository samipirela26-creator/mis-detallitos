// abono.js — el cuadro de "Registrar abono", compartido por Deudores (dueño)
// y Fiados (empleado). Cobrar un fiado es plata que entra a la caja y queda
// con el nombre de quien la recibió (ver `registrarAbono`).
import { el, esc, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal } from '../ui/avisos.js';
import { registrarAbono, deudaDe } from '../data/clientes.js';
import { MONEDAS, formatear, crearPago, totalPagadoUSD, abonoEnPesos, aMenores } from '../core/dinero.js';
import { leer } from '../core/estado.js';

/** `inicial` llena los campos con el saldo completo: lo normal es pagar todo. */
export function abrirAbono(c, inicial = 0, alTerminar = () => {}) {
  const deuda = (x) => deudaDe(x, leer('tasas') || {});
  // `tasasHoy`, no `tasas`: ahí arriba `tasas` es una FUNCIÓN que lee las
  // del momento, y llamar a una y usar la otra ya rompió este botón una
  // vez —`tasas()` sobre este objeto tira "no es una función" y el abono no
  // se registraba—. Aquí hace falta la foto del momento en que se abrió el
  // cuadro, que es la tasa con la que se armaron los pagos que se ven.
  const tasasHoy = leer('tasas') || {};
  let pagos = [];
  const d = abrirDialogo('');
  const resumen = el('div');
  const pintarResumen = () => {
    const pagado = totalPagadoUSD(pagos);
    const queda = deuda(c).USD - pagado;
    resumen.innerHTML = '';
    pegar(resumen,
      el('div', { style: 'text-align:center;margin:.5rem 0' }, [
        el('div', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: 'ABONA' }),
        el('div.cifra-gigante', { texto: formatear(pagado) }),
        el('div', {
          style: `color:${queda > 0 ? 'var(--texto-suave)' : 'var(--verde)'}`,
          texto: queda > 0
            ? `Quedaría debiendo ${formatear(queda)}`
            : queda < 0 ? `Paga de más: ${formatear(-queda)}` : 'Queda al día',
        }),
      ])
    );
  };

  const campos = Object.values(MONEDAS)
    .filter((m) => m.codigo === 'USD' || tasasHoy[m.codigo])
    .map((m) => {
      const entrada = el('input', {
        inputmode: 'decimal', placeholder: '0',
        oninput: (ev) => {
          const monto = aMenores(ev.target.value, m.codigo) || 0;
          pagos = pagos.filter((p) => p.moneda !== m.codigo);
          if (monto) pagos.push(crearPago(m.codigo, monto, tasasHoy));
          pintarResumen();
        },
      });
      return { moneda: m, entrada, nodo: el('div.campo', { style: 'margin:0' }, [el('label', { texto: m.nombre }), entrada]) };
    });

  // Si vino de "Cobrarle todo", el saldo entra ya escrito en dólares (o en
  // la primera moneda con tasa, que es con la que se paga en el mostrador).
  if (inicial > 0) {
    const campo = campos.find((x) => x.moneda.codigo === 'USD') || campos[0];
    if (campo) {
      const m = campo.moneda.codigo;
      const monto = m === 'USD' ? inicial : Math.round((inicial * tasasHoy[m]) / 100);
      campo.entrada.value = String(monto / Math.pow(10, campo.moneda.decimales)).replace('.', ',');
      pagos = [crearPago(m, monto, tasasHoy)];
    }
  }
  pintarResumen();

  pegar(d,
    el('h2', { html: `Abono de ${esc(c.nombre)}` }),
    resumen,
    el('div.fila', { style: 'margin:.75rem 0' }, campos.map((x) => x.nodo)),
    el('div.fila', {}, [
      el('button.btn.callado', { texto: 'Cancelar', onclick: () => d.close() }),
      el('button.btn.principal', { texto: 'Registrar abono', onclick: async () => {
        const montoUSD = totalPagadoUSD(pagos);
        if (!montoUSD) return avisarMal('Escribe cuánto está abonando.');
        // Lo que abona también baja la deuda en PESOS, que es la moneda en
        // la que se fijó. La cuenta está en `abonoEnPesos` (core/dinero.js).
        const montoCOP = abonoEnPesos(pagos, deuda(c), tasasHoy);
        try {
          await registrarAbono({ clienteId: c.id, montoUSD, montoCOP, pagos });
          d.close();
          avisarOk('Abono registrado: esa plata ya entró a la caja.');
          alTerminar();
        } catch (e) {
          avisarMal('No se pudo registrar: ' + (e.message || e));
        }
      } }),
    ])
  );
}

