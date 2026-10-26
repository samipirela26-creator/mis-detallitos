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
import { guardarEnLote, actualizarEnLote, deshacerImportacion, clavesExistentes } from '../data/productos.js';
import { claveProducto } from '../core/texto.js';
import { aMenores, formatear, parsearCosto } from '../core/dinero.js';
import { leerCSV } from '../data/csv.js';
import { observar, leer } from '../core/estado.js';

// Cómo se suele llamar cada columna en la vida real.
const CAMPOS = {
  nombre: { titulo: 'Nombre', obligatorio: true, pistas: ['nombre', 'producto', 'descripcion', 'articulo', 'item', 'detalle'] },
  precioUSD: { titulo: 'Precio al cliente', pistas: ['precio', 'venta', 'pvp', 'precio venta', 'valor'] },
  // El costo acepta "1,80" (unitario) o "12 por 1,80" (lo que costó el paquete).
  // Muchos Excel traen el costo de la caja en esta columna, y guardarlo como
  // unitario infla la ganancia y el valor del inventario sin avisar.
  costoUSD: { titulo: 'Lo que te cuesta a ti', pistas: ['costo', 'compra', 'precio compra', 'costo unitario', 'costo caja', 'costo paquete'] },
  stock: { titulo: 'Cantidad', pistas: ['cantidad', 'stock', 'existencia', 'inventario', 'disponible'] },
  categoria: { titulo: 'Categoría', pistas: ['categoria', 'rubro', 'tipo', 'grupo', 'linea'] },
  codigoBarras: { titulo: 'Código de barras', pistas: ['codigo barras', 'barras', 'ean', 'upc', 'codigo de barras'] },
  sku: { titulo: 'Código / SKU', pistas: ['sku', 'codigo', 'ref', 'referencia'] },
  unidad: { titulo: 'Unidad', pistas: ['unidad', 'medida', 'presentacion'] },
  alias: { titulo: 'Otros nombres', pistas: ['alias', 'sinonimo', 'sinonimos', 'otros nombres'] },
  stockMinimo: { titulo: 'Stock mínimo', pistas: ['minimo', 'stock minimo', 'reorden'] },
  // Ojo con el título de esta columna: el que adivina puntúa por substring, así
  // que si se llamara "precio por cantidad" le robaría la columna a precioUSD.
  // "Mayoreo" no colisiona con ninguna pista de los demás campos.
  escalas: { titulo: 'Mayoreo', pistas: ['mayoreo', 'mayor', 'escala', 'escalas', 'docena', 'tramo'] },
};

/**
 * Lee "12 por 3.33" -> desde 12 unidades, las 12 cuestan $3,33 (o sea $0,2775 c/u).
 *
 * Se escribe el precio del PAQUETE porque es como lo piensa quien vende: "la
 * docena a diez mil". La app guarda el unitario, así que aquí se divide.
 * Varios tramos van separados por ; o por salto de línea:
 *   "12 por 3.33; 100 por 23.33"
 */
export function parsearEscalas(texto) {
  const crudo = String(texto || '').trim();
  if (!crudo) return [];
  const salida = [];
  for (const parte of crudo.split(/[;\n]/)) {
    const m = parte.trim().match(/^(\d+)\s*(?:por|x|=|:)\s*([\d.,]+)$/i);
    if (!m) continue;
    const desdeCant = Number(m[1]);
    const totalPaquete = Number(String(m[2]).replace(',', '.'));
    if (!desdeCant || !Number.isFinite(totalPaquete) || totalPaquete <= 0) continue;
    const unitario = aMenores(totalPaquete / desdeCant);
    if (unitario > 0) salida.push({ desdeCant, precioUSD: unitario });
  }
  return salida.sort((a, b) => a.desdeCant - b.desdeCant);
}

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

let estado = null;   // { filas, encabezados, mapeo, archivo, existentes }

