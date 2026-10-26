// estudio-fotos.js — ESTUDIO DE FOTOS.
//
// El Excel resuelve los datos pero no las fotos, y poner 1000 fotos a mano
// (entrar al producto, buscar el botón, subir, guardar, volver) es insufrible.
//
// Aquí se hace de corrido: la app lista SOLO los productos sin foto, ordenados
// por categoría (así se recorre el estante en orden físico, no saltando), con
// la cámara ya abierta. Disparas, se comprime, se sube y SALTA SOLO al
// siguiente. Sin formularios, sin guardar, sin volver atrás.
//
// Modo alterno: arrastrar una carpeta de fotos y emparejarlas por nombre de
// archivo = SKU o código de barras (como las apps de imágenes masivas de
// Shopify).

import { registrar, ir } from '../core/router.js';
import { el, esc, $, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal } from '../ui/avisos.js';
import { pedirRecorte } from '../ui/recortar.js';
import { productos as catalogo } from '../data/catalogo.js';
import { guardarFoto, obtenerFoto, borrarFoto } from '../data/fotos.js';
import { procesar, cargarAjustes, lista as iaLista } from '../data/estudio-ia.js';
import { normalizar } from '../core/texto.js';

registrar('fotos', {
  // El empleado entra: es quien está en el mostrador con el producto en la
  // mano, y la pantalla no enseña ni costos ni ganancias.
  titulo: 'Fotos', icono: '📷', seccion: 'Los productos', orden: 30,
  montar(nodo) {
    let pendientes = [];
    let i = 0;
    // La proporción elegida se queda puesta para las siguientes fotos: en una
    // tirada de 200 productos nadie quiere volver a escogerla cada vez.
    let razonPreferida = '1:1';
    // Los ajustes del fondo blanco se leen una vez al entrar. Si cambian en
    // Configuración, se vuelve a entrar a esta pantalla y ya.
    let ajustes = null;
    cargarAjustes().then((a) => { ajustes = a; pintar(); });

    const recargar = () => {
      pendientes = catalogo()
        .filter((p) => !p.tieneFoto && p.tipo !== 'servicio')
        .sort((a, b) =>
          (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz', 'es') ||
          a.nombre.localeCompare(b.nombre, 'es'));
      i = Math.min(i, Math.max(0, pendientes.length - 1));
    };
    recargar();

    // En una computadora no hay cámara que abrir: el botón "Tomar foto" lleva a
    // un selector de archivos, que no es lo que promete. Ahí lo natural es
    // arrastrar la foto desde la carpeta que ya está abierta al lado.
    const esComputadora = !window.matchMedia('(any-pointer: coarse)').matches;

    function pintar() {
      if (!pendientes.length) {
        nodo.innerHTML = '';
        nodo.appendChild(el('div.tarjeta.marca', { style: 'text-align:center' }, [
          el('div', { style: 'font-size:3rem', texto: '' }),
          el('h1', { texto: 'Todos tienen foto' }),
          el('p', { texto: 'No queda ningún producto sin foto. Eso facilita mucho vender.' }),
          el('button.btn.principal', { texto: 'Ver inventario', onclick: () => ir('inventario') }),
        ]));
        nodo.appendChild(zonaLote());
        return;
      }

      const p = pendientes[i];
      nodo.innerHTML = '';
      nodo.appendChild(el('div.estudio', {}, [
        el('div.contador', { texto: `${i + 1} de ${pendientes.length} sin foto` }),
        el('div', { style: 'height:8px;background:var(--superficie-2);border-radius:999px;overflow:hidden;margin:.5rem 0 1rem' }, [
          el('div', { style: `height:100%;width:${(i / pendientes.length) * 100}%;background:var(--marca)` }),
        ]),
        el('div.nombre', { html: esc(p.nombre) }),
        el('div', { style: 'color:var(--texto-suave);margin-bottom:1rem', html: esc(p.categoria || 'Sin categoría') }),

        tiraIA(),

        el('div', { id: 'visor' }),

        esComputadora ? zonaSoltar(p) : null,

        el('div.fila', { style: 'margin-top:1rem' }, [
          el('button.btn.plano', { texto: '←', 'aria-label': 'Producto anterior', title: 'Anterior', style: 'flex:0 0 70px;font-size:1.3rem', disabled: i === 0 ? '' : null, onclick: () => { i--; pintar(); } }),
          el('button.btn.acento.grande', {
            style: 'flex:3',
            texto: esComputadora ? 'Elegir la foto' : 'Tomar foto',
            onclick: () => $('#camara', nodo).click(),
          }),
          el('button.btn.plano', { texto: '→', 'aria-label': 'Saltar al siguiente', title: 'Saltar', style: 'flex:0 0 70px;font-size:1.3rem', onclick: saltar }),
        ]),
        el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-pie);margin-top:.75rem',
          texto: esComputadora
            ? 'Al poner la foto pasa solo al siguiente producto. Si no tienes esa foto, dale a la flecha.'
            : 'Al tomar la foto pasa solo al siguiente producto. Si no tienes el producto a mano, dale a la flecha.',
        }),

        // En el teléfono, `capture` abre la cámara trasera directo. En la
        // computadora no se pone: ahí abre el selector de archivos y punto.
        el('input', {
          type: 'file', id: 'camara', accept: 'image/*',
          ...(esComputadora ? {} : { capture: 'environment' }),
          hidden: '',
          onchange: (ev) => ev.target.files[0] && tomar(ev.target.files[0]),
        }),
      ]));
      nodo.appendChild(zonaLote());
    }

    /** El cuadro donde se suelta la foto del producto que toca ahora. */
    function zonaSoltar(producto) {
      const caja = el('div', {
        style: 'border:3px dashed var(--borde);border-radius:var(--r-bloque);padding:1.6rem 1rem;'
             + 'text-align:center;color:var(--texto-suave);margin-top:.5rem;transition:background .1s',
      }, [
        el('div', { style: 'font-weight:600;color:var(--texto)', texto: 'Arrastra aquí la foto' }),
        el('div', { style: 'font-size:var(--t-pie);margin-top:.25rem', html: `de <strong>${esc(producto.nombre)}</strong>` }),
      ]);
      const resaltar = (si) => {
        caja.style.borderColor = si ? 'var(--marca)' : 'var(--borde)';
        caja.style.background = si ? 'var(--marca-suave)' : '';
      };
      caja.addEventListener('dragover', (ev) => { ev.preventDefault(); resaltar(true); });
      caja.addEventListener('dragleave', () => resaltar(false));
      caja.addEventListener('drop', (ev) => {
        ev.preventDefault();
        resaltar(false);
        const foto = [...(ev.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
        if (foto) tomar(foto);
        else avisarMal('Eso no es una imagen.');
      });
      return caja;
    }

    function saltar() {
      i = (i + 1) % pendientes.length;
      pintar();
    }

    /** Dice si el fondo blanco está activo, sin obligar a ir a buscarlo. */
    function tiraIA() {
      if (!ajustes) return null;
      const activa = iaLista(ajustes);
      return el('div', {
        style: 'display:flex;gap:.5rem;align-items:center;justify-content:center;'
             + 'font-size:var(--t-pie);margin-bottom:.75rem;color:var(--texto-suave)',
      }, [
        el('span', {
          class: `etiqueta ${activa ? 'ok' : 'info'}`,
          texto: activa ? 'Fondo blanco con IA activado' : 'Fondo blanco con IA apagado',
        }),
        el('button.btn.plano', {
          style: 'min-height:32px;padding:.2rem .6rem;font-size:var(--t-pie)',
          texto: activa ? 'Ajustar' : 'Activar',
          onclick: () => ir('config'),
        }),
      ]);
    }

    async function tomar(archivo) {
      const p = pendientes[i];
      const visor = $('#visor', nodo);

      // Primero el recorte, después la IA: al servicio le llega la foto ya
      // encuadrada, recorta mejor y no se paga por mostrador de más.
      const recorte = await pedirRecorte(archivo, { titulo: p.nombre, razon: razonPreferida });
      if (!recorte) { pintar(); return; }          // le dio a "Repetir foto"
      if (recorte.razon) razonPreferida = recorte.razon;

      const conIA = iaLista(ajustes);
      visor.innerHTML = `<div class="cargando">${conIA ? 'Quitando el fondo con IA…' : 'Guardando la foto…'}</div>`;
      try {
        const { datos, aviso } = await procesar(recorte.blob, { ajustes, encajar: recorte.recortada });
        if (aviso) avisar(`${aviso} La foto se guardó con su fondo original.`);
        visor.innerHTML = '';
        visor.appendChild(el('img', { src: datos, style: 'width:100%;max-height:40dvh;object-fit:contain;border-radius:var(--r)' }));
        await guardarFoto(p.id, datos);
        avisarOk(`Foto de ${p.nombre}`);
        // El catálogo se actualiza solo por el listener; quitamos esta de la lista.
        pendientes = pendientes.filter((x) => x.id !== p.id);
        if (i >= pendientes.length) i = 0;
        setTimeout(pintar, 350);
      } catch (e) {
        avisarMal(e.message || 'No se pudo guardar la foto');
        pintar();
      }
    }

    // --- modo lote: emparejar por nombre de archivo ---
    function zonaLote() {
      const caja = el('div.tarjeta', { style: 'margin-top:1.5rem' });
      pegar(caja, 
        el('h2', { texto: 'O de un solo golpe' }),
        el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
          texto: 'Si ya tienes las fotos en la computadora, suéltalas aquí. Se emparejan por el nombre del archivo: debe ser el código de barras, el SKU o el nombre del producto (por ejemplo "lapiz-mongol.jpg"). Si el fondo blanco con IA está activado, se le aplica a cada una.',
        }),
        el('input', {
          type: 'file', accept: 'image/*', multiple: '',
          onchange: (ev) => porLote([...ev.target.files]),
        }),
        el('div', { id: 'lote' })
      );

      // Arrastrar la carpeta entera encima. En la computadora es mucho más
      // rápido que ir a buscar los archivos con el selector.
      const normal = caja.style.cssText;
      const resaltar = (si) => {
        caja.style.cssText = si
          ? `${normal};outline:3px dashed var(--marca);outline-offset:-6px;background:var(--marca-suave)`
          : normal;
      };
      caja.addEventListener('dragover', (ev) => { ev.preventDefault(); resaltar(true); });
      caja.addEventListener('dragleave', () => resaltar(false));
      caja.addEventListener('drop', (ev) => {
        ev.preventDefault();
        resaltar(false);
        const fotos = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (fotos.length) porLote(fotos);
        else avisarMal('Eso no son imágenes.');
      });
      return caja;
    }

    async function porLote(archivos) {
      if (!archivos.length) return;
      const caja = $('#lote', nodo);
      const todos = catalogo();
      let hechas = 0, fallidas = [];

      const conIA = iaLista(ajustes);
      let fallosIA = 0;

      for (const [n, archivo] of archivos.entries()) {
        caja.textContent = conIA
          ? `Quitando el fondo ${n + 1} de ${archivos.length}…`
          : `Procesando ${n + 1} de ${archivos.length}…`;
        const base = archivo.name.replace(/\.[^.]+$/, '');
        const clave = normalizar(base);
        const p = todos.find((x) =>
          x.codigoBarras === base ||
          normalizar(x.sku || '') === clave ||
          x.nombreNorm === clave);
        if (!p) { fallidas.push(archivo.name); continue; }
        try {
          const { datos, aviso } = await procesar(archivo, { ajustes });
          if (aviso) fallosIA++;
          await guardarFoto(p.id, datos);
          hechas++;
        } catch { fallidas.push(archivo.name); }
      }

      caja.innerHTML = '';
      caja.appendChild(el('p', { style: 'font-weight:600', texto: `${hechas} fotos emparejadas.` }));
      if (fallosIA) {
        caja.appendChild(el('p', {
          style: 'color:var(--ambar);font-size:var(--t-pie)',
          texto: `${fallosIA} se guardaron con su fondo original porque la IA no respondió.`,
        }));
      }
      if (fallidas.length) {
        caja.appendChild(el('details', {}, [
          el('summary', { style: 'cursor:pointer;color:var(--ambar)', texto: `${fallidas.length} no se pudieron emparejar` }),
          el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: fallidas.map(esc).join('<br>') }),
        ]));
      }
      recargar();
      setTimeout(pintar, 1200);
    }

    pintar();
  },
});

