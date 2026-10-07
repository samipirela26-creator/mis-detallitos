// export-excel.js — sacar los datos a Excel. Que la información sea tuya y
// puedas abrirla sin la app.

import { aMayores, formatear } from '../core/dinero.js';
import { avisar } from '../ui/avisos.js';

async function XLSX() {
  if (!window.XLSX) await import('../../vendor/xlsx.js');
  return window.XLSX;
}

function bajar(libro, nombre) {
  return XLSX().then((X) => {
    X.writeFile(libro, nombre);
    avisar('Archivo descargado');
  });
}

export async function exportarInventario(productos) {
  const X = await XLSX();
  const filas = productos.map((p) => ({
    Nombre: p.nombre,
    'Otros nombres': (p.alias || []).join(', '),
    Categoría: p.categoria || '',
    Tipo: p.tipo === 'servicio' ? 'Servicio' : 'Producto',
    'Tipo de precio': p.tipoPrecio === 'variable' ? 'Variable' : 'Fijo',
    'Precio (USD)': aMayores(p.precioUSD),
    'Costo (USD)': aMayores(p.costoUSD),
    'Ganancia (USD)': aMayores((p.precioUSD || 0) - (p.costoUSD || 0)),
    'Margen %': p.precioUSD ? Number((((p.precioUSD - p.costoUSD) / p.precioUSD) * 100).toFixed(1)) : '',
    Cantidad: p.stock,
    'Stock mínimo': p.stockMinimo,
    Unidad: p.unidad,
    'Código de barras': p.codigoBarras || '',
    SKU: p.sku || '',
    'Tiene foto': p.tieneFoto ? 'Sí' : 'No',
  }));
  const hoja = X.utils.json_to_sheet(filas);
  hoja['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];
  const libro = X.utils.book_new();
  X.utils.book_append_sheet(libro, hoja, 'Inventario');
  return bajar(libro, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportarVentas(ventas, { desde, hasta, porProducto = [], porVendedor = [] }) {
  const X = await XLSX();
  const libro = X.utils.book_new();

  const hojaVentas = X.utils.json_to_sheet(ventas.map((v) => ({
    Fecha: v.dia,
    Vendedor: v.nombreUsuario,
    Productos: (v.lineas || []).map((l) => `${l.cantidad}x ${l.nombre}`).join(' | '),
    'Total (USD)': aMayores(v.totalUSD),
    'Costo (USD)': aMayores(v.costoTotalUSD),
    'Ganancia (USD)': aMayores(v.gananciaUSD),
    Pagos: (v.pagos || []).map((p) => formatear(p.monto, p.moneda)).join(' + '),
    'Quedó debiendo': aMayores(Math.max(0, v.saldoUSD || 0)),
  })));
  hojaVentas['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
  X.utils.book_append_sheet(libro, hojaVentas, 'Ventas');

  if (porProducto.length) {
    const hoja = X.utils.json_to_sheet(porProducto.map((p) => ({
      Producto: p.nombre,
      Unidades: p.unidades,
      'Vendido (USD)': aMayores(p.vendidoUSD),
      'Costo (USD)': aMayores(p.costoUSD),
      'Ganancia (USD)': aMayores(p.gananciaUSD),
      'Margen %': p.margenPct === null ? '' : Number(p.margenPct.toFixed(1)),
      'Veces vendido': p.veces,
    })));
    hoja['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    X.utils.book_append_sheet(libro, hoja, 'Por producto');
  }

  if (porVendedor.length) {
    const hoja = X.utils.json_to_sheet(porVendedor.map((v) => ({
      Vendedor: v.nombre,
      Ventas: v.ventas,
      'Vendido (USD)': aMayores(v.vendidoUSD),
      'Ganancia (USD)': aMayores(v.gananciaUSD),
      '% del total': Number(v.pct.toFixed(1)),
      'Ticket promedio (USD)': aMayores(v.ticketUSD),
      'Precios cambiados': v.descuentos,
    })));
    hoja['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 18 }];
    X.utils.book_append_sheet(libro, hoja, 'Por vendedor');
  }

  return bajar(libro, `ventas-${desde}-a-${hasta}.xlsx`);
}
