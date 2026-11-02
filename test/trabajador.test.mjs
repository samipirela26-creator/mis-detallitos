import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porSemana, veredicto, lunesDe } from '../public/js/reports/trabajador.js';

const venta = (dia, totalUSD, costo, uid = 'a', estado = 'ok') =>
  ({ dia, uid, estado, totalUSD, lineas: [{ productoId: 'p', cantidad: 1, costoUSD: costo }] });

test('la semana empieza en lunes', () => {
  assert.equal(lunesDe('2026-11-02'), '2026-11-02');  // lunes
  assert.equal(lunesDe('2026-11-08'), '2026-11-02');  // domingo
  assert.equal(lunesDe('2026-11-03'), '2026-11-02');
});

test('cuenta ganancia y no vendido, ignora anuladas y otras personas', () => {
  const ventas = [
    venta('2026-10-26', 1000, 600), venta('2026-10-27', 500, 100),
    venta('2026-10-27', 9999, 0, 'a', 'anulada'), venta('2026-10-28', 9999, 0, 'b'),
  ];
  const s = porSemana({ ventas, uid: 'a', nombre: 'A', sueldoUSD: 2000, hoy: '2026-11-02', semanas: 4 });
  assert.equal(s.length, 2);                       // semana en curso + la del 26
  assert.equal(s[1].vendidoUSD, 1500);
  assert.equal(s[1].gananciaUSD, 800);
  assert.equal(s[1].cubre, false);
});

test('suma lo pagado como sueldo, solo a esa persona', () => {
  const retiros = [
    { categoria: 'Pago de trabajador', paraQue: 'abraham', montoUSD: 2000, dia: '2026-10-28' },
    { categoria: 'Pago de trabajador', paraQue: 'Otro', montoUSD: 500, dia: '2026-10-28' },
    { categoria: 'Diezmo', paraQue: 'Abraham', montoUSD: 700, dia: '2026-10-28' },
  ];
  const s = porSemana({ ventas: [venta('2026-10-26', 100, 0)], retiros, uid: 'a', nombre: 'Abraham', sueldoUSD: 2000, hoy: '2026-11-02' });
  assert.equal(s[1].pagadoUSD, 2000);
});

test('el veredicto no juzga la semana que corre', () => {
  const ventas = [venta('2026-10-26', 5000, 1000), venta('2026-11-02', 100, 0)];
  const v = veredicto(porSemana({ ventas, uid: 'a', nombre: 'A', sueldoUSD: 2000, hoy: '2026-11-02' }));
  assert.equal(v.semanas, 1);
  assert.equal(v.cubre, true);
});
