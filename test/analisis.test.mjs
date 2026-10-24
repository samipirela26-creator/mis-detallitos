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

const RETIROS = [
  { dia: '2026-10-02', categoria: 'Pago de trabajador', montoUSD: 100, porque: 'Quincena' },
  { dia: '2026-10-03', categoria: 'Diezmo', montoUSD: 45, porque: 'Diezmo del mes' },
  { dia: '2026-10-04', categoria: 'Pago de trabajador', montoUSD: 50, porque: 'Día extra' },
];

test('resumen de retiros: total y desglose por categoría de mayor a menor', () => {
  const rr = a.resumenRetiros(RETIROS);
  assert.equal(rr.totalUSD, 195);
  assert.equal(rr.cantidad, 3);
  assert.equal(rr.porCategoria.length, 2);
  assert.deepEqual(rr.porCategoria[0], { categoria: 'Pago de trabajador', totalUSD: 150, cantidad: 2 });
  assert.deepEqual(rr.porCategoria[1], { categoria: 'Diezmo', totalUSD: 45, cantidad: 1 });
});

test('disponible: ganancia neta menos lo retirado, y avisa en negativo', () => {
  const r = a.resumen(VENTAS, GASTOS);
  assert.equal(r.gananciaNetaUSD, 250);
  assert.equal(a.disponible(r, RETIROS), 55);
  assert.equal(a.disponible(r, []), 250);
  assert.equal(a.disponible(r, [{ categoria: 'Diezmo', montoUSD: 400 }]), -150);
});

test('dinero por lugar: la caja y lo guardado se cuentan aparte', () => {
  const d = a.dineroPorLugar({
    ingresos: [{ lugar: 'Caja', montoUSD: 50000 }],                    // el dinero inicial
    traslados: [{ desde: 'Caja', hacia: 'Caja fuerte', montoUSD: 30000 }],
    ventas: VENTAS,                                                     // 1400, con 200 fiados
    gastos: GASTOS,                                                     // 200
    retiros: [{ lugar: 'Caja fuerte', categoria: 'Diezmo', montoUSD: 100 }],
  });
  assert.equal(d.saldos['Caja'], 50000 - 30000 + 1200 - 200);
  assert.equal(d.saldos['Caja fuerte'], 30000 - 100);
  assert.equal(d.totalUSD, 50000 + 1200 - 200 - 100);
});

test('dinero por lugar: un traslado no cambia el total', () => {
  const base = { ingresos: [{ lugar: 'Caja', montoUSD: 1000 }] };
  const sin = a.dineroPorLugar(base);
  const con = a.dineroPorLugar({ ...base, traslados: [{ desde: 'Caja', hacia: 'Caja fuerte', montoUSD: 400 }] });
  assert.equal(sin.totalUSD, con.totalUSD);
  assert.equal(con.saldos['Caja'], 600);
});

test('dinero por lugar: el fiado que te pagan SÍ entra en la caja', () => {
  const base = { ventas: VENTAS };                    // 1400 vendidos, 200 fiados
  const sin = a.dineroPorLugar(base);
  const con = a.dineroPorLugar({ ...base, abonos: [{ montoUSD: 200 }] });
  assert.equal(sin.saldos['Caja'], 1200);
  assert.equal(con.saldos['Caja'], 1400);             // cobró el fiado: la plata está
  assert.equal(con.totalUSD, 1400);
});

test('dinero por lugar: un abono cobrado en la caja fuerte no toca la gaveta', () => {
  const d = a.dineroPorLugar({ abonos: [{ montoUSD: 500, lugar: 'Caja fuerte' }] });
  assert.equal(d.saldos['Caja'], 0);
  assert.equal(d.saldos['Caja fuerte'], 500);
});

test('dinero por lugar: un gasto pagado de la caja fuerte sale de ahí', () => {
  const d = a.dineroPorLugar({
    ingresos: [{ lugar: 'Caja fuerte', montoUSD: 1000 }],
    gastos: [{ montoUSD: 300, lugar: 'Caja fuerte' }],
  });
  assert.equal(d.saldos['Caja fuerte'], 700);
  assert.equal(d.saldos['Caja'], 0);
});

test('cobrado de ventas: lo fiado no entra en la caja', () => {
  assert.equal(a.cobradoDeVentas(VENTAS), 1200);
  assert.equal(a.cobradoDeVentas([]), 0);
});

test('sin movimientos no hay plata, pero los sitios existen', () => {
  const d = a.dineroPorLugar();
  assert.equal(d.totalUSD, 0);
  assert.deepEqual(d.porLugar.map((l) => l.lugar), ['Caja', 'Caja fuerte', 'Conmigo']);
});

// --- las ventas de la calle --------------------------------------------------
// Vender con la caja cerrada es normal (las ventas rápidas de afuera se hacen
// así). Esa plata está con quien vendió, no en la gaveta: cargársela a la
// gaveta era pedirle al siguiente arqueo una plata que no estaba en el
// mostrador, y el cierre cantaba un faltante inventado.

