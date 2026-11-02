// Arma (o rearma desde cero) el NEGOCIO DE DEMOSTRACIÓN: datos inventados para
// que cualquiera pruebe la app sin tocar los datos reales.
//
// Uso:  node scripts/sembrar-demo.mjs            → muestra qué haría
//       node scripts/sembrar-demo.mjs --guardar  → borra el negocio "demo" y lo rehace
//
// El demo vive en `negocios/demo`, dentro del mismo proyecto de Firebase pero
// en otro negocio: las reglas se evalúan por negocio, así que las cuentas demo
// no ven nada de `negocios/mis-detallitos`. NUNCA toca el negocio real: el
// negocio está fijado aquí abajo, no se lee de NEGOCIO.
//
// Se corre otra vez cuando alguien haya dejado el demo hecho un desastre.

process.env.NEGOCIO = 'demo';
const { col, db, NEGOCIO } = await import('./admin.mjs');
const { getAuth } = await import('firebase-admin/auth');
const { normalizar, claveProducto } = await import('../public/js/core/texto.js');
const { versionVenta } = await import('../public/js/core/producto-publico.js');

if (NEGOCIO !== 'demo') { console.error('Esto solo toca el negocio "demo".'); process.exit(1); }
const guardar = process.argv.includes('--guardar');

export const CUENTAS_DEMO = [
  { email: 'dueno@demo.misdetallitos', clave: 'demo1234', nombre: 'Dueña Demo', rol: 'dueno' },
  { email: 'empleado@demo.misdetallitos', clave: 'demo1234', nombre: 'Empleado Demo', rol: 'empleado' },
];

// Números repetibles: el demo sale igual cada vez que se siembra.
let semilla = 20261102;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const uno = (lista) => lista[Math.floor(azar() * lista.length)];

const TASAS = { VES: 4500, COP: 3900 };   // Bs en céntimos por USD, pesos por USD

// [nombre, categoría, precioUSD en centavos, costoUSD en centavos, stock, mínimo, alias]
// Precios a propósito exagerados/graciosos: es un demo.
const CATALOGO = [
  ['Lápiz Mongol N2', 'Lápices', 60, 25, 240, 50, ['lapiz', 'mongol']],
  ['Lápiz de Oro 24K (decorativo)', 'Lápices', 9900, 1200, 3, 2, ['lapiz oro']],
  ['Lapicero Bic Azul', 'Lapiceros', 50, 20, 180, 40, ['bolígrafo', 'boligrafo', 'pluma']],
  ['Lapicero Bic Negro', 'Lapiceros', 50, 20, 150, 40, ['boligrafo negro']],
  ['Lapicero que Escribe Solo', 'Lapiceros', 4500, 300, 5, 3, []],
  ['Borrador Nata', 'Escolar', 40, 15, 120, 30, ['goma']],
  ['Sacapuntas Metálico', 'Escolar', 70, 28, 90, 20, ['tajador']],
  ['Regla 30 cm', 'Escolar', 100, 40, 60, 15, []],
  ['Compás Profesional', 'Escolar', 450, 190, 18, 5, []],
  ['Cuaderno Universitario 100 hojas', 'Cuadernos', 280, 140, 75, 20, ['cuaderno rayas']],
  ['Cuaderno Cuadriculado', 'Cuadernos', 300, 150, 40, 15, ['cuadriculado']],
  ['Cuaderno que Hace la Tarea', 'Cuadernos', 12000, 800, 2, 2, ['cuaderno magico']],
  ['Resma Carta 500 hojas', 'Papel', 650, 480, 35, 10, ['resma', 'papel carta']],
  ['Resma Oficio 500 hojas', 'Papel', 720, 540, 22, 8, ['papel oficio']],
  ['Cartulina Blanca', 'Papel', 45, 18, 200, 50, []],
  ['Cartulina Fosforescente', 'Papel', 80, 30, 110, 30, []],
  ['Foami Escarchado', 'Manualidades', 120, 45, 85, 20, ['foami', 'goma eva']],
  ['Pega Blanca 250 ml', 'Manualidades', 220, 100, 30, 10, ['colbón', 'colbon']],
  ['Silicón en Barra', 'Manualidades', 60, 22, 8, 25, ['silicon']],
  ['Pistola de Silicón', 'Manualidades', 1100, 600, 12, 4, []],
  ['Témpera Roja 60 ml', 'Pintura', 180, 80, 40, 12, ['tempera']],
  ['Témpera Azul 60 ml', 'Pintura', 180, 80, 38, 12, []],
  ['Pincel Plano N°8', 'Pintura', 150, 60, 55, 15, []],
  ['Marcador Permanente', 'Marcadores', 160, 70, 70, 20, ['sharpie']],
  ['Marcador Fluorescente', 'Marcadores', 140, 60, 4, 15, ['resaltador']],
  ['Grapadora Mediana', 'Oficina', 600, 280, 16, 5, []],
  ['Grapas Caja x1000', 'Oficina', 130, 50, 48, 12, []],
  ['Clips Caja x100', 'Oficina', 90, 35, 60, 15, []],
  ['Carpeta Manila', 'Oficina', 50, 18, 160, 40, ['folder']],
  ['Sobre Manila Carta', 'Oficina', 30, 10, 220, 50, []],
  ['Tijera Escolar', 'Escolar', 250, 110, 33, 10, []],
  ['Calculadora Científica', 'Oficina', 1800, 1100, 9, 3, []],
  ['Mochila Dinosaurio', 'Mochilas', 2400, 1300, 14, 4, ['bulto']],
  ['Mochila Unicornio Gigante', 'Mochilas', 3200, 1700, 6, 3, ['bulto unicornio']],
  ['Pelota Antiestrés', 'Regalos', 350, 120, 25, 8, []],
  ['Tarjeta de Cumpleaños', 'Regalos', 200, 70, 44, 12, []],
  ['Bolsa de Regalo Grande', 'Regalos', 150, 50, 58, 15, []],
  // Servicios: no llevan stock.
  ['Fotocopia B/N carta', 'Servicios', 10, 3, 0, 0, ['copia', 'fotocopia']],
  ['Impresión a color carta', 'Servicios', 40, 14, 0, 0, ['impresion color']],
  ['Plastificado carta', 'Servicios', 120, 45, 0, 0, ['laminado']],
  ['Anillado hasta 100 hojas', 'Servicios', 200, 80, 0, 0, ['empastado']],
];

