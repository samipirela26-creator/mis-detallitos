import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCSV, detectarSeparador } from '../public/js/data/csv.js';

test('NO convierte "1,91" en 191 (el error que trae SheetJS)', () => {
  const filas = leerCSV('Nombre,Precio\n"Lápiz","1,91"');
  assert.deepEqual(filas[1], ['Lápiz', '1,91']);
});

test('respeta acentos y la ñ', () => {
  const filas = leerCSV('Nombre\n"Compás Niño Ñandú"');
  assert.equal(filas[1][0], 'Compás Niño Ñandú');
});

test('comillas dobles escapadas', () => {
  const filas = leerCSV('a,b\n"Cuaderno ""Grande""",5');
  assert.deepEqual(filas[1], ['Cuaderno "Grande"', '5']);
});

test('salto de línea dentro de un campo', () => {
  const filas = leerCSV('a,b\n"linea 1\nlinea 2",x');
  assert.equal(filas.length, 2);
  assert.equal(filas[1][0], 'linea 1\nlinea 2');
});

test('separador punto y coma (el que usa Excel en español)', () => {
  assert.equal(detectarSeparador('Nombre;Precio;Costo'), ';');
  const filas = leerCSV('Nombre;Precio\nLápiz;1,91');
  assert.deepEqual(filas[1], ['Lápiz', '1,91']);
});

test('tabulaciones', () => {
  assert.equal(detectarSeparador('a\tb\tc'), '\t');
  assert.deepEqual(leerCSV('a\tb\nLápiz\t1,91')[1], ['Lápiz', '1,91']);
});

test('quita el BOM que mete Excel', () => {
  const filas = leerCSV('﻿Nombre,Precio\nLápiz,1');
  assert.equal(filas[0][0], 'Nombre');
});

test('salta las filas vacías y aguanta finales raros', () => {
  const filas = leerCSV('a,b\n1,2\n\n\n3,4\n');
  assert.equal(filas.length, 3);
  assert.deepEqual(filas[2], ['3', '4']);
});

test('archivo vacío no explota', () => {
  assert.deepEqual(leerCSV(''), []);
  assert.deepEqual(leerCSV('\n\n'), []);
});
