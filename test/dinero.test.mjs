import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../public/js/core/dinero.js';

test('lee números escritos a la venezolana y a la gringa', () => {
  assert.equal(d.aMenores('1.234,56'), 123456);
  assert.equal(d.aMenores('1,234.56'), 123456);
  assert.equal(d.aMenores('12,5'), 1250);
  assert.equal(d.aMenores('  Bs 36,50  ', 'VES'), 3650);
  assert.equal(d.aMenores('4.100', 'COP'), 4100);
  assert.equal(d.aMenores('4,100', 'COP'), 4100);
  assert.equal(d.aMenores(12.5), 1250);
  assert.equal(d.aMenores(''), null);
  assert.equal(d.aMenores('abc'), null);
  assert.equal(d.aMenores('-3,25'), -325);
});

test('convierte USD a las tres monedas y regresa sin perder plata', () => {
  const tasas = { VES: d.tasaAMenores('36,50', 'VES'), COP: d.tasaAMenores('4100', 'COP') };
  assert.equal(tasas.VES, 3650);
  assert.equal(tasas.COP, 4100);
  assert.equal(d.desdeUSD(500, 'VES', tasas.VES), 18250);   // $5 = Bs 182,50
  assert.equal(d.desdeUSD(500, 'COP', tasas.COP), 20500);   // $5 = 20.500 COP
  assert.equal(d.desdeUSD(500, 'USD', null), 500);
  assert.equal(d.aUSD(18250, 'VES', tasas.VES), 500);
  assert.equal(d.aUSD(20500, 'COP', tasas.COP), 500);
});

test('sin tasa, la conversión falla en vez de inventar un número', () => {
  assert.throws(() => d.desdeUSD(500, 'VES', null), /Falta la tasa/);
  assert.throws(() => d.aUSD(1000, 'COP', 0), /Falta la tasa/);
});

test('pago mixto: pesos + dólares, con vuelto', () => {
  const tasas = { VES: 3650, COP: 4100 };
  const totalUSD = 730;                                   // $7,30
  const pagos = [
    d.crearPago('COP', 20000, tasas),                     // 20.000 COP = $4,88
    d.crearPago('USD', 500, tasas),                       // $5,00
  ];
  assert.equal(pagos[0].montoUSD, 488);
  assert.equal(pagos[0].tasa, 4100, 'la tasa queda congelada en el pago');
  assert.equal(d.totalPagadoUSD(pagos), 988);
  const vuelto = d.saldoPago(totalUSD, pagos);
  assert.equal(vuelto, 258);                              // sobran $2,58
  const enMonedas = d.vueltoEnMonedas(vuelto, tasas);
  assert.equal(enMonedas.USD, 258);
  assert.equal(enMonedas.VES, 9417);                      // Bs 94,17
  assert.equal(enMonedas.COP, 10578);
});

test('saldo negativo cuando falta plata', () => {
  assert.equal(d.saldoPago(1000, [d.crearPago('USD', 700, {})]), -300);
  assert.equal(d.saldoPago(1000, []), -1000);
});

test('escalas de cantidad: la fotocopia baja de precio al pedir más', () => {
  const copia = {
    precioUSD: 10,
    escalas: [
      { desdeCant: 50, precioUSD: 8 },
      { desdeCant: 200, precioUSD: 6 },
    ],
  };
  assert.equal(d.precioPorCantidad(copia, 1), 10);
  assert.equal(d.precioPorCantidad(copia, 49), 10);
  assert.equal(d.precioPorCantidad(copia, 50), 8);
  assert.equal(d.precioPorCantidad(copia, 199), 8);
  assert.equal(d.precioPorCantidad(copia, 200), 6);
  assert.equal(d.precioPorCantidad(copia, 1000), 6);
  assert.equal(d.precioPorCantidad({ precioUSD: 25 }, 7), 25, 'sin escalas usa el precio base');
});

test('invariante: ganancia = total - costo, al centavo', () => {
  const lineas = [
    { cantidad: 3, precioUSD: 150, costoUSD: 90 },
    { cantidad: 200, precioUSD: 6, costoUSD: 2 },
    { cantidad: 1.5, precioUSD: 333, costoUSD: 111 },
  ];
  const t = d.totalesVenta(lineas);
  assert.equal(t.totalUSD, 450 + 1200 + 500);
  assert.equal(t.costoUSD, 270 + 400 + 167);
  assert.equal(t.gananciaUSD, t.totalUSD - t.costoUSD);
  assert.ok(Number.isInteger(t.totalUSD) && Number.isInteger(t.gananciaUSD));
});

test('margen y autorización por precio bajo', () => {
  assert.equal(Math.round(d.margenPct(1000, 600)), 40);
  assert.equal(d.margenPct(0, 0), null);
  const prod = { precioUSD: 100, precioMinimoUSD: 70, costoUSD: 50 };
  assert.equal(d.requiereAutorizacion(prod, 80), false);
  assert.equal(d.requiereAutorizacion(prod, 65), true);
  assert.equal(d.requiereAutorizacion(prod, 65, { permitirBajoMinimo: true }), false);
  assert.equal(d.requiereAutorizacion({ costoUSD: 50 }, 40), true, 'sin mínimo, el piso es el costo');
});
