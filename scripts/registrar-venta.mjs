// Registra una venta que ya ocurrió, desde la computadora.
//
// Uso:  node scripts/registrar-venta.mjs <archivo.json>            → muestra qué haría
//       node scripts/registrar-venta.mjs <archivo.json> --guardar  → la escribe
//
// Para cuando el dueño dicta una venta de ayer que no quedó anotada. La venta
// se escribe IGUAL que si la hubiera hecho la app: con sus líneas, su ganancia,
// su pago, y descontando el stock en el mismo lote — un `movimientos` por
// producto, que es el libro del inventario. Si la venta se escribiera sin esos
// movimientos, el stock quedaría diciendo que la mercancía sigue en el estante.
//
// Los servicios (fotocopias, plastificado) NO descuentan stock: no son algo que
// esté en un estante.
//
// El archivo:
//   { "dia": "2026-10-19", "moneda": "COP",
//     "lineas": [{ "producto": "Impresión B/N carta", "cantidad": 7 }] }
//
// El precio sale del catálogo, no del archivo: así la venta queda al precio que
// de verdad tiene puesto el producto.

import { readFileSync } from 'node:fs';
import { productos, col, NEGOCIO } from './admin.mjs';

const archivo = process.argv[2];
const guardar = process.argv.includes('--guardar');
if (!archivo) { console.error('Dime cuál archivo de venta.'); process.exit(1); }

const UID = '5f0FgkMwOIXec1AOyk1UoQjfQqD3';
const NOMBRE = 'Samuel';

const pedido = JSON.parse(readFileSync(archivo, 'utf8'));
const catalogo = new Map((await productos()).map((p) => [p.nombre.toLowerCase(), p]));

// La tasa del día de la venta, no la de hoy: una venta de ayer se cobró a la
// tasa de ayer, y cambiarla ahora movería la ganancia de ese día.
const tasaDoc = await col('tasas').doc(pedido.dia).get();
let tasas = tasaDoc.exists ? tasaDoc.data() : null;
if (!tasas) {
  const todas = await col('tasas').get();
  const previas = todas.docs.filter((d) => d.id <= pedido.dia).sort((a, b) => b.id.localeCompare(a.id));
  if (!previas.length) { console.error(`No hay tasa del ${pedido.dia} ni anterior.`); process.exit(1); }
  tasas = previas[0].data();
  console.log(`Sin tasa del ${pedido.dia}: se usa la del ${previas[0].id}`);
}

const moneda = pedido.moneda || 'USD';
const tasa = moneda === 'USD' ? 100 : tasas[moneda];
if (!tasa) { console.error(`Falta la tasa de ${moneda} para ese día.`); process.exit(1); }

const lineas = [];
for (const l of pedido.lineas) {
  const p = catalogo.get(String(l.producto).toLowerCase());
  if (!p) { console.error(`No encuentro "${l.producto}" en el inventario.`); process.exit(1); }
  const cantidad = Number(l.cantidad) || 1;
  lineas.push({
    productoId: p.id,
    nombre: p.nombre,
    cantidad,
    precioUSD: Math.round(l.precioUSD ?? p.precioUSD),
    costoUSD: Math.round(p.costoUSD || 0),
    precioEditado: false,
    precioOriginalUSD: Math.round(p.precioUSD),
    autorizadoPor: null,
    esServicio: p.tipo === 'servicio',
    stockAntes: p.stock,
    precioCOP: p.precioCOP || 0,
  });
}

const totalUSD = lineas.reduce((t, l) => t + l.precioUSD * l.cantidad, 0);
const costoUSD = lineas.reduce((t, l) => t + l.costoUSD * l.cantidad, 0);
// Lo que se cobra en pesos es la suma de las ETIQUETAS, no el dólar convertido
// de vuelta: un centavo de dólar son ~32 pesos y en una venta de 7 fotocopias
// ya se nota (7.110 en vez de los 7.000 que el cliente pagó). Si algún producto
// no tiene precio en pesos, se cae a la conversión para toda la venta.
const todosConCOP = moneda === 'COP' && lineas.every((l) => l.precioCOP > 0);
// `montoPagado` manda sobre todo: es lo que el cliente puso en la mano. Sin
// eso, convertir de vuelta desde el dólar deja cifras como 495,58 Bs donde se
// cobraron 500 redondos.
const enMoneda = pedido.montoPagado > 0 ? pedido.montoPagado
  : moneda === 'USD' ? totalUSD
  : todosConCOP ? lineas.reduce((t, l) => t + l.precioCOP * l.cantidad, 0)
  : Math.round((totalUSD * tasa) / 100);
