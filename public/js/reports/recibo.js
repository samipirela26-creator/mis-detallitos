// recibo.js — el papelito de la venta. Se puede compartir por WhatsApp
// (que es como de verdad se manda aquí) o imprimir en PDF.

import { el, abrirDialogo, esc, fecha, pegar } from '../ui/html.js';
import { formatear, desdeUSD, MONEDAS } from '../core/dinero.js';
import { avisar, avisarOk } from '../ui/avisos.js';

const NEGOCIO = 'Mis Detallitos G&M C.A';

export function textoRecibo({ id, venta, tasas = {} }) {
  const lineas = venta.lineas.map((l) =>
    `${l.cantidad} x ${l.nombre} — ${formatear(Math.round(l.cantidad * l.precioUSD))}`
  );
  const otras = Object.keys(MONEDAS)
    .filter((m) => m !== 'USD' && tasas[m])
    .map((m) => `${formatear(desdeUSD(venta.totalUSD, m, tasas[m]), m)}`);
  const pagos = (venta.pagos || []).map((p) => `  ${formatear(p.monto, p.moneda)}`);

  return [
    `*${NEGOCIO}*`,
    new Date().toLocaleString('es-VE'),
    `Recibo ${String(id).slice(-6).toUpperCase()}`,
    '',
    ...lineas,
    '',
    `*TOTAL: ${formatear(venta.totalUSD)}*`,
    otras.length ? `(${otras.join(' / ')})` : '',
    pagos.length ? `Pagó:\n${pagos.join('\n')}` : '',
    venta.saldoUSD > 0 ? `*Queda debiendo: ${formatear(venta.saldoUSD)}*` : '',
    '',
    '¡Gracias por su compra!',
  ].filter(Boolean).join('\n');
}

export function recibo({ id, venta, tasas = {} }) {
  const texto = textoRecibo({ id, venta, tasas });
  const d = abrirDialogo('');
  pegar(d, 
    el('h2', { texto: '✅ Venta registrada' }),
    el('div.cifra-gigante', { style: 'text-align:center;margin:.5rem 0', texto: formatear(venta.totalUSD) }),
    venta.saldoUSD > 0
      ? el('p', { style: 'text-align:center;color:var(--rojo);font-weight:700', texto: `Queda debiendo ${formatear(venta.saldoUSD)}` })
      : null,
    el('pre', {
      style: 'background:var(--superficie-2);border-radius:var(--r-chico);padding:.75rem;font-size:.8rem;white-space:pre-wrap;max-height:30vh;overflow:auto',
      texto: texto.replace(/\*/g, ''),
    }),
    el('div.fila', { style: 'margin-top:1rem' }, [
      el('button.btn.plano', { texto: '📤 Compartir', onclick: () => compartir(texto) }),
      el('button.btn.plano', { texto: '🖨️ Imprimir', onclick: () => imprimir(texto) }),
      el('button.btn.principal', { texto: 'Listo', onclick: () => d.close() }),
    ])
  );
  // Que se pueda cerrar con Enter para seguir vendiendo rápido.
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.close(); });
}

export async function compartir(texto) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Recibo', text: texto });
      return;
    }
    await navigator.clipboard.writeText(texto);
    avisarOk('Recibo copiado: pégalo en WhatsApp');
  } catch (e) {
    if (e?.name !== 'AbortError') avisar('No se pudo compartir');
  }
}

export function imprimir(texto) {
  const v = window.open('', '_blank', 'width=380,height=600');
  if (!v) return avisar('El navegador bloqueó la ventana de impresión');
  v.document.write(`<pre style="font:13px/1.45 monospace;white-space:pre-wrap;padding:12px">${esc(texto.replace(/\*/g, ''))}</pre>`);
  v.document.close();
  v.focus();
  v.print();
}
