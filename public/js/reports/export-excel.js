// export-excel.js — sacar los datos a Excel. Que la información sea tuya y
// puedas abrirla sin la app.

import { aMayores } from '../core/dinero.js';
import { avisar } from '../ui/avisos.js';

async function XLSX() {
  if (!window.XLSX) await import('../../vendor/xlsx.js');
  return window.XLSX;
}

function bajar(libro, nombre) {
  return XLSX().then((X) => {
    X.writeFile(libro, nombre);
    if (typeof document !== 'undefined') avisar('Archivo descargado');
  });
}

/**
 * Calcula anchos de columna dinámicamente según el contenido máximo
 */
function autoAjustarColumnas(matrizFilas) {
  if (!matrizFilas || !matrizFilas.length) return [];
  const numCols = Math.max(...matrizFilas.map((r) => r.length));
  const anchos = new Array(numCols).fill(10);

  for (const fila of matrizFilas) {
    fila.forEach((val, c) => {
      const texto = val === null || val === undefined ? '' : String(val);
      if (texto.length > anchos[c]) {
        anchos[c] = texto.length;
      }
    });
  }

  return anchos.map((w) => ({ wch: Math.min(Math.max(w + 3, 10), 60) }));
}

/**
 * Aplica autofiltro y congela la fila superior de encabezados
 */
