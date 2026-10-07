// clientes.js — los fiados. Quién debe, cuánto, y los abonos.
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, abrirDialogo, pegar } from '../ui/html.js';
import { avisarOk, avisarMal } from '../ui/avisos.js';
import { listarClientes, guardarCliente, registrarAbono, abonosDe } from '../data/clientes.js';
import { MONEDAS, formatear, crearPago, totalPagadoUSD, aMenores } from '../core/dinero.js';
import { leer } from '../core/estado.js';

registrar('clientes', {
  titulo: 'Deudas', icono: '🤝', soloDueno: true,
  async montar(nodo) {
    nodo.innerHTML = '<div class="cargando">Cargando clientes…</div>';
    let clientes = [];
    try { clientes = await listarClientes(); }
    catch { nodo.innerHTML = ''; return nodo.appendChild(el('div.vacio', { texto: 'No se pudo cargar (¿sin internet?).' })); }

    const pintar = () => {
      const deben = clientes.filter((c) => (c.saldoUSD || 0) > 0);
      const total = deben.reduce((t, c) => t + c.saldoUSD, 0);
      nodo.innerHTML = '';
      pegar(nodo, 
        el('div.kpis', { style: 'margin-bottom:1rem' }, [
          el('div.kpi.acento', {}, [
            el('div.rotulo', { texto: 'Te deben' }),
            el('div.valor', { texto: formatear(total) }),
          ]),
          el('div.kpi', {}, [
            el('div.rotulo', { texto: 'Clientes con deuda' }),
            el('div.valor', { texto: String(deben.length) }),
          ]),
        ]),
        el('button.btn.principal.ancho', { style: 'margin-bottom:1rem', texto: '➕ Cliente nuevo', onclick: () => formulario() })
      );

      if (!clientes.length) return nodo.appendChild(el('div.vacio', { texto: 'Todavía no hay clientes.' }));

      const tarjeta = el('div.tarjeta', { style: 'padding:.5rem' });
      for (const c of [...clientes].sort((a, b) => (b.saldoUSD || 0) - (a.saldoUSD || 0))) {
        tarjeta.appendChild(el('div', {
          style: 'display:flex;gap:.6rem;align-items:center;padding:.6rem;border-bottom:1px solid var(--borde);cursor:pointer',
          onclick: () => detalle(c),
        }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(c.nombre) }),
            el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: esc(c.telefono || '') }),
          ]),
          el('div', {
            style: `font-weight:700;color:${(c.saldoUSD || 0) > 0 ? 'var(--rojo)' : 'var(--verde)'}`,
            texto: (c.saldoUSD || 0) > 0 ? formatear(c.saldoUSD) : 'al día',
          }),
        ]));
      }
      nodo.appendChild(tarjeta);
    };

    const recargar = async () => { clientes = await listarClientes(); pintar(); };

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

    async function detalle(c) {
      const d = abrirDialogo('');
      pegar(d, 
        el('h2', { html: esc(c.nombre) }),
        el('div.cifra-gigante', {
          style: `text-align:center;color:${(c.saldoUSD || 0) > 0 ? 'var(--rojo)' : 'var(--verde)'}`,
          texto: formatear(c.saldoUSD || 0),
        }),
        el('p', { style: 'text-align:center;color:var(--texto-suave)', texto: (c.saldoUSD || 0) > 0 ? 'debe' : 'está al día' }),
        el('div.fila', { style: 'margin:1rem 0' }, [
          el('button.btn.plano', { texto: '✏️ Editar', onclick: () => { d.close(); formulario(c); } }),
          (c.saldoUSD || 0) > 0 ? el('button.btn.principal', { texto: '💵 Abonar', onclick: () => { d.close(); abonar(c); } }) : null,
        ]),
        el('div', { id: 'abonos', class: 'cargando', texto: 'Cargando abonos…' }),
        el('button.btn.plano.ancho', { texto: 'Cerrar', onclick: () => d.close() })
      );
      const lista = await abonosDe(c.id).catch(() => []);
      const caja = $('#abonos', d);
      caja.className = '';
      caja.innerHTML = '';
      if (!lista.length) caja.appendChild(el('p', { style: 'color:var(--texto-suave);font-size:.9rem', texto: 'Sin abonos todavía.' }));
      for (const a of lista) {
        caja.appendChild(el('div', {
          style: 'display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--borde);font-size:.9rem',
        }, [
          el('span', { texto: fecha(a.ts) }),
          el('strong', { texto: formatear(a.montoUSD) }),
        ]));
      }
    }

    function abonar(c) {
      const tasas = leer('tasas') || {};
      let pagos = [];
      const d = abrirDialogo('');
      const resumen = el('div');
      const pintarResumen = () => {
        const pagado = totalPagadoUSD(pagos);
        resumen.innerHTML = '';
        pegar(resumen, 
          el('div', { style: 'text-align:center;margin:.5rem 0' }, [
            el('div', { style: 'color:var(--texto-suave);font-size:.85rem', texto: 'ABONA' }),
            el('div.cifra-gigante', { texto: formatear(pagado) }),
            el('div', { style: 'color:var(--texto-suave)', texto: `Quedaría debiendo ${formatear(Math.max(0, (c.saldoUSD || 0) - pagado))}` }),
          ])
        );
      };
      pintarResumen();

      pegar(d, 
        el('h2', { html: `Abono de ${esc(c.nombre)}` }),
        resumen,
        el('div.fila', { style: 'margin:.75rem 0' },
          Object.values(MONEDAS)
            .filter((m) => m.codigo === 'USD' || tasas[m.codigo])
            .map((m) => el('div.campo', { style: 'margin:0' }, [
              el('label', { texto: m.nombre }),
              el('input', {
                inputmode: 'decimal', placeholder: '0',
                oninput: (ev) => {
                  const monto = aMenores(ev.target.value, m.codigo) || 0;
                  pagos = pagos.filter((p) => p.moneda !== m.codigo);
                  if (monto) pagos.push(crearPago(m.codigo, monto, tasas));
                  pintarResumen();
                },
              }),
            ]))),
        el('div.fila', {}, [
          el('button.btn.plano', { texto: 'Cancelar', onclick: () => d.close() }),
          el('button.btn.principal', { texto: 'Registrar abono', onclick: async () => {
            const montoUSD = totalPagadoUSD(pagos);
            if (!montoUSD) return avisarMal('Escribe cuánto está abonando.');
            try {
              await registrarAbono({ clienteId: c.id, montoUSD, pagos });
              d.close();
              avisarOk('Abono registrado');
              recargar();
            } catch (e) {
              avisarMal('No se pudo registrar: ' + (e.message || e));
            }
          } }),
        ])
      );
    }

    pintar();
  },
});