test('venta con la caja cerrada: la plata queda Conmigo, no en la gaveta', () => {
  const venta = {
    totalUSD: 500, lugar: 'Conmigo',
    pagos: [{ moneda: 'COP', monto: 16000, tasa: 3200, montoUSD: 500 }],
  };
  const d = a.dineroPorLugar({ ventas: [venta] });
  assert.equal(d.saldos.Conmigo, 500);
  assert.equal(d.saldos.Caja, 0);
  assert.equal(d.totalUSD, 500);          // la plata del negocio es la misma

  const e = a.efectivoPorLugar({ ventas: [venta] });
  assert.equal(e.Conmigo.COP, 16000);
  assert.equal(e.Caja.COP, 0);
});

test('venta de la calle pagada por móvil: los bolívares no van al bolsillo', () => {
  // El pago móvil llega al teléfono esté quien sea donde esté.
  const venta = {
    totalUSD: 500, lugar: 'Conmigo',
    pagos: [{ moneda: 'VES', monto: 496605, tasa: 99321, montoUSD: 500 }],
  };
  const e = a.efectivoPorLugar({ ventas: [venta] });
  assert.equal(e['Caja fuerte'].VES, 496605);
  assert.equal(e.Conmigo.VES, 0);
});

test('entregar lo que andabas cargando es un traslado, no plata nueva', () => {
  const venta = {
    totalUSD: 500, lugar: 'Conmigo',
    pagos: [{ moneda: 'COP', monto: 16000, tasa: 3200, montoUSD: 500 }],
  };
  const d = a.dineroPorLugar({
    ventas: [venta],
    traslados: [{ desde: 'Conmigo', hacia: 'Caja', moneda: 'COP', monto: 16000, montoUSD: 500 }],
  });
  assert.equal(d.saldos.Conmigo, 0);
  assert.equal(d.saldos.Caja, 500);
  assert.equal(d.totalUSD, 500);
});

test('la venta normal sigue cayendo en la gaveta', () => {
  const d = a.dineroPorLugar({
    ventas: [{ totalUSD: 500, pagos: [{ moneda: 'USD', monto: 500, montoUSD: 500 }] }],
  });
  assert.equal(d.saldos.Caja, 500);
  assert.equal(d.saldos.Conmigo, 0);
});

test('venta fiada de la calle: lo cobrado se le acredita a quien vendió', () => {
  // Sin pagos detallados (una venta vieja o fiada en parte) el monto va al
  // sitio de la venta, no por defecto a la gaveta.
  const d = a.dineroPorLugar({
    ventas: [{ totalUSD: 1000, saldoUSD: 600, pagos: [], lugar: 'Conmigo' }],
  });
  assert.equal(d.saldos.Conmigo, 400);
  assert.equal(d.saldos.Caja, 0);
});

// --- efectivo de verdad, moneda por moneda -----------------------------------
// Esta es la cuenta que se compara contando billetes, y la que explicaba los
// faltantes: el vuelto que salió de la gaveta no estaba restado en ninguna parte.

test('vuelto: una venta vieja sin el vuelto escrito se reconstruye con su tasa', () => {
  const v = {
    totalUSD: 79, pagadoUSD: 159,
    pagos: [{ moneda: 'COP', monto: 5000, tasa: 3154, montoUSD: 159 }],
  };
  const x = a.vueltoDeVenta(v);
  assert.equal(x.moneda, 'COP');
  assert.equal(x.montoUSD, 80);
  assert.equal(x.monto, 2523);          // 80 centavos a 3154 pesos por dólar
  assert.equal(x.reconstruido, true);
});

test('vuelto: si la venta lo trae escrito, se respeta tal cual', () => {
  const v = {
    totalUSD: 79, pagadoUSD: 159,
    pagos: [{ moneda: 'COP', monto: 5000, tasa: 3154, montoUSD: 159 }],
    vuelto: { moneda: 'VES', monto: 7945, montoUSD: 80 },
  };
  assert.deepEqual(a.vueltoDeVenta(v), { moneda: 'VES', monto: 7945, montoUSD: 80 });
});

test('vuelto: sin sobrante no hay vuelto', () => {
  assert.equal(a.vueltoDeVenta({ totalUSD: 100, pagadoUSD: 100, pagos: [{ moneda: 'USD', monto: 100 }] }), null);
  assert.equal(a.vueltoDeVenta({ totalUSD: 100, pagadoUSD: 0, pagos: [] }), null);   // fiada
});

test('efectivo por lugar: el vuelto se resta de la gaveta', () => {
  const e = a.efectivoPorLugar({
    ventas: [{
      totalUSD: 79, pagadoUSD: 159,
      pagos: [{ moneda: 'COP', monto: 5000, tasa: 3154, montoUSD: 159 }],
    }],
  });
  assert.equal(e['Caja'].COP, 5000 - 2523);
});

