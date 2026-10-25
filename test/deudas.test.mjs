import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deudaDe, debe, abonoEnPesos } from '../public/js/core/dinero.js';

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

// --- El abono -----------------------------------------------------------------
// Cuánto le baja un abono a la deuda, en pesos. Esta cuenta vivía dentro del
// botón "Registrar abono" y ahí nadie la podía probar: una `tasas` que era un
// objeto donde el código llamaba `tasas()` dejó el botón muerto —se escribía el
// monto, se tocaba y no pasaba nada— y no había prueba que lo cantara.

test('abono: lo que paga en pesos baja pesos, exactos', () => {
  const pagos = [{ moneda: 'COP', monto: 5000, montoUSD: 158 }];
  assert.equal(abonoEnPesos(pagos, { COP: 20000, USD: 630, enPesos: true }, TASAS), 5000);
});

test('abono: lo que paga en otra moneda se pasa a pesos con la tasa de hoy', () => {
  const pagos = [{ moneda: 'USD', monto: 100, montoUSD: 100 }];
  // 1 dólar a 3.174 pesos por dólar.
  assert.equal(abonoEnPesos(pagos, { COP: 20000, USD: 630, enPesos: true }, TASAS), 3174);
});

test('abono: si paga todo, la deuda en pesos se cierra en lo acordado', () => {
  // 20.000 pesos en la etiqueta son 630 centavos; pagados en dólares y
  // convertidos de vuelta darían 19.996 y dejarían 4 pesos colgando.
  const pagos = [{ moneda: 'USD', monto: 630, montoUSD: 630 }];
  assert.equal(abonoEnPesos(pagos, { COP: 20000, USD: 630, enPesos: true }, TASAS), 20000);
});

test('abono: pagar de más tampoco deja saldo a favor en pesos', () => {
  const pagos = [{ moneda: 'COP', monto: 25000, montoUSD: 788 }];
  assert.equal(abonoEnPesos(pagos, { COP: 20000, USD: 630, enPesos: true }, TASAS), 20000);
});

test('abono: mezcla de billetes, cada uno por su lado', () => {
  const pagos = [
    { moneda: 'COP', monto: 10000, montoUSD: 315 },
    { moneda: 'USD', monto: 100, montoUSD: 100 },
  ];
  assert.equal(abonoEnPesos(pagos, { COP: 50000, USD: 1575, enPesos: true }, TASAS), 13174);
});

test('abono: sin tasa del peso no se inventa un peso para el resto', () => {
  const pagos = [{ moneda: 'USD', monto: 100, montoUSD: 100 }];
  assert.equal(abonoEnPesos(pagos, { COP: null, USD: 630, enPesos: false }, {}), 0);
});

test('abono: un cliente viejo, sin deuda en pesos, no cierra un peso que no existe', () => {
  const pagos = [{ moneda: 'USD', monto: 630, montoUSD: 630 }];
  assert.equal(abonoEnPesos(pagos, { COP: null, USD: 630, enPesos: false }, TASAS), 19996);
});