const fmt = (c) => '$' + (c / 100).toFixed(2);

console.log(`\nVenta del ${pedido.dia}:`);
for (const l of lineas) {
  console.log(`   ${l.cantidad} × ${l.nombre.padEnd(28)} ${fmt(l.precioUSD * l.cantidad).padStart(8)}`
    + (l.esServicio ? '  (servicio, no mueve stock)' : `  (stock ${l.stockAntes} → ${l.stockAntes - l.cantidad})`));
}
console.log(`   TOTAL: ${fmt(totalUSD)} · ganancia ${fmt(totalUSD - costoUSD)}`);
// En bolívares hay decimales: 50.000 unidades menores son 500,00 Bs, y verlo
// crudo invita a confundir una cosa con la otra cuando es plata.
const enTexto = (menores, mon) => {
  const dec = mon === 'VES' ? 2 : 0;
  return (menores / Math.pow(10, dec)).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
console.log(`   cobrado: ${enTexto(enMoneda, moneda)} ${moneda}`
  + (pedido.montoPagado > 0 ? ' (lo que puso el cliente)'
     : todosConCOP ? ' (suma de las etiquetas)' : ` (convertido a la tasa ${tasa})`));

if (!guardar) {
  console.log('\nNo se escribió nada. Para guardarla, agrega --guardar');
  process.exit(0);
}

const ventaRef = col('ventas').doc();
const lote = col('ventas').firestore.batch();
lote.set(ventaRef, {
  numero: Date.parse(pedido.dia + 'T12:00:00'),
  lineas: lineas.map(({ esServicio, stockAntes, ...l }) => l),
  totalUSD, costoTotalUSD: costoUSD, gananciaUSD: totalUSD - costoUSD,
  // Fiado: no entró plata, así que no hay pago y el saldo queda debiendo.
  pagos: pedido.fiado ? [] : [{ moneda, monto: enMoneda, tasa, montoUSD: totalUSD }],
  pagadoUSD: pedido.fiado ? 0 : totalUSD,
  saldoUSD: pedido.fiado ? totalUSD : 0,
  fiado: !!pedido.fiado, clienteId: pedido.clienteId || null,
  nota: pedido.nota || 'Registrada después, dictada por el dueño',
  estado: 'ok',
  uid: UID, nombreUsuario: NOMBRE,
  ts: new Date(pedido.dia + 'T18:00:00'),
  dia: pedido.dia,
});

// El libro del inventario: un movimiento por producto, y el stock al día.
for (const l of lineas.filter((x) => !x.esServicio)) {
  lote.set(col('movimientos').doc(), {
    productoId: l.productoId, nombre: l.nombre, tipo: 'venta',
    cantidad: -l.cantidad, costoUnitUSD: l.costoUSD, ventaId: ventaRef.id,
    uid: UID, nombreUsuario: NOMBRE, ts: new Date(pedido.dia + 'T18:00:00'), dia: pedido.dia,
  });
  const nuevo = l.stockAntes - l.cantidad;
  lote.set(col('productos').doc(l.productoId), { stock: nuevo }, { merge: true });
  lote.set(col('productos_venta').doc(l.productoId), { stock: nuevo }, { merge: true });
}

// Lo fiado se le suma al cliente, o la deuda no queda en ningún lado.
if (pedido.fiado && pedido.clienteId) {
  const cli = await col('clientes').doc(pedido.clienteId).get();
  const saldo = (cli.exists ? cli.data().saldoUSD || 0 : 0) + totalUSD;
  lote.set(col('clientes').doc(pedido.clienteId), { saldoUSD: saldo, ultimaCompra: new Date() }, { merge: true });
}

await lote.commit();
console.log(`\n✓ Venta guardada (${ventaRef.id}) en el negocio ${NEGOCIO}`);
if (pedido.fiado) console.log('  queda FIADA: el saldo se le sumó al cliente.');
