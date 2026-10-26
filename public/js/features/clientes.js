// clientes.js — DEUDORES. Quién te debe, cuánto, desde cuándo y qué se llevó.
//
// La pantalla está armada para la pregunta que se hace de verdad: "¿quién me
// debe y desde cuándo?". Por eso:
//
//  - Los que DEBEN van arriba, separados de los que están al día. Mezclados,
//    con veinte clientes, el que debe se pierde entre los que no.
//  - Cada uno dice hace cuántos días debe. Una deuda de tres días y una de
//    cuatro meses no son lo mismo y no se pueden ver iguales.
//  - La ficha muestra QUÉ se llevó fiado y QUÉ ha abonado, con fechas. Cuando
//    alguien discute una deuda, eso es lo único que la sostiene.
//  - "Cobrarle todo" llena el abono con el saldo completo: lo normal es que
//    paguen la deuda entera, y escribirla a mano se equivoca.
//  - LA CIFRA GRANDE ES EL PESO. Es el número que las dos personas acordaron y
//    el que la persona espera oír. El dólar va debajo, en chico, porque sirve
//    para los reportes del dueño y para nada más.
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal } from '../ui/avisos.js';
import {
  listarClientes, guardarCliente, registrarAbono, abonosDe, ventasFiadasDe, deudaDe, debe,
} from '../data/clientes.js';
import { MONEDAS, formatear, crearPago, totalPagadoUSD, abonoEnPesos, aMenores } from '../core/dinero.js';
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

