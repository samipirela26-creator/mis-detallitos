// velocidad.test.mjs — lo que hace la venta más rápida, probado aparte.
//
// Estas tres reglas son las que no se pueden revisar a ojo en el mostrador:
// si "100 hojas" se interpreta como cantidad, se venden 100 cuadernos; si la
// escala no se aplica al tocar "+", el cliente paga de más; y si los billetes
// sugeridos no incluyen con qué pagar, el cajero vuelve a teclear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partirCantidad, pareceCodigo } from '../public/js/data/busqueda.js';
import { conCantidad, denominacionesSugeridas, DENOMINACIONES } from '../public/js/core/dinero.js';

test('la cantidad se puede escribir en la misma búsqueda', () => {
  assert.deepEqual(partirCantidad('3x lapiz'), { cantidad: 3, texto: 'lapiz' });
  assert.deepEqual(partirCantidad('3 x lapiz'), { cantidad: 3, texto: 'lapiz' });
  assert.deepEqual(partirCantidad('3*lapiz'), { cantidad: 3, texto: 'lapiz' });
  assert.deepEqual(partirCantidad('lapiz x3'), { cantidad: 3, texto: 'lapiz' });
  assert.deepEqual(partirCantidad('lapiz*3'), { cantidad: 3, texto: 'lapiz' });
  assert.deepEqual(partirCantidad('2,5 x tela'), { cantidad: 2.5, texto: 'tela' });
});

test('un número suelto NO es cantidad: hay productos que se llaman así', () => {
  // El error caro: "cuaderno 100 hojas" agregando 100 cuadernos.
  assert.deepEqual(partirCantidad('100 hojas'), { cantidad: null, texto: '100 hojas' });
  assert.deepEqual(partirCantidad('pega 250'), { cantidad: null, texto: 'pega 250' });
  assert.deepEqual(partirCantidad('lapiz'), { cantidad: null, texto: 'lapiz' });
  assert.deepEqual(partirCantidad(''), { cantidad: null, texto: '' });
  // "0x" no es una venta de cero: se trata como texto.
  assert.equal(partirCantidad('0x lapiz').cantidad, null);
});

test('reconoce un código de barras leído de corrido', () => {
  assert.ok(pareceCodigo('7591234567890'));
  assert.ok(pareceCodigo('  12345678 '));
  assert.ok(!pareceCodigo('1234567'));        // muy corto para ser EAN
  assert.ok(!pareceCodigo('lapiz'));
  assert.ok(!pareceCodigo('750ml'));
});

test('cambiar la cantidad aplica la escala por cantidad', () => {
  const copia = {
    nombre: 'Fotocopia B/N', cantidad: 1, precioUSD: 10, precioOriginalUSD: 10,
    tipoPrecio: 'fijo', precioEditado: false,
    escalas: [{ desdeCant: 50, precioUSD: 8 }, { desdeCant: 200, precioUSD: 5 }],
  };
  assert.equal(conCantidad(copia, 10).precioUSD, 10);
  assert.equal(conCantidad(copia, 50).precioUSD, 8);
  assert.equal(conCantidad(copia, 200).precioUSD, 5);
  assert.equal(conCantidad(copia, 500).precioUSD, 5);
  assert.equal(conCantidad(copia, 200).cantidad, 200);
  // Y sabe volver: bajar la cantidad devuelve el precio de arriba.
  assert.equal(conCantidad(conCantidad(copia, 200), 10).precioUSD, 10);
});

test('un precio puesto a mano no lo pisa la escala', () => {
  const acordado = {
    cantidad: 1, precioUSD: 7, precioOriginalUSD: 10, tipoPrecio: 'fijo',
    precioEditado: true, escalas: [{ desdeCant: 50, precioUSD: 8 }],
  };
  assert.equal(conCantidad(acordado, 100).precioUSD, 7);
  const variable = { cantidad: 1, precioUSD: 300, tipoPrecio: 'variable', escalas: [] };
  assert.equal(conCantidad(variable, 3).precioUSD, 300);
  assert.equal(conCantidad(variable, 3).cantidad, 3);
});

test('los billetes sugeridos sirven para pagar lo que falta', () => {
  // Faltan $7,50 -> lo útil es el de 10, no el de 1.
  const usd = denominacionesSugeridas('USD', 750);
  assert.ok(usd.includes(1000), `esperaba el billete de 10 en ${usd}`);
  assert.ok(usd.every((d) => DENOMINACIONES.USD.includes(d)));
  assert.ok(usd.length <= 4);
  // Nada por cobrar: ofrece los de abajo, que es con lo que se completa.
  assert.deepEqual(denominacionesSugeridas('USD', 0), [100, 500, 1000, 2000]);
  // Si falta más que el billete más grande, al menos ofrece el más grande.
  assert.ok(denominacionesSugeridas('COP', 999999).includes(100000));
  assert.deepEqual(denominacionesSugeridas('XXX', 100), []);
  // Van de menor a mayor y sin repetirse.
  const ves = denominacionesSugeridas('VES', 12000);
  assert.deepEqual(ves, [...new Set(ves)].sort((a, b) => a - b));
});
