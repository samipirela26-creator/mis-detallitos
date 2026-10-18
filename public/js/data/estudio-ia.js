// estudio-ia.js — FONDO BLANCO TIPO ESTUDIO, con IA.
//
// Una foto de un lápiz sobre el mostrador no vende; la misma foto recortada
// sobre fondo blanco, centrada y con su sombrita, sí. Eso es todo lo que hace
// este módulo: manda la foto a un servicio de IA que devuelve el producto
// recortado (PNG transparente) y el resto —fondo, encuadre, margen, sombra— se
// arma aquí mismo en un canvas.
//
// Por qué se compone aquí y no se le pide el fondo al servicio: así los ajustes
// finos son instantáneos y gratis (mover el margen no gasta otra foto), y las
// 1000 fotos del inventario quedan todas con el MISMO encuadre, que es lo que
// hace que un catálogo parezca profesional.
//
// Sobre la llave: vive en `secretos/ia`, que por reglas de Firestore solo lee
// el dueño. NO va en el código ni en `config/` (ese es de lectura pública para
// el catálogo de clientes). Aun así la llave llega al navegador del dueño, así
// que conviene una llave con límite de gasto en el panel del proveedor.

import { ref } from '../core/firebase.js';
import { getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { comprimir, LADO_MAX, CALIDAD } from './fotos.js';
import { aWebp } from './webp.js';

export const PROVEEDORES = {
  photoroom: {
    nombre: 'Photoroom',
    url: 'https://sdk.photoroom.com/v1/segment',
    cabecera: 'x-api-key',
    costo: 'desde ~$0,02 por foto',
    donde: 'app.photoroom.com/api-dashboard',
  },
  removebg: {
    nombre: 'remove.bg',
    url: 'https://api.remove.bg/v1.0/removebg',
    cabecera: 'X-Api-Key',
    costo: '~$0,09 por foto (50 gratis al mes)',
    donde: 'remove.bg/dashboard#api-key',
  },
};

export const FONDOS = {
  blanco: { nombre: 'Blanco puro', color: '#ffffff' },
  hueso:  { nombre: 'Blanco hueso', color: '#faf8f5' },
  gris:   { nombre: 'Gris muy claro', color: '#f2f3f5' },
};

export const AJUSTES_DEF = {
  activo: false,
  proveedor: 'photoroom',
  apiKey: '',
  margen: 8,      // % del lado que queda libre alrededor del producto
  sombra: 35,     // 0 = sin sombra, 100 = sombra marcada
  fondo: 'blanco',
};

let cache = null;

/** Ajustes del estudio. Solo el dueño puede leerlos (reglas de Firestore). */
export async function cargarAjustes({ recargar = false } = {}) {
  if (cache && !recargar) return cache;
  try {
    const snap = await getDoc(ref('secretos', 'ia'));
    cache = { ...AJUSTES_DEF, ...(snap.exists() ? snap.data() : {}) };
  } catch {
    // El empleado no puede leer esto, y no debe: para él la IA simplemente no existe.
    cache = { ...AJUSTES_DEF };
  }
  return cache;
}

export async function guardarAjustes(parciales) {
  const nuevos = { ...(await cargarAjustes()), ...parciales };
  await setDoc(ref('secretos', 'ia'), nuevos, { merge: true });
  cache = nuevos;
  return nuevos;
}

/** ¿Está lista para usarse? (encendida, con llave y con internet) */
export function lista(ajustes) {
  return !!(ajustes?.activo && ajustes?.apiKey && navigator.onLine);
}

// --- paso 1: la IA recorta el producto --------------------------------------

/** Manda la foto al proveedor y devuelve un Blob PNG con fondo transparente. */
export async function recortar(archivo, ajustes) {
  const prov = PROVEEDORES[ajustes.proveedor] || PROVEEDORES.photoroom;
  const cuerpo = new FormData();
  cuerpo.append('image_file', archivo, 'foto.jpg');
  cuerpo.append('format', 'png');
  if (ajustes.proveedor === 'removebg') {
    cuerpo.append('size', 'auto');
    cuerpo.append('type', 'product');
  }

  let r;
  try {
    r = await fetch(prov.url, {
      method: 'POST',
      headers: { [prov.cabecera]: ajustes.apiKey, Accept: 'image/png' },
      body: cuerpo,
    });
  } catch {
    throw new Error(`No se pudo hablar con ${prov.nombre}. Revisa el internet.`);
  }

  if (!r.ok) throw new Error(await explicarFallo(r, prov));

  const blob = await r.blob();
  if (!blob.size) throw new Error(`${prov.nombre} devolvió una imagen vacía.`);
  return blob;
}

/** Traduce el error del servicio a algo que se entienda en el mostrador. */
async function explicarFallo(r, prov) {
  if (r.status === 401 || r.status === 403) return `${prov.nombre} rechazó la llave. Revísala en Configuración.`;
  if (r.status === 402) return `Se acabaron los créditos de ${prov.nombre}. Recárgalos o apaga la IA.`;
  if (r.status === 429) return `${prov.nombre} está recibiendo muchas fotos. Espera un momento.`;
  if (r.status >= 500) return `${prov.nombre} está caído. Intenta más tarde.`;
  let detalle = '';
  try {
    const t = (await r.text()).slice(0, 300);
    detalle = JSON.parse(t)?.errors?.[0]?.title || JSON.parse(t)?.error?.message || t;
  } catch { /* el cuerpo no era JSON; da igual */ }
  return `${prov.nombre} falló (${r.status})${detalle ? ': ' + detalle : ''}`;
}

// --- paso 2: el estudio se arma aquí ----------------------------------------

/** Pone el recorte sobre el fondo, centrado, con margen y sombra.
 *  Devuelve un dataURL WebP del mismo tamaño que el resto de las fotos. */
export function componer(blobRecorte, ajustes = AJUSTES_DEF, { lado = LADO_MAX } = {}) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(blobRecorte);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try { ok(dibujar(img, ajustes, lado)); } catch (e) { mal(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('El recorte llegó dañado.')); };
    img.src = url;
  });
}

