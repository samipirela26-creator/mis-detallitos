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

test('la escala cobra el dólar derivado del peso, no el peso', () => {
  // La impresión B/N vale 1.000 pesos y 300 al llegar a 200. Lo que manda al
  // cobrar es `precioUSD`, derivado con la tasa del día; `precioCOP` es el
  // número de la etiqueta y lo que `recalcularPrecios` usa para rehacer el
  // dólar cuando se mueve la tasa. Si alguna vez se cobra el peso por error,
  // la fotocopia saldría en 300 dólares.
  const tasa = 317400;   // 3.174 pesos por dólar, en menores
  const impresion = {
    precioCOP: 100000,
    precioUSD: d.aUSD(100000, 'COP', tasa),
    escalas: [{ desdeCant: 200, precioCOP: 30000, precioUSD: d.aUSD(30000, 'COP', tasa) }],
  };
  assert.equal(impresion.precioUSD, 32, 'mil pesos son 32 centavos');
  assert.equal(d.precioPorCantidad(impresion, 1), 32);
  assert.equal(d.precioPorCantidad(impresion, 199), 32);
  assert.equal(d.precioPorCantidad(impresion, 200), 9, 'trescientos pesos son 9 centavos');
  assert.equal(d.precioPorCantidad(impresion, 500), 9);
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

test('el costo se puede escribir por unidad o por paquete', () => {
  // Unitario de toda la vida: no cambia nada.
  assert.deepEqual(d.parsearCosto('0,15'), { costoUSD: 15, paquete: null });
  assert.deepEqual(d.parsearCosto(''), { costoUSD: null, paquete: null });

  // El caso que rompía las cuentas: la docena de lápices en 1,80.
  const docena = d.parsearCosto('12 por 1,80');
  assert.equal(docena.costoUSD, 15);
  assert.deepEqual(docena.paquete, { unidades: 12, totalUSD: 180 });

  // Las otras maneras de escribirlo que ya acepta el mayoreo.
  assert.equal(d.parsearCosto('12 x 1,80').costoUSD, 15);
  assert.equal(d.parsearCosto('10 = 3,50').costoUSD, 35);

  // "1 por 5" es un unitario escrito raro, no un paquete.
  assert.deepEqual(d.parsearCosto('1 por 5'), { costoUSD: 500, paquete: null });

  // Basura: no se inventa un costo.
  assert.equal(d.parsearCosto('ni idea').costoUSD, null);
  assert.equal(d.parsearCosto('12 por').costoUSD, null);
});

test('el costo se vuelve a mostrar como se escribió', () => {
  assert.equal(d.escribirCosto(15, { unidades: 12, totalUSD: 180 }), '12 por 1,80');
  assert.equal(d.escribirCosto(15, null), '0,15');
  assert.equal(d.escribirCosto(0, null), '');
});

test('el costo no se deja engañar por lo que el dueño escribe mal', () => {
  // Sin la palabra "por" se pegaban los dos números: "12 1,80" daba $121,80,
  // y con eso el empleado quedaba pidiendo PIN en cada venta del lápiz.
  assert.equal(d.parsearCosto('12 1,80').costoUSD, null);
  assert.equal(d.parsearCosto('12  1,80').costoUSD, null);

  // Un costo negativo envenena el margen y el valor del inventario.
  assert.equal(d.parsearCosto('-5').costoUSD, null);
  assert.equal(d.parsearCosto('-0,15').costoUSD, null);

  // El papel se compra por millar, y así es como se escribe.
  const millar = d.parsearCosto('1.000 por 12,50');
  assert.equal(millar.costoUSD, 1);                  // 1250/1000 = 1,25 centavos -> 1
  assert.deepEqual(millar.paquete, { unidades: 1000, totalUSD: 1250 });
  assert.equal(d.parsearCosto('500 por 2,00').paquete.unidades, 500);
});

test('los montos de millón para arriba no se dividen entre mil', () => {
  // `replace` cambia solo la PRIMERA coincidencia: con dos puntos de millar,
  // el segundo se quedaba y el resto se leía como decimal. Un alquiler de
  // 1.500.000 pesos entraba como 1.500 y nada lo delataba.
  assert.equal(d.aMenores('1.500.000', 'COP'), 1500000);
  assert.equal(d.aMenores('1.234.567', 'COP'), 1234567);
  assert.equal(d.aMenores('12.345.678', 'COP'), 12345678);
  assert.equal(d.aMenores('1.234.567', 'VES'), 123456700);
  assert.equal(d.aMenores('1.234.567,89', 'VES'), 123456789);

  // Un solo separador ya funcionaba: que siga funcionando.
  assert.equal(d.aMenores('150.000', 'COP'), 150000);
  assert.equal(d.aMenores('1.000', 'COP'), 1000);

  // A la gringa, con comas de millar.
  assert.equal(d.aMenores('1,234,567', 'COP'), 1234567);
  assert.equal(d.aMenores('1,500,000', 'COP'), 1500000);

  // Pegado y con decimales seguían bien.
  assert.equal(d.aMenores('1234567', 'COP'), 1234567);
});

test('el millar ambiguo no cambia de significado', () => {
  // Estos dos son la razón de la heurística y NO se tocan: "1.234" es mil
  // doscientos treinta y cuatro, "1,5" es uno coma cinco.
  assert.equal(d.aMenores('1.234', 'COP'), 1234);
  assert.equal(d.aMenores('1,234', 'COP'), 1234);
  assert.equal(d.aMenores('1,5'), 150);
  assert.equal(d.aMenores('1.5'), 150);
});

test('un monto grande da la vuelta completa sin perder un centavo', () => {
  for (const [texto, moneda] of [['1.500.000', 'COP'], ['98.765.432,10', 'VES'], ['1.234.567,89', 'USD']]) {
    const menores = d.aMenores(texto, moneda);
    const vuelta = d.aMenores(d.formatear(menores, moneda, { simbolo: false }), moneda);
    assert.equal(vuelta, menores, `${texto} (${moneda}) no sobrevivió la ida y vuelta`);
  }
});

test('el estado del margen es uno solo, y no un ternario copiado', () => {
  assert.equal(d.estadoMargen(null), 'sin-dato');
  assert.equal(d.estadoMargen(undefined), 'sin-dato');
  assert.equal(d.estadoMargen(NaN), 'sin-dato');
  assert.equal(d.estadoMargen(-0.1), 'perdida');     // vender por debajo del costo
  assert.equal(d.estadoMargen(-30), 'perdida');
  assert.equal(d.estadoMargen(0), 'flojo');          // ni gana ni pierde
  assert.equal(d.estadoMargen(14.9), 'flojo');
  assert.equal(d.estadoMargen(d.MARGEN_FLOJO), 'bueno');   // el umbral ya es bueno
  assert.equal(d.estadoMargen(60), 'bueno');
  // El umbral se puede mover sin tocar ninguna pantalla.
  assert.equal(d.estadoMargen(20, 30), 'flojo');
});