// Se usan los NOMBRES, categorías y alias del inventario real para que el demo
// parezca de verdad, pero nada más: los precios, costos y existencias se
// inventan aquí (precios locos a propósito). Es solo lectura sobre el negocio
// real y NO se copia ningún costo, proveedor, foto, código ni cliente.
let desdeInventario = false;
try {
  const real = await db.collection('negocios').doc('mis-detallitos').collection('productos').get();
  const lista = real.docs.map((d) => d.data()).filter((p) => p.nombre && p.activo !== false);
  if (lista.length >= 10) {
    CATALOGO.length = 0;
    for (const p of lista.sort(() => azar() - 0.5).slice(0, 90)) {
      const servicio = p.tipo === 'servicio';
      const precio = servicio ? entre(10, 400) : entre(30, 6000);
      const costo = Math.max(1, Math.round(precio * (0.35 + azar() * 0.4)));
      CATALOGO.push([String(p.nombre).slice(0, 80), String(p.categoria || 'Varios').slice(0, 40), precio, costo,
        servicio ? 0 : entre(0, 200), servicio ? 0 : entre(3, 30), (p.alias || []).map(String).slice(0, 5),
        servicio ? 'servicio' : 'producto']);
    }
    desdeInventario = true;
  }
} catch (e) { console.warn('No se pudo leer el inventario real; se usa la lista inventada:', e.message); }

const CLIENTES = [
  ['Doña Carmen', '0414-555-0101'], ['Prof. Ramírez', '0424-555-0102'],
  ['Colegio San Benito', '0412-555-0103'], ['Luisito', ''], ['Tía Yolanda', '0416-555-0105'],
];