function dibujar(img, ajustes, lado) {
  const caja = limites(img);
  const fondo = (FONDOS[ajustes.fondo] || FONDOS.blanco).color;

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, lado, lado);

  const sombra = Math.max(0, Math.min(100, Number(ajustes.sombra) || 0)) / 100;
  const margen = Math.max(0, Math.min(30, Number(ajustes.margen) || 0)) / 100;

  // El margen se mide contra el producto recortado, no contra la foto original:
  // así un borrador chiquito y una resma grande quedan del mismo tamaño en la lista.
  const libre = lado * (1 - margen * 2);
  // La sombra cae debajo, así que se le reserva su espacio para que no se corte.
  const reservaSombra = sombra ? lado * 0.04 : 0;
  const escala = Math.min(libre / caja.ancho, (libre - reservaSombra) / caja.alto);
  const ancho = caja.ancho * escala;
  const alto = caja.alto * escala;
  const x = (lado - ancho) / 2;
  const y = (lado - alto - reservaSombra) / 2;

  if (sombra) {
    ctx.shadowColor = `rgba(0,0,0,${(0.45 * sombra).toFixed(3)})`;
    ctx.shadowBlur = lado * 0.05 * (0.5 + sombra);
    ctx.shadowOffsetY = lado * 0.022 * (0.5 + sombra);
  }
  ctx.drawImage(img, caja.x, caja.y, caja.ancho, caja.alto, x, y, ancho, alto);
  ctx.shadowColor = 'transparent';

  // Igual que en fotos.js: WebP aunque el navegador no sepa hacerlo. `componer`
  // ya devuelve una promesa, así que devolver otra aquí encadena sin cambiar a
  // quien llama.
  return aWebp(lienzo, { calidad: CALIDAD }).then(({ datos }) => datos);
}

/** Caja que ocupa realmente el producto dentro del PNG transparente.
 *  Sin esto, el margen dependería de cuánto aire tenía la foto original. */
function limites(img) {
  const completo = { x: 0, y: 0, ancho: img.width, alto: img.height };
  // Se mide en chiquito: con 200px de lado alcanza y es casi instantáneo.
  const paso = Math.max(1, Math.ceil(Math.max(img.width, img.height) / 200));
  const w = Math.max(1, Math.round(img.width / paso));
  const h = Math.max(1, Math.round(img.height / paso));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  let pix;
  try { pix = ctx.getImageData(0, 0, w, h).data; } catch { return completo; }

  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pix[(y * w + x) * 4 + 3] > 12) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return completo;   // recorte vacío: mejor usar la imagen entera

  const borde = 2 * paso;        // un pelito de aire por el muestreo
  const x = Math.max(0, x1 * paso - borde);
  const y = Math.max(0, y1 * paso - borde);
  return {
    x, y,
    ancho: Math.min(img.width - x, (x2 - x1 + 1) * paso + borde * 2),
    alto: Math.min(img.height - y, (y2 - y1 + 1) * paso + borde * 2),
  };
}

// --- lo que usa el Estudio de Fotos -----------------------------------------

/** Deja la foto lista para guardar.
 *  Si la IA está apagada, sin llave, sin internet o falla, devuelve la foto
 *  comprimida normal: NUNCA se pierde el disparo por culpa de la IA.
 *  → { datos, conIA, aviso } */
export async function procesar(archivo, { ajustes, encajar = false } = {}) {
  const aj = ajustes || await cargarAjustes();
  if (!lista(aj)) return { datos: await comprimir(archivo, { encajar }), conIA: false };
  try {
    const recorte = await recortar(archivo, aj);
    return { datos: await componer(recorte, aj), conIA: true };
  } catch (e) {
    return { datos: await comprimir(archivo, { encajar }), conIA: false, aviso: e.message || 'La IA falló' };
  }
}

/** Para la vista previa de Configuración: recorta una vez y recompone muchas
 *  veces mientras se mueven los deslizadores, sin gastar fotos de más. */
export async function probar(archivo, ajustes) {
  const recorte = await recortar(archivo, ajustes);
  return {
    recorte,
    rehacer: (nuevos) => componer(recorte, { ...ajustes, ...nuevos }),
    datos: await componer(recorte, ajustes),
  };
}
