// recibo.test.mjs — el papelito es lo único que el cliente se lleva.
//
// Las dos cosas que se prueban aquí fallaban en silencio: el recibo decía la
// fecha de HOY en vez de la de la venta, y recalculaba los bolívares con la
// tasa del día, no con la que se cobró. Mientras el recibo solo se abría justo
// después de cobrar, daba lo mismo. En cuanto se reimprima uno viejo, deja de
// dar lo mismo — y es justo cuando alguien está reclamando.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoRecibo } from '../public/js/reports/recibo.js';

class TS {
  constructor(s) { this.seconds = s; this.nanoseconds = 0; }
  toDate() { return new Date(this.seconds * 1000); }
}

const ventaBase = {
  totalUSD: 1000,
  saldoUSD: 0,
  lineas: [{ cantidad: 2, nombre: 'Cuaderno', precioUSD: 500 }],
  pagos: [{ moneda: 'VES', monto: 900000, tasa: 90000, montoUSD: 1000 }],
  ts: new TS(Math.floor(new Date(2026, 9, 1, 14, 30).getTime() / 1000)),
};

test('el recibo usa la tasa CONGELADA del pago, no la de hoy', () => {
  // La tasa global se movió mucho desde que se cobró.
  const hoy = { VES: 150000 };
  const texto = textoRecibo({ id: 'v123456', venta: ventaBase, tasas: hoy });
  assert.match(texto, /Bs 9\.000,00/, 'debería mostrar el equivalente a la tasa de la venta (900,00/$)');
  assert.ok(!texto.includes('Bs 15.000,00'), 'recalculó con la tasa de hoy');
});

test('el recibo imprime la fecha de la venta, no la de ahora', () => {
  const texto = textoRecibo({ id: 'v123456', venta: ventaBase, tasas: {} });
  assert.match(texto, /1\/10\/2026/, `no salió la fecha de la venta:\n${texto}`);
});

test('el recibo dice con qué tasa se cobró', () => {
  const texto = textoRecibo({ id: 'v1', venta: ventaBase, tasas: {} });
  assert.match(texto, /Tasa: Bs 900,00\/\$/);
});

test('una venta solo en dólares no lleva línea de tasa', () => {
  const venta = { ...ventaBase, pagos: [{ moneda: 'USD', monto: 1000, tasa: 100, montoUSD: 1000 }] };
  assert.ok(!textoRecibo({ id: 'v1', venta, tasas: { VES: 90000 } }).includes('Tasa:'));
});

test('sin fecha guardada el recibo no se rompe', () => {
  const venta = { ...ventaBase, ts: null };
  assert.doesNotThrow(() => textoRecibo({ id: 'v1', venta, tasas: {} }));
});

test('lo que queda debiendo sale marcado', () => {
  const venta = { ...ventaBase, saldoUSD: 450, pagos: [{ moneda: 'USD', monto: 550, tasa: 100, montoUSD: 550 }] };
  assert.match(textoRecibo({ id: 'v1', venta, tasas: {} }), /Queda debiendo/);
});
