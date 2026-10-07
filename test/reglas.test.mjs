// reglas.test.mjs — prueba las reglas de seguridad de Firestore DE VERDAD,
// contra el emulador y por HTTP, igual que lo haría alguien con la consola del
// navegador abierta.
//
// Para correrlo:
//   node_modules/.bin/firebase emulators:start --project demo-detallitos --only auth,firestore
//   node --test test/reglas.test.mjs
//
// Si el emulador no está corriendo, las pruebas se saltan (no fallan).

import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';

const PROY = 'demo-detallitos';
const NEGOCIO = 'mis-detallitos';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = `http://127.0.0.1:8080/v1/projects/${PROY}/databases/(default)/documents`;
const NEG = `${FS}/negocios/${NEGOCIO}`;

const hayEmulador = await fetch('http://127.0.0.1:8080/').then(() => true).catch(() => false);

async function entrar(email, clave = 'detallitos123') {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: clave, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('no se pudo entrar: ' + JSON.stringify(j));
  return { token: j.idToken, uid: j.localId };
}

const como = (sesion) => ({ Authorization: `Bearer ${sesion.token}`, 'Content-Type': 'application/json' });
const comoAdmin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const leer = (ruta, cab) => fetch(`${NEG}/${ruta}`, { headers: cab });
const escribir = (ruta, campos, cab) =>
  fetch(`${NEG}/${ruta}`, { method: 'PATCH', headers: cab, body: JSON.stringify({ fields: campos }) });
const borrar = (ruta, cab) => fetch(`${NEG}/${ruta}`, { method: 'DELETE', headers: cab });

describe('reglas de seguridad', { skip: hayEmulador ? false : 'el emulador de Firestore no está corriendo' }, () => {
  let dueno, empleado;

  before(async () => {
    dueno = await entrar('dueno@detallitos.test');
    empleado = await entrar('primo@detallitos.test');
    // Un producto de prueba, escrito como admin (sin pasar por reglas).
    await escribir('productos/prueba-reglas', {
      nombre: { stringValue: 'Producto de prueba' },
      precioUSD: { integerValue: '100' },
      costoUSD: { integerValue: '60' },
      activo: { booleanValue: true },
    }, comoAdmin);
    await escribir('productos_venta/prueba-reglas', {
      nombre: { stringValue: 'Producto de prueba' },
      precioUSD: { integerValue: '100' },
      activo: { booleanValue: true },
    }, comoAdmin);
  });

  test('LO MÁS IMPORTANTE: el empleado no puede leer la colección con costos', async () => {
    const r = await leer('productos/prueba-reglas', como(empleado));
    assert.equal(r.status, 403, 'el empleado NO debe poder leer `productos`');
  });

  test('el empleado sí lee el espejo, y el espejo no trae el costo', async () => {
    const r = await leer('productos_venta/prueba-reglas', como(empleado));
    assert.equal(r.status, 200);
    const doc = await r.json();
    assert.ok(doc.fields.precioUSD, 'debe traer el precio');
    assert.equal(doc.fields.costoUSD, undefined, 'NO debe traer el costo');
  });

  test('el dueño sí lee los costos', async () => {
    const r = await leer('productos/prueba-reglas', como(dueno));
    assert.equal(r.status, 200);
    const doc = await r.json();
    assert.equal(doc.fields.costoUSD.integerValue, '60');
  });

  test('el empleado no puede escribir en el catálogo', async () => {
    const r = await escribir('productos/prueba-reglas', { precioUSD: { integerValue: '1' } }, como(empleado));
    assert.equal(r.status, 403);
    const r2 = await escribir('productos_venta/prueba-reglas', { precioUSD: { integerValue: '1' } }, como(empleado));
    assert.equal(r2.status, 403, 'tampoco en el espejo: cambiar precios es del dueño');
  });

  test('nadie se asciende solo a dueño', async () => {
    const r = await escribir(`usuarios/${empleado.uid}`, { rol: { stringValue: 'dueno' } }, como(empleado));
    assert.equal(r.status, 403);
  });

  test('el empleado puede registrar una venta pero no editarla ni borrarla', async () => {
    // Id único: una venta ya escrita sería una EDICIÓN, y editar está prohibido
    // justamente para que nadie pueda maquillar una venta después de hecha.
    const id = `venta-${Date.now()}`;
    const venta = {
      uid: { stringValue: empleado.uid },
      estado: { stringValue: 'ok' },
      totalUSD: { integerValue: '500' },
    };
    assert.equal((await escribir(`ventas/${id}`, venta, como(empleado))).status, 200, 'vender sí');
    assert.equal((await escribir(`ventas/${id}`, { totalUSD: { integerValue: '1' } }, como(empleado))).status, 403, 'editarla después no');
    assert.equal((await borrar(`ventas/${id}`, como(empleado))).status, 403, 'borrarla tampoco');
  });

  test('el empleado no puede hacer pasar una venta por otro', async () => {
    const r = await escribir('ventas/venta-ajena', {
      uid: { stringValue: 'otro-uid-cualquiera' },
      estado: { stringValue: 'ok' },
    }, como(empleado));
    assert.equal(r.status, 403);
  });

  test('la auditoría es solo del dueño y nadie la borra', async () => {
    assert.equal((await leer('auditoria', como(empleado))).status, 403);
    const rastro = `rastro-${Date.now()}`;
    await escribir(`auditoria/${rastro}`, { accion: { stringValue: 'x' }, uid: { stringValue: dueno.uid } }, como(dueno));
    assert.equal((await borrar(`auditoria/${rastro}`, como(dueno))).status, 403, 'ni el dueño puede borrar su rastro');
  });

  test('el ledger de inventario no se puede editar ni borrar', async () => {
    const mov = `mov-${Date.now()}`;
    assert.equal((await escribir(`movimientos/${mov}`, {
      uid: { stringValue: empleado.uid }, productoId: { stringValue: 'x' }, cantidad: { integerValue: '-1' },
    }, como(empleado))).status, 200, 'descontar del inventario al vender, sí');
    assert.equal((await escribir(`movimientos/${mov}`, { cantidad: { integerValue: '999' } }, como(empleado))).status, 403);
    assert.equal((await borrar(`movimientos/${mov}`, como(dueno))).status, 403);
  });

  test('sin sesión no se lee absolutamente nada', async () => {
    const sinCabecera = { 'Content-Type': 'application/json' };
    assert.notEqual((await leer('productos_venta/prueba-reglas', sinCabecera)).status, 200);
    assert.notEqual((await leer('ventas', sinCabecera)).status, 200);
  });

  test('las tasas las pone el dueño, no el empleado', async () => {
    const r = await escribir('tasas/2026-01-01', { VES: { integerValue: '1' } }, como(empleado));
    assert.equal(r.status, 403);
    const r2 = await escribir('tasas/2026-01-01', { VES: { integerValue: '3650' } }, como(dueno));
    assert.equal(r2.status, 200);
  });

  test('el empleado no puede leer las fotos para escribirlas, pero sí verlas', async () => {
    await escribir('fotos/prueba-reglas', { datos: { stringValue: 'data:image/webp;base64,xx' } }, comoAdmin);
    assert.equal((await leer('fotos/prueba-reglas', como(empleado))).status, 200, 'verlas sí');
    assert.equal((await escribir('fotos/prueba-reglas', { datos: { stringValue: 'otra' } }, como(empleado))).status, 403, 'cambiarlas no');
  });
});
