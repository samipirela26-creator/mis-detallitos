// Carga los servicios de impresión, copiado y plastificado en el catálogo.
//
// Uso:  node scripts/servicios-impresion.mjs             → muestra qué haría, NO escribe
//       node scripts/servicios-impresion.mjs --aplicar   → escribe
//       node scripts/servicios-impresion.mjs --borrar    → desactiva los que creó
//
// Por qué un script y no a mano en la app: son 11 altas con escalas, mínimos y
// sinónimos. A mano en el teléfono es media hora y un error de tipeo seguro.
//
// Tres cosas que este script hace a propósito y que no hay que "simplificar":
//
//  - Son `tipo: 'servicio'`. Así no piden foto, no entran en el conteo de
//    inventario ni en los avisos de stock bajo, y sí pueden salir en los chips
//    del mostrador (ver data/favoritos.js, que deja pasar servicios sin stock).
//  - El precio se guarda en PESOS (`precioCOP`) y el dólar se deriva con la
//    tasa del día, igual que el resto del catálogo. La escala del mayoreo
//    también lleva su peso, para que `recalcularPrecios` la mueva junto con el
//    precio base.
//  - Escribe `productos` Y `productos_venta` en el mismo lote. El espejo no
//    lleva costo. Si se escribe uno solo, el empleado ve precios viejos o ve
//    costos.
//
// Los costos son los que dio Samuel el 19/10/2026, en pesos:
//   resma de 500 hojas (carta u oficio) 15.000  ->  30 por hoja
//   hoja de opalina 400 · papel fotográfico 1.000 · vinilo autoadhesible 2.000
//   mica de carnet: 5 USD las 100  ->  0,05 USD cada una
//   mica tamaño carta: 21 USD las 100  ->  0,21 USD cada una
// El tóner y la tinta van ESTIMADOS (ver TONER_POR_HOJA e INTA más abajo): esos
// dos son los únicos números que faltan de factura, y por eso los servicios que
// imprimen quedan con `costoEstimado: true`. Los plastificados NO: su costo es
// la mica y ese sí es un precio de compra real.
//
// El costo se guarda en pesos (`costoCOP`) además de en dólares, porque se paga
// en pesos. Si solo fuera en dólares, cada tasa nueva corregiría el precio y
// dejaría el costo quieto, y el margen de los reportes se abriría solo.

import { col } from './admin.mjs';

const aplicar = process.argv.includes('--aplicar');
const borrar = process.argv.includes('--borrar');
const cop = (n) => Number(n).toLocaleString('es-VE');
const d = (c) => '$' + (c / 100).toFixed(2);

// Marca para poder encontrarlos después (y desactivarlos de un golpe).
const LOTE = 'servicios-impresion-2026-10';

