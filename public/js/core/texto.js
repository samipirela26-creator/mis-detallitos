// texto.js — normalización para buscar. Base del buscador tolerante a errores.

/** "Lápiz Mongol Nº2" -> "lapiz mongol n2". Sin acentos, sin signos, un espacio. */
export function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita acentos y la tilde de la ñ
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')   // "250ml" -> "250 ml"
    .replace(/([a-z])(\d)/g, '$1 $2')   // "n2" -> "n 2"
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quita el plural obvio para que "hojas" encuentre "hoja". */
export function singular(palabra = '') {
  if (palabra.length <= 3) return palabra;
  if (palabra.endsWith('ces')) return palabra.slice(0, -3) + 'z';  // lapices -> lapiz
  if (palabra.endsWith('es')) return palabra.slice(0, -2);
  if (palabra.endsWith('s')) return palabra.slice(0, -1);
  return palabra;
}

/** Palabras normalizadas y en singular, listas para indexar o comparar. */
export function tokens(texto = '') {
  return normalizar(texto).split(' ').filter(Boolean).map(singular);
}

/** Clave de deduplicación: dos productos con la misma clave son el mismo. */
export function claveProducto(nombre = '') {
  return tokens(nombre).sort().join(' ');
}
