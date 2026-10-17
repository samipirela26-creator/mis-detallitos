// busqueda.js — EL buscador. Es la razón por la que se abandonó Treinta:
// uno no se acuerda del nombre exacto, lo escribe mal, y no aparece nada.
//
// Orden de ataque (todo local, todo sin internet):
//   1. código de barras o SKU exacto  -> va directo
//   2. coincidencia exacta de nombre o de un sinónimo
//   3. empieza por / contiene todas las palabras (en singular y sin acentos)
//   4. difusa con Fuse.js: aguanta letras cambiadas ("lapis mongold")
//   5. si no hay nada, la pantalla ofrece preguntarle a la IA
//
// Lo que hace la diferencia de verdad son los SINÓNIMOS (`alias`), y la app los
// va aprendiendo sola: ver `sinonimos.js`.

import Fuse from '../../vendor/fuse.mjs';
import { normalizar, tokens } from '../core/texto.js';

const OPCIONES_FUSE = {
  includeScore: true,
  ignoreDiacritics: true,
  ignoreLocation: true,      // la palabra puede estar en cualquier parte
  threshold: 0.45,           // más alto = más permisivo. Calibrado contra un
                             // catálogo real de 1000 productos: con 0.38
                             // "lapis" no encontraba "Lápiz"; con 0.45 sí, y
                             // la basura que entra queda al final porque los
                             // resultados exactos van antes.
  distance: 100,
  minMatchCharLength: 2,
  keys: [
    { name: 'nombreNorm', weight: 0.6 },
    { name: 'aliasNorm', weight: 0.3 },
    { name: 'categoria', weight: 0.1 },
  ],
};

let indice = null;
let firmaIndice = '';

/** Rearma el índice solo si el catálogo cambió de verdad. */
function indiceDe(productos) {
  const firma = `${productos.length}:${productos[0]?.id || ''}:${productos.at(-1)?.actualizado?.seconds || ''}`;
  if (!indice || firma !== firmaIndice) {
    indice = new Fuse(productos, OPCIONES_FUSE);
    firmaIndice = firma;
  }
  return indice;
}

export function invalidarIndice() { indice = null; firmaIndice = ''; }

const textoDe = (p) => `${p.nombreNorm || normalizar(p.nombre)} ${(p.aliasNorm || []).join(' ')}`;

/**
 * buscar('lapis mongold', productos) -> [{ ...producto, _motivo, _puntaje }]
 * `_motivo` sirve para la interfaz: 'codigo' | 'exacto' | 'palabras' | 'difusa'.
 */
export function buscar(texto, productos = [], { limite = 25 } = {}) {
  const crudo = (texto || '').trim();
  if (!crudo) return [];
  const q = normalizar(crudo);
  const palabras = tokens(crudo);
  const vistos = new Set();
  const salida = [];

  const meter = (p, motivo, puntaje) => {
    if (!p || vistos.has(p.id)) return;
    vistos.add(p.id);
    salida.push({ ...p, _motivo: motivo, _puntaje: puntaje });
  };

  // 1. Código de barras o SKU: si coincide, no hay nada que pensar.
  for (const p of productos) {
    if ((p.codigoBarras && p.codigoBarras === crudo) || (p.sku && normalizar(p.sku) === q)) {
      meter(p, 'codigo', 0);
    }
  }
  if (salida.length) return salida;

  // 2. Nombre o sinónimo exacto.
  for (const p of productos) {
    if (p.nombreNorm === q || (p.aliasNorm || []).includes(q)) meter(p, 'exacto', 0.01);
  }

  // 3. Todas las palabras aparecen (en singular, sin acentos).
  for (const p of productos) {
    const campo = textoDe(p);
    const palabrasProducto = tokens(campo);
    const todas = palabras.every((w) =>
      palabrasProducto.some((pp) => pp.startsWith(w) || w.startsWith(pp))
    );
    if (todas) {
      // Que empiece por lo escrito vale más que que lo contenga.
      meter(p, 'palabras', campo.startsWith(q) ? 0.05 : 0.15);
    }
  }

  // 4. Difusa: aquí entran los errores de dedo.
  // Desde 4 letras, no 3: escribiendo "lap" la difusa colaba "Cinta aislante
  // en PVC" por encima de nada útil. Con 4 el ruido desaparece y los errores de
  // dedo ("lapiss", "crellones") se siguen aguantando, porque esos ya los toma
  // el paso 3 por prefijo.
  if (salida.length < limite && q.length >= 4) {
    for (const r of indiceDe(productos).search(q, { limit: limite })) {
      meter(r.item, 'difusa', 0.3 + (r.score || 0));
    }
  }

  return salida.sort((a, b) => a._puntaje - b._puntaje).slice(0, limite);
}

/** ¿Vale la pena ofrecer la ayuda de la IA? */
export const sinResultados = (resultados) => !resultados || resultados.length === 0;

// --- Cantidad y código escritos en la misma caja de búsqueda -----------------

/**
 * Separa una cantidad escrita junto al producto: "3x lapiz" -> 3 y "lapiz".
 * Acepta la x o el * delante o detrás, y decimales con coma ("2,5 x tela",
 * para lo que se vende por metro o por kilo).
 *
 * EXIGE la x o el *. Un número suelto NO es cantidad, y esta es la regla que
 * evita el error caro del mostrador: "cuaderno 100 hojas" agregando cien
 * cuadernos, o "pega 250" vendiendo 250 pegas. Hay demasiados productos que
 * llevan el número en el nombre.
 */
export function partirCantidad(entrada) {
  const texto = String(entrada ?? '').trim();
  if (!texto) return { cantidad: null, texto: '' };

  const num = '(\\d+(?:[.,]\\d+)?)';
  const delante = new RegExp(`^${num}\\s*[x*]\\s*(.+)$`, 'i');
  const detras = new RegExp(`^(.+?)\\s*[x*]\\s*${num}$`, 'i');

  let cantidad = null;
  let resto = null;

  const d = texto.match(delante);
  if (d) {
    cantidad = Number(d[1].replace(',', '.'));
    resto = d[2];
  } else {
    const t = texto.match(detras);
    if (t) {
      cantidad = Number(t[2].replace(',', '.'));
      resto = t[1];
    }
  }

  // "0x lapiz" no es una venta de cero: se busca el texto tal cual.
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { cantidad: null, texto };

  return { cantidad, texto: resto.trim() };
}

/**
 * ¿Esto lo escupió el lector de códigos de barras?
 * Sólo dígitos y al menos ocho: EAN-8 es el más corto que se usa. Por debajo
 * de eso es más probable que sea alguien tecleando un número a mano.
 */
export function pareceCodigo(entrada) {
  const s = String(entrada ?? '').trim();
  return s.length >= 8 && /^\d+$/.test(s);
}