registrar('importar', {
  titulo: 'Importar Excel', icono: '📥', soloDueno: true, seccion: 'Los productos', orden: 40,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta">
        <h1>Importar el inventario</h1>
        <p>Sube tu Excel <strong>como lo tengas</strong>. La app adivina qué columna es
           cuál, te muestra una vista previa y <strong>se puede deshacer completa</strong>
           si algo sale mal.</p>
        <div class="fila">
          <button class="btn principal" id="elegir">Elegir archivo</button>
          <button class="btn plano" id="plantilla">Descargar plantilla</button>
        </div>
        <input type="file" id="archivo" accept=".xlsx,.xls,.csv,.ods" hidden>
        <p style="font-size:var(--t-pie);color:var(--texto-suave);margin-top:.75rem">
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

    // Escanear las primeras 10 filas para encontrar la fila real de encabezados
    let idxEncabezado = 0;
    let maxCoincidencias = 0;

    const coincidir = (row) => {
      if (!Array.isArray(row)) return 0;
      let score = 0;
      for (const val of row) {
        const norm = sinAcentos(val);
        for (const def of Object.values(CAMPOS)) {
          if (def.pistas.some((pista) => norm === pista || norm.includes(pista))) {
            score++;
            break;
          }
        }
      }
      return score;
    };

    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const score = coincidir(filas[i]);
      if (score > maxCoincidencias) {
        maxCoincidencias = score;
        idxEncabezado = i;
      }
    }

    const encabezados = filas[idxEncabezado].map((h) => String(h).trim());

    // Filas de datos tras los encabezados, omitiendo sub-guías o filas explicativas
    const filasDatos = filas.slice(idxEncabezado + 1).filter((f) => {
      if (!Array.isArray(f) || !f.some((c) => String(c).trim() !== '')) return false;
      const primerValor = String(f[0] || '').trim();
      if (primerValor.startsWith('[') && primerValor.endsWith(']')) return false;
      if (primerValor.toLowerCase().includes('obligatorio')) return false;
      return true;
    });

    if (!filasDatos.length) throw new Error('El archivo no contiene filas de datos válidas.');

    // Las claves se piden AL SERVIDOR, no a la caché en memoria: esa solo trae
    // los productos activos y además está vacía hasta que entra el primer
    // snapshot. Si se importa en ese hueco, entra el inventario duplicado.
    caja.innerHTML = '<div class="tarjeta cargando">Revisando el catálogo actual…</div>';
    const existentes = await clavesExistentes();

    estado = {
      archivo: archivo.name,
      encabezados,
      filas: filasDatos,
      mapeo: adivinarMapeo(encabezados),
      hojas,
      existentes,
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
  const existentes = estado.existentes || new Map();
  const vistasEnArchivo = new Map();

  const buenas = [], malas = [], duplicadas = [], incompletas = [];
  filas.forEach((fila, i) => {
    const nombre = String(dato(fila, 'nombre') || '').trim();
    if (!nombre) { malas.push({ linea: i + 2, razon: 'sin nombre' }); return; }

    const precioUSD = aMenores(dato(fila, 'precioUSD')) || 0;
    const { costoUSD: costoUnit, paquete: costoPaquete } = parsearCosto(dato(fila, 'costoUSD'));
    const costoUSD = costoUnit || 0;
    const clave = claveProducto(nombre);

    const producto = {
      nombre,
      precioUSD,
      costoUSD,
      costoPaquete,
      stock: Number(String(dato(fila, 'stock') || 0).replace(',', '.')) || 0,
      stockMinimo: Number(String(dato(fila, 'stockMinimo') || 0).replace(',', '.')) || 0,
      categoria: String(dato(fila, 'categoria') || '').trim(),
      codigoBarras: String(dato(fila, 'codigoBarras') || '').trim(),
      sku: String(dato(fila, 'sku') || '').trim(),
      unidad: String(dato(fila, 'unidad') || 'unidad').trim() || 'unidad',
      alias: String(dato(fila, 'alias') || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
      escalas: parsearEscalas(dato(fila, 'escalas')),
      tipo: 'producto',
      tipoPrecio: 'fijo',
      linea: i + 2,
    };

    if (existentes.has(clave)) {
      const ya = existentes.get(clave);
      // El id viaja con la fila: sin él, "actualizar los que ya existen" no
      // sabría a qué documento escribirle.
      duplicadas.push({ ...producto, id: ya.id, yaExiste: ya.nombre, desactivado: !ya.activo });
      return;
    }
    if (vistasEnArchivo.has(clave)) { duplicadas.push({ ...producto, repetidaEnLinea: vistasEnArchivo.get(clave) }); return; }
    vistasEnArchivo.set(clave, producto.linea);

    if (!precioUSD || !costoUSD) incompletas.push(producto);
    buenas.push(producto);
  });

  return { buenas, malas, duplicadas, incompletas, formula: olerFormula(buenas) };
}

/**
 * ¿La columna de costo es una fórmula en vez de un costo?
 *
 * Pasó de verdad y costó caro: el Excel que se importó traía costo = precio/1,30
 * en 112 de 158 filas. No era lo que se le pagó al proveedor, era el precio
 * dividido. Nadie se dio cuenta hasta meses después, y mientras tanto el valor
 * del inventario y la ganancia de cada venta salían mal sin avisar.
 *
 * Se huele así: si muchas filas dan EXACTAMENTE el mismo cociente precio/costo,
 * no es un negocio con márgenes parecidos, es una fórmula arrastrada.
 */
function olerFormula(filas) {
  const conAmbos = filas.filter((p) => p.precioUSD > 0 && p.costoUSD > 0);
  if (conAmbos.length < 10) return null;

  const cuenta = new Map();
  for (const p of conAmbos) {
    // A dos decimales: 1,2987 y 1,3012 son la misma fórmula con otro redondeo.
    const k = (p.precioUSD / p.costoUSD).toFixed(2);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  const [cociente, cuantas] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  const porcentaje = cuantas / conAmbos.length;
  return porcentaje >= 0.4 ? { cociente, cuantas, total: conAmbos.length, porcentaje } : null;
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

  const { buenas, malas, duplicadas, incompletas, formula } = analizar();
  const sinSenal = estado.existentes?.desdeCache;
  const tarjeta = el('div.tarjeta', { id: 'previa', style: 'margin-top:1rem' });
  pegar(tarjeta, el('h2', { texto: '2. Vista previa' }));

  if (sinSenal) {
    tarjeta.appendChild(el('p', {
      style: 'color:var(--ambar);font-weight:600',
      texto: 'Sin conexión: los duplicados se comparan contra la última copia sincronizada del catálogo. Puedes importar igual (se sube solo), pero si cargaste productos desde otro dispositivo hace poco, revisa esa lista después.',
    }));
  }

  if (formula) {
    tarjeta.appendChild(el('p', {
      style: 'color:var(--ambar);font-weight:600',
      texto: `Ojo con la columna de costo: ${formula.cuantas} de ${formula.total} filas dan exactamente `
           + `precio ÷ ${formula.cociente}. Eso parece una fórmula del Excel, no lo que te costó a ti. `
           + `Si es así, la ganancia y el valor del inventario van a salir mal sin avisarte. `
           + `Puedes importar igual y corregir los costos después.`,
    }));
  }

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
    if (buenas.length > 50) tabla.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: `…y ${buenas.length - 50} más.` }));
    tarjeta.appendChild(tabla);
  }

  if (duplicadas.length) {
    tarjeta.appendChild(el('details', { style: 'margin-top:.75rem' }, [
      el('summary', { style: 'cursor:pointer;font-weight:600', texto: `${duplicadas.length} filas duplicadas (no se crean de nuevo)` }),
      el('div', {
        style: 'font-size:var(--t-pie);color:var(--texto-suave);max-height:20vh;overflow:auto',
        html: duplicadas.slice(0, 40).map((p) =>
          `Línea ${p.linea}: ${esc(p.nombre)} — ${p.yaExiste ? `ya existe como "${esc(p.yaExiste)}"${p.desactivado ? ' (desactivado)' : ''}` : `repetida de la línea ${p.repetidaEnLinea}`}`
        ).join('<br>'),
      }),
    ]));
  }
  if (malas.length) {
    tarjeta.appendChild(el('details', {}, [
      el('summary', { style: 'cursor:pointer;font-weight:600;color:var(--rojo)', texto: `${malas.length} filas con error (se saltan)` }),
      el('div', {
        style: 'font-size:var(--t-pie);color:var(--texto-suave)',
        html: malas.slice(0, 40).map((m) => `Línea ${m.linea}: ${m.razon}`).join('<br>'),
      }),
    ]));
  }

  const barra = el('div', { style: 'display:none;margin-top:1rem' }, [
    el('div', { style: 'height:10px;background:var(--superficie-2);border-radius:999px;overflow:hidden' }, [
      el('div', { id: 'relleno', style: 'height:100%;width:0;background:var(--marca);transition:width .2s' }),
    ]),
    el('p', { id: 'texto-barra', style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-cuerpo);margin-top:.4rem' }),
    el('div', { style: 'text-align:center;font-size:var(--t-cuerpo)' }, [contadorPendientes()]),
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
        recordarImportacion(importId, buenas.length);
        pintarHecho(caja, importId, buenas.length, incompletas.length, !navigator.onLine);
      } catch (e) {
        avisarMal('Falló la importación: ' + (e.message || e));
        boton.disabled = false;
      }
    },
  });

  // Los que ya están cargados: en vez de saltarlos y perder el trabajo, se les
  // puede volcar encima lo que el archivo traiga de nuevo (categoría, alias,
  // precio, costo). El stock no se toca: ver actualizarEnLote().
  const existentes = duplicadas.filter((d) => d.id);
  const botonActualizar = existentes.length ? el('button.btn.plano.ancho', {
    style: 'margin-top:.6rem',
    texto: `Actualizar los ${existentes.length} que ya existen`,
    onclick: async () => {
      if (!await confirmar(`¿Actualizar ${existentes.length} productos que ya tienes cargados?`, {
        detalle: 'Se les pone la categoría, los otros nombres, el precio y el costo que trae el '
               + 'archivo. La CANTIDAD en inventario no se toca, para no borrar las ventas que '
               + 'hiciste desde que contaste.',
        aceptar: 'Sí, actualizar',
      })) return;

      botonActualizar.disabled = true;
      barra.style.display = '';
      try {
        await actualizarEnLote(existentes, (hechos, total) => {
          $('#relleno', barra).style.width = `${(hechos / total) * 100}%`;
          $('#texto-barra', barra).textContent = `${hechos} de ${total}…`;
        });
        avisarOk(`${existentes.length} productos actualizados`);
      } catch (e) {
        avisarMal('Falló la actualización: ' + (e.message || e));
        botonActualizar.disabled = false;
      }
    },
  }) : null;

  pegar(tarjeta, boton, botonActualizar, barra);
  caja.appendChild(tarjeta);
}

