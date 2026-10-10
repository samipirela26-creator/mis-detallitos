// export-excel.js — sacar los datos a Excel. Que la información sea tuya y
// puedas abrirla sin la app.
//
// Se escribe con ExcelJS y no con SheetJS porque la versión libre de SheetJS
// no guarda estilos: salía una parrilla de texto gris donde no se distinguía
// el encabezado de los datos ni el total de una fila cualquiera.
//
// La hoja no empieza en la fila 1. Arriba va una banda con el nombre del
// negocio y debajo de qué es el archivo y de cuándo, porque estos Excel se
// imprimen y se mandan por WhatsApp sueltos, sin el nombre del archivo:
//
//   1  MIS DETALLITOS G&M C.A.      (banda turquesa, combinada)
//   2  Inventario · 10/10/2026      (subtítulo)
//   3  (respiro)
//   4  Encabezados                  (congelados y repetidos al imprimir)
//   5+ Datos                        (con cebra)
//   n  TOTALES                      (en negrita, fuera del autofiltro)

import { aMayores } from '../core/dinero.js';
import { avisar } from '../ui/avisos.js';

// Los colores son los de la app: el turquesa del logo y el hielo del fondo.
// ExcelJS los quiere en ARGB.
const MARCA = 'FF0B6A82';
const MARCA_TEXTO = 'FFFFFFFF';
const CEBRA = 'FFF1F7FA';
const TOTALES = 'FFDCEEF4';
const ROJO_SUAVE = 'FFFADFD9';
const ROJO_TEXTO = 'FF9B1C1C';
const AMBAR_SUAVE = 'FFFDF0C4';
const AMBAR_TEXTO = 'FF6A5000';

const MONEDA = '"$"#,##0.00';
const ENTERO = '#,##0';
const PORCENTAJE = '0.0%';

// Dónde empieza cada cosa. Si se toca la banda de arriba, se tocan estos dos.
const FILA_ENCAB = 4;
const FILA_DATOS = 5;

async function cargarExcelJS() {
  if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
  await import('../../vendor/exceljs.min.js');
  return (typeof window !== 'undefined' && window.ExcelJS) || globalThis.ExcelJS;
}

/**
 * Guarda el libro. En el navegador dispara la descarga; fuera de él (en los
 * tests) no hace nada y devuelve el libro para poder mirarlo por dentro.
 */
async function bajar(libro, nombre) {
  if (typeof document === 'undefined') return libro;
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  // Sin el respiro, Safari cancela la descarga al revocar la URL.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  avisar('Archivo descargado');
  return libro;
}

const hoy = () => new Date().toLocaleDateString('es-VE');

/** La banda de arriba: nombre del negocio y de qué va el archivo. */
function cabecera(hoja, subtitulo, numCols) {
  const ultima = hoja.getColumn(numCols).letter;

  hoja.mergeCells(`A1:${ultima}1`);
  const banda = hoja.getCell('A1');
  banda.value = 'MIS DETALLITOS G&M C.A.';
  banda.font = { name: 'Calibri', size: 14, bold: true, color: { argb: MARCA_TEXTO } };
  banda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
  banda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  hoja.getRow(1).height = 26;

  hoja.mergeCells(`A2:${ultima}2`);
  const sub = hoja.getCell('A2');
  sub.value = subtitulo;
  sub.font = { name: 'Calibri', size: 10, color: { argb: 'FF56707A' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  hoja.getRow(3).height = 6;
}

/** Encabezados de columna: turquesa, en negrita, congelados y repetidos. */
function encabezados(hoja, titulos) {
  const fila = hoja.getRow(FILA_ENCAB);
  titulos.forEach((t, i) => {
    const c = fila.getCell(i + 1);
    c.value = t;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MARCA_TEXTO } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: MARCA } } };
  });
  fila.height = 22;
  fila.commit?.();

  hoja.views = [{ state: 'frozen', xSplit: 0, ySplit: FILA_ENCAB }];
  hoja.pageSetup = {
    ...hoja.pageSetup,
    printTitlesRow: `${FILA_ENCAB}:${FILA_ENCAB}`,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

/** Cebra en las filas pares de datos: leer una tabla larga sin perder el renglón. */
function cebrear(hoja, desde, hasta, numCols) {
  for (let r = desde; r <= hasta; r++) {
    if ((r - desde) % 2 === 0) continue;
    for (let c = 1; c <= numCols; c++) {
      hoja.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CEBRA } };
    }
  }
}

