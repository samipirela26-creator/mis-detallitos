// recortar.js — RECORTE DE LA FOTO, justo después del disparo.
//
// Antes, el que disparaba no decidía nada: `comprimir()` cortaba un cuadrado al
// centro y listo. Con el teléfono en la mano eso falla siempre igual: el
// producto nunca queda al centro exacto, y el cuadrado se come media resma o
// deja medio mostrador dentro.
//
// Así que entre el disparo y el guardado se abre esta pantalla: arrastras el
// marco, lo estiras, giras la foto si salió acostada, y recién entonces se
// guarda. El recorte sale ANTES de la IA a propósito: si al servicio le llega
// la foto ya encuadrada, recorta mejor y se paga menos imagen inútil.
//
// Las proporciones son fijas (1:1 por omisión) porque lo que hace que un
// catálogo se vea serio es que las 1000 fotos tengan el MISMO encuadre; "Libre"
// está para el caso raro (una etiqueta muy alargada), y lo que sobre se rellena
// de blanco al comprimir, nunca se estira.
//
// Regla que no se rompe: nunca se pierde el disparo. Si la foto no se puede
// leer, o el navegador no da el recorte, se devuelve la original tal cual.

import { el, esc, pegar, recordarCuadro, olvidarCuadro } from './html.js';

export const RAZONES = [
  { id: '1:1', etiqueta: '1:1', valor: 1 },
  { id: '4:5', etiqueta: '4:5', valor: 4 / 5 },
  { id: '3:4', etiqueta: '3:4', valor: 3 / 4 },
  { id: 'libre', etiqueta: 'Libre', valor: null },
];

const LADO_SALIDA = 1600;   // el recorte sale grande; `comprimir()` lo baja a 800
const CALIDAD = 0.92;       // generosa: esta imagen todavía va a pasar por la IA

/**
 * Abre el recorte y devuelve la foto recortada.
 * → { blob, razon, recortada } | null  (null = el usuario canceló)
 */
export async function pedirRecorte(archivo, { titulo = '', razon = '1:1' } = {}) {
  let img;
  try {
    img = await cargarImagen(archivo);
  } catch {
    // Foto ilegible para el navegador (HEIC raro, archivo a medio escribir):
    // que siga su camino sin recortar antes que perder el disparo.
    return { blob: archivo, razon: null, recortada: false };
  }
  return abrir(img, archivo, { titulo, razon });
}

function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

