// fiados.js — FIADOS, la pantalla del empleado: a quién ya se le fió.
//
// El empleado podía dejar una venta fiada y hasta crear el cliente en el
// momento, pero no tenía dónde ver a quién ya se le había fiado. En el
// mostrador eso se nota: llega alguien que debe de la semana pasada, pide
// fiado otra vez, y el que está atendiendo no tiene cómo saberlo. Preguntarle
// al dueño por WhatsApp cada vez no es un sistema.
//
// Lo que NO enseña, y es a propósito: ni costos, ni ganancia, ni márgenes.
// Esta pantalla contesta una sola pregunta —quién debe, cuánto y desde
// cuándo—, igual que la de Deudores del dueño pero sin tocar nada: sin crear
// clientes, sin editarlos y sin cobrar. Cobrar un fiado mueve la plata de la
// caja y eso sigue siendo del dueño.
//
// La ficha muestra los abonos, que el empleado sí puede leer. Lo que la
// persona se llevó NO sale aquí: las reglas de Firestore solo le dejan leer
// SUS ventas, y una consulta que pida las de todos se rechaza entera (ver el
// comentario de `ventasEntre` en data/ventas.js).
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, abrirDialogo, pegar } from '../ui/html.js';
import { listarClientes, abonosDe, deudaDe, debe } from '../data/clientes.js';
import { formatear } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import { buscarClientes } from '../data/busqueda.js';
import { pasadas, CACHE } from '../data/lectura.js';

