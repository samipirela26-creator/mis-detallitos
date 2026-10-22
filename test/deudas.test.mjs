import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deudaDe, debe } from '../public/js/core/dinero.js';

// La deuda se fija en PESOS, como la etiqueta. El dólar se deriva con la tasa
// del día y no al revés: si fuera al revés, mover el dólar movería lo que la
// gente debe, y eso nadie lo acepta.

const TASAS = { COP: 3174, VES: 99318 };

test('deuda: el peso manda y el dólar se deriva con la tasa de hoy', () => {
  const d = deudaDe({ saldoCOP: 20000, saldoUSD: 630 }, TASAS);
  assert.equal(d.COP, 20000);
  assert.equal(d.USD, 630);
  assert.equal(d.enPesos, true);
});

test('deuda: si el dólar sube, debe los MISMOS pesos y menos dólares', () => {
  const d = deudaDe({ saldoCOP: 20000, saldoUSD: 630 }, { COP: 4000 });
  assert.equal(d.COP, 20000);          // lo que se acordó, intacto
  assert.equal(d.USD, 500);            // en dólares vale menos, y da igual
});

test('deuda: un cliente viejo sin pesos se convierte, pero queda marcado', () => {
  const d = deudaDe({ saldoUSD: 630 }, TASAS);
  assert.equal(d.USD, 630);
  assert.equal(d.COP, 19996);          // conversión de hoy, no lo acordado
  assert.equal(d.enPesos, false);
});

test('deuda: sin tasa cargada no se inventa un peso', () => {
  const d = deudaDe({ saldoUSD: 630 }, {});
  assert.equal(d.COP, null);
  assert.equal(d.USD, 630);
});

test('deuda: sin deuda, cero y limpio', () => {
  assert.deepEqual(deudaDe({ saldoCOP: 0, saldoUSD: 0 }, TASAS), { COP: 0, USD: 0, enPesos: true });
  assert.deepEqual(deudaDe(null, TASAS), { USD: 0, COP: 0, enPesos: false });
});

test('debe: mira el peso cuando lo hay, y el dólar en los clientes viejos', () => {
  assert.equal(debe({ saldoCOP: 20000, saldoUSD: 630 }), true);
  assert.equal(debe({ saldoCOP: 0, saldoUSD: 630 }), false);   // pagó: el peso manda
  assert.equal(debe({ saldoUSD: 630 }), true);                 // viejo, solo dólares
  assert.equal(debe({ saldoUSD: 0 }), false);
  assert.equal(debe({}), false);
});