function aplicarFormatoYVista(X, hoja, numFilas, numCols) {
  const colFin = X.utils.encode_col(numCols - 1);
  hoja['!autofilter'] = { ref: `A1:${colFin}${numFilas}` };
  hoja['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
}

/**
 * Asigna formato numérico (z) a una celda de SheetJS si existe
 */
function formatoCelda(hoja, ref, zFormat) {
  if (hoja[ref]) {
    hoja[ref].z = zFormat;
  }
}

export async function exportarInventario(productos) {
  const X = await XLSX();
  const encabezados = [
    'Nombre',
    'SKU',
    'Otros nombres',
    'Categoría',
    'Tipo',
    'Tipo de precio',
    'Precio (USD)',
    'Costo (USD)',
    'Ganancia (USD)',
    'Margen %',
    'Cantidad',
    'Stock mínimo',
    'Unidad',
    'Código de barras',
    'Tiene foto',
  ];

  const aoa = [encabezados];

  productos.forEach((p) => {
    const precio = aMayores(p.precioUSD || 0);
    const costo = aMayores(p.costoUSD || 0);
    const stock = p.stock || 0;
    const stockMin = p.stockMinimo || 0;

    aoa.push([
      p.nombre || '',
      p.sku || '',
      (p.alias || []).join(', '),
      p.categoria || '',
      p.tipo === 'servicio' ? 'Servicio' : 'Producto',
      p.tipoPrecio === 'variable' ? 'Variable' : 'Fijo',
      precio,
      costo,
      0, // Se asigna fórmula abajo
      0, // Se asigna fórmula abajo
      stock,
      stockMin,
      p.unidad || 'unidad',
      p.codigoBarras ? String(p.codigoBarras) : '',
      p.tieneFoto ? 'Sí' : 'No',
    ]);
  });

  const lastDataRow = aoa.length;
  const totalRowIndex = aoa.length + 1;
  if (productos.length > 0) {
    aoa.push(['TOTALES / PROMEDIO', '', '', '', '', '', 0, 0, 0, 0, 0, '', '', '', '']);
  }

  const hoja = X.utils.aoa_to_sheet(aoa);

  // Columnas: A:Nombre(0), B:SKU(1), C:Alias(2), D:Cat(3), E:Tipo(4), F:TipoP(5), G:Precio(6), H:Costo(7), I:Ganancia(8), J:Margen(9), K:Stock(10), L:StockMin(11)
  productos.forEach((_, idx) => {
    const r = idx + 2;
    const trIdx = idx + 1;
    formatoCelda(hoja, X.utils.encode_cell({ r: trIdx, c: 6 }), '"$"#,##0.00');
    formatoCelda(hoja, X.utils.encode_cell({ r: trIdx, c: 7 }), '"$"#,##0.00');
    hoja[X.utils.encode_cell({ r: trIdx, c: 8 })] = { t: 'n', f: `G${r}-H${r}`, z: '"$"#,##0.00' };
    hoja[X.utils.encode_cell({ r: trIdx, c: 9 })] = { t: 'n', f: `IF(G${r}>0,(G${r}-H${r})/G${r},0)`, z: '0.0%' };
    formatoCelda(hoja, X.utils.encode_cell({ r: trIdx, c: 10 }), '#,##0');
    formatoCelda(hoja, X.utils.encode_cell({ r: trIdx, c: 11 }), '#,##0');
  });

  if (productos.length > 0) {
    const tr = totalRowIndex - 1;
    hoja[X.utils.encode_cell({ r: tr, c: 6 })] = { t: 'n', f: `AVERAGE(G2:G${lastDataRow})`, z: '"$"#,##0.00' };
    hoja[X.utils.encode_cell({ r: tr, c: 7 })] = { t: 'n', f: `AVERAGE(H2:H${lastDataRow})`, z: '"$"#,##0.00' };
    hoja[X.utils.encode_cell({ r: tr, c: 8 })] = { t: 'n', f: `SUM(I2:I${lastDataRow})`, z: '"$"#,##0.00' };
    hoja[X.utils.encode_cell({ r: tr, c: 9 })] = { t: 'n', f: `IF(G${totalRowIndex}>0,(G${totalRowIndex}-H${totalRowIndex})/G${totalRowIndex},0)`, z: '0.0%' };
    hoja[X.utils.encode_cell({ r: tr, c: 10 })] = { t: 'n', f: `SUM(K2:K${lastDataRow})`, z: '#,##0' };
  }

  const matrizValores = aoa.map((r) => r.map((c) => (c && typeof c === 'object' ? String(c.f || '') : c)));
  hoja['!cols'] = autoAjustarColumnas(matrizValores);
  aplicarFormatoYVista(X, hoja, aoa.length, encabezados.length);

  const libro = X.utils.book_new();
  X.utils.book_append_sheet(libro, hoja, 'Inventario');
  return bajar(libro, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportarVentas(ventas, { desde, hasta, porProducto = [], porVendedor = [] }) {
  const X = await XLSX();
  const libro = X.utils.book_new();

  // --- 1. Hoja Ventas ---
  const encVentas = ['Fecha', 'Vendedor', 'Productos', 'Total (USD)', 'Costo (USD)', 'Ganancia (USD)', 'Pagos', 'Quedó debiendo'];
  const aoaVentas = [encVentas];

  ventas.forEach((v) => {
    const total = aMayores(v.totalUSD || 0);
    const costo = aMayores(v.costoTotalUSD || 0);
    const debiendo = aMayores(Math.max(0, v.saldoUSD || 0));

    aoaVentas.push([
      v.dia || '',
      v.nombreUsuario || '',
      (v.lineas || []).map((l) => `${l.cantidad}x ${l.nombre}`).join(' | '),
      total,
      costo,
      0,
      (v.pagos || []).map((p) => `${p.moneda} ${p.monto}`).join(' + '),
      debiendo,
    ]);
  });

  const lastVentaRow = aoaVentas.length;
  if (ventas.length > 0) {
    aoaVentas.push(['TOTALES', '', '', 0, 0, 0, '', 0]);
  }

  const hojaVentas = X.utils.aoa_to_sheet(aoaVentas);

  ventas.forEach((_, idx) => {
    const r = idx + 2;
    const trIdx = idx + 1;
    formatoCelda(hojaVentas, X.utils.encode_cell({ r: trIdx, c: 3 }), '"$"#,##0.00');
    formatoCelda(hojaVentas, X.utils.encode_cell({ r: trIdx, c: 4 }), '"$"#,##0.00');
    hojaVentas[X.utils.encode_cell({ r: trIdx, c: 5 })] = { t: 'n', f: `D${r}-E${r}`, z: '"$"#,##0.00' };
    formatoCelda(hojaVentas, X.utils.encode_cell({ r: trIdx, c: 7 }), '"$"#,##0.00');
  });

  if (ventas.length > 0) {
    const tr = lastVentaRow;
    hojaVentas[X.utils.encode_cell({ r: tr, c: 3 })] = { t: 'n', f: `SUM(D2:D${lastVentaRow})`, z: '"$"#,##0.00' };
    hojaVentas[X.utils.encode_cell({ r: tr, c: 4 })] = { t: 'n', f: `SUM(E2:E${lastVentaRow})`, z: '"$"#,##0.00' };
    hojaVentas[X.utils.encode_cell({ r: tr, c: 5 })] = { t: 'n', f: `SUM(F2:F${lastVentaRow})`, z: '"$"#,##0.00' };
    hojaVentas[X.utils.encode_cell({ r: tr, c: 7 })] = { t: 'n', f: `SUM(H2:H${lastVentaRow})`, z: '"$"#,##0.00' };
  }

  const matVentas = aoaVentas.map((r) => r.map((c) => (c && typeof c === 'object' ? String(c.f || '') : c)));
  hojaVentas['!cols'] = autoAjustarColumnas(matVentas);
  aplicarFormatoYVista(X, hojaVentas, aoaVentas.length, encVentas.length);
  X.utils.book_append_sheet(libro, hojaVentas, 'Ventas');

  // --- 2. Hoja Por Producto ---
  if (porProducto.length) {
    const encProd = ['Producto', 'Unidades', 'Vendido (USD)', 'Costo (USD)', 'Ganancia (USD)', 'Margen %', 'Veces vendido'];
    const aoaProd = [encProd];

    porProducto.forEach((p) => {
      aoaProd.push([
        p.nombre || '',
        p.unidades || 0,
        aMayores(p.vendidoUSD || 0),
        aMayores(p.costoUSD || 0),
        0,
        0,
        p.veces || 0,
      ]);
    });

    const lastProdRow = aoaProd.length;
    aoaProd.push(['TOTALES', 0, 0, 0, 0, 0, 0]);

    const hojaProd = X.utils.aoa_to_sheet(aoaProd);

    porProducto.forEach((_, idx) => {
      const r = idx + 2;
      const trIdx = idx + 1;
      formatoCelda(hojaProd, X.utils.encode_cell({ r: trIdx, c: 1 }), '#,##0');
      formatoCelda(hojaProd, X.utils.encode_cell({ r: trIdx, c: 2 }), '"$"#,##0.00');
      formatoCelda(hojaProd, X.utils.encode_cell({ r: trIdx, c: 3 }), '"$"#,##0.00');
      hojaProd[X.utils.encode_cell({ r: trIdx, c: 4 })] = { t: 'n', f: `C${r}-D${r}`, z: '"$"#,##0.00' };
      hojaProd[X.utils.encode_cell({ r: trIdx, c: 5 })] = { t: 'n', f: `IF(C${r}>0,(C${r}-D${r})/C${r},0)`, z: '0.0%' };
      formatoCelda(hojaProd, X.utils.encode_cell({ r: trIdx, c: 6 }), '#,##0');
    });

    const tr = lastProdRow;
    const totRowExcel = tr + 1;
    hojaProd[X.utils.encode_cell({ r: tr, c: 1 })] = { t: 'n', f: `SUM(B2:B${lastProdRow})`, z: '#,##0' };
    hojaProd[X.utils.encode_cell({ r: tr, c: 2 })] = { t: 'n', f: `SUM(C2:C${lastProdRow})`, z: '"$"#,##0.00' };
    hojaProd[X.utils.encode_cell({ r: tr, c: 3 })] = { t: 'n', f: `SUM(D2:D${lastProdRow})`, z: '"$"#,##0.00' };
    hojaProd[X.utils.encode_cell({ r: tr, c: 4 })] = { t: 'n', f: `SUM(E2:E${lastProdRow})`, z: '"$"#,##0.00' };
    hojaProd[X.utils.encode_cell({ r: tr, c: 5 })] = { t: 'n', f: `IF(C${totRowExcel}>0,(C${totRowExcel}-D${totRowExcel})/C${totRowExcel},0)`, z: '0.0%' };
    hojaProd[X.utils.encode_cell({ r: tr, c: 6 })] = { t: 'n', f: `SUM(G2:G${lastProdRow})`, z: '#,##0' };

    const matProd = aoaProd.map((r) => r.map((c) => (c && typeof c === 'object' ? String(c.f || '') : c)));
    hojaProd['!cols'] = autoAjustarColumnas(matProd);
    aplicarFormatoYVista(X, hojaProd, aoaProd.length, encProd.length);
    X.utils.book_append_sheet(libro, hojaProd, 'Por producto');
  }

  // --- 3. Hoja Por Vendedor ---
  if (porVendedor.length) {
    const encVend = ['Vendedor', 'Ventas', 'Vendido (USD)', 'Ganancia (USD)', '% del total', 'Ticket promedio (USD)', 'Precios cambiados'];
    const aoaVend = [encVend];

    porVendedor.forEach((v) => {
      aoaVend.push([
        v.nombre || '',
        v.ventas || 0,
        aMayores(v.vendidoUSD || 0),
        aMayores(v.gananciaUSD || 0),
        0,
        0,
        v.descuentos || 0,
      ]);
    });

    const lastVendRow = aoaVend.length;
    aoaVend.push(['TOTALES', 0, 0, 0, 0, 0, 0]);

    const hojaVend = X.utils.aoa_to_sheet(aoaVend);
    const totRowExcel = lastVendRow + 1;

    porVendedor.forEach((_, idx) => {
      const r = idx + 2;
      const trIdx = idx + 1;
      formatoCelda(hojaVend, X.utils.encode_cell({ r: trIdx, c: 1 }), '#,##0');
      formatoCelda(hojaVend, X.utils.encode_cell({ r: trIdx, c: 2 }), '"$"#,##0.00');
      formatoCelda(hojaVend, X.utils.encode_cell({ r: trIdx, c: 3 }), '"$"#,##0.00');
      hojaVend[X.utils.encode_cell({ r: trIdx, c: 4 })] = { t: 'n', f: `C${r}/C$${totRowExcel}`, z: '0.0%' };
      hojaVend[X.utils.encode_cell({ r: trIdx, c: 5 })] = { t: 'n', f: `IF(B${r}>0,C${r}/B${r},0)`, z: '"$"#,##0.00' };
      formatoCelda(hojaVend, X.utils.encode_cell({ r: trIdx, c: 6 }), '#,##0');
    });

    const tr = lastVendRow;
    hojaVend[X.utils.encode_cell({ r: tr, c: 1 })] = { t: 'n', f: `SUM(B2:B${lastVendRow})`, z: '#,##0' };
    hojaVend[X.utils.encode_cell({ r: tr, c: 2 })] = { t: 'n', f: `SUM(C2:C${lastVendRow})`, z: '"$"#,##0.00' };
    hojaVend[X.utils.encode_cell({ r: tr, c: 3 })] = { t: 'n', f: `SUM(D2:D${lastVendRow})`, z: '"$"#,##0.00' };
    hojaVend[X.utils.encode_cell({ r: tr, c: 4 })] = { t: 'n', f: `SUM(E2:E${lastVendRow})`, z: '0.0%' };
    hojaVend[X.utils.encode_cell({ r: tr, c: 5 })] = { t: 'n', f: `IF(B${totRowExcel}>0,C${totRowExcel}/B${totRowExcel},0)`, z: '"$"#,##0.00' };
    hojaVend[X.utils.encode_cell({ r: tr, c: 6 })] = { t: 'n', f: `SUM(G2:G${lastVendRow})`, z: '#,##0' };

    const matVend = aoaVend.map((r) => r.map((c) => (c && typeof c === 'object' ? String(c.f || '') : c)));
    hojaVend['!cols'] = autoAjustarColumnas(matVend);
    aplicarFormatoYVista(X, hojaVend, aoaVend.length, encVend.length);
    X.utils.book_append_sheet(libro, hojaVend, 'Por vendedor');
  }

  return bajar(libro, `ventas-${desde}-a-${hasta}.xlsx`);
}