test('efectivo por lugar: cada moneda se cuadra con su moneda', () => {
  const e = a.efectivoPorLugar({
    ingresos: [{ lugar: 'Caja', moneda: 'COP', monto: 59000 }, { lugar: 'Caja fuerte', moneda: 'VES', monto: 712900 }],
    ventas: [{ totalUSD: 224, pagadoUSD: 224, pagos: [{ moneda: 'COP', monto: 7000, montoUSD: 224 }] }],
    abonos: [{ pagos: [{ moneda: 'USD', monto: 500 }] }],
    gastos: [{ moneda: 'COP', monto: 5000 }],
    retiros: [{ moneda: 'USD', monto: 100, lugar: 'Caja' }],
    traslados: [{ desde: 'Caja', hacia: 'Caja fuerte', moneda: 'COP', monto: 10000 }],
  });
  assert.equal(e['Caja'].COP, 59000 + 7000 - 5000 - 10000);
  assert.equal(e['Caja'].USD, 500 - 100);
  assert.equal(e['Caja'].VES, 0);
  assert.equal(e['Caja fuerte'].COP, 10000);
  assert.equal(e['Caja fuerte'].VES, 712900);
});

// --- los bolívares nunca pasan por la gaveta ---------------------------------
// Entran por pago móvil y el que atiende no puede dar vuelto en bolívares, así
// que van derecho a la caja fuerte. Si se contaran en la gaveta, cada cierre
// reclamaría unos bolívares que están en un teléfono.

test('efectivo por lugar: un pago en bolívares no entra a la gaveta', () => {
  const e = a.efectivoPorLugar({
    ventas: [{ totalUSD: 50, pagadoUSD: 50, pagos: [{ moneda: 'VES', monto: 50000, montoUSD: 50 }] }],
  });
  assert.equal(e['Caja'].VES, 0);
  assert.equal(e['Caja fuerte'].VES, 50000);
});

test('efectivo por lugar: pesos y dólares sí van a la gaveta', () => {
  const e = a.efectivoPorLugar({
    ventas: [{ totalUSD: 324, pagadoUSD: 324, pagos: [
      { moneda: 'COP', monto: 7000, montoUSD: 224 },
      { moneda: 'USD', monto: 100, montoUSD: 100 },
    ] }],
  });
  assert.equal(e['Caja'].COP, 7000);
  assert.equal(e['Caja'].USD, 100);
});

test('dinero por lugar: lo cobrado en bolívares se guarda, no queda en la caja', () => {
  const d = a.dineroPorLugar({
    ventas: [{ totalUSD: 50, pagadoUSD: 50, saldoUSD: 0, pagos: [{ moneda: 'VES', monto: 50000, montoUSD: 50 }] }],
  });
  assert.equal(d.saldos['Caja'], 0);
  assert.equal(d.saldos['Caja fuerte'], 50);
  assert.equal(d.totalUSD, 50);          // el total del negocio no cambia
});

test('dinero por lugar: una venta sin detalle de pagos se le carga a la caja', () => {
  const d = a.dineroPorLugar({ ventas: [{ totalUSD: 400, saldoUSD: 200 }] });
  assert.equal(d.saldos['Caja'], 200);   // lo fiado no está
});

// --- el redondeo al cobrar ---------------------------------------------------
// Los precios caen en números que no se pueden dar con monedas ($ 1.520) y se
// redondean al cobrar. El ajuste va en la VENTA, no en el precio del producto:
// el producto no cambió de precio, se redondeó esa venta.

const VENTA_REDONDEADA = {
  id: 'v9', dia: '2026-10-22', uid: 'u1', nombreUsuario: 'Abraham',
  totalUSD: 472, ajusteUSD: -6, gananciaUSD: 266, saldoUSD: 0,
  lineas: [{ productoId: 'p1', nombre: 'Cuaderno', cantidad: 1, precioUSD: 478, costoUSD: 200 }],
};

test('reportes: lo vendido es lo que se cobró, ya redondeado', () => {
  const r = a.resumen([VENTA_REDONDEADA]);
  assert.equal(r.vendidoUSD, 472);        // no los 478 de la etiqueta
  assert.equal(r.costoUSD, 200);
  assert.equal(r.gananciaBrutaUSD, 272);  // el redondeo sale de la ganancia
});

test('reportes: el producto conserva su precio de etiqueta', () => {
  const [p] = a.porProducto([VENTA_REDONDEADA]);
  assert.equal(p.nombre, 'Cuaderno');
  assert.equal(p.vendidoUSD, 478);        // el redondeo no se le carga al producto
  assert.equal(p.unidades, 1);
});

test('reportes: una venta redondeada no deja vuelto que reconstruir', () => {
  assert.equal(a.vueltoDeVenta({ ...VENTA_REDONDEADA, pagadoUSD: 472, pagos: [{ moneda: 'COP', monto: 1500, montoUSD: 472 }] }), null);
});
