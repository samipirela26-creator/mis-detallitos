// respaldo.test.mjs — la prueba que convierte el respaldo EN un respaldo.
//
// "El respaldo no restauró y perdí todo" fue la queja que más se repitió en la
// investigación de reseñas, y la que nadie perdona. Un archivo que se baja pero
// que nunca se probó restaurando es peor que no tener ninguno: el dueño deja de
// hacer su propia copia porque cree que está cubierto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../public/js/core/respaldo-formato.js';

/** Un Timestamp de mentira con la misma forma que el de Firestore. */
class TS {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toDate() { return new Date(this.seconds * 1000); }
}

/** Datos con todas las formas que de verdad guarda la app. */
function datosDePrueba() {
  return {
    productos: [{
      id: 'p1', nombre: 'Cuaderno', precioUSD: 120, precioCOP: 5000, costoUSD: 80,
      costoEstimado: true, activo: true, alias: ['libreta', 'cuaderno doble raya'],
      escalas: [{ desde: 10, precioUSD: 100 }, { desde: 50, precioUSD: 90 }],
      creado: new TS(1700000000, 123456789), sinFoto: null,
    }],
    ventas: [{
      id: 'v1', totalUSD: 730, saldoUSD: 0, estado: 'ok',
      lineas: [{ productoId: 'p1', cantidad: 2, precioUSD: 120, nombre: 'Cuaderno' }],
      pagos: [
        { moneda: 'USD', monto: 500, tasa: 100, montoUSD: 500 },
        { moneda: 'COP', monto: 20000, tasa: 4100, montoUSD: 488 },
      ],
      ts: new TS(1700000500, 0),
    }],
    clientes: [{ id: 'c1', nombre: 'José Ramírez', nombreNorm: 'jose ramirez', saldoUSD: 450, telefono: '0412-555' }],
    cajas: [], gastos: [], tasas: [{ id: '2026-10-23', VES: 98061, COP: 4100, ts: new TS(1700001000, 500) }],
  };
}

test('una fecha de Firestore sobrevive la ida y la vuelta al segundo y al nanosegundo', () => {
  const original = new TS(1700000000, 123456789);
  const plano = r.aPlano(original);
  // Pasa por JSON de verdad: es lo que hace el archivo que se baja.
  const vuelta = r.aFirestore(JSON.parse(JSON.stringify(plano)), TS);
  assert.ok(vuelta instanceof TS, 'volvió como otra cosa, no como Timestamp');
  assert.equal(vuelta.seconds, 1700000000);
  assert.equal(vuelta.nanoseconds, 123456789);
});

test('las fechas anidadas dentro de arreglos y objetos también vuelven', () => {
  const dato = { a: [{ cuando: new TS(111, 222) }], b: { c: { d: new TS(333, 0) } } };
  const vuelta = r.aFirestore(JSON.parse(JSON.stringify(r.aPlano(dato))), TS);
  assert.equal(vuelta.a[0].cuando.seconds, 111);
  assert.equal(vuelta.a[0].cuando.nanoseconds, 222);
  assert.equal(vuelta.b.c.d.seconds, 333);
});

test('exportar, pasar por archivo y restaurar devuelve EXACTAMENTE lo mismo', () => {
  const antes = datosDePrueba();
  const archivo = JSON.stringify(r.armar(antes, { negocio: 'mis-detallitos' }));
  const leido = JSON.parse(archivo);

  const v = r.validar(leido);
  assert.ok(v.ok, v.error);

  for (const [coleccion, filas] of Object.entries(antes)) {
    const restaurado = (leido.colecciones[coleccion] || []).map((d) => {
      const { id, ...campos } = d;
      return { id, ...r.aFirestore(campos, TS) };
    });
    assert.deepEqual(restaurado, filas, `la colección "${coleccion}" no volvió igual`);
  }
});

test('ni un centavo se pierde por el camino', () => {
  const antes = datosDePrueba();
  const leido = JSON.parse(JSON.stringify(r.armar(antes)));
  const venta = leido.colecciones.ventas[0];
  assert.equal(venta.totalUSD, 730);
  assert.equal(venta.pagos[0].monto, 500);
  assert.equal(venta.pagos[1].monto, 20000);
  assert.equal(venta.pagos[1].tasa, 4100, 'la tasa congelada del pago es lo que defiende el precio meses después');
  assert.equal(leido.colecciones.productos[0].precioCOP, 5000);
  assert.equal(leido.colecciones.clientes[0].saldoUSD, 450);
  // Las escalas son objetos dentro de un arreglo: el sitio donde más fácil se
  // pierde algo al serializar.
  assert.deepEqual(leido.colecciones.productos[0].escalas, [{ desde: 10, precioUSD: 100 }, { desde: 50, precioUSD: 90 }]);
});

