import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../public/js/reports/analisis.js';

const VENTAS = [
  { id: 'v1', dia: '2026-10-01', uid: 'u1', nombreUsuario: 'Samuel', totalUSD: 1000, costoTotalUSD: 600, gananciaUSD: 400, saldoUSD: 0,
    lineas: [{ productoId: 'p1', nombre: 'Lápiz', cantidad: 10, precioUSD: 50, costoUSD: 30, precioEditado: false },
             { productoId: 'p2', nombre: 'Resma', cantidad: 1, precioUSD: 500, costoUSD: 300, precioEditado: false }] },
  { id: 'v2', dia: '2026-10-01', uid: 'u2', nombreUsuario: 'Primo', totalUSD: 400, costoTotalUSD: 350, gananciaUSD: 50, saldoUSD: 200,
    lineas: [{ productoId: 'p2', nombre: 'Resma', cantidad: 1, precioUSD: 400, precioOriginalUSD: 500, costoUSD: 350, precioEditado: true, autorizadoPor: 'Dueño' }] },
];
const GASTOS = [{ dia: '2026-10-01', montoUSD: 200 }];

test('resumen: vendido, ganancia, gastos y neto', () => {
  const r = a.resumen(VENTAS, GASTOS);
  assert.equal(r.cantidad, 2);
  assert.equal(r.vendidoUSD, 1400);
  assert.equal(r.costoUSD, 950);
  assert.equal(r.gananciaBrutaUSD, 450);
  assert.equal(r.gastosUSD, 200);
  assert.equal(r.gananciaNetaUSD, 250);
  assert.equal(r.porCobrarUSD, 200);
  assert.equal(r.ticketPromedioUSD, 700);
});

test('por producto: ordena por ganancia y detecta venta bajo costo', () => {
  const p = a.porProducto(VENTAS);
  const resma = p.find((x) => x.nombre === 'Resma');
  assert.equal(resma.unidades, 2);
  assert.equal(resma.vendidoUSD, 900);
  assert.equal(resma.costoUSD, 650);
  assert.equal(resma.gananciaUSD, 250);
  assert.equal(resma.bajoCosto, 0);
  const lapiz = p.find((x) => x.nombre === 'Lápiz');
  assert.equal(lapiz.gananciaUSD, 200);
  assert.equal(p[0].nombre, 'Resma', 'el de más ganancia va primero');
});

test('vende bajo costo: se cuenta', () => {
  const p = a.porProducto([{ lineas: [{ productoId: 'x', nombre: 'Mal', cantidad: 1, precioUSD: 10, costoUSD: 20 }] }]);
  assert.equal(p[0].bajoCosto, 1);
  assert.equal(p[0].gananciaUSD, -10);
});

test('ranking de vendedores con porcentaje', () => {
  const v = a.porVendedor(VENTAS);
  assert.equal(v[0].nombre, 'Samuel');
  assert.equal(v[0].vendidoUSD, 1000);
  assert.equal(Math.round(v[0].pct), 71);
  assert.equal(v[1].descuentos, 1);
  assert.equal(v[0].ticketUSD, 1000);
});

test('descuentos: cuánta ganancia se regaló y quién autorizó', () => {
  const d = a.descuentos(VENTAS);
  assert.equal(d.length, 1);
  assert.equal(d[0].regaladoUSD, 100);
  assert.equal(d[0].vendedor, 'Primo');
  assert.equal(d[0].autorizadoPor, 'Dueño');
});

test('margen flojo: saca los que dejan poco', () => {
  const flojos = a.margenFlojo(a.porProducto(VENTAS), 30);
  assert.ok(flojos.some((x) => x.nombre === 'Resma'), 'la Resma dejó 27%, está por debajo de 30');
  assert.ok(!flojos.some((x) => x.nombre === 'Lápiz'), 'el Lápiz dejó 40%');
});

test('por día junta ventas y gastos', () => {
  const d = a.porDia(VENTAS, GASTOS);
  assert.equal(d.length, 1);
  assert.equal(d[0].vendidoUSD, 1400);
  assert.equal(d[0].gastosUSD, 200);
  assert.equal(d[0].gananciaUSD, 450);
});

test('proyección de quiebre de stock', () => {
  const dias = a.proyeccionQuiebre({ id: 'p1', stock: 30 }, VENTAS, 30);
  assert.equal(dias, 90, '10 unidades en 30 días = 1 cada 3 días; 30 unidades duran 90');
  assert.equal(a.proyeccionQuiebre({ id: 'zzz', stock: 5 }, VENTAS, 30), null, 'si no se vende, no hay proyección');
});

test('sin datos no explota', () => {
  const r = a.resumen([], []);
  assert.equal(r.vendidoUSD, 0);
  assert.equal(r.margenPct, null);
  assert.deepEqual(a.porProducto([]), []);
  assert.deepEqual(a.porVendedor([]), []);
});

test('ventas del empleado (sin costo) usan el costo del catálogo', () => {
  // El empleado no puede leer costos, así que su venta guarda costoUSD = 0.
  const ventaEmpleado = [{
    id: 'v3', dia: '2026-10-02', uid: 'u2', nombreUsuario: 'Primo',
    totalUSD: 1000, costoTotalUSD: 0, gananciaUSD: 1000, saldoUSD: 0,
    lineas: [{ productoId: 'p1', nombre: 'Lápiz', cantidad: 10, precioUSD: 100, costoUSD: 0 }],
  }];
  const costos = { p1: 60 };

  const sinMapa = a.resumen(ventaEmpleado, []);
  assert.equal(sinMapa.gananciaBrutaUSD, 1000, 'sin el mapa la ganancia saldría inflada');

  const r = a.resumen(ventaEmpleado, [], costos);
  assert.equal(r.costoUSD, 600);
  assert.equal(r.gananciaBrutaUSD, 400, 'con el mapa sale la ganancia real');

  assert.equal(a.porProducto(ventaEmpleado, costos)[0].gananciaUSD, 400);
  assert.equal(a.porVendedor(ventaEmpleado, costos)[0].gananciaUSD, 400);
  assert.equal(a.porDia(ventaEmpleado, [], costos)[0].gananciaUSD, 400);
  assert.equal(a.costosEstimados(ventaEmpleado), true);
  assert.equal(a.costosEstimados(VENTAS), false);
});

test('el costo guardado en la venta manda sobre el del catálogo', () => {
  // Si el proveedor subió el precio después, la venta vieja conserva SU costo.
  const r = a.resumen(VENTAS, [], { p1: 999, p2: 999 });
  assert.equal(r.costoUSD, 950, 'usa los costos que quedaron escritos en las líneas');
});
