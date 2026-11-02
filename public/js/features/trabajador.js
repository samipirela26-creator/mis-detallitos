// trabajador.js — ¿vale la pena lo que se paga? Y el botón de pagar el sueldo.
// Es del dueño. Lee ventas, retiros y costos; las cuentas viven en reports/trabajador.js.
import { registrar } from '../core/router.js';
import { el, esc, $, pegar, abrirDialogo, unSoloToque, diaISO } from '../ui/html.js';
import { avisarOk, avisarMal } from '../ui/avisos.js';
import { ventasEntre } from '../data/ventas.js';
import { retirosEntre } from '../data/retiros.js';
import { productos as catalogo } from '../data/catalogo.js';
import { sueldoSemanal, guardarSueldoSemanal, personas, pagarSueldo } from '../data/sueldos.js';
import { porSemana, veredicto } from '../reports/trabajador.js';
import { MONEDAS, LUGARES, aMenores, aMayores, formatear, aUSD } from '../core/dinero.js';
import { lugarDeLaMoneda } from '../core/sitios.js';
import { leer } from '../core/estado.js';

const SEMANAS = 8;
const corto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });

registrar('trabajador', {
  titulo: 'Sueldos', icono: '💵', soloDueno: true, seccion: 'La plata', orden: 35,
  async montar(nodo) {
    nodo.innerHTML = '<div class="cargando">Sacando las cuentas…</div>';
    let gente = [];
    let sueldo = 2000;
    let elegido = null;
    let ventas = [], retiros = [];

    try {
      const hoy = diaISO();
      const desde = new Date(Date.now() - SEMANAS * 7 * 86400000 - 86400000).toISOString().slice(0, 10);
      [gente, sueldo, ventas, retiros] = await Promise.all([
        personas(), sueldoSemanal(), ventasEntre(desde, hoy), retirosEntre(desde, hoy),
      ]);
    } catch (e) {
      console.warn('[sueldos]', e?.code || e);
      nodo.innerHTML = '<div class="vacio">No se pudo cargar (¿sin internet?).</div>';
      return;
    }
    const empleados = gente.filter((g) => g.rol !== 'dueno');
    // Quien más ha vendido entre el equipo, para no abrir en alguien sin ventas.
    const conVentas = (u) => ventas.filter((v) => v.uid === u.uid && v.estado !== 'anulada').length;
    elegido = [...empleados].sort((a, b) => conVentas(b) - conVentas(a))[0]?.uid || gente[0]?.uid;

    const costos = Object.fromEntries(catalogo().map((p) => [p.id, p.costoUSD || 0]));

    const pintar = () => {
      const p = gente.find((g) => g.uid === elegido);
      nodo.innerHTML = '';
      if (!p) return nodo.appendChild(el('div.vacio', { texto: 'No hay nadie en el equipo todavía.' }));
      const filas = porSemana({ ventas, retiros, uid: p.uid, nombre: p.nombre, costos, sueldoUSD: sueldo, hoy: diaISO(), semanas: SEMANAS });
      const v = veredicto(filas);
      const pagadoTotal = filas.reduce((t, s) => t + s.pagadoUSD, 0);

      pegar(nodo,
        el('div.campo', {}, [
          el('label', { texto: 'Persona' }),
          el('select', { onchange: (ev) => { elegido = ev.target.value; pintar(); } },
            gente.map((g) => el('option', { value: g.uid, texto: g.nombre + (g.rol === 'dueno' ? ' (tú)' : ''), ...(g.uid === elegido ? { selected: '' } : {}) }))),
        ]),
        el('button.btn.principal.ancho', { texto: `Pagar sueldo a ${p.nombre.split(' ')[0]}`, onclick: () => formularioPago(p) }),
        el('div.tarjeta', { style: 'margin-top:1rem' }, [
          el('h2', { texto: '¿Vale la pena?' }),
          v.semanas
            ? el('p', { style: 'font-size:var(--t-dato)', html:
              `En ${v.semanas} semana${v.semanas === 1 ? '' : 's'} completa${v.semanas === 1 ? '' : 's'}, ${esc(p.nombre.split(' ')[0])} dejó `
              + `<strong>${formatear(v.gananciaUSD)}</strong> de ganancia con sus ventas y el sueldo son <strong>${formatear(v.sueldoUSD)}</strong>. `
              + (v.cubre ? '<strong style="color:var(--verde)">Sí cubre su sueldo.</strong>' : '<strong style="color:var(--rojo)">No lo cubre solo con ventas.</strong>')
              + ` Semanas que sí cubrió: ${v.cubiertas} de ${v.semanas}.` })
            : el('p', { texto: 'Aún no hay una semana completa con ventas para juzgar.' }),
          el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto:
            'Solo cuenta lo que vendió. Limpiar, abrir la caja o atender mientras tú haces otra cosa vale, pero no está en ninguna venta.' }),
        ]),
        el('div.seccion', {}, [el('h2', { texto: 'Semana por semana' })]),
        filas.length ? el('div.tarjeta', { style: 'padding:.4rem .9rem' }, filas.map((s) => el('div', {
          style: 'padding:.6rem 0;border-bottom:1px solid var(--borde)',
        }, [
          el('div', { style: 'display:flex;justify-content:space-between;gap:.5rem' }, [
            el('strong', { texto: `${corto(s.desde)} – ${corto(s.hasta)}${s.enCurso ? ' · en curso' : ''}` }),
            el('strong.cifra', { style: `color:var(--${s.cubre ? 'verde' : 'rojo'})`, texto: `${formatear(s.gananciaUSD)} de ganancia` }),
          ]),
          el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto:
            `${s.ventas} ventas · vendió ${formatear(s.vendidoUSD)} · se le pagó ${formatear(s.pagadoUSD)} de ${formatear(s.sueldoUSD)}` }),
        ]))) : el('div.vacio', { texto: 'Sin ventas de esta persona todavía.' }),
        filas.length ? el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: `Pagado en este período: ${formatear(pagadoTotal)}.` }) : null,
        el('div.tarjeta', { style: 'margin-top:1rem' }, [
          el('h2', { texto: 'Sueldo semanal' }),
          el('div.fila', {}, [
            el('input#sueldo-semanal', { inputmode: 'decimal', value: String(aMayores(sueldo, 'USD')).replace('.', ',') }),
            el('button.btn.plano', {
              texto: 'Guardar',
              onclick: () => {
                try { sueldo = aMenores($('#sueldo-semanal', nodo).value, 'USD'); guardarSueldoSemanal(sueldo); avisarOk('Sueldo guardado'); pintar(); }
                catch (e) { avisarMal(e.message); }
              },
            }),
          ]),
        ]),
      );
    };

    function formularioPago(p) {
      const d = abrirDialogo('');
      const tasas = leer('tasas') || {};
      const esDueno = p.rol === 'dueno';
      pegar(d,
        el('h2', { texto: `Pagar sueldo · ${p.nombre}` }),
        el('div.fila', {}, [
          el('div.campo', {}, [el('label', { texto: 'Moneda' }), el('select#s-moneda', {
            onchange: () => { $('#s-lugar', d).value = lugarDeLaMoneda($('#s-moneda', d).value); },
          }, Object.values(MONEDAS).map((m) => el('option', { value: m.codigo, texto: m.nombre })))]),
          el('div.campo', { style: 'flex:2' }, [el('label', { texto: 'Monto' }), el('input#s-monto', { inputmode: 'decimal', value: String(aMayores(sueldo, 'USD')).replace('.', ',') })]),
        ]),
        el('div.campo', {}, [el('label', { texto: '¿De dónde sale?' }), el('select#s-lugar', {}, LUGARES.map((l) => el('option', { texto: l })))]),
        el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: 'Se anota como sueldo, no como gasto: no baja la ganancia y sale de la caja. Aparece en "Mi dinero".' }),
        el('button.btn.principal.ancho', {
          texto: 'Pagar sueldo',
          onclick: unSoloToque(async () => {
            const moneda = $('#s-moneda', d).value;
            const monto = aMenores($('#s-monto', d).value, moneda);
            if (!monto) return avisarMal('Escribe el monto.');
            if (moneda !== 'USD' && !tasas[moneda]) return avisarMal(`Falta la tasa de hoy para ${MONEDAS[moneda].nombre}.`);
            try {
              await pagarSueldo({
                persona: p.nombre, esDueno, lugar: $('#s-lugar', d).value, moneda, monto,
                tasa: moneda === 'USD' ? 100 : tasas[moneda],
                montoUSD: aUSD(monto, moneda, moneda === 'USD' ? null : tasas[moneda]),
              });
              d.close(); avisarOk('Sueldo anotado');
              retiros = await retirosEntre(diaISO(Date.now() - SEMANAS * 7 * 86400000), diaISO()).catch(() => retiros);
              pintar();
            } catch (e) { avisarMal(e.message); }
          }, { mientras: 'Guardando…' }),
        }),
        el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Cancelar', onclick: () => d.close() })
      );
      $('#s-lugar', d).value = lugarDeLaMoneda('USD');
    }

    pintar();
  },
});