const dia = (atras) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - atras);
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- armar datos
const productos = CATALOGO.map(([nombre, categoria, precioUSD, costoUSD, stock, stockMinimo, alias, tipo], i) => {
  const servicio = tipo ? tipo === 'servicio' : categoria === 'Servicios';
  const base = {
    nombre, nombreNorm: normalizar(nombre), clave: claveProducto(nombre),
    alias, aliasNorm: alias.map(normalizar),
    categoria, sku: `DEMO-${String(i + 1).padStart(3, '0')}`, codigoBarras: '',
    tipo: servicio ? 'servicio' : 'producto', tipoPrecio: 'fijo',
    precioUSD, precioCOP: Math.round((precioUSD * TASAS.COP) / 100 / 50) * 50,
    precioMinimoUSD: 0, escalas: [],
    costoUSD, costoCOP: Math.round((costoUSD * TASAS.COP) / 100), costoEstimado: false, costoPaquete: null,
    stock, stockMinimo, unidad: 'unidad',
    fotoPendiente: false, tieneFoto: false, incompleto: false, activo: true, importId: null,
  };
  if (nombre.startsWith('Fotocopia')) {
    base.escalas = [
      { desdeCant: 50, precioUSD: 8, precioCOP: Math.round(0.08 * TASAS.COP) },
      { desdeCant: 200, precioUSD: 6, precioCOP: Math.round(0.06 * TASAS.COP) },
    ];
  }
  return { id: `demo-p${String(i + 1).padStart(3, '0')}`, ...base };
});
const vendibles = productos.filter((p) => p.tipo === 'producto' ? p.stock > 0 : true);

const clientes = CLIENTES.map(([nombre, telefono], i) => (
  { id: `demo-c${i + 1}`, nombre, nombreNorm: normalizar(nombre), telefono, nota: '', saldoUSD: 0, creado: dia(30) }));

// Ventas de los últimos 21 días, con pagos mezclados.
const ventas = [], movimientos = [];
for (let atras = 21; atras >= 0; atras--) {
  const n = atras === 0 ? entre(3, 5) : entre(4, 9);
  for (let k = 0; k < n; k++) {
    const d = dia(atras); d.setHours(8 + Math.floor((k * 10) / n) + entre(0, 1), entre(0, 59));
    const cuantas = entre(1, 4);
    const elegidos = new Map();
    for (let j = 0; j < cuantas; j++) { const p = uno(vendibles); elegidos.set(p.id, p); }
    const lineas = [...elegidos.values()].map((p) => {
      const cantidad = p.nombre.startsWith('Fotocopia') ? entre(1, 60) : entre(1, 3);
      const esc = [...p.escalas].reverse().find((e) => cantidad >= e.desdeCant);
      return {
        productoId: p.id, nombre: p.nombre, cantidad,
        precioUSD: esc ? esc.precioUSD : p.precioUSD, costoUSD: p.costoUSD,
        precioEditado: false, precioOriginalUSD: p.precioUSD, autorizadoPor: null,
        precioCOP: esc ? esc.precioCOP : p.precioCOP,
      };
    });
    const totalUSD = lineas.reduce((t, l) => t + l.precioUSD * l.cantidad, 0);
    const costo = lineas.reduce((t, l) => t + l.costoUSD * l.cantidad, 0);
    const moneda = uno(['USD', 'COP', 'COP', 'VES']);
    const tasa = moneda === 'USD' ? 100 : TASAS[moneda];
    const fiadoA = atras <= 6 && azar() < 0.07 ? uno(clientes) : null;
    const quien = azar() < 0.55 ? CUENTAS_DEMO[0] : CUENTAS_DEMO[1];
    const id = `demo-v${ventas.length + 1}`;
    ventas.push({
      id, numero: d.getTime(), lineas, totalUSD, costoTotalUSD: costo, gananciaUSD: totalUSD - costo,
      pagos: fiadoA ? [] : [{ moneda, monto: Math.round((totalUSD * tasa) / 100), tasa, montoUSD: totalUSD }],
      pagadoUSD: fiadoA ? 0 : totalUSD, saldoUSD: fiadoA ? totalUSD : 0,
      fiado: !!fiadoA, clienteId: fiadoA?.id || null, nota: '', estado: 'ok',
      uid: `demo-${quien.rol}`, nombreUsuario: quien.nombre, ts: d, dia: iso(d),
    });
    if (fiadoA) fiadoA.saldoUSD += totalUSD;
    for (const l of lineas) {
      const p = productos.find((x) => x.id === l.productoId);
      if (p.tipo === 'servicio') continue;
      movimientos.push({
        productoId: p.id, nombre: p.nombre, tipo: 'venta', cantidad: -l.cantidad,
        costoUnitUSD: l.costoUSD, ventaId: id, uid: `demo-${quien.rol}`, nombreUsuario: quien.nombre, ts: d, dia: iso(d),
      });
    }
  }
}