/** Hace cuántos días es esa fecha. Null si no hay fecha. */
function diasDesde(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Cómo se dice el tiempo de una deuda, y de qué color se ve. */
function antiguedad(dias) {
  if (dias === null) return { texto: '', color: 'var(--texto-suave)' };
  if (dias <= 0) return { texto: 'de hoy', color: 'var(--texto-suave)' };
  if (dias === 1) return { texto: 'de ayer', color: 'var(--texto-suave)' };
  if (dias < 30) return { texto: `hace ${dias} días`, color: 'var(--texto-suave)' };
  if (dias < 60) return { texto: `hace ${dias} días`, color: 'var(--ambar)' };
  const meses = Math.floor(dias / 30);
  return { texto: `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`, color: 'var(--rojo)' };
}

registrar('fiados', {
  titulo: 'Fiados', icono: '🤝', soloEmpleado: true, seccion: 'La plata', orden: 40,
  async montar(nodo) {
    nodo.innerHTML = '<div class="cargando">Cargando fiados…</div>';
    let clientes = [];
    let filtro = '';

    const tasas = () => leer('tasas') || {};
    const deuda = (c) => deudaDe(c, tasas());
    // La cifra grande es el peso, que es como se acordó la deuda y como la va
    // a decir la persona (misma regla que en Deudores).
    const monto = (c) => (deuda(c).COP ? formatear(deuda(c).COP, 'COP') : formatear(deuda(c).USD));

    const pintar = () => {
      const todosDeben = clientes.filter(debe);
      const visibles = buscarClientes(clientes, filtro);
      const deben = [...visibles].filter(debe).sort((a, b) => deuda(b).USD - deuda(a).USD);

      nodo.innerHTML = '';
      pegar(nodo,
        el('div.kpis', { style: 'margin-bottom:1rem' }, [
          el('div.kpi.acento', {}, [
            el('div.rotulo', { texto: 'DEBEN' }),
            el('div.valor', { texto: String(todosDeben.length) }),
          ]),
        ]),
        el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-pie);margin:-.3rem 0 1rem',
          texto: todosDeben.length
            ? 'Antes de fiar otra vez, mira si la persona ya debe. Para cobrar un fiado, el dueño.'
            : 'Nadie debe nada ahora mismo.',
        }),
        clientes.length > 6 ? el('input#buscar-fiado', {
          type: 'search', placeholder: 'Buscar por nombre o teléfono…',
          value: filtro, autocomplete: 'off',
          style: 'margin-bottom:1rem',
          oninput: (ev) => { filtro = ev.target.value; pintar(); },
        }) : null
      );

      if (!todosDeben.length) {
        nodo.appendChild(el('div.vacio', { texto: 'Nadie te debe nada.' }));
      } else if (!deben.length) {
        nodo.appendChild(el('div.vacio', { texto: `Nadie que deba coincide con "${filtro}".` }));
      } else {
        nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Deben' })]));
        nodo.appendChild(lista(deben));
      }

      // Igual que en Deudores: `pintar` rehace el nodo, así que el campo de
      // búsqueda es uno nuevo y hay que devolverle el foco o solo se puede
      // escribir una letra.
      if (filtro) {
        const campo = $('#buscar-fiado', nodo);
        if (campo && document.activeElement !== campo) {
          campo.focus();
          campo.setSelectionRange(campo.value.length, campo.value.length);
        }
      }
    };

    function lista(gente) {
      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const c of gente) {
        const a = antiguedad(diasDesde(c.ultimaCompra));
        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.6rem;border-bottom:1px solid var(--borde);cursor:pointer',
          role: 'button',
          tabindex: '0',
          onclick: () => detalle(c),
          onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); detalle(c); } },
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(c.nombre) }),
            el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: esc(c.telefono || '') }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div.cifra', { style: 'font-weight:700;color:var(--rojo)', texto: monto(c) }),
            a.texto ? el('div', { style: `font-size:var(--t-pie);color:${a.color}`, texto: a.texto }) : null,
          ]),
        ]));
      }
      return tarjeta;
    }

    /** La ficha: cuánto debe, desde cuándo y qué ha abonado. */
    function detalle(c) {
      const a = antiguedad(diasDesde(c.ultimaCompra));
      const d = abrirDialogo('');
      pegar(d,
        el('h2', { html: esc(c.nombre) }),
        c.telefono ? el('p', { style: 'margin-top:-.5rem;color:var(--texto-suave)', html: esc(c.telefono) }) : null,
        el('div.cifra-gigante', { style: 'text-align:center;color:var(--rojo)', texto: monto(c) }),
        el('p', {
          style: 'text-align:center;color:var(--texto-suave);margin-top:-.4rem',
          texto: `debe${a.texto ? ` · última compra ${a.texto}` : ''}`,
        }),
        el('div', { id: 'abonos-fiado', class: 'cargando', texto: 'Buscando lo que ha abonado…' }),
        el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-pie)',
          texto: 'El detalle de lo que se llevó y el cobro de la deuda los lleva el dueño.',
        }),
        el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Cerrar', onclick: () => d.close() })
      );

      const pintarAbonos = (fuente) => abonosDe(c.id, { fuente }).then((abonos) => {
        if (fuente === CACHE && !abonos.length) return false;
        const caja = $('#abonos-fiado', d);
        if (!caja) return;                 // el cuadro se cerró mientras cargaba
        caja.className = '';
        caja.innerHTML = '';
        caja.appendChild(el('h3', { style: 'font-size:1rem;margin:.5rem 0 .2rem', texto: 'Lo que ha abonado' }));
        if (!abonos.length) {
          caja.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)', texto: 'Sin abonos todavía.' }));
          return;
        }
        for (const x of abonos) {
          caja.appendChild(el('div', {
            style: 'display:flex;justify-content:space-between;gap:.5rem;padding:.4rem 0;border-bottom:1px solid var(--borde);font-size:var(--t-cuerpo)',
          }, [
            el('div', {}, [
              el('div', { texto: fecha(x.ts) }),
              x.nombreUsuario ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: esc(x.nombreUsuario) }) : null,
            ]),
            el('strong.cifra', {
              style: 'color:var(--verde)',
              texto: x.montoCOP ? formatear(x.montoCOP, 'COP') : formatear(x.montoUSD || 0),
            }),
          ]));
        }
      });

      pasadas(pintarAbonos).catch((e) => {
        console.warn('[fiados] abonos:', e?.code || e);
        const caja = $('#abonos-fiado', d);
        if (!caja) return;
        caja.className = '';
        caja.textContent = 'No se pudo cargar lo abonado (¿sin internet?).';
      });
    }

    try {
      await pasadas(async (fuente) => {
        const gente = await listarClientes({ fuente });
        if (fuente === CACHE && !gente.length) return false;
        clientes = gente;
        pintar();
      });
    } catch (e) {
      console.warn('[fiados]', e?.code || e);
      nodo.innerHTML = '';
      nodo.appendChild(el('div.vacio', { texto: 'No se pudo cargar (¿sin internet?).' }));
    }
  },
});
