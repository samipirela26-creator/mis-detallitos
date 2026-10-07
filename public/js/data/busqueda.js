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
  if (salida.length < limite && q.length >= 3) {
    for (const r of indiceDe(productos).search(q, { limit: limite })) {
      meter(r.item, 'difusa', 0.3 + (r.score || 0));
    }
  }

  return salida.sort((a, b) => a._puntaje - b._puntaje).slice(0, limite);
}

/** ¿Vale la pena ofrecer la ayuda de la IA? */
export const sinResultados = (resultados) => !resultados || resultados.length === 0;