registrar('clientes', {
  titulo: 'Deudores', icono: '🤝', soloDueno: true, seccion: 'La plata', orden: 40,
  async montar(nodo) {
    nodo.innerHTML = '<div class="cargando">Cargando deudores…</div>';
    let clientes = [];
    // La lista que ya está en el teléfono sale al instante; la del servidor
    // repinta encima cuando llegue (ver data/lectura.js).
    try { clientes = await listarClientes({ fuente: CACHE }); } catch { /* caché fría */ }
    const deLaCache = clientes.length > 0;
    if (!deLaCache) {
      try { clientes = await listarClientes(); }
      catch { nodo.innerHTML = ''; return nodo.appendChild(el('div.vacio', { texto: 'No se pudo cargar (¿sin internet?).' })); }
    }

    const tasas = () => leer('tasas') || {};
    const deuda = (c) => deudaDe(c, tasas());

    // Lo que se escribió en el buscador. Vive fuera de `pintar` para que no se
    // borre cada vez que la lista se repinta (al abonar, al crear un cliente).
    let filtro = '';

    const pintar = () => {
      // El filtro manda sobre las dos listas, pero NO sobre los totales de
      // arriba: "te deben" tiene que seguir diciendo el total de verdad aunque
      // estés buscando a una persona.
      // Los KPI salen de TODOS los que deben, filtre o no: el total que debe la
      // calle no cambia porque estés buscando a una persona.
      const todosDeben = clientes.filter(debe);
      const totalCOP = todosDeben.reduce((t, c) => t + (deuda(c).COP || 0), 0);
      const total = todosDeben.reduce((t, c) => t + deuda(c).USD, 0);
      const sinPesos = todosDeben.some((c) => !deuda(c).enPesos);
      const viejas = todosDeben.filter((c) => (diasDesde(c.ultimaCompra) ?? 0) >= 30);

      // Las listas sí se filtran.
      const visibles = buscarClientes(clientes, filtro);
      const deben = [...visibles].filter(debe)
        .sort((a, b) => deuda(b).USD - deuda(a).USD);
      const alDia = visibles.filter((c) => !debe(c));

      nodo.innerHTML = '';
      pegar(nodo,
        el('div.kpis', { style: 'margin-bottom:1rem' }, [
          el('div.kpi.acento', {}, [
            el('div.rotulo', { texto: 'TE DEBEN' }),
            el('div.valor', { texto: totalCOP ? formatear(totalCOP, 'COP') : formatear(total) }),
            totalCOP ? el('div', { style: 'font-size:var(--t-pie);opacity:.75', texto: formatear(total) }) : null,
          ]),
          el('div.kpi', {}, [
            el('div.rotulo', { texto: 'Personas' }),
            el('div.valor', { texto: String(todosDeben.length) }),
          ]),
          ...(viejas.length ? [el('div.kpi.malo', {}, [
            el('div.rotulo', { texto: 'De más de un mes' }),
            el('div.valor', { texto: String(viejas.length) }),
          ])] : []),
        ]),
        el('p', {
          style: 'color:var(--texto-suave);font-size:var(--t-pie);margin:-.3rem 0 1rem',
          texto: total
            ? 'La deuda está en pesos, como la etiqueta: no se mueve cuando se mueve el dólar. '
              + 'Y esta plata NO está en la caja: está en la calle.'
            : 'Nadie te debe nada ahora mismo.',
        }),
        sinPesos ? el('div.tarjeta.amarilla', { style: 'margin-bottom:1rem' }, [
          el('p', {
            style: 'font-size:var(--t-cuerpo);margin:0',
            texto: 'Hay deudas de antes que solo existen en dólares: el peso que se ve es una '
                 + 'conversión de hoy, no lo que se acordó. Corre scripts/deudas-en-pesos.mjs para fijarlas.',
          }),
        ]) : null,
        el('button.btn.principal.ancho', { style: 'margin-bottom:1rem', texto: 'Cliente nuevo', onclick: () => formulario() }),
        // Con veinte fiados, bajar scrolleando a buscar a alguien es lo que
        // hace que no se consulte. Busca sin acentos y por teléfono, igual que
        // el del mostrador.
        clientes.length > 6 ? el('input#buscar-cliente', {
          type: 'search', placeholder: 'Buscar por nombre o teléfono…',
          value: filtro, autocomplete: 'off',
          style: 'margin-bottom:1rem',
          oninput: (ev) => { filtro = ev.target.value; pintar(); },
        }) : null
      );

      if (!clientes.length) {
        return nodo.appendChild(el('div.vacio', {}, [
          el('p', { texto: 'Todavía no hay clientes.' }),
          el('p', {
            style: 'font-size:var(--t-cuerpo);color:var(--texto-suave)',
            texto: 'Se crean solos cuando dejas una venta fiada, o con el botón de arriba.',
          }),
        ]));
      }

      if (deben.length) {
        nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Te deben' })]));
        nodo.appendChild(listaDe(deben, true));
      }
      if (alDia.length) {
        nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Al día' })]));
        nodo.appendChild(listaDe(alDia, false));
      }

      if (filtro && !deben.length && !alDia.length) {
        nodo.appendChild(el('div.vacio', { texto: `Ningún cliente coincide con "${filtro}".` }));
      }

      // `pintar` rehace el nodo entero, así que el campo de búsqueda que acabas
      // de escribir es uno NUEVO: sin esto se pierde el foco en cada tecla y
      // solo se puede escribir una letra.
      if (filtro) {
        const campo = $('#buscar-cliente', nodo);
        if (campo && document.activeElement !== campo) {
          campo.focus();
          campo.setSelectionRange(campo.value.length, campo.value.length);
        }
      }
    };

    function listaDe(lista, debiendo) {
      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const c of lista) {
        const dias = diasDesde(c.ultimaCompra);
        const a = antiguedad(dias);
        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.6rem;border-bottom:1px solid var(--borde);cursor:pointer',
          onclick: () => detalle(c),
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(c.nombre) }),
            el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)' }, [
              el('span', { html: esc(c.telefono || (debiendo ? '' : 'sin deuda')) }),
            ]),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div.cifra', {
              style: `font-weight:700;color:${debiendo ? 'var(--rojo)' : 'var(--verde)'}`,
              texto: debiendo
                ? (deuda(c).COP ? formatear(deuda(c).COP, 'COP') : formatear(deuda(c).USD))
                : 'al día',
            }),
            debiendo && deuda(c).COP
              ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: formatear(deuda(c).USD) })
              : null,
            debiendo && a.texto
              ? el('div', { style: `font-size:var(--t-pie);color:${a.color}`, texto: a.texto })
              : null,
          ]),
        ]));
      }
      return tarjeta;
    }

    const recargar = async () => {
      await pasadas(async (fuente) => {
        const lista = await listarClientes({ fuente });
        if (fuente === CACHE && !lista.length) return false;
        clientes = lista;
        pintar();
      });
    };

    function formulario(c = null) {
      const d = abrirDialogo(`
        <h2>${c ? 'Editar cliente' : 'Cliente nuevo'}</h2>
        <form id="f">
          <div class="campo"><label>Nombre</label><input name="nombre" required value="${esc(c?.nombre || '')}"></div>
          <div class="campo"><label>Teléfono</label><input name="telefono" inputmode="tel" value="${esc(c?.telefono || '')}"></div>
          <div class="campo"><label>Nota</label><input name="nota" value="${esc(c?.nota || '')}"></div>
          <div class="fila">
            <button type="button" class="btn plano" id="x">Cancelar</button>
            <button type="submit" class="btn principal">Guardar</button>
          </div>
        </form>`);
      $('#x', d).onclick = () => d.close();
      $('#f', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target;
        await guardarCliente({ nombre: f.nombre.value, telefono: f.telefono.value, nota: f.nota.value }, c?.id);
        d.close();
        avisarOk('Guardado');
        recargar();
      });
    }

    /** La ficha del deudor: cuánto debe, qué se llevó y qué ha abonado. */
    async function detalle(c) {
      const d0 = deuda(c);
      const debeUSD = d0.USD;
      const a = antiguedad(diasDesde(c.ultimaCompra));
      const d = abrirDialogo('');
      pegar(d,
        el('h2', { html: esc(c.nombre) }),
        c.telefono ? el('p', { style: 'margin-top:-.5rem;color:var(--texto-suave)', html: esc(c.telefono) }) : null,
        el('div.cifra-gigante', {
          style: `text-align:center;color:${debeUSD > 0 ? 'var(--rojo)' : 'var(--verde)'}`,
          texto: d0.COP ? formatear(d0.COP, 'COP') : formatear(debeUSD),
        }),
        el('p', {
          style: 'text-align:center;color:var(--texto-suave);margin-top:-.4rem',
          texto: debeUSD > 0
            ? `debe${d0.COP ? ` · ${formatear(debeUSD)} de hoy` : ''} · última compra ${a.texto}`
            : 'está al día',
        }),
        el('div.fila', { style: 'margin:1rem 0' }, [
          el('button.btn.callado', { texto: 'Editar', onclick: () => { d.close(); formulario(c); } }),
          debeUSD > 0 ? el('button.btn.principal', {
            style: 'flex:2',
            texto: `Cobrarle ${d0.COP ? formatear(d0.COP, 'COP') : formatear(debeUSD)}`,
            onclick: () => { d.close(); abonar(c, debeUSD); },
          }) : null,
        ]),
        debeUSD > 0 ? el('button.btn.plano.ancho', { style: 'margin-bottom:1rem', texto: 'Abonar otra cantidad', onclick: () => { d.close(); abonar(c, 0); } }) : null,
        el('div', { id: 'movimientos', class: 'cargando', texto: 'Buscando lo que se llevó…' }),
        el('button.btn.plano.ancho', { style: 'margin-top:1rem', texto: 'Cerrar', onclick: () => d.close() })
      );

      async function movimientos(fuente) {
        const [fiadas, abonos] = await Promise.all([
          ventasFiadasDe(c.id, { fuente }).catch(() => []),
          abonosDe(c.id, { fuente }).catch(() => []),
        ]);
        if (fuente === CACHE && !fiadas.length && !abonos.length) return false;
        const caja = $('#movimientos', d);
        if (!caja) return;                 // el cuadro se cerró mientras cargaba
        caja.className = '';
        caja.innerHTML = '';

        const fila = (izq, der, nota, color) => el('div', {
          style: 'display:flex;justify-content:space-between;gap:.5rem;padding:.4rem 0;border-bottom:1px solid var(--borde);font-size:var(--t-cuerpo)',
        }, [
          el('div', { style: 'min-width:0' }, [
            el('div', { texto: izq }),
            nota ? el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: nota }) : null,
          ]),
          el('strong.cifra', { style: color ? `color:${color}` : '', texto: der }),
        ]);

        caja.appendChild(el('h3', { style: 'font-size:1rem;margin:.5rem 0 .2rem', texto: 'Lo que se llevó fiado' }));
        if (!fiadas.length) {
          caja.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)', texto: 'Nada fiado todavía.' }));
        }
        for (const v of fiadas) {
          caja.appendChild(fila(
            fecha(v.ts),
            formatear(v.totalUSD || 0),
            (v.lineas || []).map((l) => `${l.cantidad} ${esc(l.nombre)}`).join(' · '),
          ));
        }

        caja.appendChild(el('h3', { style: 'font-size:1rem;margin:1rem 0 .2rem', texto: 'Lo que ha abonado' }));
        if (!abonos.length) {
          caja.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)', texto: 'Sin abonos todavía.' }));
        }
        for (const x of abonos) {
          caja.appendChild(fila(
            fecha(x.ts),
            formatear(x.montoUSD || 0),
            (x.pagos || []).map((p) => formatear(p.monto, p.moneda)).join(' + '),
            'var(--verde)',
          ));
        }
        if (abonos.length) {
          const sumado = abonos.reduce((t, x) => t + (x.montoUSD || 0), 0);
          caja.appendChild(el('p', {
            style: 'text-align:right;font-weight:700;margin:.4rem 0 0',
            texto: `Abonado en total: ${formatear(sumado)}`,
          }));
        }
      }

      // Dos pasadas (ver data/lectura.js): lo que ya está en el teléfono se ve
      // al instante —abrir la ficha de alguien es un toque, no una consulta— y
      // el servidor repinta encima.
      await pasadas(movimientos);
    }

    /** `inicial` llena los campos con el saldo completo: lo normal es pagar todo. */
    function abonar(c, inicial = 0) {
      // `tasasHoy`, no `tasas`: ahí arriba `tasas` es una FUNCIÓN que lee las
      // del momento, y llamar a una y usar la otra ya rompió este botón una
      // vez —`tasas()` sobre este objeto tira "no es una función" y el abono no
      // se registraba—. Aquí hace falta la foto del momento en que se abrió el
      // cuadro, que es la tasa con la que se armaron los pagos que se ven.
      const tasasHoy = leer('tasas') || {};
      let pagos = [];
      const d = abrirDialogo('');
      const resumen = el('div');
      const pintarResumen = () => {
        const pagado = totalPagadoUSD(pagos);
        const queda = deuda(c).USD - pagado;
        resumen.innerHTML = '';
        pegar(resumen,
          el('div', { style: 'text-align:center;margin:.5rem 0' }, [
            el('div', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: 'ABONA' }),
            el('div.cifra-gigante', { texto: formatear(pagado) }),
            el('div', {
              style: `color:${queda > 0 ? 'var(--texto-suave)' : 'var(--verde)'}`,
              texto: queda > 0
                ? `Quedaría debiendo ${formatear(queda)}`
                : queda < 0 ? `Paga de más: ${formatear(-queda)}` : 'Queda al día',
            }),
          ])
        );
      };

      const campos = Object.values(MONEDAS)
        .filter((m) => m.codigo === 'USD' || tasasHoy[m.codigo])
        .map((m) => {
          const entrada = el('input', {
            inputmode: 'decimal', placeholder: '0',
            oninput: (ev) => {
              const monto = aMenores(ev.target.value, m.codigo) || 0;
              pagos = pagos.filter((p) => p.moneda !== m.codigo);
              if (monto) pagos.push(crearPago(m.codigo, monto, tasasHoy));
              pintarResumen();
            },
          });
          return { moneda: m, entrada, nodo: el('div.campo', { style: 'margin:0' }, [el('label', { texto: m.nombre }), entrada]) };
        });

      // Si vino de "Cobrarle todo", el saldo entra ya escrito en dólares (o en
      // la primera moneda con tasa, que es con la que se paga en el mostrador).
      if (inicial > 0) {
        const campo = campos.find((x) => x.moneda.codigo === 'USD') || campos[0];
        if (campo) {
          const m = campo.moneda.codigo;
          const monto = m === 'USD' ? inicial : Math.round((inicial * tasasHoy[m]) / 100);
          campo.entrada.value = String(monto / Math.pow(10, campo.moneda.decimales)).replace('.', ',');
          pagos = [crearPago(m, monto, tasasHoy)];
        }
      }
      pintarResumen();

      pegar(d,
        el('h2', { html: `Abono de ${esc(c.nombre)}` }),
        resumen,
        el('div.fila', { style: 'margin:.75rem 0' }, campos.map((x) => x.nodo)),
        el('div.fila', {}, [
          el('button.btn.callado', { texto: 'Cancelar', onclick: () => d.close() }),
          el('button.btn.principal', { texto: 'Registrar abono', onclick: async () => {
            const montoUSD = totalPagadoUSD(pagos);
            if (!montoUSD) return avisarMal('Escribe cuánto está abonando.');
            // Lo que abona también baja la deuda en PESOS, que es la moneda en
            // la que se fijó. La cuenta está en `abonoEnPesos` (core/dinero.js).
            const montoCOP = abonoEnPesos(pagos, deuda(c), tasasHoy);
            try {
              await registrarAbono({ clienteId: c.id, montoUSD, montoCOP, pagos });
              d.close();
              avisarOk('Abono registrado: esa plata ya entró a la caja.');
              recargar();
            } catch (e) {
              avisarMal('No se pudo registrar: ' + (e.message || e));
            }
          } }),
        ])
      );
    }

    pintar();
    // Se pintó con la caché: ahora sí la de verdad, y repinta si cambió.
    if (deLaCache) listarClientes().then((l) => { clientes = l; pintar(); }).catch(() => {});
  },
});
