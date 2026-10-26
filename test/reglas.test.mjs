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

const PROY = 'mis-detallitos';
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

// OJO: un PATCH sin updateMask REEMPLAZA el documento entero. Eso es lo que
// queremos para probar una escritura completa...
const escribir = (ruta, campos, cab) =>
  fetch(`${NEG}/${ruta}`, { method: 'PATCH', headers: cab, body: JSON.stringify({ fields: campos }) });

// ...y esto es lo que hace la app de verdad: setDoc(..., { merge: true }).
const fusionar = (ruta, campos, cab) => {
  const mascara = Object.keys(campos).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  return fetch(`${NEG}/${ruta}?${mascara}`, { method: 'PATCH', headers: cab, body: JSON.stringify({ fields: campos }) });
};
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

  test('REGISTRO POR LINK: la cuenta nueva nace apagada y no ve nada', async () => {
    // Alguien que recibió el link se registra solo.
    const email = `invitado${Date.now()}@detallitos.test`;
    const r = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'detallitos123', returnSecureToken: true }),
    });
    const nuevo = await r.json();
    const sesion = { token: nuevo.idToken, uid: nuevo.localId };

    // Puede crear SU documento, pero solo apagado y como empleado.
    const comoDebe = await escribir(`usuarios/${sesion.uid}`, {
      nombre: { stringValue: 'Invitado' }, email: { stringValue: email },
      rol: { stringValue: 'empleado' }, activo: { booleanValue: false },
    }, como(sesion));
    assert.equal(comoDebe.status, 200, 'registrarse sí');

    // Y mientras esté apagado, no ve nada del negocio. El catálogo sí: ese es
    // público a propósito, para que el cliente vea los precios sin entrar.
    assert.equal((await leer('clientes', como(sesion))).status, 403, 'no ve los clientes');
    assert.equal((await leer('ventas', como(sesion))).status, 403, 'no ve las ventas');
    assert.equal((await leer('equipo/pin', como(sesion))).status, 403, 'no ve el PIN del equipo');
    assert.equal((await leer(`usuarios/${sesion.uid}`, como(sesion))).status, 200, 'pero sí su propia solicitud');

    // No puede encenderse solo.
    assert.equal((await fusionar(`usuarios/${sesion.uid}`, { activo: { booleanValue: true } }, como(sesion))).status, 403);

    // El dueño lo habilita y ahí sí entra.
    assert.equal((await fusionar(`usuarios/${sesion.uid}`, { activo: { booleanValue: true } }, como(dueno))).status, 200);
    assert.equal((await leer('clientes', como(sesion))).status, 200, 'ya habilitado, trabaja');
    assert.equal((await leer('productos/prueba-reglas', como(sesion))).status, 403, 'pero los costos siguen siendo del dueño');
  });

  test('nadie se registra directamente como dueño', async () => {
    const email = `vivo${Date.now()}@detallitos.test`;
    const r = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'detallitos123', returnSecureToken: true }),
    });
    const nuevo = await r.json();
    const sesion = { token: nuevo.idToken, uid: nuevo.localId };

    assert.equal((await escribir(`usuarios/${sesion.uid}`, {
      nombre: { stringValue: 'Vivo' }, email: { stringValue: email },
      rol: { stringValue: 'dueno' }, activo: { booleanValue: true },
    }, como(sesion))).status, 403, 'registrarse como dueño: no');

    assert.equal((await escribir(`usuarios/${sesion.uid}`, {
      nombre: { stringValue: 'Vivo' }, email: { stringValue: email },
      rol: { stringValue: 'empleado' }, activo: { booleanValue: true },
    }, como(sesion))).status, 403, 'registrarse ya habilitado: tampoco');

    assert.equal((await escribir(`usuarios/otro-uid-cualquiera`, {
      nombre: { stringValue: 'Vivo' }, rol: { stringValue: 'empleado' }, activo: { booleanValue: false },
    }, como(sesion))).status, 403, 'crear la solicitud de otro: tampoco');
  });

  test('sin sesión solo se lee el catálogo público', async () => {
    const sinCabecera = { 'Content-Type': 'application/json' };
    // Esto es lo que ve el cliente desde el link del catálogo.
    assert.equal((await leer('productos_venta/prueba-reglas', sinCabecera)).status, 200, 'el catálogo sí');
    // Todo lo demás, no. Ojo con `productos`: ese lleva el costo.
    for (const ruta of ['productos/prueba-reglas', 'ventas', 'clientes', 'cajas', 'ingresos',
                        'retiros', 'gastos', 'auditoria', 'equipo/pin', 'secretos/mercadolibre']) {
      assert.notEqual((await leer(ruta, sinCabecera)).status, 200, `sin sesión NO se lee ${ruta}`);
    }
  });

  test('las tasas las pone el dueño, no el empleado', async () => {
    const r = await escribir('tasas/2026-01-01', { VES: { integerValue: '1' } }, como(empleado));
    assert.equal(r.status, 403);
    const r2 = await escribir('tasas/2026-01-01', { VES: { integerValue: '3650' } }, como(dueno));
    assert.equal(r2.status, 200);
  });

  // Abrir caja sin querer tranca la gaveta de todo el mundo, porque es una
  // sola. La salida es anular esa apertura, y eso lo hace el dueño desde su
  // pantalla: por eso las reglas tienen que dejarlo tocar un turno que no es
  // suyo, y seguir impidiendo que un empleado toque el de otro.
  test('una apertura por error la anula el dueño, también la de otro', async () => {
    const delPrimo = 'cajas/turno-por-error';
    assert.equal((await escribir(delPrimo, {
      estado: { stringValue: 'abierta' },
      uid: { stringValue: empleado.uid },
      nombreUsuario: { stringValue: 'Primo' },
      dia: { stringValue: '2026-01-02' },
    }, como(empleado))).status, 200, 'el empleado abre su turno');

    // El dueño lo anula: es el arreglo del enredo.
    assert.equal((await fusionar(delPrimo, {
      estado: { stringValue: 'anulada' },
      motivoAnulacion: { stringValue: 'Se abrió sin querer' },
      anuladaPor: { stringValue: 'Dueño' },
    }, como(dueno))).status, 200, 'el dueño sí anula la apertura del empleado');

    // Y suelta la gaveta, que es lo que la tenía trancada.
    assert.equal((await fusionar('equipo/turno', {
      abierto: { booleanValue: false },
    }, como(dueno))).status, 200, 'se suelta el marcador de la gaveta');

    // Lo que NO cambia: el turno de otro sigue siendo intocable para el
    // empleado, y una caja no se borra nunca, ni el dueño.
    const delDueno = 'cajas/turno-del-dueno';
    assert.equal((await escribir(delDueno, {
      estado: { stringValue: 'abierta' },
      uid: { stringValue: dueno.uid },
      nombreUsuario: { stringValue: 'Dueño' },
      dia: { stringValue: '2026-01-02' },
    }, como(dueno))).status, 200);
    assert.equal((await fusionar(delDueno, {
      estado: { stringValue: 'anulada' },
    }, como(empleado))).status, 403, 'el empleado no anula el turno de otro');
    assert.notEqual((await borrar(delPrimo, como(dueno))).status, 200, 'una caja no se borra');
  });

  test('las fotos las toma el equipo; de afuera solo se ven', async () => {
    const sinCabecera = { 'Content-Type': 'application/json' };
    await escribir('fotos/prueba-reglas', { datos: { stringValue: 'data:image/webp;base64,xx' } }, comoAdmin);
    assert.equal((await leer('fotos/prueba-reglas', como(empleado))).status, 200, 'verlas sí');
    // El empleado es el que está en el mostrador con el producto en la mano.
    assert.equal((await escribir('fotos/prueba-reglas', { datos: { stringValue: 'otra' } }, como(empleado))).status, 200,
      'el empleado sí toma fotos');
    assert.equal((await escribir('fotos/prueba-reglas', { datos: { stringValue: 'ajena' } }, sinCabecera)).status, 403,
      'pero de afuera nadie las cambia');
  });
  test('el empleado puede vender: descuenta stock, pero no toca precios ni ve costos', async () => {
    // Al cobrar, la app graba la venta Y descuenta el stock en el MISMO lote.
    // Con las reglas viejas el stock era solo del dueño, así que el lote entero
    // se caía y la venta del empleado no se guardaba, en silencio.
    const n = (v) => ({ integerValue: String(v) });
    await escribir('productos/p-stock', { nombre: { stringValue: 'Lápiz' }, stock: n(10), precioUSD: n(100), costoUSD: n(70) }, comoAdmin);
    await escribir('productos_venta/p-stock', { nombre: { stringValue: 'Lápiz' }, stock: n(10), precioUSD: n(100) }, comoAdmin);

    assert.equal((await fusionar('productos/p-stock', { stock: n(9) }, como(empleado))).status, 200,
      'el empleado tiene que poder descontar stock al vender');
    assert.equal((await fusionar('productos_venta/p-stock', { stock: n(9) }, como(empleado))).status, 200,
      'y también en el espejo público');
    assert.equal((await fusionar('productos/p-stock', { precioUSD: n(1) }, como(empleado))).status, 403,
      'pero NO puede cambiar el precio');
    assert.notEqual((await leer('productos/p-stock', como(empleado))).status, 200,
      'ni ver el costo');
  });

});