const gastos = [
  ['Mercancía', 'Caja fuerte', 18000, 'Resmas y cuadernos'],
  ['Servicios (luz, agua, internet)', 'Caja', 3500, 'Internet del mes'],
  ['Sueldos / pago de trabajador', 'Caja fuerte', 12000, 'Semana del empleado'],
  ['Transporte / flete', 'Caja', 1500, 'Flete de mochilas'],
].map(([categoria, lugar, montoUSD, nota], i) => {
  const d = dia(3 + i * 4);
  return {
    id: `demo-g${i + 1}`, categoria, lugar, montoUSD, moneda: 'USD', monto: montoUSD, tasa: 100, nota, foto: null,
    uid: 'demo-dueno', nombreUsuario: CUENTAS_DEMO[0].nombre, ts: d, dia: iso(d),
  };
});

const tasasDocs = [];
for (let atras = 21; atras >= 0; atras--) {
  const d = dia(atras);
  tasasDocs.push({ id: iso(d), VES: TASAS.VES + (21 - atras) * 8, COP: TASAS.COP, fuente: 'demo', ts: d });
}

const total = ventas.reduce((t, v) => t + v.totalUSD, 0);
console.log(`Demo (${desdeInventario ? 'nombres de tu inventario, precios inventados' : 'lista inventada'}): ${productos.length} productos, ${clientes.length} clientes, ${ventas.length} ventas `
  + `(US$ ${(total / 100).toFixed(2)}), ${gastos.length} gastos, ${tasasDocs.length} tasas`);
if (!guardar) { console.log('\nNo se escribió nada. Para guardarlo, agrega --guardar'); process.exit(0); }

// ------------------------------------------------------------------- escribir
console.log(`\nBorrando lo que haya en negocios/${NEGOCIO}…`);
const negocioRef = db.collection('negocios').doc(NEGOCIO);
for (const c of await negocioRef.listCollections()) await db.recursiveDelete(c);

// Cuentas de Auth (si ya existen, solo se les pone la clave de nuevo).
const auth = getAuth();
const uids = {};
for (const c of CUENTAS_DEMO) {
  try {
    const u = await auth.getUserByEmail(c.email);
    await auth.updateUser(u.uid, { password: c.clave, displayName: c.nombre });
    uids[c.rol] = u.uid;
  } catch {
    uids[c.rol] = (await auth.createUser({ email: c.email, password: c.clave, displayName: c.nombre })).uid;
  }
}
// La marca `demo` va en el token: las reglas de Firestore y de Storage la usan
// para que estas cuentas solo valgan dentro de negocios/demo.
for (const uid of Object.values(uids)) await auth.setCustomUserClaims(uid, { demo: true });
// Las ventas se firman con el uid real de cada cuenta (las reglas del empleado
// filtran por uid).
for (const o of [...ventas, ...movimientos, ...gastos]) {
  const rol = o.uid.replace('demo-', '');
  o.uid = uids[rol] || uids.dueno;
}

let lote = db.batch(), n = 0;
const poner = async (referencia, datos) => {
  lote.set(referencia, datos);
  if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
};

for (const c of CUENTAS_DEMO) {
  await poner(col('usuarios').doc(uids[c.rol]), { nombre: c.nombre, email: c.email, rol: c.rol, activo: true, creado: new Date() });
}
await poner(col('config').doc('general'), { baseBs: 'EUR', tasasFijas: {}, demo: true });
for (const { id, ...t } of tasasDocs) await poner(col('tasas').doc(id), t);
for (const { id, ...p } of productos) {
  await poner(col('productos').doc(id), { ...p, actualizado: new Date() });
  await poner(col('productos_venta').doc(id), { ...versionVenta(p), actualizado: new Date() });
}
for (const { id, ...c } of clientes) await poner(col('clientes').doc(id), c);
for (const { id, ...v } of ventas) await poner(col('ventas').doc(id), v);
for (const m of movimientos) await poner(col('movimientos').doc(), m);
for (const { id, ...g } of gastos) await poner(col('gastos').doc(id), g);
await lote.commit();

console.log(`✓ Demo listo en negocios/${NEGOCIO}`);
for (const c of CUENTAS_DEMO) console.log(`  ${c.rol.padEnd(9)} ${c.email}  clave: ${c.clave}`);
