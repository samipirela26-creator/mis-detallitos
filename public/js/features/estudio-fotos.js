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
import { productos as catalogo } from '../data/catalogo.js';
import { comprimir, guardarFoto, obtenerFoto, borrarFoto } from '../data/fotos.js';
import { normalizar } from '../core/texto.js';

registrar('fotos', {
  titulo: 'Fotos', icono: '📷', menu: true, soloDueno: true, orden: 40,
  montar(nodo) {
    let pendientes = [];
    let i = 0;

    const recargar = () => {
      pendientes = catalogo()
        .filter((p) => !p.tieneFoto && p.tipo !== 'servicio')
        .sort((a, b) =>
          (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz', 'es') ||
          a.nombre.localeCompare(b.nombre, 'es'));
      i = Math.min(i, Math.max(0, pendientes.length - 1));
    };
    recargar();

    function pintar() {
      if (!pendientes.length) {
        nodo.innerHTML = '';
        nodo.appendChild(el('div.tarjeta.marca', { style: 'text-align:center' }, [
          el('div', { style: 'font-size:3rem', texto: '🎉' }),
          el('h1', { texto: 'Todos tienen foto' }),
          el('p', { texto: 'No queda ningún producto sin foto. Eso facilita mucho vender.' }),
          el('button.btn.principal', { texto: '📦 Ver inventario', onclick: () => ir('inventario') }),
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

        el('div', { id: 'visor' }),

        el('div.fila', { style: 'margin-top:1rem' }, [
          el('button.btn.plano', { texto: '⬅️', style: 'flex:0 0 70px', disabled: i === 0 ? '' : null, onclick: () => { i--; pintar(); } }),
          el('button.btn.acento.grande', { style: 'flex:3', texto: '📷 Tomar foto', onclick: () => $('#camara', nodo).click() }),
          el('button.btn.plano', { texto: '➡️', style: 'flex:0 0 70px', onclick: saltar }),
        ]),
        el('p', {
          style: 'color:var(--texto-suave);font-size:.85rem;margin-top:.75rem',
          texto: 'Al tomar la foto pasa solo al siguiente producto. Si no tienes el producto a mano, dale a la flecha.',
        }),

        // `capture` abre directamente la cámara trasera en el teléfono.
        el('input', {
          type: 'file', id: 'camara', accept: 'image/*', capture: 'environment', hidden: '',
          onchange: (ev) => ev.target.files[0] && tomar(ev.target.files[0]),
        }),
      ]));
      nodo.appendChild(zonaLote());
    }

    function saltar() {
      i = (i + 1) % pendientes.length;
      pintar();
    }

    async function tomar(archivo) {
      const p = pendientes[i];
      const visor = $('#visor', nodo);
      visor.innerHTML = '<div class="cargando">Guardando la foto…</div>';
      try {
        const datos = await comprimir(archivo);
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
          style: 'color:var(--texto-suave);font-size:.9rem',
          texto: 'Si ya tienes las fotos en la computadora, suéltalas aquí. Se emparejan por el nombre del archivo: debe ser el código de barras, el SKU o el nombre del producto (por ejemplo "lapiz-mongol.jpg").',
        }),
        el('input', {
          type: 'file', accept: 'image/*', multiple: '',
          onchange: (ev) => porLote([...ev.target.files]),
        }),
        el('div', { id: 'lote' })
      );
      return caja;
    }

    async function porLote(archivos) {
      if (!archivos.length) return;
      const caja = $('#lote', nodo);
      const todos = catalogo();
      let hechas = 0, fallidas = [];

      for (const [n, archivo] of archivos.entries()) {
        caja.textContent = `Procesando ${n + 1} de ${archivos.length}…`;
        const base = archivo.name.replace(/\.[^.]+$/, '');
        const clave = normalizar(base);
        const p = todos.find((x) =>
          x.codigoBarras === base ||
          normalizar(x.sku || '') === clave ||
          x.nombreNorm === clave);
        if (!p) { fallidas.push(archivo.name); continue; }
        try {
          await guardarFoto(p.id, await comprimir(archivo));
          hechas++;
        } catch { fallidas.push(archivo.name); }
      }

      caja.innerHTML = '';
      caja.appendChild(el('p', { style: 'font-weight:600', texto: `${hechas} fotos emparejadas.` }));
      if (fallidas.length) {
        caja.appendChild(el('details', {}, [
          el('summary', { style: 'cursor:pointer;color:var(--ambar)', texto: `${fallidas.length} no se pudieron emparejar` }),
          el('div', { style: 'font-size:.85rem;color:var(--texto-suave)', html: fallidas.map(esc).join('<br>') }),
        ]));
      }
      recargar();
      setTimeout(pintar, 1200);
    }

    pintar();
  },
});

/** Ver / cambiar la foto de un producto puntual (lo usa Inventario). */
export async function verFoto(producto) {
  const { abrirDialogo } = await import('../ui/html.js');
  const datos = await obtenerFoto(producto.id);
  const d = abrirDialogo('');
  const entrada = el('input', {
    type: 'file', accept: 'image/*', capture: 'environment', hidden: '',
    onchange: async (ev) => {
      if (!ev.target.files[0]) return;
      await guardarFoto(producto.id, await comprimir(ev.target.files[0]));
      d.close();
      avisarOk('Foto actualizada');
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
      datos ? el('button.btn.plano', { texto: '🗑️ Quitar', onclick: async () => { await borrarFoto(producto.id); d.close(); } }) : null,
      el('button.btn.principal', { texto: '📷 Nueva foto', onclick: () => entrada.click() }),
    ])
  );
}
