// pendientes-diarios.js — los pendientes del empleado.
//
// `hoy` (empleado): lo primero que ve al abrir la app. Saludo y la lista de lo
// que le toca hoy, con casilla. No bloquea nada: debajo hay un botón a vender.
// `pendientes` (dueño): crea, pausa y borra pendientes, y ve qué marcó el empleado.
import { registrar, ir } from '../core/router.js';
import { el, esc, $, pegar, abrirDialogo, unSoloToque, diaISO, sumarDias } from '../ui/html.js';
import { usuarioActual } from '../core/sesion.js';
import { avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { pasadas, CACHE } from '../data/lectura.js';
import {
  listarPendientes, hechosDelDia, guardarPendiente, pausarPendiente, borrarPendiente,
  marcarHecho, desmarcarHecho,
} from '../data/pendientes.js';
import { tocaHoy, describirRepeticion, NOMBRES_DIA } from '../core/pendientes-dia.js';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

/** Carga plantillas + marcas de hoy y llama a `pintar` (caché y luego servidor). */
async function cargarHoy(dia, pintar) {
  await pasadas(async (fuente) => {
    const [plantillas, hechos] = await Promise.all([
      listarPendientes({ fuente }), hechosDelDia(dia, { fuente }),
    ]);
    if (fuente === CACHE && !plantillas.length) return false;
    pintar(plantillas, hechos);
  });
}

// ---------------------------------------------------------------- empleado
registrar('hoy', {
  titulo: 'Hoy', icono: '✓', soloEmpleado: true, orden: 5,
  async montar(nodo) {
    const dia = diaISO();
    const u = usuarioActual();
    const primerNombre = (u?.nombre || '').split(' ')[0];
    nodo.innerHTML = '<div class="cargando">Cargando tus pendientes…</div>';
    let hechos = new Set();
    let lista = [];

    const pintar = () => {
      const hechas = lista.filter((p) => hechos.has(p.id)).length;
      nodo.innerHTML = '';
      pegar(nodo,
        el('h1', { style: 'margin:.2rem 0 .2rem', texto: `${saludo()}${primerNombre ? `, ${primerNombre}` : ''}` }),
        el('p', {
          style: 'color:var(--texto-suave);margin:0 0 1rem',
          texto: !lista.length ? 'Hoy no tienes pendientes.'
            : hechas === lista.length ? 'Todo listo por hoy. ¡Gracias!'
            : `Tus pendientes de hoy · ${hechas} de ${lista.length}`,
        })
      );
      if (lista.length) {
        const tarjeta = el('div.tarjeta', { style: 'padding:.4rem .9rem' });
        for (const p of lista) {
          const hecho = hechos.has(p.id);
          tarjeta.appendChild(el('label.interruptor.pendiente' + (hecho ? '.hecho' : ''), {}, [
            el('input', {
              type: 'checkbox', ...(hecho ? { checked: '' } : {}),
              onchange: (ev) => {
                if (ev.target.checked) { hechos.add(p.id); marcarHecho(p.id, dia); }
                else { hechos.delete(p.id); desmarcarHecho(p.id, dia); }
                pintar();
              },
            }),
            el('span', { html: esc(p.titulo) }),
            p.tipo === 'unico' ? el('em.chip-hoy', { texto: 'Solo hoy' }) : null,
          ]));
        }
        nodo.appendChild(tarjeta);
      }
      nodo.appendChild(el('button.btn.principal.ancho', {
        style: 'margin-top:1rem', texto: 'Ir a vender →', onclick: () => ir('vender'),
      }));
    };

    try {
      await cargarHoy(dia, (plantillas, marcas) => {
        lista = plantillas.filter((p) => tocaHoy(p, dia)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
        hechos = new Set(marcas.map((m) => m.pendienteId));
        pintar();
      });
    } catch (e) {
      console.warn('[hoy]', e?.code || e);
      lista = [];
      pintar();
    }
  },
});

// -------------------------------------------------------------------- dueño
registrar('pendientes', {
  titulo: 'Pendientes', icono: '✓', soloDueno: true, seccion: 'El equipo', orden: 60,
  async montar(nodo) {
    const dia = diaISO();
    nodo.innerHTML = '<div class="cargando">Cargando pendientes…</div>';
    let plantillas = [];
    let marcas = [];

    const pintar = () => {
      const deHoy = plantillas.filter((p) => tocaHoy(p, dia));
      const hechos = new Map(marcas.map((m) => [m.pendienteId, m]));
      nodo.innerHTML = '';
      pegar(nodo,
        el('button.btn.principal.ancho', { texto: '+ Nuevo pendiente', onclick: () => formulario() }),
        el('div.seccion', {}, [el('h2', { texto: `Hoy · ${marcas.filter((m) => deHoy.some((p) => p.id === m.pendienteId)).length} de ${deHoy.length}` })]),
        deHoy.length ? el('div.tarjeta', { style: 'padding:.4rem .9rem' }, deHoy.map((p) => {
          const m = hechos.get(p.id);
          const hora = m?.ts?.toDate ? m.ts.toDate().toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' }) : '';
          return el('div.pendiente' + (m ? '.hecho' : ''), { style: 'display:flex;gap:.6rem;padding:.5rem 0' }, [
            el('span', { texto: m ? '✓' : '○' }),
            el('span', { style: 'flex:1', html: esc(p.titulo) }),
            m ? el('small', { style: 'color:var(--texto-suave)', texto: `${m.nombreUsuario || ''} ${hora}`.trim() }) : null,
          ]);
        })) : el('div.vacio', { texto: 'Nada le toca hoy al equipo.' }),
        el('div.seccion', {}, [el('h2', { texto: 'Todos los pendientes' })]),
      );
      const todos = [...plantillas].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      if (!todos.length) { nodo.appendChild(el('div.vacio', { texto: 'Aún no hay pendientes. Crea el primero.' })); return; }
      const tarjeta = el('div.tarjeta', { style: 'padding:.4rem .9rem' });
      for (const p of todos) {
        const vencido = p.tipo === 'unico' && p.fecha < dia;
        tarjeta.appendChild(el('div', {
          style: `display:flex;gap:.6rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--borde);${p.activo === false || vencido ? 'opacity:.55' : ''}`,
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(p.titulo) }),
            el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: `${describirRepeticion(p)}${p.activo === false ? ' · en pausa' : vencido ? ' · ya pasó' : ''}` }),
          ]),
          el('button.btn.plano', { texto: 'Editar', onclick: () => formulario(p) }),
        ]));
      }
      nodo.appendChild(tarjeta);
    };

    function formulario(p = null) {
      const d = abrirDialogo('');
      let tipo = p?.tipo || 'diario';
      let dias = new Set(p?.dias || []);
      const zonaExtra = el('div');
      const pintarExtra = () => {
        zonaExtra.innerHTML = '';
        if (tipo === 'dias') {
          const fila = el('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' });
          for (const n of [1, 2, 3, 4, 5, 6, 0]) {
            fila.appendChild(el('button.chip', {
              type: 'button', 'aria-pressed': String(dias.has(n)), texto: NOMBRES_DIA[n],
              onclick: (ev) => {
                if (dias.has(n)) dias.delete(n); else dias.add(n);
                ev.currentTarget.setAttribute('aria-pressed', String(dias.has(n)));
              },
            }));
          }
          zonaExtra.appendChild(fila);
        } else if (tipo === 'unico') {
          zonaExtra.appendChild(el('input#pend-fecha', { type: 'date', value: p?.fecha || sumarDias(dia, 1) }));
        } else if (tipo === 'alterno') {
          zonaExtra.appendChild(el('label', { texto: 'Empieza el' }));
          zonaExtra.appendChild(el('input#pend-ancla', { type: 'date', value: p?.ancla || dia }));
        }
      };
      const selector = el('select#pend-tipo', { onchange: (ev) => { tipo = ev.target.value; pintarExtra(); } }, [
        ['diario', 'Todos los días'], ['dias', 'Días de la semana'],
        ['alterno', 'Un día sí, uno no'], ['unico', 'Solo un día'],
      ].map(([v, t]) => el('option', { value: v, texto: t, ...(v === tipo ? { selected: '' } : {}) })));
      pintarExtra();

      pegar(d,
        el('h2', { texto: p ? 'Editar pendiente' : 'Nuevo pendiente' }),
        el('div.campo', {}, [el('label', { texto: 'Qué tiene que hacer' }), el('input#pend-titulo', { type: 'text', value: p?.titulo || '', placeholder: 'Ej. Limpiar el baño', maxlength: '120' })]),
        el('div.campo', {}, [el('label', { texto: 'Cuándo' }), selector, zonaExtra]),
        p ? el('label.interruptor', {}, [el('input#pend-activo', { type: 'checkbox', ...(p.activo !== false ? { checked: '' } : {}) }), el('span', { texto: 'Activo' })]) : null,
        el('button.btn.principal.ancho', {
          texto: 'Guardar',
          onclick: unSoloToque(async () => {
            try {
              if (tipo === 'dias' && !dias.size) return avisarMal('Elige al menos un día');
              guardarPendiente(p?.id, {
                titulo: $('#pend-titulo', d).value, tipo, dias: [...dias],
                fecha: $('#pend-fecha', d)?.value, ancla: $('#pend-ancla', d)?.value,
                activo: p ? $('#pend-activo', d).checked : true,
              });
              d.close(); avisarOk('Pendiente guardado'); recargar();
            } catch (e) { avisarMal(e.message); }
          }, { mientras: 'Guardando…' }),
        }),
        p ? el('button.btn.peligro.ancho', {
          style: 'margin-top:.5rem', texto: 'Borrar',
          onclick: async () => {
            if (!(await confirmar('¿Borrar este pendiente?', { aceptar: 'Borrar', peligro: true }))) return;
            borrarPendiente(p.id); d.close(); recargar();
          },
        }) : null,
        el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Cancelar', onclick: () => d.close() })
      );
    }

    const recargar = () => cargarHoy(dia, (pl, ma) => { plantillas = pl; marcas = ma; pintar(); })
      .catch((e) => { console.warn('[pendientes]', e?.code || e); nodo.innerHTML = '<div class="vacio">No se pudo cargar (¿sin internet?).</div>'; });
    await recargar();
  },
});
