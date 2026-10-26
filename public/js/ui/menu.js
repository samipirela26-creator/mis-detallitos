// menu.js — la barra de abajo, partida en dos.
//
// POR QUÉ ESTÁ PARTIDA. La barra solo pintaba las pantallas registradas con
// `menu: true`, y eran cinco por rol. Las otras siete del dueño (Mi dinero,
// Caja, Deudores, Gastos, Ventas, Configuración, Importar) existían, servían y
// no tenían botón: se llegaba desde un atajo del Panel, o no se llegaba.
// Estando en Vender, para ver quién te debe había que volver al Panel. Y
// "Mis ventas" del empleado —el único sitio donde puede pedir que se anule una
// venta mal cobrada— solo se abría desde dentro de Mi caja.
//
// Entonces: a la izquierda las ACCIONES, lo que se toca a cada rato, con
// Vender en el medio donde cae el pulgar. Un separador. A la derecha las
// TAREAS: lo que espera a alguien (con su número encima) y Todo, que abre la
// hoja con el mapa completo de la app. Ninguna pantalla se queda sin botón.
//
// El estilo no cambia: son las mismas clases de la píldora (.nav), las mismas
// tarjetas y el mismo cuadro que usa el resto de la app.

import { el, esc, pegar, abrirDialogo } from './html.js';
import { icono } from './iconos.js';
import { pantallasDeMenu, pantallasDeTodo, ir } from '../core/router.js';
import { esDueno } from '../core/sesion.js';
import { pendientes, cuantos } from '../data/pendientes.js';
import { pasadas, CACHE } from '../data/lectura.js';

/** Un botón de la píldora, igual que los de siempre. */
function boton(id, titulo, nombreIcono, { destacado = false, chapita = null } = {}) {
  const b = el('button', {
    'data-id': id,
    class: destacado ? 'destacado' : '',
    onclick: () => ir(id),
  }, [
    el('span.ico', { html: icono(nombreIcono || id) }),
    el('span', { texto: titulo }),
  ]);
  if (chapita) b.appendChild(chapita);
  return b;
}

/** El numerito rojo. Nace vacío y escondido: las cuentas llegan después. */
function chapita() {
  return el('span.nav-chapita', { style: 'display:none', 'aria-hidden': 'true' });
}

export function montarBarra(nav) {
  nav.innerHTML = '';

  // --- acciones ---
  for (const p of pantallasDeMenu()) {
    nav.appendChild(boton(p.id, p.titulo, p.icono, { destacado: p.id === 'vender' }));
  }

  nav.appendChild(el('span.nav-separador', { 'aria-hidden': 'true' }));

  // --- tareas ---
  const marca = chapita();
  if (esDueno()) {
    const b = el('button.nav-tarea', {
      type: 'button',
      'aria-label': 'Pendientes',
      onclick: () => abrirPendientes(),
    }, [
      el('span.ico', { html: icono('alert') }),
      // "Tareas" y no "Pendientes": en un teléfono de 375px la palabra larga
      // sale cortada ("ndient…") y deja de ser un rótulo.
      el('span', { texto: 'Tareas' }),
      marca,
    ]);
    nav.appendChild(b);
  } else {
    // Al empleado la tarea que le toca es la suya: lo que pidió anular y
    // todavía no le han contestado. Y de paso deja de estar escondida.
    // "Ventas" y no "Mis ventas": el empleado solo ve las suyas, y el rótulo
    // largo se parte en dos líneas dentro de la píldora.
    nav.appendChild(boton('mis-ventas', 'Ventas', 'cart', { chapita: marca }));
  }

  nav.appendChild(el('button.nav-tarea', {
    type: 'button',
    'aria-label': 'Todas las pantallas',
    onclick: () => abrirTodo(),
  }, [
    el('span.ico', { html: icono('box') }),
    el('span', { texto: 'Todo' }),
  ]));

  contarPendientes(marca);
  return marca;
}

/** Pone (o quita) el número de la chapita. Se vuelve a llamar al cambiar de
 *  pantalla: así baja sola cuando se atiende algo. */