/**
 * Contador vivo de lo que falta por subir.
 *
 * El número sale de `pendientes` en el estado, que es el mismo que usan las
 * ventas: así una importación offline y una venta offline se cuentan juntas,
 * que es lo que importa saber ("¿puedo confiar en lo que ve el empleado?").
 *
 * Se desuscribe solo cuando el nodo sale de la pantalla: el router reemplaza
 * el contenido sin avisarle a nadie, y un oyente huérfano por cada visita a
 * esta pantalla se va acumulando.
 */
function contadorPendientes() {
  const nodo = el('p', { style: 'font-weight:600;margin-top:.5rem' });
  const pintar = (n) => {
    nodo.style.color = n > 0 ? 'var(--ambar)' : 'var(--verde)';
    nodo.textContent = n > 0
      ? `Faltan ${n} por subir — se suben solos cuando haya señal.`
      : 'Todo subido ✓';
  };
  pintar(leer('pendientes') || 0);
  const parar = observar('pendientes', (n) => {
    // El router reemplaza el contenido sin avisarle a nadie: sin esto queda un
    // oyente huérfano por cada visita a esta pantalla.
    if (!nodo.isConnected) { parar(); return; }
    pintar(n || 0);
  }, { inmediato: false });
  return nodo;
}

function pintarHecho(caja, importId, cuantos, incompletos, enCola = false) {
  caja.innerHTML = '';
  caja.appendChild(el('div.tarjeta.marca', {}, [
    el('h2', { texto: 'Inventario cargado' }),
    el('p', { texto: `Entraron ${cuantos} productos.` }),
    enCola ? el('p', {
      style: 'color:var(--ambar);font-weight:600',
      texto: 'Sin conexión: ya están guardados en este dispositivo y puedes seguir trabajando. Se suben solos en cuanto haya señal, aunque cierres la app.',
    }) : null,
    contadorPendientes(),
    incompletos ? el('p', {
      style: 'color:var(--ambar);font-weight:600',
      texto: `${incompletos} quedaron sin precio o sin costo. Los ves en Inventario con el filtro "Sin precio o sin costo".`,
    }) : null,
    el('p', { texto: 'Lo que sigue es ponerles las fotos, que se hace de corrido.' }),
    el('div.fila', {}, [
      el('button.btn.principal', { texto: 'Ir al Estudio de Fotos', onclick: () => ir('fotos') }),
      el('button.btn.plano', { texto: 'Ver inventario', onclick: () => ir('inventario') }),
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
        olvidarImportacion();
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

async function cargarExcelJS() {
  if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
  await import('../../vendor/exceljs.min.js');
  return (typeof window !== 'undefined' && window.ExcelJS) || globalThis.ExcelJS;
}

async function descargarPlantilla() {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Mis Detallitos';
  libro.created = new Date();

  const MARCA = 'FF0B6A82';
  const MARCA_TEXTO = 'FFFFFFFF';
  const CEBRA = 'FFF1F7FA';
  const GUIA_FONDO = 'FFEAEFF2';
  const AVISO_FONDO = 'FFFDF0C4';
  const AVISO_TEXTO = 'FF6A5000';
  const BORDE_GRIS = 'FFE0E0E0';

  const MONEDA = '"$"#,##0.00';
  const ENTERO = '#,##0';

  // --- HOJA 1: PRODUCTOS ---
  const hoja = libro.addWorksheet('Productos');
  const titulos = ['Nombre', 'SKU / Código', 'Otros nombres', 'Categoría', 'Precio de venta', 'Costo', 'Cantidad', 'Stock mínimo', 'Unidad', 'Código de barras'];

  const subGuias = [
    '[Obligatorio]',
    '[Ej: LAP-001]',
    '[Separados por coma]',
    '[Ej: Escritura]',
    '[USD - Cliente]',
    '[USD - Tu costo]',
    '[Stock actual]',
    '[Alerta de reposición]',
    '[Ej: unidad]',
    '[EAN / UPC]',
  ];

  const comentarios = {
    1: 'OBLIGATORIO: El nombre principal con el que venderás y buscarás el producto en la app.',
    2: 'OPCIONAL: Código interno del producto (ej: LAP-001). Sirve para enlazar fotos automáticamente.',
    3: 'OPCIONAL: Sinónimos o apodos separados por coma (ej: "mongol, lapis") para encontrarlo al vender en caja.',
    4: 'OPCIONAL: Grupo o línea de producto (ej: Escritura, Papel, Servicios, Bebidas).',
    5: 'OBLIGATORIO: Lo que paga el cliente final en dólares USD (ej: 0.50 o 12.00).',
    6: 'OBLIGATORIO: Lo que te cuesta a ti comprar el producto en USD (para calcular tu ganancia neta).',
    7: 'OPCIONAL: Cantidad o existencia inicial disponible en tu inventario.',
    8: 'OPCIONAL: Cantidad límite para recibir alertas automáticas cuando queden pocas unidades.',
    9: 'OPCIONAL: Presentación o unidad de medida (unidad, resma, caja, metro, etc.).',
    10: 'OPCIONAL: Código de barras numérico (EAN/UPC) para escaneo rápido con lectora o cámara.',
  };

  const colFin = hoja.getColumn(titulos.length).letter;

  // 1. Banda de Marca (Fila 1)
  hoja.mergeCells(`A1:${colFin}1`);
  const banda = hoja.getCell('A1');
  banda.value = 'MIS DETALLITOS G&M C.A. · Plantilla de Importación de Inventario';
  banda.font = { name: 'Calibri', size: 13, bold: true, color: { argb: MARCA_TEXTO } };
  banda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
  banda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  hoja.getRow(1).height = 28;

  // 2. Banner de Instrucciones Explicativo (Fila 2)
  hoja.mergeCells(`A2:${colFin}2`);
  const aviso = hoja.getCell('A2');
  aviso.value = '📌 INSTRUCCIONES: Escribe tus productos a partir de la fila 6. La fila 5 sirve de guía para ver qué formato lleva cada columna.';
  aviso.font = { name: 'Calibri', size: 10, bold: true, color: { argb: AVISO_TEXTO } };
  aviso.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AVISO_FONDO } };
  aviso.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  hoja.getRow(2).height = 24;

  hoja.getRow(3).height = 6; // Espaciador

  // 3. Encabezados de Tabla (Fila 4)
  const FILA_ENCAB = 4;
  const filaEnc = hoja.getRow(FILA_ENCAB);
  titulos.forEach((t, i) => {
    const colIdx = i + 1;
    const c = filaEnc.getCell(colIdx);
    c.value = t;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MARCA_TEXTO } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
    c.alignment = { vertical: 'middle', horizontal: i === 4 || i === 5 || i === 6 || i === 7 ? 'right' : 'left' };
    c.note = comentarios[colIdx];
  });
  filaEnc.height = 24;

  // 4. Sub-guía Corta en Celda (Fila 5)
  const FILA_SUBGUIA = 5;
  const filaSub = hoja.getRow(FILA_SUBGUIA);
  subGuias.forEach((g, i) => {
    const c = filaSub.getCell(i + 1);
    c.value = g;
    c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF56707A' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GUIA_FONDO } };
    c.alignment = { vertical: 'middle', horizontal: i === 4 || i === 5 || i === 6 || i === 7 ? 'right' : 'left' };
    c.border = { bottom: { style: 'thin', color: { argb: MARCA } } };
  });
  filaSub.height = 18;

  // 5. Celdas preparadas vacías para llenar (sin productos de ejemplo)
  const ejemplos = Array.from({ length: 15 }, () => ['', '', '', '', '', '', '', '', '', '']);

  const FILA_INICIO_DATOS = 6;
  ejemplos.forEach((filaData, idx) => {
    const numFila = FILA_INICIO_DATOS + idx;
    const row = hoja.getRow(numFila);
    filaData.forEach((val, cIdx) => {
      const celda = row.getCell(cIdx + 1);
      celda.value = val;
      celda.font = { name: 'Calibri', size: 10.5 };

      // Alineaciones
      if (cIdx === 4 || cIdx === 5 || cIdx === 6 || cIdx === 7) {
        celda.alignment = { horizontal: 'right' };
      } else if (cIdx === 8 || cIdx === 9) {
        celda.alignment = { horizontal: 'center' };
      }

      // Formatos numéricos
      if (cIdx === 4 || cIdx === 5) {
        celda.numFmt = MONEDA;
      } else if (cIdx === 6 || cIdx === 7) {
        celda.numFmt = ENTERO;
      }

      // Bordes limpios de celda
      celda.border = {
        top: { style: 'thin', color: { argb: BORDE_GRIS } },
        bottom: { style: 'thin', color: { argb: BORDE_GRIS } },
        left: { style: 'thin', color: { argb: BORDE_GRIS } },
        right: { style: 'thin', color: { argb: BORDE_GRIS } },
      };
    });

    // Cebra alternada
    if (idx % 2 === 1) {
      for (let c = 1; c <= titulos.length; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CEBRA } };
      }
    }
  });

  // Autofiltro y vista congelada
  hoja.autoFilter = `A${FILA_ENCAB}:${colFin}${FILA_INICIO_DATOS + ejemplos.length - 1}`;
  hoja.views = [{ state: 'frozen', xSplit: 0, ySplit: FILA_SUBGUIA }];

  // Autoajuste de anchos de columna
  titulos.forEach((t, i) => {
    let max = Math.max(String(t).length, String(subGuias[i]).length);
    ejemplos.forEach((f) => {
      const v = String(f[i] || '');
      if (v.length > max) max = v.length;
    });
    hoja.getColumn(i + 1).width = Math.min(Math.max(max + 4, 14), 48);
  });

  // --- HOJA 2: CÓMO LLENARLA (GUÍA DE USO ENRIQUECIDA) ---
  const hojaAyuda = libro.addWorksheet('Cómo llenarla');
  hojaAyuda.mergeCells('A1:B1');
  const bandaAyuda = hojaAyuda.getCell('A1');
  bandaAyuda.value = 'Guía de llenado de la plantilla de productos';
  bandaAyuda.font = { name: 'Calibri', size: 13, bold: true, color: { argb: MARCA_TEXTO } };
  bandaAyuda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
  bandaAyuda.alignment = { vertical: 'middle', indent: 1 };
  hojaAyuda.getRow(1).height = 26;

  const encAyuda = hojaAyuda.getRow(3);
  ['Campo / Columna', 'Descripción detallada y Consejos de Uso'].forEach((t, i) => {
    const c = encAyuda.getCell(i + 1);
    c.value = t;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MARCA_TEXTO } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
    c.alignment = { vertical: 'middle', indent: 1 };
  });
  encAyuda.height = 22;

  const guiaCampos = [
    ['Nombre', 'OBLIGATORIO. Es el nombre principal del producto (ej: "Resma Carta"). Se usa para la búsqueda y ventas.'],
    ['SKU / Código', 'OPCIONAL. Código interno único (ej: LAP-001). Si nombras las fotos igual que el SKU, el Estudio de Fotos las vincula automáticamente.'],
    ['Otros nombres', 'OPCIONAL. Sinónimos o alias separados por comas (ej: "mongol, lapis, creyón") para encontrarlo aunque el cliente lo pida con otro nombre.'],
    ['Categoría', 'OPCIONAL. Clasificación o línea del producto (ej: Escritura, Papel, Servicios, Bebidas).'],
    ['Precio de venta', 'Lo que PAGA EL CLIENTE en USD (ej: 0.50 o 12.00). Puedes usar comas o puntos decimales.'],
    ['Costo', 'Lo que TE COSTÓ A TI comprar el producto en USD. Permite a la app calcular tus ganancias netas reales (solo visible para el dueño).'],
    ['Cantidad', 'Existencia o stock inicial en tu inventario.'],
    ['Stock mínimo', 'Cantidad de alerta. Cuando la existencia baje de este valor, la app te notificará para reponer.'],
    ['Unidad', 'Presentación del producto (unidad, resma, metro, paquete, caja, etc.).'],
    ['Código de barras', 'Código EAN/UPC numérico para escaneo súper rápido con lector de barras o cámara.'],
  ];

  guiaCampos.forEach(([campo, desc], idx) => {
    const row = hojaAyuda.getRow(4 + idx);
    const c1 = row.getCell(1);
    const c2 = row.getCell(2);
    c1.value = campo;
    c1.font = { name: 'Calibri', size: 10.5, bold: true };
    c2.value = desc;
    c2.font = { name: 'Calibri', size: 10.5 };
    c1.border = { top: { style: 'thin', color: { argb: BORDE_GRIS } }, bottom: { style: 'thin', color: { argb: BORDE_GRIS } } };
    c2.border = { top: { style: 'thin', color: { argb: BORDE_GRIS } }, bottom: { style: 'thin', color: { argb: BORDE_GRIS } } };
    if (idx % 2 === 1) {
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CEBRA } };
      c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CEBRA } };
    }
  });

  // Sección de Notas de Negocio en la guía
  const filaInicioNotas = 4 + guiaCampos.length + 2;
  hojaAyuda.mergeCells(`A${filaInicioNotas}:B${filaInicioNotas}`);
  const titNotas = hojaAyuda.getCell(`A${filaInicioNotas}`);
  titNotas.value = '💡 CONSEJOS IMPORTANTES DE IMPORTACIÓN:';
  titNotas.font = { name: 'Calibri', size: 11, bold: true, color: { argb: MARCA } };

  const notas = [
    '1. No estás obligado a usar esta plantilla exacta: puedes subir cualquier archivo Excel existente y la app adivinará qué columna es cuál.',
    '2. Las fotos NO se colocan en el Excel. Se toman o vinculan fácilmente desde el Estudio de Fotos en la aplicación.',
    '3. Si algo sale mal durante la importación, NO TE PREOCUPES: la app incluye un botón de "Deshacer importación completa".',
  ];

  notas.forEach((n, idx) => {
    const rIdx = filaInicioNotas + 1 + idx;
    hojaAyuda.mergeCells(`A${rIdx}:B${rIdx}`);
    const cell = hojaAyuda.getCell(`A${rIdx}`);
    cell.value = n;
    cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF40505A' } };
  });

  hojaAyuda.getColumn(1).width = 22;
  hojaAyuda.getColumn(2).width = 100;

  // Descargar archivo
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-mis-detallitos.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  avisar('Plantilla descargada con diseño actualizado');
}



