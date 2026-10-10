import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// El Excel se escribe con ExcelJS (vendor/exceljs.min.js), que es un bundle
// UMD para navegador: en Node se carga con require, no con import, y se deja
// en window porque es de ahí donde lo toma export-excel.js (igual que el test
// viejo hacía con window.XLSX).
// El bundle no devuelve nada por `module.exports`: se cuelga de globalThis.
// Por eso se requiere por el efecto y se recoge de ahí.
const require = createRequire(import.meta.url);
require('../public/vendor/exceljs.min.js');
const ExcelJS = globalThis.ExcelJS;
global.window = global.window || {};
global.window.ExcelJS = ExcelJS;

const { exportarInventario, exportarVentas } = await import('../public/js/reports/export-excel.js');

// La tabla no empieza en la fila 1: hay banda de título (1), subtítulo (2),
// respiro (3) y encabezados (4). Los datos arrancan en la 5.
const FILA_ENCAB = 4;
const FILA_DATOS = 5;

const productos = [
  { nombre: 'Lápiz Mongol', sku: 'LAP-01', alias: ['mongol'], categoria: 'Escritura', tipo: 'producto', tipoPrecio: 'fijo', precioUSD: 100, costoUSD: 50, stock: 50, stockMinimo: 10, unidad: 'unidad', codigoBarras: '123456', tieneFoto: true },
  { nombre: 'Resma Hojas', sku: 'PAP-01', alias: ['hojas'], categoria: 'Papel', tipo: 'producto', tipoPrecio: 'fijo', precioUSD: 500, costoUSD: 300, stock: 20, stockMinimo: 5, unidad: 'resma', codigoBarras: '654321', tieneFoto: false },
];

test('exportarInventario genera la estructura correcta con fórmulas y formatos', async () => {
  const libro = await exportarInventario(productos);

  assert.deepEqual(libro.worksheets.map((w) => w.name), ['Inventario']);
  const hoja = libro.getWorksheet('Inventario');

  assert.ok(hoja.autoFilter, 'Debe incluir autofiltro');
  assert.equal(hoja.views[0].state, 'frozen', 'Debe incluir vista inmovilizada');
  assert.equal(hoja.views[0].ySplit, FILA_ENCAB, 'Se congela hasta los encabezados');
  // El autofiltro NO puede abarcar la fila de TOTALES: ordenar la mandaría al medio.
  assert.equal(hoja.autoFilter, `A${FILA_ENCAB}:O${FILA_DATOS + productos.length - 1}`);

  // Fórmulas y formatos en la primera fila de datos
  const ganancia = hoja.getCell(FILA_DATOS, 9);
  assert.equal(ganancia.value.formula, `G${FILA_DATOS}-H${FILA_DATOS}`, 'Ganancia = Precio - Costo');
  assert.equal(ganancia.numFmt, '"$"#,##0.00', 'Formato numérico de moneda');

  const margen = hoja.getCell(FILA_DATOS, 10);
  assert.equal(margen.value.formula, `IF(G${FILA_DATOS}>0,(G${FILA_DATOS}-H${FILA_DATOS})/G${FILA_DATOS},0)`);
  assert.equal(margen.numFmt, '0.0%', 'Formato numérico porcentual');

  // Fila de totales, justo debajo del último producto
  const filaTot = FILA_DATOS + productos.length;
  const totalStock = hoja.getCell(filaTot, 11);
  assert.equal(totalStock.value.formula, `SUM(K${FILA_DATOS}:K${FILA_DATOS + 1})`, 'Suma de stock');
  assert.ok(hoja.getCell(filaTot, 1).font.bold, 'La fila de totales va en negrita');

  // Estilos: lo que motivó migrar de SheetJS a ExcelJS
  const enc = hoja.getCell(FILA_ENCAB, 1);
  assert.ok(enc.font.bold, 'Encabezado en negrita');
  // Los dos colores son los de la app (css/1-base.css): el turquesa del logo
  // --marca #0b6a82 y el hielo --superficie-2. Van fijos a propósito: si
  // alguien cambia la paleta del Excel sin querer, este test lo caza.
  assert.equal(enc.fill.fgColor.argb, 'FF0B6A82', 'Encabezado con el color de marca');
  assert.equal(hoja.getCell(FILA_DATOS + 1, 1).fill.fgColor.argb, 'FFF1F7FA', 'Segunda fila con cebra');
  assert.equal(hoja.conditionalFormattings.length, 2, 'Stock bajo y margen negativo');
  assert.equal(hoja.pageSetup.printTitlesRow, `${FILA_ENCAB}:${FILA_ENCAB}`, 'Encabezado repetido al imprimir');
});