/** La fila de TOTALES: negrita y fondo propio, para que no se lea como un dato más. */
function marcarTotales(hoja, fila, numCols) {
  for (let c = 1; c <= numCols; c++) {
    const celda = hoja.getCell(fila, c);
    celda.font = { name: 'Calibri', size: 11, bold: true };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALES } };
    celda.border = { top: { style: 'medium', color: { argb: MARCA } } };
  }
}

/**
 * El autofiltro abarca SÓLO los datos, nunca la fila de totales: si la
 * incluyera, al ordenar por cualquier columna el total se iría al medio.
 */
function filtrar(hoja, numCols, ultimaFilaDatos) {
  if (ultimaFilaDatos < FILA_DATOS) return;
  const ultima = hoja.getColumn(numCols).letter;
  hoja.autoFilter = `A${FILA_ENCAB}:${ultima}${ultimaFilaDatos}`;
}

/** Ancho de columna según el contenido más largo, con tope para que no se desborde. */
function anchos(hoja, titulos, filas) {
  hoja.columns = titulos.map((t, i) => {
    let max = String(t).length;
    for (const f of filas) {
      const v = f[i];
      const texto = v === null || v === undefined ? '' : String(v);
      if (texto.length > max) max = texto.length;
    }
    return { width: Math.min(Math.max(max + 3, 10), 60) };
  });
}

/** Escribe una fila de datos y le pone el formato numérico de cada columna. */
function escribirFila(hoja, fila, valores, formatos) {
  valores.forEach((v, i) => {
    const celda = hoja.getCell(fila, i + 1);
    if (v && typeof v === 'object' && v.formula) celda.value = { formula: v.formula };
    else celda.value = v;
    if (formatos[i]) celda.numFmt = formatos[i];
    celda.font = celda.font || { name: 'Calibri', size: 11 };
  });
}

function formula(f) {
  return { formula: f };
}

// --- Inventario --------------------------------------------------------------