/**
 * Deja una foto puesta en un producto: recorte, fondo blanco si está activo, y
 * guardado. Es el único camino, venga la foto de la cámara, del botón de la
 * ficha o arrastrada desde una carpeta.
 *
 * `conRecorte` se apaga cuando entran muchas de golpe: abrir el recorte
 * cincuenta veces seguidas no lo aguanta nadie.
 * → true si quedó guardada, false si el dueño canceló el recorte.
 */
export async function ponerFoto(producto, archivo, { conRecorte = true, ajustes = null } = {}) {
  let entrada = archivo;
  let recortada = false;
  if (conRecorte) {
    const r = await pedirRecorte(archivo, { titulo: producto.nombre });
    if (!r) return false;
    entrada = r.blob;
    recortada = r.recortada;
  }
  const aj = ajustes || await cargarAjustes();
  const { datos, aviso } = await procesar(entrada, { ajustes: aj, encajar: recortada });
  await guardarFoto(producto.id, datos);
  if (aviso) avisar(`${aviso} Se guardó con su fondo original.`);
  return true;
}

/** Ver / cambiar la foto de un producto puntual (lo usa Inventario). */
export async function verFoto(producto) {
  const { abrirDialogo } = await import('../ui/html.js');
  const datos = await obtenerFoto(producto.id);
  const d = abrirDialogo('');
  const entrada = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment', hidden: '',
    onchange: async (ev) => {
      if (!ev.target.files[0]) return;
      try {
        const recorte = await pedirRecorte(ev.target.files[0], { titulo: producto.nombre });
        if (!recorte) { ev.target.value = ''; return; }
        const ajustes = await cargarAjustes();
        if (iaLista(ajustes)) avisar('Quitando el fondo con IA…');
        const { datos, aviso } = await procesar(recorte.blob, { ajustes, encajar: recorte.recortada });
        await guardarFoto(producto.id, datos);
        d.close();
        if (aviso) avisar(`${aviso} Se guardó con su fondo original.`);
        else avisarOk('Foto actualizada');
      } catch (e) {
        // Sin esto el error se perdía en la consola y la pantalla se quedaba
        // igual: parecía que cambiar la foto simplemente no hacía nada.
        ev.target.value = '';
        avisarMal(e.message || 'No se pudo guardar la foto');
      }
    },
  });
  pegar(d, 
    el('h2', { html: esc(producto.nombre) }),
    datos
      ? el('img', { src: datos, style: 'width:100%;border-radius:var(--r)' })
      : el('div.vacio', { texto: 'Sin foto' }),
    entrada,
    el('div.fila', { style: 'margin-top:1rem' }, [
      el('button.btn.plano', { texto: 'Cerrar', onclick: () => d.close() }),
      datos ? el('button.btn.plano', { texto: 'Quitar', onclick: async () => { await borrarFoto(producto.id); d.close(); } }) : null,
      el('button.btn.principal', { texto: datos ? 'Cambiar foto' : 'Poner foto', onclick: () => entrada.click() }),
    ])
  );
}
