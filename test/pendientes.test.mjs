import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tocaHoy, diasEntre, describirRepeticion } from '../public/js/core/pendientes-dia.js';

test('diario toca siempre, y pausado nunca', () => {
  assert.equal(tocaHoy({ tipo: 'diario' }, '2026-11-02'), true);
  assert.equal(tocaHoy({ tipo: 'diario', activo: false }, '2026-11-02'), false);
});

test('por días de la semana (2026-11-02 es lunes)', () => {
  const p = { tipo: 'dias', dias: [1, 4] };
  assert.equal(tocaHoy(p, '2026-11-02'), true);   // lunes
  assert.equal(tocaHoy(p, '2026-11-03'), false);  // martes
  assert.equal(tocaHoy(p, '2026-11-05'), true);   // jueves
  assert.equal(tocaHoy({ tipo: 'dias', dias: [] }, '2026-11-02'), false);
});

test('un día sí, uno no, desde el ancla', () => {
  const p = { tipo: 'alterno', ancla: '2026-11-02' };
  assert.equal(tocaHoy(p, '2026-11-02'), true);
  assert.equal(tocaHoy(p, '2026-11-03'), false);
  assert.equal(tocaHoy(p, '2026-11-04'), true);
  assert.equal(tocaHoy(p, '2026-11-01'), false);  // antes del ancla
  assert.equal(tocaHoy(p, '2027-01-01'), diasEntre('2026-11-02', '2027-01-01') % 2 === 0);
});

test('el cambio de hora no mueve el conteo', () => {
  assert.equal(diasEntre('2026-03-07', '2026-03-09'), 2);
  assert.equal(diasEntre('2026-10-31', '2026-11-02'), 2);
});

test('único solo en su fecha', () => {
  const p = { tipo: 'unico', fecha: '2026-11-03' };
  assert.equal(tocaHoy(p, '2026-11-03'), true);
  assert.equal(tocaHoy(p, '2026-11-04'), false);
});

test('describe la repetición', () => {
  assert.equal(describirRepeticion({ tipo: 'dias', dias: [0, 1, 3] }), 'L X D');
  assert.equal(describirRepeticion({ tipo: 'alterno' }), 'Un día sí, uno no');
});
