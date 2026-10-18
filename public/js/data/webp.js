// webp.js — garantiza WebP aunque el teléfono no sepa hacerlo.
//
// El iPhone decodifica WebP pero NO lo codifica: `canvas.toDataURL('image/webp')`
// devuelve otra cosa, y el código caía a JPEG. Se vio en los datos: la única
// foto tomada con el teléfono pesaba 122 KB cuando el promedio de las demás
// era 22 KB. Seis veces más, y multiplicado por 160 productos es la diferencia
// entre 4 MB y 26 MB en la base.
//
// Ningún parámetro obliga a Safari a codificar WebP, así que aquí se lleva el
// codificador: libwebp compilado a WebAssembly (el mismo de Squoosh, de Google).
// Son 320 KB que se bajan UNA sola vez y solo en el teléfono que los necesita
// — en la computadora ni se tocan, porque ahí el navegador ya sabe.
//
// Orden: lo que el navegador sepa hacer primero, y el wasm como último recurso.

// Relativa a ESTE archivo, no a la raíz del dominio: la app también se publica
// en GitHub Pages colgando de un subdirectorio, y ahí '/vendor/…' daba 404.
const RUTA_WASM = new URL('../../vendor/webp-enc.js', import.meta.url).href;

// Opciones de libwebp. Vienen de struct WebPConfig: el binding las exige todas,
// una que falte lo tumba. Solo `quality` se toca aquí.
const OPCIONES = {
  quality: 72, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50,
  filter_strength: 60, filter_sharpness: 0, filter_type: 1, partitions: 0,
  segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0,
  partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100,
  lossless: 0, exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0,
  low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0,
};

let codificador = null;   // promesa del módulo wasm, una sola vez por sesión
let nativo = null;        // null = todavía no se ha preguntado

/** ¿Este navegador sabe exportar WebP por su cuenta? Se pregunta una vez. */
export function navegadorSabeWebp() {
  if (nativo !== null) return nativo;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    nativo = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    nativo = false;
  }
  return nativo;
}

async function cargarWasm() {
  if (!codificador) {
    codificador = import(RUTA_WASM)
      .then((m) => m.default())     // emscripten devuelve el módulo listo
      .catch((e) => { codificador = null; throw e; });
  }
  return codificador;
}

/**
 * Pasa un canvas a WebP.
 * → { datos: dataURL, via: 'navegador' | 'wasm' | 'jpeg' }
 *
 * Nunca lanza por culpa del formato: si todo falla, devuelve JPEG. Perder la
 * foto por no poder comprimirla sería peor que guardarla pesada.
 */
export async function aWebp(lienzo, { calidad = 0.72 } = {}) {
  if (navegadorSabeWebp()) {
    const datos = lienzo.toDataURL('image/webp', calidad);
    if (datos.startsWith('data:image/webp')) return { datos, via: 'navegador' };
  }

  try {
    const modulo = await cargarWasm();
    const ctx = lienzo.getContext('2d');
    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const salida = modulo.encode(imagen.data, lienzo.width, lienzo.height, {
      ...OPCIONES,
      quality: Math.round(calidad * 100),
    });
    if (!salida) throw new Error('el codificador no devolvió nada');
    return { datos: `data:image/webp;base64,${aBase64(salida)}`, via: 'wasm' };
  } catch (e) {
    console.warn('[webp] no se pudo codificar con wasm:', e.message);
    // Último recurso: JPEG, pero más apretado para que no pese tanto.
    return { datos: lienzo.toDataURL('image/jpeg', Math.min(calidad, 0.62)), via: 'jpeg' };
  }
}

/** Bytes → base64 por pedazos: con una foto entera, `String.fromCharCode(...)`
 *  de un solo golpe revienta la pila de llamadas. */
function aBase64(bytes) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto = '';
  for (let i = 0; i < datos.length; i += 8192) {
    texto += String.fromCharCode.apply(null, datos.subarray(i, i + 8192));
  }
  return btoa(texto);
}
