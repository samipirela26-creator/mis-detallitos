// cobro.js — el estado de cuenta de un deudor, para mandárselo por WhatsApp.
//
// Dos formas, la que prefiera el dueño: texto (se pega en el chat) o imagen
// tipo factura (se comparte como foto). La imagen se dibuja en un canvas, sin
// librerías: funciona sin internet y pesa poco.
import { el, abrirDialogo, fecha, pegar } from '../ui/html.js';
import { formatear, desdeUSD } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { avisar, avisarOk } from '../ui/avisos.js';

const NEGOCIO = 'Mis Detallitos G&M C.A';

const monto = (deuda) => (deuda.COP ? formatear(deuda.COP, 'COP') : formatear(deuda.USD));

/** Lo que debe en bolívares a la tasa de hoy, o null si no hay tasa. */
function enBolivares(deuda) {
  const tasa = (leer('tasas') || {}).VES;
  return tasa > 0 && deuda.USD > 0 ? formatear(desdeUSD(deuda.USD, 'VES', tasa), 'VES') : null;
}

/** El mensaje en texto, con el formato de WhatsApp (*negrita*). */
export function textoCobro({ cliente, deuda, fiadas = [], abonos = [] }) {
  const filas = [`*${NEGOCIO}*`, `Estado de cuenta — ${new Date().toLocaleDateString('es-VE')}`, '',
    `Cliente: ${cliente.nombre}`, ''];
  if (fiadas.length) {
    filas.push('*Lo que se llevó fiado*');
    for (const v of fiadas) {
      const det = (v.lineas || []).map((l) => `${l.cantidad} ${l.nombre}`).join(', ');
      filas.push(`• ${fecha(v.ts)} — ${formatear(v.totalUSD || 0)}${det ? `\n   ${det}` : ''}`);
    }
    filas.push('');
  }
  if (abonos.length) {
    filas.push('*Abonos*');
    for (const x of abonos) filas.push(`• ${fecha(x.ts)} — ${formatear(x.montoUSD || 0)}`);
    filas.push('');
  }
  filas.push(`*Total a pagar: ${monto(deuda)}*`);
  if (deuda.COP) filas.push(`(${formatear(deuda.USD)} al dólar de hoy)`);
  const bs = enBolivares(deuda);
  if (bs) filas.push(`*En bolívares: ${bs}* (a la tasa de hoy)`);
  filas.push('', 'Gracias por tu compra 🙏');
  return filas.join('\n');
}

/** Parte `texto` en renglones que quepan en `ancho` píxeles. */
function envolver(ctx, texto, ancho) {
  const out = [];
  let linea = '';
  for (const palabra of String(texto).split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (linea && ctx.measureText(prueba).width > ancho) { out.push(linea); linea = palabra; }
    else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

/** Dibuja la "factura" y devuelve un Blob PNG. */
export function imagenCobro({ cliente, deuda, fiadas = [], abonos = [] }) {
  const W = 720, M = 40, ANCHO = W - 2 * M;
  const filas = [];
  const ctx0 = document.createElement('canvas').getContext('2d');
  ctx0.font = '22px sans-serif';
  for (const v of fiadas) {
    const det = (v.lineas || []).map((l) => `${l.cantidad} ${l.nombre}`).join(' · ');
    filas.push({ tipo: 'fiado', izq: fecha(v.ts), der: formatear(v.totalUSD || 0), det: envolver(ctx0, det, ANCHO - 140) });
  }
  for (const x of abonos) {
    filas.push({ tipo: 'abono', izq: `Abono ${fecha(x.ts)}`, der: `- ${formatear(x.montoUSD || 0)}`, det: [] });
  }
  const altoFilas = filas.reduce((t, f) => t + 44 + f.det.length * 28, 0);
  const H = 330 + altoFilas + 200;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0f4c5c'; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif';
  ctx.fillText(NEGOCIO, M, 55);
  ctx.font = '22px sans-serif';
  ctx.fillText(`Estado de cuenta · ${new Date().toLocaleDateString('es-VE')}`, M, 90);

  ctx.fillStyle = '#222'; ctx.font = 'bold 30px sans-serif';
  ctx.fillText(cliente.nombre, M, 165);
  if (cliente.telefono) { ctx.font = '22px sans-serif'; ctx.fillStyle = '#666'; ctx.fillText(cliente.telefono, M, 198); }

  let y = 250;
  ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#666';
  ctx.fillText('DETALLE', M, y);
  ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(M, y + 12); ctx.lineTo(W - M, y + 12); ctx.stroke();
  y += 50;
  for (const f of filas) {
    ctx.font = '24px sans-serif';
    ctx.fillStyle = f.tipo === 'abono' ? '#1b7a3d' : '#222';
    ctx.fillText(f.izq, M, y);
    ctx.textAlign = 'right'; ctx.fillText(f.der, W - M, y); ctx.textAlign = 'left';
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#777';
    f.det.forEach((l, i) => ctx.fillText(l, M + 14, y + 28 * (i + 1)));
    y += 44 + f.det.length * 28;
  }

  ctx.strokeStyle = '#0f4c5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 60;
  ctx.fillStyle = '#222'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('TOTAL A PAGAR', M, y);
  ctx.fillStyle = '#c0392b'; ctx.textAlign = 'right'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText(monto(deuda), W - M, y); ctx.textAlign = 'left';
  if (deuda.COP) {
    ctx.fillStyle = '#777'; ctx.font = '20px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${formatear(deuda.USD)} al dólar de hoy`, W - M, y + 30); ctx.textAlign = 'left';
  }
  const bs = enBolivares(deuda);
  if (bs) {
    ctx.fillStyle = '#222'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`En bolívares: ${bs}`, W - M, y + (deuda.COP ? 70 : 45)); ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#666'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Gracias por tu compra', W / 2, H - 30); ctx.textAlign = 'left';

  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

/** El cuadro con las dos opciones: mandar como texto o como imagen. */
export function abrirCobro(datos) {
  const d = abrirDialogo('');
  const texto = textoCobro(datos);
  const nombreArchivo = `cobro-${datos.cliente.nombre.replace(/\W+/g, '-').toLowerCase()}.png`;
  const tel = String(datos.cliente.telefono || '').replace(/\D/g, '');

  const mandarTexto = () => {
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); avisarOk('Texto copiado'); }
    catch { avisar('No se pudo copiar'); }
  };
  const mandarImagen = async () => {
    const blob = await imagenCobro(datos);
    const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
    if (navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: `Estado de cuenta de ${datos.cliente.nombre}` }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    // Sin "compartir" del sistema (computador): se descarga para adjuntarla.
    const a = el('a', { href: URL.createObjectURL(blob), download: nombreArchivo });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    avisarOk('Imagen descargada: adjúntala en WhatsApp');
  };

  pegar(d,
    el('h2', { texto: 'Enviar cobro' }),
    el('pre', {
      style: 'white-space:pre-wrap;font:inherit;font-size:var(--t-pie);background:var(--fondo-suave,#f4f4f4);padding:.6rem;border-radius:8px;max-height:40vh;overflow:auto',
      texto,
    }),
    el('div.fila', { style: 'margin:1rem 0 .5rem' }, [
      el('button.btn.principal', { texto: '💬 Texto por WhatsApp', onclick: mandarTexto }),
      el('button.btn.callado', { texto: 'Copiar', onclick: copiar }),
    ]),
    el('button.btn.callado.ancho', { texto: '🖼️ Enviar como imagen', onclick: mandarImagen }),
    el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Cerrar', onclick: () => d.close() })
  );
}
