import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarCambioDeMoneda, RESTO_TOLERADO } from '../public/js/core/cambio-moneda.js';

const tasas = { COP: 4100, VES: 3650 };

test('sobra un dólar y faltan los pesos: fue un cambio, no un faltante', () => {
  // Venta de 4.100 pesos pagada con un dólar: el dólar entró, los pesos no.
  const r = detectarCambioDeMoneda({ USD: 500, COP: -20500 }, tasas);
  assert.equal(r.hayCambio, true);
  assert.equal(r.soloCambio, true);
  assert.equal(r.pares.length, 1);
  assert.deepEqual(r.pares[0].sobra, { moneda: 'USD', monto: 500 });
  assert.deepEqual(r.pares[0].falta, { moneda: 'COP', monto: 20500 });
  assert.equal(r.pares[0].usd, 500);
  assert.equal(r.sobranteUSD, 0);
  assert.equal(r.faltanteUSD, 0);
});

test('al revés también: pagó en pesos y el vuelto salió en dólares', () => {
  const r = detectarCambioDeMoneda({ COP: 20500, USD: -500 }, tasas);
  assert.equal(r.soloCambio, true);
  assert.deepEqual(r.pares[0].sobra, { moneda: 'COP', monto: 20500 });
  assert.deepEqual(r.pares[0].falta, { moneda: 'USD', monto: 500 });
});

test('un cambio no tapa lo que de verdad falta', () => {
  // Cambió $5 por pesos, y además faltan 8.200 pesos ($2) que no se explican.
  const r = detectarCambioDeMoneda({ USD: 500, COP: -28700 }, tasas);
  assert.equal(r.hayCambio, true);
  assert.equal(r.soloCambio, false);
  assert.equal(r.faltanteUSD, 200);
  assert.equal(r.sobranteUSD, 0);
});

test('el redondeo del cambio no se reporta como faltante', () => {
  // 20.300 pesos en vez de 20.500: son 5 centavos de diferencia.
  const r = detectarCambioDeMoneda({ USD: 500, COP: -20300 }, tasas);
  assert.equal(r.soloCambio, true);
  assert.ok(r.sobranteUSD <= RESTO_TOLERADO);
});

test('cuadrado o descuadrado para un solo lado: no hay cambio que detectar', () => {
  assert.equal(detectarCambioDeMoneda({ USD: 0, COP: 0 }, tasas).hayCambio, false);
  const falta = detectarCambioDeMoneda({ USD: -500, COP: -20500 }, tasas);
  assert.equal(falta.hayCambio, false);
  assert.equal(falta.faltanteUSD, 1000);
});

test('tres monedas: empareja el cambio grande con el grande', () => {
  const r = detectarCambioDeMoneda({ USD: 1000, COP: -20500, VES: -18250 }, tasas);
  assert.equal(r.soloCambio, true);
  assert.equal(r.pares.length, 2);
  assert.equal(r.pares[0].falta.moneda, 'COP');
  assert.equal(r.pares[0].usd, 500);
  assert.equal(r.pares[1].falta.moneda, 'VES');
});

test('sin tasa no se inventa la conversión: esa moneda queda fuera', () => {
  const r = detectarCambioDeMoneda({ USD: 500, COP: -20500 }, {});
  assert.deepEqual(r.sinTasa, ['COP']);
  assert.equal(r.hayCambio, false);
  assert.equal(r.soloCambio, false);
  assert.equal(r.sobranteUSD, 500);
});
