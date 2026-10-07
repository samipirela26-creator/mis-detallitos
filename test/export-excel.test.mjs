import test from 'node:test';
import assert from 'node:assert/strict';

// Mock window.XLSX y window.avisar para Node environment
global.window = global.window || {};

// Cargar vendor/xlsx.js (asigna global.window.XLSX)
await import('../public/vendor/xlsx.js');
const XLSX = global.window.XLSX;

// Importar funciones desestructuradas asíncronas
const { exportarInventario, exportarVentas } = await import('../public/js/reports/export-excel.js');

test('exportarInventario genera la estructura correcta con fórmulas y formatos', async () => {
  let libroGenerado = null;
  let nombreArchivo = null;

  // Intercept XLSX.writeFile
  const origWriteFile = XLSX.writeFile;
  XLSX.writeFile = (wb, filename) => {
    libroGenerado = wb;
    nombreArchivo = filename;
  };

  const productos = [
    { nombre: 'Lápiz Mongol', sku: 'LAP-01', alias: ['mongol'], categoria: 'Escritura', tipo: 'producto', tipoPrecio: 'fijo', precioUSD: 100, costoUSD: 50, stock: 50, stockMinimo: 10, unidad: 'unidad', codigoBarras: '123456', tieneFoto: true },
    { nombre: 'Resma Hojas', sku: 'PAP-01', alias: ['hojas'], categoria: 'Papel', tipo: 'producto', tipoPrecio: 'fijo', precioUSD: 500, costoUSD: 300, stock: 20, stockMinimo: 5, unidad: 'resma', codigoBarras: '654321', tieneFoto: false },
  ];

  await exportarInventario(productos);

  XLSX.writeFile = origWriteFile;

  assert.ok(libroGenerado, 'Se debe haber generado el libro');
  assert.ok(nombreArchivo.startsWith('inventario-'), 'Nombre de archivo debe ser inventario-...');
  assert.deepEqual(libroGenerado.SheetNames, ['Inventario']);

  const hoja = libroGenerado.Sheets['Inventario'];
  assert.ok(hoja['!autofilter'], 'Debe incluir autofiltro');
  assert.ok(hoja['!views'], 'Debe incluir vista inmovilizada');

  // Verificar fórmulas y formatos en la fila de datos 1 (Fila Excel 2 -> R=1)
  const celdaGanancia = hoja[XLSX.utils.encode_cell({ r: 1, c: 8 })];
  assert.equal(celdaGanancia.f, 'G2-H2', 'Fórmula de ganancia debe restar Precio menos Costo');
  assert.equal(celdaGanancia.z, '"$"#,##0.00', 'Formato numérico de moneda');

  const celdaMargen = hoja[XLSX.utils.encode_cell({ r: 1, c: 9 })];
  assert.equal(celdaMargen.f, 'IF(G2>0,(G2-H2)/G2,0)', 'Fórmula de margen porcentual');
  assert.equal(celdaMargen.z, '0.0%', 'Formato numérico porcentual');

  // Verificar fila de totales (Fila 4 -> R=3)
  const celdaTotalStock = hoja[XLSX.utils.encode_cell({ r: 3, c: 10 })];
  assert.equal(celdaTotalStock.f, 'SUM(K2:K3)', 'Fórmula de suma de stock');
});

test('exportarVentas genera las pestañas de Ventas, Producto y Vendedor con totales', async () => {
  let libroGenerado = null;

  const origWriteFile = XLSX.writeFile;
  XLSX.writeFile = (wb) => {
    libroGenerado = wb;
  };

  const ventas = [
    { dia: '2026-10-01', nombreUsuario: 'Juan', lineas: [{ cantidad: 2, nombre: 'Lápiz' }], totalUSD: 200, costoTotalUSD: 100, gananciaUSD: 100, pagos: [{ moneda: 'USD', monto: 2 }], saldoUSD: 0 },
  ];
  const porProducto = [
    { nombre: 'Lápiz', unidades: 2, vendidoUSD: 200, costoUSD: 100, gananciaUSD: 100, margenPct: 50, veces: 1 },
  ];
  const porVendedor = [
    { nombre: 'Juan', ventas: 1, vendidoUSD: 200, gananciaUSD: 100, pct: 100, ticketUSD: 200, descuentos: 0 },
  ];

  await exportarVentas(ventas, { desde: '2026-10-01', hasta: '2026-10-07', porProducto, porVendedor });

  XLSX.writeFile = origWriteFile;

  assert.ok(libroGenerado);
  assert.deepEqual(libroGenerado.SheetNames, ['Ventas', 'Por producto', 'Por vendedor']);

  const hojaVentas = libroGenerado.Sheets['Ventas'];
  assert.equal(hojaVentas[XLSX.utils.encode_cell({ r: 1, c: 5 })].f, 'D2-E2');

  const hojaProd = libroGenerado.Sheets['Por producto'];
  assert.equal(hojaProd[XLSX.utils.encode_cell({ r: 2, c: 2 })].f, 'SUM(C2:C2)');

  const hojaVend = libroGenerado.Sheets['Por vendedor'];
  assert.equal(hojaVend[XLSX.utils.encode_cell({ r: 1, c: 4 })].f, 'C2/C$3');
});
