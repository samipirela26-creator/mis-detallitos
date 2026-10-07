// importar-excel.js — EL CUELLO DE BOTELLA DEL PROYECTO.
//
// Llenar ~1000 productos a mano es lo que hace que la gente abandone estos
// sistemas. Aquí se copia lo que hacen los grandes (Shopify, Square) y se
// corrige lo que hacen mal:
//
//  - No se exige un formato: la app ADIVINA qué columna es cuál y tú corriges.
//  - VISTA PREVIA obligatoria antes de escribir nada.
//  - Detecta duplicados contra el catálogo Y dentro del propio archivo.
//  - Importa en lotes de 200 con barra de progreso.
//  - SE PUEDE DESHACER COMPLETA. Esto es lo que vuelve seguro equivocarse.
//  - Las filas sin precio o sin costo NO se rechazan: entran marcadas como
//    "incompleto". Primero vender, después completar.
//  - Las fotos no se piden aquí: eso es el Estudio de Fotos.

import { registrar, ir } from '../core/router.js';
import { el, esc, $, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { guardarEnLote, deshacerImportacion } from '../data/productos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { claveProducto } from '../core/texto.js';
import { aMenores, formatear } from '../core/dinero.js';
import { leerCSV } from '../data/csv.js';

// Cómo se suele llamar cada columna en la vida real.
const CAMPOS = {
  nombre: { titulo: 'Nombre', obligatorio: true, pistas: ['nombre', 'producto', 'descripcion', 'articulo', 'item', 'detalle'] },
  precioUSD: { titulo: 'Precio de venta', pistas: ['precio', 'venta', 'pvp', 'precio venta', 'valor'] },
  costoUSD: { titulo: 'Costo', pistas: ['costo', 'compra', 'precio compra', 'costo unitario'] },
  stock: { titulo: 'Cantidad', pistas: ['cantidad', 'stock', 'existencia', 'inventario', 'disponible'] },
  categoria: { titulo: 'Categoría', pistas: ['categoria', 'rubro', 'tipo', 'grupo', 'linea'] },
  codigoBarras: { titulo: 'Código de barras', pistas: ['codigo barras', 'barras', 'ean', 'upc', 'codigo de barras'] },
  sku: { titulo: 'Código / SKU', pistas: ['sku', 'codigo', 'ref', 'referencia'] },
  unidad: { titulo: 'Unidad', pistas: ['unidad', 'medida', 'presentacion'] },
  alias: { titulo: 'Otros nombres', pistas: ['alias', 'sinonimo', 'sinonimos', 'otros nombres'] },
  stockMinimo: { titulo: 'Stock mínimo', pistas: ['minimo', 'stock minimo', 'reorden'] },
};

const sinAcentos = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Adivina qué campo es cada columna, por el encabezado. */
function adivinarMapeo(encabezados) {
  const mapeo = {};
  const usadas = new Set();
  for (const [campo, def] of Object.entries(CAMPOS)) {
    let mejor = null, mejorPuntaje = 0;
    encabezados.forEach((h, i) => {
      if (usadas.has(i)) return;
      const limpio = sinAcentos(h);
      for (const pista of def.pistas) {
        const p = limpio === pista ? 3 : limpio.startsWith(pista) ? 2 : limpio.includes(pista) ? 1 : 0;
        if (p > mejorPuntaje) { mejorPuntaje = p; mejor = i; }
      }
    });
    if (mejor !== null) { mapeo[campo] = mejor; usadas.add(mejor); }
  }
  return mapeo;
}

let estado = null;   // { filas, encabezados, mapeo, archivo }

registrar('importar', {
  titulo: 'Importar Excel', icono: '📥', soloDueno: true,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta">
        <h1>📥 Importar el inventario</h1>
        <p>Sube tu Excel <strong>como lo tengas</strong>. La app adivina qué columna es
           cuál, te muestra una vista previa y <strong>se puede deshacer completa</strong>
           si algo sale mal.</p>
        <div class="fila">
          <button class="btn principal" id="elegir">📂 Elegir archivo</button>
          <button class="btn plano" id="plantilla">⬇️ Descargar plantilla</button>
        </div>
        <input type="file" id="archivo" accept=".xlsx,.xls,.csv,.ods" hidden>
        <p style="font-size:.85rem;color:var(--texto-suave);margin-top:.75rem">
          Acepta .xlsx, .xls, .csv y .ods. Las fotos no se ponen aquí:
          eso se hace de corrido en el <strong>Estudio de Fotos</strong>.</p>
      </div>
      <div id="paso"></div>`;

    const entrada = $('#archivo', nodo);
    $('#elegir', nodo).onclick = () => entrada.click();
    $('#plantilla', nodo).onclick = descargarPlantilla;
    entrada.onchange = () => entrada.files[0] && leerArchivo(entrada.files[0], $('#paso', nodo));

    // Soltar el archivo encima también funciona.
    nodo.addEventListener('dragover', (e) => { e.preventDefault(); });
    nodo.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) leerArchivo(f, $('#paso', nodo));
    });
  },
});

async function cargarXLSX() {
  if (!window.XLSX) await import('../../vendor/xlsx.js');
  return window.XLSX;
}

async function leerArchivo(archivo, caja) {
  caja.innerHTML = '<div class="tarjeta cargando">Leyendo el archivo…</div>';
  try {
    // Los .csv se leen con nuestro propio lector (data/csv.js): el de SheetJS
    // convierte "1,91" en 191 porque toma la coma como separador de miles, y
    // eso destruiría los precios sin avisar. Además así los acentos llegan bien.
    let filas, hojas = ['CSV'];
    const esTexto = /\.(csv|txt|tsv)$/i.test(archivo.name) || (archivo.type || '').startsWith('text/');

    if (esTexto) {
      filas = leerCSV(await archivo.text());
    } else {
      const XLSX = await cargarXLSX();
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false, codepage: 65001 });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      hojas = libro.SheetNames;
      // raw:false devuelve el texto ya formateado, que es lo que la persona ve
      // en su Excel: así "0,50" sigue siendo "0,50".
      filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '', raw: false });
    }
    if (filas.length < 2) throw new Error('El archivo no tiene filas de datos.');

    const encabezados = filas[0].map((h) => String(h).trim());
    estado = {
      archivo: archivo.name,
      encabezados,
      filas: filas.slice(1).filter((f) => f.some((c) => String(c).trim() !== '')),
      mapeo: adivinarMapeo(encabezados),
      hojas,
    };
    pintarMapeo(caja);
  } catch (e) {
    caja.innerHTML = '';
    caja.appendChild(el('div.tarjeta', {}, [
      el('h2', { texto: 'No se pudo leer el archivo' }),
      el('p', { texto: e.message || String(e) }),
    ]));
  }
}

function pintarMapeo(caja) {
  const { encabezados, filas, mapeo } = estado;
  caja.innerHTML = '';
  const tarjeta = el('div.tarjeta', { style: 'margin-top:1rem' });
  pegar(tarjeta, 
    el('h2', { texto: '1. ¿Qué es cada columna?' }),
    el('p', {
      style: 'color:var(--texto-suave)',
      texto: `${filas.length} filas en "${estado.archivo}". Revisa que la app haya adivinado bien.`,
    })
  );

  const rejilla = el('div', { style: 'display:grid;gap:.6rem' });
  for (const [campo, def] of Object.entries(CAMPOS)) {
    const select = el('select', { 'data-campo': campo });
    select.appendChild(el('option', { value: '', texto: '— no está en mi archivo —' }));
    encabezados.forEach((h, i) => {
      const o = el('option', { value: String(i), texto: `${h || `Columna ${i + 1}`}  (ej: ${String(filas[0]?.[i] ?? '').slice(0, 18)})` });
      if (mapeo[campo] === i) o.selected = true;
      select.appendChild(o);
    });
    select.onchange = () => {
      const v = select.value;
      if (v === '') delete estado.mapeo[campo];
      else estado.mapeo[campo] = Number(v);
      pintarPrevia(caja);
    };
    rejilla.appendChild(el('div.fila', { style: 'align-items:center' }, [
      el('label', { style: 'flex:1;margin:0', html: `${def.titulo}${def.obligatorio ? ' <span style="color:var(--rojo)">*</span>' : ''}` }),
      select,
    ]));
  }
  tarjeta.appendChild(rejilla);
  caja.appendChild(tarjeta);
  pintarPrevia(caja);
}

/** Convierte las filas crudas en productos, y dice qué está mal en cada una. */
function analizar() {
  const { filas, mapeo } = estado;
  const dato = (fila, campo) => (mapeo[campo] === undefined ? '' : fila[mapeo[campo]]);
  const existentes = new Map(catalogo().map((p) => [p.clave || claveProducto(p.nombre), p]));
  const vistasEnArchivo = new Map();

  const buenas = [], malas = [], duplicadas = [], incompletas = [];
  filas.forEach((fila, i) => {
    const nombre = String(dato(fila, 'nombre') || '').trim();
    if (!nombre) { malas.push({ linea: i + 2, razon: 'sin nombre' }); return; }

    const precioUSD = aMenores(dato(fila, 'precioUSD')) || 0;
    const costoUSD = aMenores(dato(fila, 'costoUSD')) || 0;
    const clave = claveProducto(nombre);

    const producto = {
      nombre,
      precioUSD,
      costoUSD,
      stock: Number(String(dato(fila, 'stock') || 0).replace(',', '.')) || 0,
      stockMinimo: Number(String(dato(fila, 'stockMinimo') || 0).replace(',', '.')) || 0,
      categoria: String(dato(fila, 'categoria') || '').trim(),
      codigoBarras: String(dato(fila, 'codigoBarras') || '').trim(),
      sku: String(dato(fila, 'sku') || '').trim(),
      unidad: String(dato(fila, 'unidad') || 'unidad').trim() || 'unidad',
      alias: String(dato(fila, 'alias') || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
      tipo: 'producto',
      tipoPrecio: 'fijo',
      linea: i + 2,
    };

    if (existentes.has(clave)) { duplicadas.push({ ...producto, yaExiste: existentes.get(clave).nombre }); return; }
    if (vistasEnArchivo.has(clave)) { duplicadas.push({ ...producto, repetidaEnLinea: vistasEnArchivo.get(clave) }); return; }
    vistasEnArchivo.set(clave, producto.linea);

    if (!precioUSD || !costoUSD) incompletas.push(producto);
    buenas.push(producto);
  });

  return { buenas, malas, duplicadas, incompletas };
}

function pintarPrevia(caja) {
  const vieja = $('#previa', caja);
  if (vieja) vieja.remove();
  if (estado.mapeo.nombre === undefined) {
    caja.appendChild(el('div.tarjeta', { id: 'previa', style: 'margin-top:1rem' }, [
      el('p', { style: 'color:var(--rojo)', texto: 'Falta decir cuál columna tiene el NOMBRE del producto.' }),
    ]));
    return;
  }

  const { buenas, malas, duplicadas, incompletas } = analizar();
  const tarjeta = el('div.tarjeta', { id: 'previa', style: 'margin-top:1rem' });
  pegar(tarjeta, el('h2', { texto: '2. Vista previa' }));

  tarjeta.appendChild(el('div.kpis', { style: 'margin-bottom:1rem' }, [
    kpi('Van a entrar', String(buenas.length), 'bueno'),
    kpi('Duplicadas', String(duplicadas.length), duplicadas.length ? 'acento' : ''),
    kpi('Sin precio o costo', String(incompletas.length), incompletas.length ? 'acento' : ''),
    kpi('Con error', String(malas.length), malas.length ? 'malo' : ''),
  ]));

  if (buenas.length) {
    const tabla = el('div', { style: 'overflow:auto;max-height:46vh' });
    const t = el('table');
    t.appendChild(el('thead', { html: `<tr><th>Nombre</th><th class="num">Precio</th><th class="num">Costo</th><th class="num">Cant.</th><th>Categoría</th></tr>` }));
    const cuerpo = el('tbody');
    for (const p of buenas.slice(0, 50)) {
      cuerpo.appendChild(el('tr', {
        html: `<td>${esc(p.nombre)}${(!p.precioUSD || !p.costoUSD) ? ' <span class="etiqueta alerta">incompleto</span>' : ''}</td>
               <td class="num">${p.precioUSD ? formatear(p.precioUSD) : '—'}</td>
               <td class="num">${p.costoUSD ? formatear(p.costoUSD) : '—'}</td>
               <td class="num">${p.stock}</td>
               <td>${esc(p.categoria || '—')}</td>`,
      }));
    }
    t.appendChild(cuerpo);
    tabla.appendChild(t);
    if (buenas.length > 50) tabla.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:.85rem', texto: `…y ${buenas.length - 50} más.` }));
    tarjeta.appendChild(tabla);
  }

  if (duplicadas.length) {
    tarjeta.appendChild(el('details', { style: 'margin-top:.75rem' }, [
      el('summary', { style: 'cursor:pointer;font-weight:600', texto: `${duplicadas.length} filas duplicadas (se saltan)` }),
      el('div', {
        style: 'font-size:.85rem;color:var(--texto-suave);max-height:20vh;overflow:auto',
        html: duplicadas.slice(0, 40).map((p) =>
          `Línea ${p.linea}: ${esc(p.nombre)} — ${p.yaExiste ? `ya existe como "${esc(p.yaExiste)}"` : `repetida de la línea ${p.repetidaEnLinea}`}`
        ).join('<br>'),
      }),
    ]));
  }
  if (malas.length) {
    tarjeta.appendChild(el('details', {}, [
      el('summary', { style: 'cursor:pointer;font-weight:600;color:var(--rojo)', texto: `${malas.length} filas con error (se saltan)` }),
      el('div', {
        style: 'font-size:.85rem;color:var(--texto-suave)',
        html: malas.slice(0, 40).map((m) => `Línea ${m.linea}: ${m.razon}`).join('<br>'),
      }),
    ]));
  }

  const barra = el('div', { style: 'display:none;margin-top:1rem' }, [
    el('div', { style: 'height:10px;background:var(--superficie-2);border-radius:999px;overflow:hidden' }, [
      el('div', { id: 'relleno', style: 'height:100%;width:0;background:var(--marca);transition:width .2s' }),
    ]),
    el('p', { id: 'texto-barra', style: 'text-align:center;color:var(--texto-suave);font-size:.9rem;margin-top:.4rem' }),
  ]);

  const boton = el('button.btn.principal.grande.ancho', {
    style: 'margin-top:1rem',
    texto: `Importar ${buenas.length} productos`,
    disabled: buenas.length ? null : '',
    onclick: async () => {
      if (!await confirmar(`¿Importar ${buenas.length} productos?`, {
        detalle: 'Si algo sale mal, se puede deshacer completo desde esta misma pantalla.',
        aceptar: 'Sí, importar',
      })) return;

      boton.disabled = true;
      barra.style.display = '';
      const importId = `imp-${Date.now()}`;
      try {
        await guardarEnLote(buenas, importId, (hechos, total) => {
          $('#relleno', barra).style.width = `${(hechos / total) * 100}%`;
          $('#texto-barra', barra).textContent = `${hechos} de ${total}…`;
        });
        avisarOk(`${buenas.length} productos importados`);
        pintarHecho(caja, importId, buenas.length, incompletas.length);
      } catch (e) {
        avisarMal('Falló la importación: ' + (e.message || e));
        boton.disabled = false;
      }
    },
  });

  pegar(tarjeta, boton, barra);
  caja.appendChild(tarjeta);
}

function pintarHecho(caja, importId, cuantos, incompletos) {
  caja.innerHTML = '';
  caja.appendChild(el('div.tarjeta.marca', {}, [
    el('h2', { texto: '✅ Inventario cargado' }),
    el('p', { texto: `Entraron ${cuantos} productos.` }),
    incompletos ? el('p', {
      style: 'color:var(--ambar);font-weight:600',
      texto: `${incompletos} quedaron sin precio o sin costo. Los ves en Inventario con el filtro "Sin precio o sin costo".`,
    }) : null,
    el('p', { texto: 'Lo que sigue es ponerles las fotos, que se hace de corrido.' }),
    el('div.fila', {}, [
      el('button.btn.principal', { texto: '📷 Ir al Estudio de Fotos', onclick: () => ir('fotos') }),
      el('button.btn.plano', { texto: '📦 Ver inventario', onclick: () => ir('inventario') }),
    ]),
    el('button.btn.plano.ancho', {
      style: 'margin-top:1rem;color:var(--rojo)',
      texto: '↩️ Deshacer esta importación',
      onclick: async () => {
        if (!await confirmar('¿Deshacer la importación?', {
          detalle: `Se borran los ${cuantos} productos que acaban de entrar. Lo que ya estaba antes no se toca.`,
          aceptar: 'Sí, deshacer', peligro: true,
        })) return;
        avisar('Deshaciendo…');
        const borrados = await deshacerImportacion(importId);
        avisarOk(`Se deshizo: ${borrados} productos borrados`);
        ir('importar');
      },
    }),
  ]));
}

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { style: 'font-size:1.4rem', texto: valor }),
  ]);
}

async function descargarPlantilla() {
  const XLSX = await cargarXLSX();
  const libro = XLSX.utils.book_new();

  const ejemplo = [
    ['Nombre', 'Otros nombres', 'Categoría', 'Precio de venta', 'Costo', 'Cantidad', 'Stock mínimo', 'Unidad', 'Código de barras'],
    ['Lápiz Mongol Nº2', 'mongol, lapis', 'Escritura', 0.5, 0.3, 120, 20, 'unidad', ''],
    ['Borrador Nata', 'goma, gomita', 'Escritura', 0.4, 0.22, 60, 10, 'unidad', ''],
    ['Resma Carta', 'resma, hojas blancas', 'Papel', 6, 4.5, 15, 3, 'resma', ''],
    ['Fotocopia B/N', 'copia, xerox', 'Servicios', 0.05, 0.02, 0, 0, 'copia', ''],
  ];
  const hoja = XLSX.utils.aoa_to_sheet(ejemplo);
  hoja['!cols'] = [{ wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');

  const ayuda = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar esta plantilla'],
    [''],
    ['Nombre', 'Obligatorio. Es lo único que no puede faltar.'],
    ['Otros nombres', 'Sinónimos separados por coma. ESTO ES LO MÁS ÚTIL: hace que el producto aparezca aunque lo escriban mal o le digan de otra forma.'],
    ['Precio de venta', 'En dólares. Puede ir 0,50 o 0.50, da igual.'],
    ['Costo', 'En dólares. Sin esto no se puede calcular la ganancia.'],
    ['Cantidad', 'Cuántos hay ahora mismo.'],
    ['Stock mínimo', 'Cuando baje de aquí, la app avisa.'],
    [''],
    ['No hace falta usar esta plantilla: puedes subir tu propio Excel y la app adivina las columnas.'],
    ['Las fotos NO van en el Excel. Se ponen de corrido en el Estudio de Fotos.'],
  ]);
  ayuda['!cols'] = [{ wch: 20 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(libro, ayuda, 'Cómo llenarla');

  XLSX.writeFile(libro, 'plantilla-mis-detallitos.xlsx');
  avisar('Plantilla descargada');
}