test('exportarVentas genera las pestañas de Ventas, Producto y Vendedor con totales', async () => {
  const ventas = [
    { dia: '2026-10-01', nombreUsuario: 'Juan', lineas: [{ cantidad: 2, nombre: 'Lápiz' }], totalUSD: 200, costoTotalUSD: 100, gananciaUSD: 100, pagos: [{ moneda: 'USD', monto: 2 }], saldoUSD: 0 },
  ];
  const porProducto = [
    { nombre: 'Lápiz', unidades: 2, vendidoUSD: 200, costoUSD: 100, gananciaUSD: 100, margenPct: 50, veces: 1 },
  ];
  const porVendedor = [
    { nombre: 'Juan', ventas: 1, vendidoUSD: 200, gananciaUSD: 100, pct: 100, ticketUSD: 200, descuentos: 0 },
  ];

  const libro = await exportarVentas(ventas, { desde: '2026-10-01', hasta: '2026-10-07', porProducto, porVendedor });

  assert.deepEqual(libro.worksheets.map((w) => w.name), ['Ventas', 'Por producto', 'Por vendedor']);

  const hojaVentas = libro.getWorksheet('Ventas');
  assert.equal(hojaVentas.getCell(FILA_DATOS, 6).value.formula, `D${FILA_DATOS}-E${FILA_DATOS}`);

  // Totales de "Por producto": una sola fila de datos, así que el rango es de ella a ella.
  const hojaProd = libro.getWorksheet('Por producto');
  assert.equal(hojaProd.getCell(FILA_DATOS + 1, 3).value.formula, `SUM(C${FILA_DATOS}:C${FILA_DATOS})`);

  // El % del total apunta a la celda de totales con fila fija ($).
  const hojaVend = libro.getWorksheet('Por vendedor');
  assert.equal(hojaVend.getCell(FILA_DATOS, 5).value.formula, `C${FILA_DATOS}/C$${FILA_DATOS + 1}`);
});

test('con cero productos no revienta ni inventa una fila de totales', async () => {
  const libro = await exportarInventario([]);
  const hoja = libro.getWorksheet('Inventario');
  assert.ok(!hoja.autoFilter, 'Sin datos no hay autofiltro que poner');
  assert.equal(hoja.getCell(FILA_DATOS, 1).value, null, 'No se escribe ninguna fila');
  assert.equal(hoja.conditionalFormattings.length, 0, 'Ni reglas de color sobre un rango vacío');
});

test('el archivo se escribe y se vuelve a leer con los estilos puestos', async () => {
  const libro = await exportarInventario(productos);
  const buffer = await libro.xlsx.writeBuffer();

  const releido = new ExcelJS.Workbook();
  await releido.xlsx.load(buffer);
  const hoja = releido.getWorksheet('Inventario');

  assert.equal(hoja.getCell(FILA_ENCAB, 1).value, 'Nombre');
  assert.ok(hoja.getCell(FILA_ENCAB, 1).font.bold, 'La negrita sobrevive al guardar');
  assert.equal(hoja.getCell(FILA_DATOS, 9).value.formula, `G${FILA_DATOS}-H${FILA_DATOS}`, 'Y la fórmula también');
  assert.equal(hoja.conditionalFormattings.length, 2);
});