function abrir(img, original, { titulo, razon }) {
  return new Promise((listo) => {
    let grados = 0;
    let fuente = rotar(img, 0);
    let razonId = RAZONES.some((r) => r.id === razon) ? razon : '1:1';
    let marco = encuadreInicial(fuente.width, fuente.height, valorDe(razonId));
    let resuelto = false;

    // --- armazón ---
    const lienzo = el('canvas', {
      // El tamaño en pantalla se calcula en `ajustar()`, no con CSS: un
      // max-width y un max-height juntos aplastan el canvas en los dos ejes a
      // la vez (una foto vertical salía en proporción 0,89 en vez de 0,56) y el
      // marco apuntaba a otro lado.
      style: 'display:block;border-radius:var(--r);background:#0c1e24;touch-action:none',
    });
    const caja = el('div', {
      style: 'position:absolute;outline:2px solid #fff;cursor:move;touch-action:none;'
           + 'box-shadow:0 0 0 9999px rgba(12,30,36,.55)',
    });
    // El envoltorio mide lo que mide el canvas: el marco se posiciona contra la
    // imagen de verdad, no contra el ancho del diálogo.
    const envoltura = el('div', { style: 'position:relative;display:inline-block;line-height:0;max-width:100%' }, [lienzo, caja]);
    const escena = el('div', { style: 'text-align:center' }, [envoltura]);
    const tira = el('div.fila', { style: 'gap:.4rem;margin-top:.75rem' });

    for (const esquina of ['nw', 'ne', 'sw', 'se']) {
      caja.appendChild(asa(esquina));
    }

    const d = el('dialog', { style: 'max-width:min(560px,94vw);width:100%' });
    d.addEventListener('close', () => { d.remove(); olvidarCuadro(d); if (!resuelto) { resuelto = true; listo(null); } });
    d.addEventListener('cancel', (ev) => ev.preventDefault());   // sin salidas accidentales

    pegar(d,
      el('h2', { style: 'margin-bottom:.25rem', texto: 'Recortar la foto' }),
      titulo ? el('p', { style: 'color:var(--texto-suave);margin:0 0 .75rem', html: esc(titulo) }) : null,
      escena,
      el('p', {
        style: 'color:var(--texto-suave);font-size:var(--t-pie);margin:.6rem 0 0',
        texto: 'Arrastra el marco para encuadrar el producto. Las esquinas lo estiran.',
      }),
      tira,
      el('div.fila', { style: 'margin-top:.5rem' }, [
        el('button.btn.plano', {
          texto: 'Girar',
          style: 'flex:0 0 auto',
          onclick: () => {
            grados = (grados + 90) % 360;
            fuente = rotar(img, grados);
            marco = encuadreInicial(fuente.width, fuente.height, valorDe(razonId));
            pintar();
          },
        }),
        el('button.btn.plano', {
          texto: 'Todo',
          style: 'flex:0 0 auto',
          onclick: () => { marco = encuadreInicial(fuente.width, fuente.height, valorDe(razonId), 1); pintar(); },
        }),
      ]),
      el('div.fila', { style: 'margin-top:1rem' }, [
        el('button.btn.plano', { texto: 'Repetir foto', onclick: () => d.close() }),
        el('button.btn.principal', {
          texto: 'Usar esta foto',
          style: 'flex:2',
          onclick: async () => {
            const blob = await cortar(fuente, marco);
            resuelto = true;
            d.close();
            // Si el navegador no dio el recorte, va la original: nunca se pierde el disparo.
            listo({ blob: blob || original, razon: razonId, recortada: !!blob });
          },
        }),
      ])
    );

    // --- proporciones ---
    function pintarTira() {
      tira.innerHTML = '';
      for (const r of RAZONES) {
        tira.appendChild(el('button', {
          class: `btn ${r.id === razonId ? 'acento' : 'plano'}`,
          texto: r.etiqueta,
          'aria-pressed': r.id === razonId ? 'true' : 'false',
          style: 'flex:1;min-height:44px',
          onclick: () => {
            razonId = r.id;
            marco = encuadreInicial(fuente.width, fuente.height, r.valor);
            pintar();
          },
        }));
      }
    }

    /** Mete la foto en el hueco disponible SIN deformarla. El envoltorio queda
     *  del tamaño exacto de lo que se ve, que es contra lo que se mide el marco. */
    function ajustar() {
      const anchoHueco = escena.clientWidth || 320;
      const altoHueco = Math.max(200, window.innerHeight * 0.52);
      const escala = Math.min(anchoHueco / fuente.width, altoHueco / fuente.height, 1);
      lienzo.style.width = `${Math.round(fuente.width * escala)}px`;
      lienzo.style.height = `${Math.round(fuente.height * escala)}px`;
    }

    function pintar() {
      lienzo.width = fuente.width;
      lienzo.height = fuente.height;
      ajustar();
      lienzo.getContext('2d').drawImage(fuente, 0, 0);
      const pc = (v, total) => `${(v / total) * 100}%`;
      caja.style.left = pc(marco.x, fuente.width);
      caja.style.top = pc(marco.y, fuente.height);
      caja.style.width = pc(marco.w, fuente.width);
      caja.style.height = pc(marco.h, fuente.height);
      pintarTira();
    }

    // --- arrastre ---
    /** Pasa píxeles de pantalla a píxeles de la foto. */
    const factor = () => fuente.width / (lienzo.getBoundingClientRect().width || 1);

    function arrastrar(nodo, rol) {
      nodo.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // Sin captura el dedo "se sale" del marco al moverse rápido. Si el
        // navegador no la da, el arrastre igual funciona.
        try { nodo.setPointerCapture(ev.pointerId); } catch { /* da igual */ }
        const f = factor();
        const inicio = { x: ev.clientX, y: ev.clientY, marco: { ...marco } };
        const mover = (e) => {
          const dx = (e.clientX - inicio.x) * f;
          const dy = (e.clientY - inicio.y) * f;
          marco = rol === 'mover'
            ? mueve(inicio.marco, dx, dy, fuente.width, fuente.height)
            : estira(inicio.marco, rol, dx, dy, fuente.width, fuente.height, valorDe(razonId));
          pintar();
        };
        const fin = () => {
          nodo.removeEventListener('pointermove', mover);
          nodo.removeEventListener('pointerup', fin);
          nodo.removeEventListener('pointercancel', fin);
        };
        nodo.addEventListener('pointermove', mover);
        nodo.addEventListener('pointerup', fin);
        nodo.addEventListener('pointercancel', fin);
      });
    }

    arrastrar(caja, 'mover');
    for (const a of caja.querySelectorAll('[data-rol]')) arrastrar(a, a.dataset.rol);

    document.body.appendChild(d);
    d.showModal();
    recordarCuadro(d);
    pintar();
    // El canvas ya tiene tamaño en pantalla: el marco se repinta con la medida real.
    requestAnimationFrame(pintar);
  });
}

