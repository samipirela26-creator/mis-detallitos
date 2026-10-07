// export-pdf.js — el reporte en PDF, para imprimir o mandar por WhatsApp.
import { formatear } from '../core/dinero.js';
import { avisar } from '../ui/avisos.js';

async function jsPDF() {
  if (!window.jspdf) {
    await import('../../vendor/jspdf.js');
    await import('../../vendor/jspdf-autotable.js');
  }
  return window.jspdf.jsPDF;
}

export async function reportePDF({ desde, hasta, resumen, porProducto = [], porVendedor = [] }) {
  const PDF = await jsPDF();
  const doc = new PDF({ unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text('Mis Detallitos G&M C.A', 40, 50);
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(`Reporte del ${desde} al ${hasta}`, 40, 68);
  doc.setTextColor(0);

  const kpis = [
    ['Vendido', formatear(resumen.vendidoUSD)],
    ['Costo de lo vendido', formatear(resumen.costoUSD)],
    ['Ganancia bruta', formatear(resumen.gananciaBrutaUSD)],
    ['Gastos', formatear(resumen.gastosUSD)],
    ['GANANCIA NETA', formatear(resumen.gananciaNetaUSD)],
    ['Ventas', String(resumen.cantidad)],
    ['Ticket promedio', formatear(resumen.ticketPromedioUSD)],
    ['Por cobrar (fiado)', formatear(resumen.porCobrarUSD)],
  ];
  doc.autoTable({
    startY: 88,
    body: kpis,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 200 }, 1: { halign: 'right', fontStyle: 'bold' } },
  });

  if (porProducto.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Producto', 'Unid.', 'Vendido', 'Ganancia', 'Margen']],
      body: porProducto.slice(0, 40).map((p) => [
        p.nombre, String(p.unidades), formatear(p.vendidoUSD), formatear(p.gananciaUSD),
        p.margenPct === null ? '—' : `${p.margenPct.toFixed(0)}%`,
      ]),
      headStyles: { fillColor: [0, 162, 200] },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  if (porVendedor.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Vendedor', 'Ventas', 'Vendido', '% del total', 'Ticket prom.']],
      body: porVendedor.map((v) => [
        v.nombre, String(v.ventas), formatear(v.vendidoUSD), `${v.pct.toFixed(0)}%`, formatear(v.ticketUSD),
      ]),
      headStyles: { fillColor: [0, 162, 200] },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Generado el ${new Date().toLocaleString('es-VE')} · página ${i} de ${paginas}`, 40, doc.internal.pageSize.getHeight() - 24);
  }

  doc.save(`reporte-${desde}-a-${hasta}.pdf`);
  avisar('PDF descargado');
}