export async function contarPendientes(marca) {
  if (!marca?.isConnected) return;
  const poner = (fuente) => pendientes({ fuente }).then((lista) => {
    if (!marca.isConnected) return;
    const n = cuantos(lista);
    marca.textContent = n > 9 ? '9+' : String(n);
    marca.style.display = n ? '' : 'none';
  });
  // Dos pasadas, como el resto de la app (data/lectura.js): primero lo que ya
  // está en el teléfono, que contesta al instante, y encima lo del servidor.
  // Con una sola pasada, sin señal, el número se quedaba esperando para
  // siempre y la chapita no aparecía nunca.
  try {
    await pasadas(poner);
  } catch (e) {
    console.warn('[menu] pendientes:', e?.code || e);
  }
}

/** La hoja de Pendientes: cada cosa que espera, y el botón que la resuelve. */
function abrirPendientes() {
  const d = abrirDialogo(`
    <h2 style="margin:0 0 .15rem;font-family:var(--fuente-titulo);font-size:1.35rem">Pendientes</h2>
    <p style="margin:0 0 1rem;color:var(--texto-suave);font-size:var(--t-pie)">Lo que está esperando que alguien lo mire.</p>
    <div id="lista-pendientes"><div class="cargando">Revisando…</div></div>
    <button class="btn plano ancho" id="cerrar-pendientes" style="margin-top:1rem">Cerrar</button>
  `);
  d.querySelector('#cerrar-pendientes').onclick = () => d.close();

  const caja = d.querySelector('#lista-pendientes');
  const pintar = (fuente) => pendientes({ fuente })
    .then((lista) => {
      if (!d.isConnected) return;
      // La caché vacía no se pinta: puede ser que todavía no haya leído nada,
      // y un "todo al día" mentiroso es peor que esperar un segundo.
      if (fuente === CACHE && !lista.length) return false;
      caja.innerHTML = '';
      if (!lista.length) {
        caja.appendChild(el('div.vacio', { texto: 'Nada esperando. Todo al día.' }));
        return;
      }
      for (const p of lista) {
        caja.appendChild(el(`div.tarjeta${p.urgente ? '.amarilla' : ''}`, {
          style: 'cursor:pointer;margin-bottom:.6rem',
          role: 'button',
          tabindex: '0',
          onclick: () => { d.close(); ir(p.destino); },
          onkeydown: (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); d.close(); ir(p.destino); }
          },
        }, [
          el('h2', { style: 'margin:0;font-family:var(--fuente-cuerpo);font-size:var(--t-dato);font-weight:700', texto: p.texto }),
          el('p', { style: 'margin:.2rem 0 0;font-size:var(--t-pie)', texto: p.detalle }),
        ]));
      }
    });

  pasadas(pintar).catch((e) => {
    console.warn('[menu] pendientes:', e?.code || e);
    if (!d.isConnected) return;
    caja.innerHTML = '';
    caja.appendChild(el('div.vacio', { texto: 'No se pudo revisar (¿sin internet?).' }));
  });
}

/** La hoja de Todo: el registro completo de pantallas, por sección. */
function abrirTodo() {
  const d = abrirDialogo(`
    <h2 style="margin:0 0 .15rem;font-family:var(--fuente-titulo);font-size:1.35rem">Todo</h2>
    <p style="margin:0 0 .5rem;color:var(--texto-suave);font-size:var(--t-pie)">Todas las pantallas que puedes abrir.</p>
    <div id="lista-todo"></div>
    <button class="btn plano ancho" id="cerrar-todo" style="margin-top:1rem">Cerrar</button>
  `);
  d.querySelector('#cerrar-todo').onclick = () => d.close();

  const caja = d.querySelector('#lista-todo');
  for (const { seccion, items } of pantallasDeTodo()) {
    caja.appendChild(el('div.seccion', {}, [el('h2', { texto: seccion })]));
    const rejilla = el('div.todo-grid');
    for (const p of items) {
      rejilla.appendChild(el('button.todo-item', {
        type: 'button',
        onclick: () => { d.close(); ir(p.id); },
      }, [
        el('span.ico-wrap', { html: icono(p.icono || p.id) }),
        el('span', { html: esc(p.titulo) }),
      ]));
    }
    pegar(caja, rejilla);
  }
}