/** Esquina de 44px de toque con la escuadrita visible dentro. */
function asa(rol) {
  const n = rol.includes('n'), o = rol.includes('w');
  const nodo = el('div', {
    'data-rol': rol,
    style: 'position:absolute;width:44px;height:44px;touch-action:none;'
         + `${n ? 'top' : 'bottom'}:-22px;${o ? 'left' : 'right'}:-22px;`
         + `cursor:${n === o ? 'nwse' : 'nesw'}-resize`,
  });
  nodo.appendChild(el('div', {
    style: 'position:absolute;width:20px;height:20px;border-radius:2px;'
         + `${n ? 'top' : 'bottom'}:11px;${o ? 'left' : 'right'}:11px;`
         + `border-${n ? 'top' : 'bottom'}:5px solid var(--amarillo);`
         + `border-${o ? 'left' : 'right'}:5px solid var(--amarillo);`,
  }));
  return nodo;
}

function valorDe(id) {
  return (RAZONES.find((r) => r.id === id) || {}).valor ?? null;
}

/** Marco inicial: el más grande que cabe con esa proporción, centrado. */
function encuadreInicial(W, H, valor, holgura = 0.95) {
  let w, h;
  if (!valor) { w = W * holgura; h = H * holgura; }
  else {
    w = W; h = w / valor;
    if (h > H) { h = H; w = h * valor; }
    w *= holgura; h *= holgura;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

function mueve(m, dx, dy, W, H) {
  return {
    ...m,
    x: Math.max(0, Math.min(W - m.w, m.x + dx)),
    y: Math.max(0, Math.min(H - m.h, m.y + dy)),
  };
}

/** Estira desde una esquina: la opuesta queda clavada. */
function estira(m, rol, dx, dy, W, H, valor) {
  const der = rol.includes('e');
  const aba = rol.includes('s');
  const min = Math.max(48, Math.min(W, H) * 0.1);

  let w = der ? m.w + dx : m.w - dx;
  let h = aba ? m.h + dy : m.h - dy;

  // Con proporción fija manda el eje que se movió más; el otro se deduce.
  if (valor) {
    if (Math.abs(dx) >= Math.abs(dy)) h = w / valor;
    else w = h * valor;
  }

  // Lo que hay disponible hacia ese lado, para no salirse de la foto.
  const topeW = der ? W - m.x : m.x + m.w;
  const topeH = aba ? H - m.y : m.y + m.h;
  w = Math.min(Math.max(w, min), topeW);
  h = Math.min(Math.max(h, min), topeH);
  if (valor) {
    w = Math.min(w, h * valor);
    h = w / valor;
  }

  return {
    w, h,
    x: der ? m.x : m.x + m.w - w,
    y: aba ? m.y : m.y + m.h - h,
  };
}

/** Gira la foto en pasos de 90° y devuelve el lienzo ya girado. */
function rotar(img, grados) {
  const acostada = grados % 180 !== 0;
  const c = document.createElement('canvas');
  c.width = acostada ? img.naturalHeight || img.height : img.naturalWidth || img.width;
  c.height = acostada ? img.naturalWidth || img.width : img.naturalHeight || img.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((grados * Math.PI) / 180);
  ctx.drawImage(img, -(img.width / 2), -(img.height / 2), img.width, img.height);
  return c;
}

/** Saca el pedazo marcado como JPEG. Fondo blanco por si la foto trae alfa. */
function cortar(fuente, m) {
  const escala = Math.min(1, LADO_SALIDA / Math.max(m.w, m.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(m.w * escala));
  c.height = Math.max(1, Math.round(m.h * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fuente, m.x, m.y, m.w, m.h, 0, 0, c.width, c.height);
  return new Promise((ok) => {
    try { c.toBlob((b) => ok(b || null), 'image/jpeg', CALIDAD); }
    catch { ok(null); }
  });
}