test('los id sobreviven: sin ellos el fiado se despega de su cliente', () => {
  const leido = JSON.parse(JSON.stringify(r.armar(datosDePrueba())));
  assert.equal(leido.colecciones.productos[0].id, 'p1');
  assert.equal(leido.colecciones.ventas[0].id, 'v1');
  assert.equal(leido.colecciones.clientes[0].id, 'c1');
  assert.equal(leido.colecciones.tasas[0].id, '2026-10-23');
});

test('el respaldo NO se lleva llaves ni el hash del PIN', () => {
  assert.ok(!r.COLECCIONES.includes('secretos'), 'las llaves de API no van en un archivo que se manda por WhatsApp');
  assert.ok(!r.COLECCIONES.includes('equipo'), 'el hash del PIN es una credencial');
  assert.ok(!r.COLECCIONES.includes('productos_venta'), 'el espejo del empleado se reconstruye, no se restaura');
});

test('un archivo que no sirve se rechaza ANTES de escribir nada', () => {
  assert.equal(r.validar(null).ok, false);
  assert.equal(r.validar({}).ok, false);
  assert.equal(r.validar({ app: 'otra-cosa', formato: 1, colecciones: {} }).ok, false);
  assert.equal(r.validar({ app: 'mis-detallitos', colecciones: {} }).ok, false);          // sin formato
  assert.equal(r.validar({ app: 'mis-detallitos', formato: 1, colecciones: {} }).ok, false); // vacío

  // De una versión futura: mejor parar que restaurar campos que no se entienden.
  const futuro = r.validar({ app: 'mis-detallitos', formato: 99, colecciones: { productos: [{ id: 'x' }] } });
  assert.equal(futuro.ok, false);
  assert.match(futuro.error, /más nueva/);

  // Un documento sin id no se puede volver a poner en su sitio.
  const roto = r.validar({ app: 'mis-detallitos', formato: 1, colecciones: { productos: [{ nombre: 'sin id' }] } });
  assert.equal(roto.ok, false);
  assert.match(roto.error, /sin id/);
});

test('el resumen dice qué trae el archivo, para mirarlo antes de aceptar', () => {
  const v = r.validar(JSON.parse(JSON.stringify(r.armar(datosDePrueba()))));
  assert.ok(v.ok);
  assert.equal(v.total, 4);                       // 1 producto + 1 venta + 1 cliente + 1 tasa
  const nombres = v.resumen.map((x) => x.nombre);
  assert.ok(nombres.includes('productos'));
  assert.ok(!nombres.includes('cajas'), 'las colecciones vacías no se listan');
});

test('el nombre del archivo deja ver cuál es el más nuevo sin abrirlo', () => {
  assert.equal(
    r.nombreArchivo(new Date(2026, 9, 23, 9, 5)),
    'respaldo-detallitos-2026-10-23-0905.json',
  );
});

// --- el espejo del empleado ---------------------------------------------------
// Vive aquí porque la restauración lo REHACE, y es el único momento en que se
// reconstruye desde fuera de la app, con llave de administrador y sin reglas
// que frenen nada.

import { versionVenta, SECRETOS } from '../public/js/core/producto-publico.js';

test('el catálogo del empleado nunca lleva costos, se rehaga desde donde se rehaga', () => {
  const producto = {
    nombre: 'Cuaderno', nombreNorm: 'cuaderno', precioUSD: 120, precioCOP: 5000,
    stock: 12, categoria: 'Papelería', activo: true,
    costoUSD: 80, costoCOP: 3000, costoEstimado: true,
    margenObjetivo: 40, proveedor: 'Distribuidora X', notaCosto: 'factura 123',
    costoPaquete: { unidades: 12, totalUSD: 960 },
    incompleto: true,
  };
  const publico = versionVenta(producto);

  for (const campo of SECRETOS) {
    assert.ok(!(campo in publico), `"${campo}" llegó al empleado y no debía`);
  }
  assert.ok(!('incompleto' in publico));
  // Y lo que sí tiene que llegar, llega.
  assert.equal(publico.nombre, 'Cuaderno');
  assert.equal(publico.precioUSD, 120);
  assert.equal(publico.precioCOP, 5000);
  assert.equal(publico.stock, 12);
});

test('el precio mínimo solo viaja si el dueño puso uno', () => {
  // Con mínimo: viaja, porque sin él el PIN no se pide nunca.
  assert.equal(versionVenta({ nombre: 'x', precioMinimoUSD: 100 }).precioMinimoUSD, 100);
  // Sin mínimo: NO viaja. Un cero sería el costo redondeado, y eso lo delata.
  assert.ok(!('precioMinimoUSD' in versionVenta({ nombre: 'x', precioMinimoUSD: 0 })));
  assert.ok(!('precioMinimoUSD' in versionVenta({ nombre: 'x' })));
});

test('versionVenta no muerde el producto original', () => {
  const p = { nombre: 'x', costoUSD: 50 };
  versionVenta(p);
  assert.equal(p.costoUSD, 50, 'le borró el costo al objeto de verdad');
});