export async function exportarInventario(productos) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Mis Detallitos';
  libro.created = new Date();
  const hoja = libro.addWorksheet('Inventario');

  const titulos = [
    'Nombre', 'SKU', 'Otros nombres', 'Categoría', 'Tipo', 'Tipo de precio',
    'Precio (USD)', 'Costo (USD)', 'Ganancia (USD)', 'Margen %',
    'Cantidad', 'Stock mínimo', 'Unidad', 'Código de barras', 'Tiene foto',
  ];
  const formatos = [
    null, null, null, null, null, null,
    MONEDA, MONEDA, MONEDA, PORCENTAJE,
    ENTERO, ENTERO, null, null, null,
  ];

  cabecera(hoja, `Inventario · ${hoy()}`, titulos.length);
  encabezados(hoja, titulos);

  const crudas = [];
  productos.forEach((p, i) => {
    const r = FILA_DATOS + i;
    const valores = [
      p.nombre || '',
      p.sku || '',
      (p.alias || []).join(', '),
      p.categoria || '',
      p.tipo === 'servicio' ? 'Servicio' : 'Producto',
      p.tipoPrecio === 'variable' ? 'Variable' : 'Fijo',
      aMayores(p.precioUSD || 0),
      aMayores(p.costoUSD || 0),
      formula(`G${r}-H${r}`),
      formula(`IF(G${r}>0,(G${r}-H${r})/G${r},0)`),
      p.stock || 0,
      p.stockMinimo || 0,
      p.unidad || 'unidad',
      p.codigoBarras ? String(p.codigoBarras) : '',
      p.tieneFoto ? 'Sí' : 'No',
    ];
    escribirFila(hoja, r, valores, formatos);
    crudas.push(valores.map((v) => (v && v.formula ? v.formula : v)));
  });

  const ultimaDatos = FILA_DATOS + productos.length - 1;

  if (productos.length) {
    cebrear(hoja, FILA_DATOS, ultimaDatos, titulos.length);
    filtrar(hoja, titulos.length, ultimaDatos);

    const tot = ultimaDatos + 1;
    escribirFila(hoja, tot, [
      'TOTALES / PROMEDIO', '', '', '', '', '',
      formula(`AVERAGE(G${FILA_DATOS}:G${ultimaDatos})`),
      formula(`AVERAGE(H${FILA_DATOS}:H${ultimaDatos})`),
      formula(`SUM(I${FILA_DATOS}:I${ultimaDatos})`),
      formula(`IF(G${tot}>0,(G${tot}-H${tot})/G${tot},0)`),
      formula(`SUM(K${FILA_DATOS}:K${ultimaDatos})`),
      '', '', '', '',
    ], formatos);
    marcarTotales(hoja, tot, titulos.length);

    // Las dos preguntas que el dueño le hace al inventario, respondidas por
    // color en vez de leyendo fila por fila.
    hoja.addConditionalFormatting({
      ref: `K${FILA_DATOS}:K${ultimaDatos}`,
      rules: [{
        type: 'expression',
        formulae: [`AND($L${FILA_DATOS}>0,$K${FILA_DATOS}<=$L${FILA_DATOS})`],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBAR_SUAVE } },
          font: { bold: true, color: { argb: AMBAR_TEXTO } },
        },
      }],
    });
    hoja.addConditionalFormatting({
      ref: `J${FILA_DATOS}:J${ultimaDatos}`,
      rules: [{
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['0'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: ROJO_SUAVE } },
          font: { bold: true, color: { argb: ROJO_TEXTO } },
        },
      }],
    });
  }

  anchos(hoja, titulos, crudas);
  return bajar(libro, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- Ventas ------------------------------------------------------------------

export async function exportarVentas(ventas, { desde, hasta, porProducto = [], porVendedor = [] }) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Mis Detallitos';
  libro.created = new Date();
  const periodo = `${desde} a ${hasta}`;

  // --- 1. Ventas ---
  const hojaVentas = libro.addWorksheet('Ventas');
  const encVentas = ['Fecha', 'Vendedor', 'Productos', 'Total (USD)', 'Costo (USD)', 'Ganancia (USD)', 'Pagos', 'Quedó debiendo'];
  const fmtVentas = [null, null, null, MONEDA, MONEDA, MONEDA, null, MONEDA];

  cabecera(hojaVentas, `Ventas · ${periodo}`, encVentas.length);
  encabezados(hojaVentas, encVentas);

  const crudasVentas = [];
  ventas.forEach((v, i) => {
    const r = FILA_DATOS + i;
    const valores = [
      v.dia || '',
      v.nombreUsuario || '',
      (v.lineas || []).map((l) => `${l.cantidad}x ${l.nombre}`).join(' | '),
      aMayores(v.totalUSD || 0),
      aMayores(v.costoTotalUSD || 0),
      formula(`D${r}-E${r}`),
      (v.pagos || []).map((p) => `${p.moneda} ${p.monto}`).join(' + '),
      aMayores(Math.max(0, v.saldoUSD || 0)),
    ];
    escribirFila(hojaVentas, r, valores, fmtVentas);
    crudasVentas.push(valores.map((x) => (x && x.formula ? x.formula : x)));
  });

  const ultVentas = FILA_DATOS + ventas.length - 1;
  if (ventas.length) {
    cebrear(hojaVentas, FILA_DATOS, ultVentas, encVentas.length);
    filtrar(hojaVentas, encVentas.length, ultVentas);
    const tot = ultVentas + 1;
    escribirFila(hojaVentas, tot, [
      'TOTALES', '', '',
      formula(`SUM(D${FILA_DATOS}:D${ultVentas})`),
      formula(`SUM(E${FILA_DATOS}:E${ultVentas})`),
      formula(`SUM(F${FILA_DATOS}:F${ultVentas})`),
      '',
      formula(`SUM(H${FILA_DATOS}:H${ultVentas})`),
    ], fmtVentas);
    marcarTotales(hojaVentas, tot, encVentas.length);
  }
  anchos(hojaVentas, encVentas, crudasVentas);

  // --- 2. Por producto ---
  if (porProducto.length) {
    const hoja = libro.addWorksheet('Por producto');
    const enc = ['Producto', 'Unidades', 'Vendido (USD)', 'Costo (USD)', 'Ganancia (USD)', 'Margen %', 'Veces vendido'];
    const fmt = [null, ENTERO, MONEDA, MONEDA, MONEDA, PORCENTAJE, ENTERO];

    cabecera(hoja, `Ganancia por producto · ${periodo}`, enc.length);
    encabezados(hoja, enc);

    const crudas = [];
    porProducto.forEach((p, i) => {
      const r = FILA_DATOS + i;
      const valores = [
        p.nombre || '',
        p.unidades || 0,
        aMayores(p.vendidoUSD || 0),
        aMayores(p.costoUSD || 0),
        formula(`C${r}-D${r}`),
        formula(`IF(C${r}>0,(C${r}-D${r})/C${r},0)`),
        p.veces || 0,
      ];
      escribirFila(hoja, r, valores, fmt);
      crudas.push(valores.map((x) => (x && x.formula ? x.formula : x)));
    });

    const ult = FILA_DATOS + porProducto.length - 1;
    cebrear(hoja, FILA_DATOS, ult, enc.length);
    filtrar(hoja, enc.length, ult);
    const tot = ult + 1;
    escribirFila(hoja, tot, [
      'TOTALES',
      formula(`SUM(B${FILA_DATOS}:B${ult})`),
      formula(`SUM(C${FILA_DATOS}:C${ult})`),
      formula(`SUM(D${FILA_DATOS}:D${ult})`),
      formula(`SUM(E${FILA_DATOS}:E${ult})`),
      formula(`IF(C${tot}>0,(C${tot}-D${tot})/C${tot},0)`),
      formula(`SUM(G${FILA_DATOS}:G${ult})`),
    ], fmt);
    marcarTotales(hoja, tot, enc.length);

    // Lo que deja menos del 15% se pinta: es el reporte que pidió el dueño.
    hoja.addConditionalFormatting({
      ref: `F${FILA_DATOS}:F${ult}`,
      rules: [{
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['0.15'],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: AMBAR_SUAVE } },
          font: { bold: true, color: { argb: AMBAR_TEXTO } },
        },
      }],
    });

    anchos(hoja, enc, crudas);
  }

  // --- 3. Por vendedor ---
  if (porVendedor.length) {
    const hoja = libro.addWorksheet('Por vendedor');
    const enc = ['Vendedor', 'Ventas', 'Vendido (USD)', 'Ganancia (USD)', '% del total', 'Ticket promedio (USD)', 'Precios cambiados'];
    const fmt = [null, ENTERO, MONEDA, MONEDA, PORCENTAJE, MONEDA, ENTERO];

    cabecera(hoja, `Quién vendió · ${periodo}`, enc.length);
    encabezados(hoja, enc);

    const ult = FILA_DATOS + porVendedor.length - 1;
    const tot = ult + 1;

    const crudas = [];
    porVendedor.forEach((v, i) => {
      const r = FILA_DATOS + i;
      const valores = [
        v.nombre || '',
        v.ventas || 0,
        aMayores(v.vendidoUSD || 0),
        aMayores(v.gananciaUSD || 0),
        // Fila fija con $: al copiar la fórmula hacia abajo sigue apuntando al total.
        formula(`C${r}/C$${tot}`),
        formula(`IF(B${r}>0,C${r}/B${r},0)`),
        v.descuentos || 0,
      ];
      escribirFila(hoja, r, valores, fmt);
      crudas.push(valores.map((x) => (x && x.formula ? x.formula : x)));
    });

    cebrear(hoja, FILA_DATOS, ult, enc.length);
    filtrar(hoja, enc.length, ult);
    escribirFila(hoja, tot, [
      'TOTALES',
      formula(`SUM(B${FILA_DATOS}:B${ult})`),
      formula(`SUM(C${FILA_DATOS}:C${ult})`),
      formula(`SUM(D${FILA_DATOS}:D${ult})`),
      formula(`SUM(E${FILA_DATOS}:E${ult})`),
      formula(`IF(B${tot}>0,C${tot}/B${tot},0)`),
      formula(`SUM(G${FILA_DATOS}:G${ult})`),
    ], fmt);
    marcarTotales(hoja, tot, enc.length);
    anchos(hoja, enc, crudas);
  }

  return bajar(libro, `ventas-${desde}-a-${hasta}.xlsx`);
}