// --- la última importación, para poder deshacerla mañana ----------------------
//
// El `importId` vivía solo en la memoria de esta pantalla: bastaba recargar la
// app —o que el teléfono matara la pestaña— para que el botón de deshacer
// desapareciera y no hubiera forma de volver a esa importación desde ningún
// lado. Y una importación que salió mal se descubre casi siempre al rato, no
// en el mismo minuto.
//
// Se guarda en el aparato y no en Firestore a propósito: es una ayuda local y
// no tiene por qué gastar lecturas ni viajar al servidor.
const CLAVE_IMPORT = 'detallitos:ultima-importacion';

export function recordarImportacion(importId, cuantos) {
  try {
    localStorage.setItem(CLAVE_IMPORT, JSON.stringify({ importId, cuantos, cuando: Date.now() }));
  } catch { /* modo incógnito o almacenamiento bloqueado: se sigue sin esto */ }
}

export function ultimaImportacion() {
  try {
    const crudo = localStorage.getItem(CLAVE_IMPORT);
    if (!crudo) return null;
    const d = JSON.parse(crudo);
    if (!d?.importId) return null;
    // Después de una semana ya no es "lo que acabo de hacer": ofrecer deshacerla
    // es más peligroso que útil.
    if (Date.now() - (d.cuando || 0) > 7 * 86400000) { olvidarImportacion(); return null; }
    return d;
  } catch { return null; }
}

export function olvidarImportacion() {
  try { localStorage.removeItem(CLAVE_IMPORT); } catch { /* da igual */ }
}