// --- normalización, igual que core/texto.js ----------------------------------
// Copiada a propósito: `public/js/core/texto.js` importa de rutas del navegador
// en otros módulos del paquete y este script corre en node. Si cambia allá,
// cambia aquí: lo que depende de que coincidan es la deduplicación por `clave`.
const normalizar = (t = '') => String(t)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/(\d)([a-z])/g, '$1 $2')
  .replace(/([a-z])(\d)/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim();
const singular = (p = '') => (p.length > 3 && p.endsWith('es') ? p.slice(0, -2)
  : p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p);
const tokens = (t = '') => normalizar(t).split(' ').filter(Boolean).map(singular);
const claveProducto = (n = '') => tokens(n).sort().join(' ');

// --- la lista, tal como la dictó Samuel el 19/10/2026 ------------------------
// `minimoCOP` es el piso: por debajo de eso el POS pide el PIN del dueño.
// En la impresión B/N carta el piso es el precio del mayoreo (300), porque ese
// sí es un precio real de venta; en los demás el piso es el precio mismo, así
// que cualquier rebaja pasa por el PIN.

// --- consumibles, en pesos por hoja ------------------------------------------
const HOJA = 30;          // resma de 500 en 15.000
const OPALINA = 400;
const FOTOGRAFICO = 1000;
const VINILO = 2000;   // la hoja, corregido por Samuel el 19/10
const MICA_CARNET_USD = 5;   // las 100
const MICA_CARTA_USD = 21;   // las 100

// Los dos estimados. Todos los márgenes se calculan como si todo se imprimiera
// en la Canon imageCLASS, que es la que sale más caro por hoja: si el número
// cuadra ahí, cuadra en la Epson.
const TONER_POR_HOJA = 31;   // tóner genérico ~50.000 para ~1.600 hojas
const TINTA_TEXTO = 40;      // página con color de texto o gráfico liviano
const TINTA_LLENA = 200;     // página cubierta de lado a lado (foto)

const SERVICIOS = [
  {
    nombre: 'Impresión B/N carta',
    precioCOP: 1000, minimoCOP: 300,
    costoCOP: HOJA + TONER_POR_HOJA, estimado: true,
    escalas: [{ desdeCant: 200, precioCOP: 300 }],
    alias: ['fotocopia', 'copia blanco y negro', 'impresion carta', 'print bn'],
  },
  {
    nombre: 'Impresión o copia a color carta',
    precioCOP: 1500, minimoCOP: 1500,
    costoCOP: HOJA + TINTA_TEXTO, estimado: true,
    alias: ['copia color', 'impresion color carta', 'color carta'],
  },
  {
    nombre: 'Impresión B/N oficio',
    precioCOP: 1500, minimoCOP: 1500,
    costoCOP: HOJA + TONER_POR_HOJA, estimado: true,
    alias: ['copia oficio', 'oficio blanco y negro', 'impresion oficio'],
  },
  {
    nombre: 'Impresión a color oficio',
    precioCOP: 2000, minimoCOP: 2000,
    costoCOP: HOJA + TINTA_TEXTO, estimado: true,
    alias: ['color oficio', 'copia color oficio'],
  },
  {
    nombre: 'Plastificado tipo carnet',
    precioCOP: 4000, minimoCOP: 4000,
    costoUSD: Math.round((MICA_CARNET_USD / 100) * 100), estimado: false,
    alias: ['laminado carnet', 'plastificar carnet', 'carnet'],
  },
  {
    nombre: 'Plastificado tamaño carta',
    precioCOP: 6000, minimoCOP: 6000,
    costoUSD: Math.round((MICA_CARTA_USD / 100) * 100), estimado: false,
    alias: ['laminado carta', 'plastificar carta'],
  },
  {
    nombre: 'Impresión en opalina B/N',
    precioCOP: 2000, minimoCOP: 2000,
    costoCOP: OPALINA + TONER_POR_HOJA, estimado: true,
    alias: ['opalina blanco y negro', 'opalina bn'],
  },
  {
    nombre: 'Impresión en opalina a color',
    precioCOP: 2500, minimoCOP: 2500,
    costoCOP: OPALINA + TINTA_TEXTO, estimado: true,
    alias: ['opalina color'],
  },
  {
    nombre: 'Impresión en papel fotográfico',
    precioCOP: 10000, minimoCOP: 10000,
    costoCOP: FOTOGRAFICO + TINTA_TEXTO, estimado: true,
    alias: ['papel fotografico', 'foto impresa', 'impresion fotografica'],
  },
  {
    nombre: 'Impresión en papel fotográfico full color',
    precioCOP: 15000, minimoCOP: 15000,
    costoCOP: FOTOGRAFICO + TINTA_LLENA, estimado: true,
    alias: ['papel fotografico full color', 'foto full color'],
  },
  {
    nombre: 'Impresión de stickers',
    precioCOP: 10000, minimoCOP: 10000,
    costoCOP: VINILO + TINTA_LLENA, estimado: true,
    alias: ['sticker', 'calcomania', 'adhesivo impreso'],
  },
  {
    nombre: 'Impresión en vinilo autoadhesible',
    precioCOP: 12000, minimoCOP: 12000,
    costoCOP: VINILO + TINTA_LLENA, estimado: true,
    alias: ['vinilo', 'autoadhesivo', 'vinilo adhesivo'],
  },
];

// --- la tasa del día ---------------------------------------------------------
const hoy = new Date().toISOString().slice(0, 10);
let tasaCOP = null, diaTasa = null;
for (let i = 0; i < 10 && !tasaCOP; i++) {
  const clave = new Date(Date.parse(hoy) - i * 86400000).toISOString().slice(0, 10);
  const snap = await col('tasas').doc(clave).get();
  if (snap.exists && snap.data().COP > 0) { tasaCOP = snap.data().COP; diaTasa = clave; }
}
if (!tasaCOP) {
  console.error('No hay tasa del peso de los últimos 10 días. Cárgala en la app primero.');
  process.exit(1);
}
const aUSD = (pesos) => Math.round((pesos * 100) / tasaCOP);

/** El costo de un servicio, en centavos de dólar. La mica ya viene en dólares. */
const costoDe = (s) => (s.costoUSD != null ? s.costoUSD : aUSD(s.costoCOP || 0));

// --- corregir precios y costos de los que ya están ---------------------------
// Para cuando aparezca la factura del tóner o de la tinta: se cambia la
// constante de arriba y esto lo baja a los servicios ya creados, sin
// duplicarlos y sin tocar el resto del catálogo.
//
//   node scripts/servicios-impresion.mjs --actualizar             → muestra
//   node scripts/servicios-impresion.mjs --actualizar --aplicar   → escribe
if (process.argv.includes('--actualizar')) {
  const snap = await col('productos').where('importId', '==', LOTE).get();
  const porClave = new Map(snap.docs.map((doc) => [doc.data().clave, doc]));
  const lote = col('productos').firestore.batch();
  let n = 0;
  for (const s of SERVICIOS) {
    const doc = porClave.get(claveProducto(s.nombre));
    if (!doc || !(s.precioCOP > 0)) continue;
    const costoUSD = costoDe(s);
    const costoCOP = s.costoCOP || Math.round((costoUSD / 100) * tasaCOP);
    const publico = {
      precioCOP: s.precioCOP,
      precioUSD: aUSD(s.precioCOP),
      precioMinimoUSD: aUSD(s.minimoCOP),
      escalas: (s.escalas || []).map((e) => ({
        desdeCant: e.desdeCant, precioCOP: e.precioCOP, precioUSD: aUSD(e.precioCOP),
      })),
      actualizado: new Date(),
    };
    const viejo = doc.data();
    const cambia = viejo.precioCOP !== s.precioCOP || (viejo.costoCOP || 0) !== costoCOP;
    if (!cambia) continue;
    console.log(`  ${s.nombre.slice(0, 40).padEnd(40)} precio ${cop(viejo.precioCOP)} → ${cop(s.precioCOP)} · costo ${cop(viejo.costoCOP || 0)} → ${cop(costoCOP)}`);
    lote.set(col('productos').doc(doc.id), {
      ...publico, costoUSD, costoCOP, costoEstimado: !!s.estimado,
    }, { merge: true });
    // El espejo NO lleva costo.
    lote.set(col('productos_venta').doc(doc.id), publico, { merge: true });
    n++;
  }
  if (!n) { console.log('Los servicios ya están con estos precios y costos.'); process.exit(0); }
  if (!process.argv.includes('--aplicar')) {
    console.log(`\n${n} por corregir. No se escribió nada. Agrega --aplicar.`);
    process.exit(0);
  }
  await lote.commit();
  console.log(`\n${n} servicios corregidos.`);
  process.exit(0);
}

// --- desactivar lo que creó este script --------------------------------------
if (borrar) {
  const snap = await col('productos').where('importId', '==', LOTE).get();
  if (snap.empty) { console.log('No hay nada de este lote en el catálogo.'); process.exit(0); }
  const lote = col('productos').firestore.batch();
  for (const doc of snap.docs) {
    lote.set(col('productos').doc(doc.id), { activo: false }, { merge: true });
    lote.set(col('productos_venta').doc(doc.id), { activo: false }, { merge: true });
  }
  await lote.commit();
  console.log(`${snap.size} servicios desactivados. No se borran: las ventas viejas siguen cuadrando.`);
  process.exit(0);
}

// --- ¿alguno existe ya? ------------------------------------------------------
const existentes = new Map();
for (const doc of (await col('productos').get()).docs) {
  const p = doc.data();
  existentes.set(p.clave || claveProducto(p.nombre || ''), { id: doc.id, nombre: p.nombre, activo: p.activo !== false });
}

const nuevos = [], repetidos = [], sinPrecio = [];
for (const s of SERVICIOS) {
  const clave = claveProducto(s.nombre);
  if (existentes.has(clave)) repetidos.push({ ...s, ya: existentes.get(clave) });
  else if (!(s.precioCOP > 0)) sinPrecio.push(s);
  else nuevos.push({ ...s, clave });
}


console.log(`Tasa del peso: ${cop(tasaCOP)} por dólar (del ${diaTasa})\n`);
console.log('servicio                                    precio       te cuesta      ganas    margen');
for (const s of nuevos) {
  const precio = s.precioCOP;
  const costoUSD = costoDe(s);
  const costoCOP = Math.round((costoUSD / 100) * tasaCOP);
  const gana = precio - costoCOP;
  const margen = ((gana / precio) * 100).toFixed(0);
  console.log(
    `  ${s.nombre.slice(0, 40).padEnd(40)} ${(cop(precio)).padStart(9)} ${(cop(costoCOP)).padStart(13)} ${(cop(gana)).padStart(11)} ${(margen + '%').padStart(9)}` +
    (s.estimado ? '  (costo estimado)' : '')
  );
  for (const e of s.escalas || []) {
    const ganaE = e.precioCOP - costoCOP;
    console.log(
      `    desde ${String(e.desdeCant).padEnd(34)} ${(cop(e.precioCOP)).padStart(9)} ${(cop(costoCOP)).padStart(13)} ${(cop(ganaE)).padStart(11)} ${(((ganaE / e.precioCOP) * 100).toFixed(0) + '%').padStart(9)}`
    );
  }
}
if (sinPrecio.length) {
  console.log(`\nSin precio de venta, NO se crean (${sinPrecio.length}):`);
  for (const s of sinPrecio) {
    const c = Math.round((costoDe(s) / 100) * tasaCOP);
    console.log(`  ${s.nombre} — te cuesta ${cop(c)} COP la hoja. Falta a cuánto se vende.`);
  }
}
if (repetidos.length) {
  console.log(`\nYa están en el catálogo y NO se tocan (${repetidos.length}):`);
  for (const r of repetidos) console.log(`  ${r.nombre} → "${r.ya.nombre}"${r.ya.activo ? '' : ' (desactivado)'}`);
}
console.log(`\n${nuevos.length} servicios por crear · todo en pesos, el dólar se deriva de la tasa del día`);
console.log(`Los márgenes salen calculados con la Canon imageCLASS, que es la que sale más caro por hoja.`);
console.log(`"Costo estimado" = la hoja y la mica son de factura, el tóner (${TONER_POR_HOJA}/hoja) y la tinta (${TINTA_TEXTO}-${TINTA_LLENA}/hoja) son cálculo.`);
console.log('Precio fijo con mínimo: por debajo del mínimo el POS pide el PIN del dueño.');

if (!aplicar) {
  console.log('\nNo se escribió nada. Para hacerlo:  node scripts/servicios-impresion.mjs --aplicar');
  console.log('Para deshacer después:              node scripts/servicios-impresion.mjs --borrar');
  process.exit(0);
}
if (!nuevos.length) { console.log('\nNada que crear.'); process.exit(0); }

// --- alta ---------------------------------------------------------------------
// Los campos secretos (costoUSD, costoEstimado) NO van al espejo público.
const lote = col('productos').firestore.batch();
for (const s of nuevos) {
  const alias = s.alias || [];
  const escalas = (s.escalas || []).map((e) => ({
    desdeCant: e.desdeCant,
    precioCOP: e.precioCOP,
    precioUSD: aUSD(e.precioCOP),
  }));
  const costoUSD = costoDe(s);
  const comun = {
    nombre: s.nombre,
    nombreNorm: normalizar(s.nombre),
    clave: s.clave,
    alias,
    aliasNorm: alias.map(normalizar),
    categoria: 'Servicios',
    sku: '',
    codigoBarras: '',
    tipo: 'servicio',
    tipoPrecio: 'fijo',
    precioCOP: s.precioCOP,
    precioUSD: aUSD(s.precioCOP),
    precioMinimoUSD: aUSD(s.minimoCOP),
    escalas,
    // Un servicio no tiene existencias que contar: la hoja se repone sola
    // cuando se compra la resma, y el aviso de stock bajo aquí sería ruido.
    stock: 0,
    stockMinimo: 0,
    unidad: 'unidad',
    // No es un producto que se fotografíe en el Estudio: que no engorde la
    // cuenta de "139 productos sin foto".
    fotoPendiente: false,
    tieneFoto: false,
    activo: true,
    importId: LOTE,
    creado: new Date(),
    actualizado: new Date(),
  };
  const id = col('productos').doc().id;
  lote.set(col('productos').doc(id), {
    ...comun,
    costoUSD,
    // En pesos también: es como se paga y como se mantiene al día.
    costoCOP: s.costoCOP || Math.round((costoUSD / 100) * tasaCOP),
    costoEstimado: !!s.estimado,
  });
  lote.set(col('productos_venta').doc(id), comun);
}
await lote.commit();
console.log(`\nListo: ${nuevos.length} servicios en el catálogo, ya se pueden vender.`);
console.log('Falta el costo real de cada uno. Hasta entonces los reportes avisan que el margen es estimado.');
