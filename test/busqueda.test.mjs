import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscar } from '../public/js/data/busqueda.js';
import { normalizar } from '../public/js/core/texto.js';

const hacer = (nombre, extra = {}) => ({
  id: nombre, nombre, nombreNorm: normalizar(nombre),
  alias: extra.alias || [], aliasNorm: (extra.alias || []).map(normalizar),
  categoria: extra.categoria || '', sku: extra.sku || '', codigoBarras: extra.codigoBarras || '',
});

const CATALOGO = [
  hacer('Lápiz Mongol Nº2', { categoria: 'Escritura', alias: ['mongol'] }),
  hacer('Lapicero Kilométrico Azul', { categoria: 'Escritura' }),
  hacer('Borrador Nata', { categoria: 'Escritura', alias: ['goma', 'gomita'] }),
  hacer('Sacapuntas Metálico', { categoria: 'Escritura' }),
  hacer('Pega Blanca 250 ml', { categoria: 'Manualidades', alias: ['cola blanca'] }),
  hacer('Hojas de Examen', { categoria: 'Papel', codigoBarras: '7591234567890' }),
  hacer('Resma Carta', { categoria: 'Papel', sku: 'RES-CTA' }),
  hacer('Cuaderno Cuadriculado 100 hojas', { categoria: 'Cuadernos' }),
  hacer('Tijera Escolar', { categoria: 'Manualidades' }),
  hacer('Carpeta Marrón Oficio', { categoria: 'Archivo' }),
];

const primeros = (q, n = 3) => buscar(q, CATALOGO).slice(0, n).map((p) => p.nombre);

test('encuentra escribiendo bien', () => {
  assert.equal(primeros('lápiz')[0], 'Lápiz Mongol Nº2');
  assert.equal(primeros('tijera')[0], 'Tijera Escolar');
});

test('aguanta que lo escriban mal (que es el caso real)', () => {
  for (const [mal, esperado] of [
    ['lapis', 'Lápiz Mongol Nº2'],
    ['lapiz mongold', 'Lápiz Mongol Nº2'],
    ['sakapunta', 'Sacapuntas Metálico'],
    ['sacapunta', 'Sacapuntas Metálico'],
    ['cuadreno', 'Cuaderno Cuadriculado 100 hojas'],
    ['tijeras', 'Tijera Escolar'],
    ['carpeta marron', 'Carpeta Marrón Oficio'],
  ]) {
    assert.ok(primeros(mal).includes(esperado), `"${mal}" debería encontrar ${esperado}, dio ${primeros(mal)}`);
  }
});

test('los sinónimos son lo que salva el día', () => {
  assert.equal(primeros('gomita')[0], 'Borrador Nata');
  assert.equal(primeros('goma')[0], 'Borrador Nata');
  assert.equal(primeros('cola blanca')[0], 'Pega Blanca 250 ml');
  assert.equal(primeros('mongol')[0], 'Lápiz Mongol Nº2');
});

test('plurales, acentos y mayúsculas dan igual', () => {
  assert.equal(primeros('HOJAS')[0], 'Hojas de Examen');
  assert.equal(primeros('hoja')[0], 'Hojas de Examen');
  assert.ok(primeros('metalico').includes('Sacapuntas Metálico'));
  assert.ok(primeros('MARRON').includes('Carpeta Marrón Oficio'));
});

test('varias palabras en cualquier orden', () => {
  assert.equal(primeros('blanca pega')[0], 'Pega Blanca 250 ml');
  assert.equal(primeros('250 pega')[0], 'Pega Blanca 250 ml');
});

test('código de barras y SKU van directo y solos', () => {
  const r = buscar('7591234567890', CATALOGO);
  assert.equal(r.length, 1);
  assert.equal(r[0].nombre, 'Hojas de Examen');
  assert.equal(r[0]._motivo, 'codigo');
  assert.equal(buscar('RES-CTA', CATALOGO)[0].nombre, 'Resma Carta');
});

test('sin texto no devuelve nada, y lo imposible devuelve vacío', () => {
  assert.deepEqual(buscar('', CATALOGO), []);
  assert.deepEqual(buscar('   ', CATALOGO), []);
  assert.equal(buscar('xqzwkj', CATALOGO).length, 0, 'aquí es donde entra la ayuda de la IA');
});
