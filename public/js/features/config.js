// config.js — tasas del día, PIN, sinónimos por aprobar y usuarios.
// Todo esto es del dueño; el empleado ni ve el botón.

import { temaGuardado, guardarTema } from '../ui/tema.js';
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { ref, col } from '../core/firebase.js';
import { setDoc, getDoc, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { cargarTasas, guardarTasas, sugerirTasas, hoyISO, baseBs, guardarBaseBs, BASES_BS, tasasFijas, fijarTasa } from '../data/tasas.js';
import { pendientes, aprobar, descartar } from '../data/sinonimos.js';
import { turnosAbiertos } from '../data/caja.js';
import { productos as catalogo } from '../data/catalogo.js';
import { hashPin, olvidarHash, salNueva, VUELTAS } from '../ui/pin.js';
import { MONEDAS, aMenores, tasaAMenores, formatear, aMayores } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import {
  cargarAjustes, guardarAjustes, probar, lista as iaLista,
  PROVEEDORES, FONDOS, AJUSTES_DEF,
} from '../data/estudio-ia.js';

registrar('config', {
  titulo: 'Configuración', icono: '⚙️', soloDueno: true, seccion: 'El negocio', orden: 20,
  async montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta" id="caja-abierta" style="display:none;margin-bottom:1rem"></div>
      <div class="tarjeta" id="tasas"><div class="cargando">Cargando tasas…</div></div>
      <div class="tarjeta" id="sinonimos" style="margin-top:1rem"><div class="cargando">Cargando sinónimos…</div></div>
      <div class="tarjeta" id="pin" style="margin-top:1rem"></div>
      <div class="tarjeta" id="solicitudes" style="margin-top:1rem"><div class="cargando">Revisando solicitudes…</div></div>
      <div class="tarjeta" id="usuarios" style="margin-top:1rem"><div class="cargando">Cargando usuarios…</div></div>
      <div class="tarjeta" id="catalogo-config" style="margin-top:1rem"></div>
      <div class="tarjeta" id="estudio-ia" style="margin-top:1rem"></div>
      <div class="tarjeta" id="tema" style="margin-top:1rem"></div>
      <div class="tarjeta" id="datos" style="margin-top:1rem"></div>`;

    pintarCajaAbierta($('#caja-abierta', nodo));
    pintarTasas($('#tasas', nodo));
    pintarSinonimos($('#sinonimos', nodo));
    pintarPin($('#pin', nodo));
    pintarSolicitudes($('#solicitudes', nodo), () => pintarUsuarios($('#usuarios', nodo)));
    pintarUsuarios($('#usuarios', nodo));
    pintarCatalogoConfig($('#catalogo-config', nodo));
    pintarEstudioIA($('#estudio-ia', nodo));
    pintarTema($('#tema', nodo));
    pintarDatos($('#datos', nodo));
  },
});

// --- una caja abierta por error ----------------------------------------------
//
// Es el arreglo de un enredo real: se abre caja sin querer y la gaveta queda
// trancada para todos, porque es una sola. Cerrarla no era la salida —obliga a
// inventar un arqueo de un turno que no existió—, así que la apertura se anula
// y aquí está el botón, en la pantalla del dueño, que es el único que puede.
//
// La tarjeta no existe mientras no haya nada abierto: un botón para deshacer
// algo que no pasó solo asusta.
async function pintarCajaAbierta(caja) {
  let abiertos = [];
  try {
    abiertos = await turnosAbiertos();
  } catch {
    return;    // sin internet no se puede saber, y no es nada urgente
  }
  if (!abiertos.length) { caja.style.display = 'none'; return; }

  caja.innerHTML = '';
  caja.style.display = '';
  pegar(caja,
    el('h2', { texto: abiertos.length === 1 ? 'Hay una caja abierta' : `Hay ${abiertos.length} cajas abiertas` }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'Si alguna se abrió por error, anúlala desde aquí: el turno queda anulado con el '
           + 'motivo y la gaveta se suelta, sin tener que inventar un cierre. Si el turno es de '
           + 'verdad, déjalo: se cierra contando, en la pantalla de Caja.',
    })
  );

  for (const t of abiertos) {
    const fondo = Object.entries(t.fondo || {})
      .filter(([, v]) => v)
      .map(([m, v]) => formatear(v, m)).join('  ·  ');
    caja.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem;'
           + 'padding:.6rem 0;border-top:1px solid var(--borde);flex-wrap:wrap',
    }, [
      el('div', {}, [
        el('div', { style: 'font-weight:600', html: esc(t.nombreUsuario || 'Alguien') }),
        el('div', {
          style: 'font-size:var(--t-pie);color:var(--texto-suave)',
          texto: `Abrió el ${fecha(t.apertura)}${fondo ? ` con ${fondo}` : ' sin nada'}`,
        }),
      ]),
      el('button.btn.plano', {
        style: 'min-height:36px;font-size:var(--t-pie)', texto: 'Fue un error: anularla',
        onclick: async () => {
          const { pedirAnularApertura } = await import('./caja.js');
          pedirAnularApertura(t, () => pintarCajaAbierta(caja));
        },
      }),
    ]));
  }
}

// --- tasas del día -----------------------------------------------------------
// La del bolívar se actualiza sola con el BCV al abrir la app; aquí se puede
// corregir a mano y elegir cuál de las dos tasas del BCV usa el negocio.
async function pintarTasas(caja) {
  const actual = await cargarTasas();
  const base = await baseBs();
  const tasas = leer('tasas') || {};
  const auto = actual && actual.fuente && actual.fuente.startsWith('bcv-');
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: 'Tasas de hoy' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: actual?.deHoy
        ? (auto
            ? `Puestas hoy solas con la tasa del ${actual.fuente === 'bcv-eur' ? 'euro' : 'dólar'} del BCV.`
            : `Puestas hoy por ${actual.nombreUsuario || 'ti'}.`)
        : actual
          ? `Las últimas son del ${actual.fecha}. Actualízalas para que los cobros salgan bien.`
          : 'Todavía no has puesto ninguna tasa. Sin esto solo se puede cobrar en dólares.',
    })
  );

  // Cuál de las dos tasas del BCV se usa para el bolívar.
  const selector = el('select', {}, Object.values(BASES_BS).map((b) =>
    el('option', { value: b.base, texto: b.nombre, ...(b.base === base.base ? { selected: '' } : {}) })));
  selector.onchange = async () => {
    try {
      await guardarBaseBs(selector.value);
      avisarOk('Listo. Mañana la tasa se actualiza sola con esa.');
    } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
  };
  caja.appendChild(el('div.campo', {}, [
    el('label', { texto: 'Tasa del BCV que usas para cobrar en bolívares' }),
    selector,
  ]));

  const entradas = {};
  const fijas = await tasasFijas();
  for (const m of Object.values(MONEDAS)) {
    if (m.codigo === 'USD') continue;
    entradas[m.codigo] = el('input', {
      inputmode: 'decimal',
      value: tasas[m.codigo] ? String(aMayores(tasas[m.codigo], m.codigo)).replace('.', ',') : '',
      placeholder: m.codigo === 'VES' ? '980,61' : '3240',
    });

    // Dejarla fija. El peso no se compra en una casa de cambio: el dueño vende
    // a la tasa que él decide, y esa es la de las etiquetas del estante. Sin
    // esto, cada mañana el automático escribía la del mercado encima y los
    // precios dejaban de ser los suyos.
    const idFija = `fija-${m.codigo}`;
    const casilla = el('input', {
      type: 'checkbox', id: idFija, style: 'width:20px;height:20px;accent-color:var(--marca)',
      ...(fijas[m.codigo] ? { checked: '' } : {}),
      onchange: async (ev) => {
        const valor = aMenores(entradas[m.codigo].value, m.codigo) || 0;
        if (ev.target.checked && !valor) {
          ev.target.checked = false;
          return avisarMal(`Escribe primero la tasa de ${m.nombre.toLowerCase()}.`);
        }
        try {
          await fijarTasa(m.codigo, ev.target.checked ? valor : 0);
          avisarOk(ev.target.checked
            ? `${m.nombre}: queda fija en ${formatear(valor, m.codigo)}`
            : `${m.nombre}: vuelve a actualizarse sola`);
        } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
      },
    });

    caja.appendChild(el('div.campo', {}, [
      el('label', { texto: `${m.nombre} por 1 dólar` }),
      entradas[m.codigo],
      el('label', {
        for: idFija,
        style: 'display:flex;align-items:center;gap:.5rem;margin-top:.4rem;cursor:pointer;font-weight:400',
      }, [
        casilla,
        el('span', { style: 'font-size:var(--t-cuerpo)', texto: 'Dejarla fija (no la actualices sola cada día)' }),
      ]),
    ]));
  }

  // Lo que dice el BCV ahora mismo, para comparar antes de guardar.
  const comparacion = el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie)' });

  caja.appendChild(el('div.fila', {}, [
    el('button.btn.plano', { texto: 'Consultar BCV', onclick: async () => {
      avisar('Consultando…');
      const s = await sugerirTasas();
      if (!s) return avisarMal('No se pudo consultar. Escríbelas a mano.');
      for (const codigo of ['VES', 'COP']) {
        if (s[codigo] && entradas[codigo]) {
          entradas[codigo].value = String(aMayores(s[codigo], codigo)).replace('.', ',');
        }
      }
      const partes = [];
      if (s.bcv?.EUR) partes.push(`euro ${formatear(s.bcv.EUR, 'VES')}`);
      if (s.bcv?.USD) partes.push(`dólar ${formatear(s.bcv.USD, 'VES')}`);
      comparacion.textContent = partes.length ? `BCV: ${partes.join(' · ')}` : '';
      avisarOk(s.base === base.base
        ? 'Tasa del BCV puesta. Revísala y guarda.'
        : `La del ${base.nombre.toLowerCase()} no respondió; se puso la otra. Revísala.`);
    } }),
    el('button.btn.principal', { texto: 'Guardar tasas', onclick: async () => {
      const datos = { fuente: 'manual' };
      for (const [codigo, entrada] of Object.entries(entradas)) {
        // `tasaAMenores` y no `aMenores`: una tasa en 0 no se puede usar para
        // convertir, así que vale más rechazarla que guardarla y descubrirlo
        // en mitad de un cobro.
        const tasa = tasaAMenores(entrada.value, codigo);
        if (entrada.value.trim() && !tasa) {
          return avisarMal(`La tasa de ${MONEDAS[codigo].nombre} no se entiende: "${entrada.value}"`);
        }
        datos[codigo] = tasa || 0;
      }
      try {
        await guardarTasas(datos);
        // Si esa moneda está fija, lo que acaba de escribir es la nueva fija:
        // si no, mañana volvería al valor viejo y parecería que no guardó.
        const yaFijas = await tasasFijas();
        for (const codigo of Object.keys(entradas)) {
          if (yaFijas[codigo] && datos[codigo] > 0) await fijarTasa(codigo, datos[codigo]);
        }
        avisarOk('Tasas guardadas');
        pintarTasas(caja);
      } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
    } }),
  ]));
  caja.appendChild(comparacion);
  caja.appendChild(el('p', {
    style: 'color:var(--texto-suave);font-size:var(--t-pie);margin-top:.6rem',
    texto: 'Cada venta guarda la tasa que se usó en ese momento. Cambiar la tasa de hoy no altera las ventas de ayer.',
  }));
}

// --- sinónimos que la app aprendió sola --------------------------------------
async function pintarSinonimos(caja) {
  let lista = [];
  try { lista = await pendientes(); } catch { lista = []; }
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: 'Sinónimos por aprobar' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'Cuando alguien busca algo con otro nombre y termina vendiendo un producto, la app lo anota aquí. Apruébalo y esa palabra queda para siempre.',
    })
  );
  if (!lista.length) return caja.appendChild(el('p', { style: 'color:var(--texto-suave)', texto: 'Nada pendiente por ahora.' }));

  for (const s of lista) {
    const fila = el('div', {
      style: 'display:flex;gap:.5rem;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--borde)',
    }, [
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { html: `¿<strong>"${esc(s.busqueda)}"</strong> es ${esc(s.nombreProducto)}?` }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: fecha(s.ts) }),
      ]),
      el('button.btn.plano', { style: 'min-height:38px', texto: 'No', 'aria-label': 'Descartar esta sugerencia', onclick: async () => { await descartar(s.id); fila.remove(); } }),
      el('button.btn.principal', { style: 'min-height:38px', texto: 'Sí', 'aria-label': 'Aprobar esta sugerencia', onclick: async () => {
        const p = catalogo().find((x) => x.id === s.productoId);
        await aprobar(s, p?.alias || []);
        avisarOk(`"${s.busqueda}" ahora encuentra ${s.nombreProducto}`);
        fila.remove();
      } }),
    ]);
    caja.appendChild(fila);
  }
}

// --- PIN de autorización -----------------------------------------------------
async function pintarPin(caja) {
  let tiene = false;
  try {
    const snap = await getDoc(ref('config', 'general'));
    tiene = !!snap.data()?.pinHash;
  } catch { /* nada */ }

  caja.innerHTML = '';
  const entrada = el('input', { type: 'password', inputmode: 'numeric', placeholder: tiene ? 'Cambiar PIN' : 'Ej: 1234' });
  pegar(caja, 
    el('h2', { texto: 'PIN de autorización' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: tiene
        ? 'Ya tienes PIN. Se pide cuando un empleado quiere vender por debajo del precio mínimo.'
        : 'Sin PIN, cualquiera puede bajar los precios todo lo que quiera. Ponle uno.',
    }),
    el('div.campo', {}, [entrada]),
    el('button.btn.principal', { texto: tiene ? 'Cambiar PIN' : 'Poner PIN', onclick: async () => {
      const pin = entrada.value.trim();
      if (pin.length < 4) return avisarMal('El PIN debe tener al menos 4 números.');
      if (pin.length < 6) avisar('Con 6 números en vez de 4 es 100 veces más difícil de adivinar.');
      try {
        // Sal nueva en cada cambio de PIN, y fuera de `config/` que es público.
        const sal = salNueva();
        await setDoc(ref('equipo', 'seguridad'), {
          pinHash: await hashPin(pin, sal), pinSal: sal, pinVueltas: VUELTAS,
        }, { merge: true });
        olvidarHash();
        entrada.value = '';
        avisarOk('PIN guardado');
        pintarPin(caja);
      } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
    } })
  );
}

// --- solicitudes de acceso ---------------------------------------------------
// Quien recibe el link se crea su cuenta solo, pero nace apagada. Aquí el dueño
// la enciende de un toque. Mientras esté apagada esa persona no ve ni un dato.
async function pintarSolicitudes(caja, alCambiar) {
  let lista = [];
  try {
    const snap = await getDocs(col('usuarios'));
    lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.rol !== 'dueno' && u.activo !== true);
  } catch { /* nada */ }

  caja.innerHTML = '';
  pegar(caja,
    el('h2', { texto: 'Dar acceso' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'Manda este link a tu mamá y a tu trabajador. Ellos crean su cuenta y aparecen aquí; hasta que les des acceso no ven nada.',
    }),
    el('div.fila', { style: 'margin-bottom:1rem' }, [
      el('input', { id: 'link-invitacion', readonly: '', value: linkDeRegistro() }),
      el('button.btn.principal', { style: 'flex:0 0 auto', texto: 'Compartir', onclick: compartirLink }),
    ])
  );

  if (!lista.length) {
    pegar(caja, el('p', { style: 'color:var(--texto-suave)', texto: 'No hay nadie esperando acceso.' }));
    return;
  }

  for (const u of lista) {
    const fila = el('div', {
      style: 'display:flex;gap:.5rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--borde)',
    }, [
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { style: 'font-weight:600', html: esc(u.nombre || '(sin nombre)') }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', html: esc(u.email || u.id) }),
      ]),
      el('button.btn.plano', { style: 'min-height:38px', texto: 'Rechazar', onclick: async () => {
        if (!await confirmar(`¿Rechazar a ${u.nombre}?`, {
          detalle: 'Se borra su solicitud. Puede volver a pedir acceso con el link.',
          aceptar: 'Rechazar', peligro: true,
        })) return;
        await deleteDoc(ref('usuarios', u.id));
        fila.remove();
      } }),
      el('button.btn.principal', { style: 'min-height:38px', texto: 'Dar acceso', onclick: async () => {
        await setDoc(ref('usuarios', u.id), { activo: true, rol: 'empleado' }, { merge: true });
        avisarOk(`${u.nombre} ya puede vender`);
        fila.remove();
        alCambiar?.();
      } }),
    ]);
    pegar(caja, fila);
  }
}

/** La dirección de la app + #/registro. Incluye la subcarpeta si la hay
 *  (en GitHub Pages la app vive en /mis-detallitos/, no en la raíz). */
function linkDeRegistro() {
  return location.href.split('#')[0] + '#/registro';
}

async function compartirLink() {
  const link = linkDeRegistro();
  const texto = `Te paso el acceso al sistema de Mis Detallitos 🖇️\n\n${link}\n\nAbre el link, crea tu cuenta con tu correo, y avísame para habilitarte.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Mis Detallitos', text: texto }); return; }
    await navigator.clipboard.writeText(texto);
    avisarOk('Link copiado: pégalo en WhatsApp');
  } catch (e) {
    if (e?.name !== 'AbortError') avisar('Copia el link a mano: ' + link);
  }
}

// --- usuarios ----------------------------------------------------------------
async function pintarUsuarios(caja) {
  let lista = [];
  try {
    const snap = await getDocs(col('usuarios'));
    lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { /* nada */ }

  caja.innerHTML = '';
  pegar(caja, el('h2', { texto: 'Usuarios' }));
  for (const u of lista.filter((x) => x.rol === 'dueno' || x.activo === true)) {
    caja.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--borde)',
    }, [
      el('div', {}, [
        el('div', { style: 'font-weight:600', html: esc(u.nombre || u.id) }),
        el('div', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: u.id }),
      ]),
      el('span', { class: `etiqueta ${u.rol === 'dueno' ? 'info' : 'ok'}`, texto: u.rol === 'dueno' ? 'Dueño' : 'Empleado' }),
    ]));
  }
  caja.appendChild(el('p', {
    style: 'color:var(--texto-suave);font-size:var(--t-pie);margin-top:.6rem',
    texto: 'Los usuarios se crean en la consola de Firebase (Authentication) y su rol se pone en el documento usuarios/{UID}. Ver docs/FIREBASE-SETUP.md.',
  }));
}

// --- datos -------------------------------------------------------------------
function pintarDatos(caja) {
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: 'Datos' }),

    // El respaldo va primero y es el único botón fuerte de la pantalla: es lo
    // que salva el inventario completo si se pierde la cuenta o alguien borra
    // una colección. El Excel de inventario NO sirve para eso — no lleva id,
    // ni los pesos, ni escalas, ni ventas, ni clientes.
    el('div.tarjeta', { style: 'margin-bottom:1rem' }, [
      el('p', {
        style: 'margin:0 0 .75rem;color:var(--texto-suave)',
        texto: 'Un archivo con todo: catálogo, ventas, cajas, clientes, deudas, '
             + 'movimientos y tasas. Guárdalo donde no dependa de este teléfono.',
      }),
      el('div.fila', {}, [
        el('button.btn.principal', { texto: 'Bajar respaldo completo', onclick: (ev) => bajarRespaldo(ev.target) }),
        el('button.btn.plano', { texto: 'Restaurar', onclick: () => pedirRestaurar(caja) }),
      ]),
    ]),

    // Si hubo una importación hace poco, se puede deshacer desde aquí aunque
    // se haya cerrado la app. Antes el botón vivía solo en la pantalla de
    // importar y se perdía al recargar.
    pintarDeshacerImportacion(caja),

    el('div.fila', {}, [
      el('button.btn.plano', { texto: 'Exportar inventario', onclick: async () => {
        const { exportarInventario } = await import('../reports/export-excel.js');
        exportarInventario(catalogo());
      } }),
      el('button.btn.plano', { texto: 'Limpiar caché local', onclick: async () => {
        if (!await confirmar('¿Limpiar el caché?', {
          detalle: 'No se borra nada del servidor. La app volverá a descargar el catálogo y las fotos.',
          aceptar: 'Limpiar',
        })) return;
        const { vaciar, ALMACENES } = await import('../data/idb.js');
        for (const a of Object.values(ALMACENES)) await vaciar(a);
        avisarOk('Caché limpio. Recarga la app.');
      } }),
      el('button.btn.plano', { texto: 'Rehacer catálogo público', onclick: async (ev) => {
        if (!await confirmar('¿Rehacer el catálogo público?', {
          detalle: 'Copia tus productos al catálogo que ven los clientes. No borra nada y los costos no se publican.',
          aceptar: 'Rehacer',
        })) return;
        const boton = ev.currentTarget;
        boton.disabled = true;
        try {
          const { reconstruirCatalogoPublico } = await import('../data/productos.js');
          const { escritos } = await reconstruirCatalogoPublico();
          avisarOk(`Catálogo público al día: ${escritos} ${escritos === 1 ? 'producto' : 'productos'}.`);
        } catch (e) {
          console.warn('[catalogo-publico]', e);
          avisarMal('No se pudo rehacer el catálogo público.');
        } finally {
          boton.disabled = false;
        }
      } }),
    ])
  );
}


// --- tema claro / oscuro -----------------------------------------------------
function pintarTema(caja) {
  const OPCIONES = [
    ['auto', 'Como el teléfono'],
    ['claro', 'Claro'],
    ['oscuro', 'Oscuro'],
  ];
  caja.innerHTML = '';
  const fila = el('div.chips-barra', { style: 'margin-top:.5rem' });

  const marcar = () => {
    const actual = temaGuardado();
    fila.querySelectorAll('.chip').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tema === actual));
    });
  };

  for (const [valor, rotulo] of OPCIONES) {
    fila.appendChild(el('button.chip', {
      type: 'button', 'data-tema': valor, texto: rotulo,
      onclick: () => { guardarTema(valor); marcar(); },
    }));
  }

  pegar(caja,
    el('h2', { texto: 'Aspecto' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'El oscuro cansa menos la vista de noche en el mostrador. De día, bajo el sol, se lee mejor el claro.',
    }),
    fila
  );
  marcar();
}

// --- catálogo digital y WhatsApp ----------------------------------------------
function pintarCatalogoConfig(caja) {
  const actualWa = leer('config_whatsapp') || '';
  const inputWa = el('input', {
    placeholder: 'Ej: 584141234567 (código país + número sin +)',
    value: actualWa,
  });

  const base = location.pathname.replace(/\/[^\/]*$/, '/');
  const urlCatalogo = `${location.origin}${base}catalogo.html`;

  const btnGuardar = el('button.btn.principal', {
    texto: 'Guardar WhatsApp',
    onclick: async () => {
      const val = inputWa.value.replace(/[^\d]/g, '');
      const { escribir } = await import('../core/estado.js');
      escribir('config_whatsapp', val);
      try {
        await setDoc(ref('config', 'whatsapp'), { numero: val, actualizado: new Date() });
      } catch (e) { console.warn(e); }
      avisarOk('Número de WhatsApp guardado');
    },
  });

  const btnCompartir = el('button.btn.exito', {
    texto: 'Copiar Enlace del Catálogo 📲',
    onclick: () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(urlCatalogo).then(() => {
          avisarOk('¡Enlace del catálogo copiado!');
        }).catch(() => {
          prompt('Copia este enlace para enviarlo por WhatsApp:', urlCatalogo);
        });
      } else {
        prompt('Copia este enlace para enviarlo por WhatsApp:', urlCatalogo);
      }
    },
  });

  caja.innerHTML = '';
  pegar(caja,
    el('h2', { texto: 'Catálogo Digital y Pedidos por WhatsApp' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'Tus clientes pueden ver tu catálogo en su teléfono y enviarte pedidos formateados a tu WhatsApp.',
    }),
    el('div.campo', {}, [
      el('label', { texto: 'Número de WhatsApp de la tienda (con código de país)' }),
      inputWa,
    ]),
    el('div.fila', {}, [
      btnGuardar,
      btnCompartir,
      el('button.btn.plano', {
        texto: 'Abrir Catálogo',
        onclick: () => window.open(urlCatalogo, '_blank'),
      }),
    ])
  );
}


// --- fondo blanco tipo estudio, con IA ---------------------------------------
//
// La llave de API se guarda en `secretos/ia` (solo el dueño la lee). La vista
// previa recorta UNA vez y recompone en el navegador cada vez que se mueve un
// deslizador: así se puede afinar el encuadre sin gastar fotos del plan.
async function pintarEstudioIA(caja) {
  const ajustes = { ...AJUSTES_DEF, ...(await cargarAjustes({ recargar: true })) };
  let prueba = null;   // { rehacer } de la última foto de prueba

  const prov = el('select', {}, Object.entries(PROVEEDORES).map(([id, p]) =>
    el('option', { value: id, texto: `${p.nombre} — ${p.costo}`, ...(id === ajustes.proveedor ? { selected: '' } : {}) })));

  const llave = el('input', {
    type: 'password', placeholder: ajustes.apiKey ? '•••••••• (ya guardada)' : 'Pega aquí la llave de API',
    autocomplete: 'off', spellcheck: 'false',
  });

  const encendido = el('input', { type: 'checkbox', ...(ajustes.activo ? { checked: '' } : {}) });

  const margen = el('input', { type: 'range', min: '0', max: '25', step: '1', value: String(ajustes.margen) });
  const sombra = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(ajustes.sombra) });
  const rotuloMargen = el('label', {});
  const rotuloSombra = el('label', {});

  const fondos = el('div.chips-barra', { style: 'margin:.25rem 0 .75rem' });
  for (const [id, f] of Object.entries(FONDOS)) {
    fondos.appendChild(el('button.chip', {
      type: 'button', 'data-fondo': id, texto: f.nombre,
      onclick: () => { ajustes.fondo = id; marcarFondos(); repintarPrueba(); },
    }));
  }
  const marcarFondos = () => fondos.querySelectorAll('.chip').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.fondo === ajustes.fondo)));

  const CAJA = 'aspect-ratio:1;display:grid;place-items:center;overflow:hidden;padding:0;font-size:var(--t-pie)';
  const antes = el('div.vacio', { style: CAJA, texto: 'Sin probar' });
  const despues = el('div.vacio', { style: CAJA, texto: 'Sin probar' });
  const columna = (rotulo, cuerpo) => el('div', {}, [
    el('div', { style: 'font-size:var(--t-pie);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--texto-suave);margin-bottom:.3rem', texto: rotulo }),
    cuerpo,
  ]);
  const visor = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin:.75rem 0' }, [
    columna('Antes', antes),
    columna('Así se guarda', despues),
  ]);

  const rotulos = () => {
    rotuloMargen.textContent = `Aire alrededor del producto: ${ajustes.margen}%`;
    rotuloSombra.textContent = ajustes.sombra ? `Sombra: ${ajustes.sombra}%` : 'Sin sombra';
  };
  rotulos();

  // Recomponer es local e instantáneo: no vuelve a llamar a la IA.
  async function repintarPrueba() {
    rotulos();
    if (!prueba) return;
    const datos = await prueba.rehacer(ajustes);
    despues.innerHTML = '';
    despues.appendChild(el('img', { src: datos, style: 'width:100%;height:100%;object-fit:contain' }));
  }

  margen.oninput = () => { ajustes.margen = Number(margen.value); repintarPrueba(); };
  sombra.oninput = () => { ajustes.sombra = Number(sombra.value); repintarPrueba(); };
  prov.onchange = () => { ajustes.proveedor = prov.value; };

  const entradaPrueba = el('input', {
    type: 'file', accept: 'image/*', hidden: '',
    onchange: async (ev) => {
      const archivo = ev.target.files[0];
      if (!archivo) return;
      const clave = llave.value.trim() || ajustes.apiKey;
      if (!clave) return avisarMal('Primero pega la llave de API.');

      antes.innerHTML = '';
      antes.appendChild(el('img', { src: URL.createObjectURL(archivo), style: 'width:100%;height:100%;object-fit:cover' }));
      despues.innerHTML = '<div class="cargando">Recortando…</div>';
      try {
        prueba = await probar(archivo, { ...ajustes, apiKey: clave });
        await repintarPrueba();
        avisarOk('Así quedarán todas tus fotos.');
      } catch (e) {
        prueba = null;
        despues.innerHTML = '';
        despues.appendChild(el('div', { style: 'color:var(--rojo);font-size:var(--t-pie);padding:.5rem', texto: e.message || 'Falló' }));
        avisarMal(e.message || 'No se pudo probar');
      }
      ev.target.value = '';
    },
  });

  caja.innerHTML = '';
  pegar(caja,
    el('h2', { texto: 'Fotos con fondo blanco (IA)' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
      texto: 'Recorta el producto y lo pone sobre fondo blanco, centrado y con sombra, como foto de catálogo. '
           + 'Se aplica solo al tomar la foto en el Estudio de Fotos. Si la IA falla o no hay internet, '
           + 'la foto se guarda con su fondo original: nunca se pierde el disparo.',
    }),

    el('label.interruptor', {}, [
      encendido,
      el('span', { texto: 'Usar IA al tomar fotos' }),
    ]),

    el('div.campo', {}, [el('label', { texto: 'Servicio' }), prov]),
    el('div.campo', {}, [
      el('label', { texto: 'Llave de API' }),
      llave,
      el('small', {
        style: 'color:var(--texto-suave)',
        texto: `Se saca en ${(PROVEEDORES[ajustes.proveedor] || PROVEEDORES.photoroom).donde}. `
             + 'Ponle un límite de gasto: la llave viaja al navegador del dueño.',
      }),
    ]),

    el('h3', { style: 'margin-top:1rem', texto: 'Cómo se ve el estudio' }),
    el('div.campo', {}, [rotuloMargen, margen]),
    el('div.campo', {}, [rotuloSombra, sombra]),
    el('label', { texto: 'Color del fondo' }),
    fondos,
    visor,
    entradaPrueba,

    el('div.fila', {}, [
      el('button.btn.plano', { texto: 'Probar con una foto', onclick: () => entradaPrueba.click() }),
      el('button.btn.principal', { texto: 'Guardar ajustes', onclick: async () => {
        const nuevos = {
          activo: encendido.checked,
          proveedor: prov.value,
          margen: Number(margen.value),
          sombra: Number(sombra.value),
          fondo: ajustes.fondo,
        };
        const escrita = llave.value.trim();
        if (escrita) nuevos.apiKey = escrita;
        if (nuevos.activo && !escrita && !ajustes.apiKey) {
          return avisarMal('Sin llave de API la IA no puede trabajar.');
        }
        try {
          await guardarAjustes(nuevos);
          llave.value = '';
          avisarOk(iaLista({ ...ajustes, ...nuevos, apiKey: nuevos.apiKey || ajustes.apiKey })
            ? 'Listo. Las próximas fotos saldrán con fondo blanco.'
            : 'Ajustes guardados. La IA está apagada.');
          pintarEstudioIA(caja);
        } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
      } }),
    ])
  );
  marcarFondos();
}

// --- respaldo -----------------------------------------------------------------

/** Baja el archivo, avisando por dónde va: con muchas ventas esto tarda. */
async function bajarRespaldo(boton) {
  const original = boton.textContent;
  boton.disabled = true;
  try {
    const { armarRespaldo, descargar } = await import('../data/respaldo.js');
    const { respaldo, fallaron } = await armarRespaldo({
      incluirFotos: false,
      alProgreso: (nombre, i, total) => { boton.textContent = `Leyendo ${nombre}… (${i + 1}/${total})`; },
    });
    boton.textContent = 'Guardando…';
    const bytes = descargar(respaldo);
    const kb = Math.round(bytes / 1024);
    if (fallaron.length) {
      avisarMal(`Respaldo bajado (${respaldo.documentos} documentos, ${kb} KB), pero NO se pudo leer: ${fallaron.join(', ')}.`);
    } else {
      avisarOk(`Respaldo bajado: ${respaldo.documentos} documentos, ${kb} KB.`);
    }
  } catch (e) {
    avisarMal('No se pudo armar el respaldo: ' + (e.message || e));
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}

/**
 * Restaurar: elegir archivo, VER qué trae, y recién ahí confirmar.
 *
 * El mismo camino que el importador de Excel, por la misma razón: nadie debe
 * escribir en la base sin haber visto antes qué va a entrar.
 */
function pedirRestaurar(caja) {
  const entrada = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  entrada.addEventListener('change', async () => {
    const file = entrada.files?.[0];
    if (!file) return;
    try {
      const { leerArchivo, validar, restaurar } = await import('../data/respaldo.js');
      const datos = await leerArchivo(file);
      const v = validar(datos);
      if (!v.ok) return avisarMal(v.error);

      const cuando = datos.fecha ? new Date(datos.fecha).toLocaleString('es-VE') : 'sin fecha';
      const detalle = v.resumen.map((r) => `${r.cuantos} ${r.nombre}`).join(', ');
      const ok = await confirmar('¿Restaurar este respaldo?', {
        detalle: `Del ${cuando}. Trae ${v.total} documentos: ${detalle}.\n\n`
               + 'No se borra nada: lo que coincida por id se sobrescribe con lo del archivo, '
               + 'y lo que no esté en él se queda como está.',
        aceptar: 'Sí, restaurar',
      });
      if (!ok) return;

      avisar('Restaurando… no cierres la app.');
      const r = await restaurar(datos, {
        alProgreso: (nombre, hechos, total) => { avisar(`Restaurando ${nombre}… ${hechos}/${total}`); },
      });
      const fallaron = Object.keys(r.rechazadas || {});
      if (fallaron.length) {
        // Decirlo claro: media restauración que se anuncia como completa es
        // justo el fallo que este botón venía a evitar.
        avisarMal(
          `Restauró ${r.escritos} de ${r.total}. Las reglas rechazaron: ${fallaron.join(', ')}. `
          + 'Eso es a propósito (el historial no se puede reescribir desde la app). '
          + 'Para reponerlo todo corre scripts/restaurar-respaldo.mjs desde la computadora.',
        );
      } else {
        avisarOk(`Listo: ${r.escritos} documentos restaurados. Recarga la app para verlos.`);
      }
      pintarDatos(caja);
    } catch (e) {
      avisarMal('No se pudo restaurar: ' + (e.message || e));
    } finally {
      entrada.value = '';
    }
  });
  entrada.click();
}

/** El botón de deshacer la última importación, si la hay y es reciente. */
function pintarDeshacerImportacion(caja) {
  let ultima = null;
  try {
    // import() es asíncrono y esto se pinta de una: se lee el mismo
    // localStorage, con la misma clave, sin cargar la pantalla de importar.
    const crudo = localStorage.getItem('detallitos:ultima-importacion');
    if (crudo) {
      const d = JSON.parse(crudo);
      if (d?.importId && Date.now() - (d.cuando || 0) <= 7 * 86400000) ultima = d;
    }
  } catch { /* almacenamiento bloqueado */ }
  if (!ultima) return null;

  const cuando = new Date(ultima.cuando).toLocaleString('es-VE');
  return el('div.tarjeta.amarilla', { style: 'margin-bottom:1rem' }, [
    el('p', { style: 'margin:0 0 .6rem', texto: `Última importación: ${ultima.cuantos} productos, el ${cuando}.` }),
    el('button.btn.plano', {
      texto: 'Deshacer esa importación',
      onclick: async () => {
        if (!await confirmar('¿Deshacer la importación?', {
          detalle: `Se borran los ${ultima.cuantos} productos que entraron el ${cuando}. `
                 + 'Lo que ya estaba antes no se toca.',
          aceptar: 'Sí, deshacer', peligro: true,
        })) return;
        try {
          avisar('Deshaciendo…');
          const { deshacerImportacion } = await import('../data/productos.js');
          const borrados = await deshacerImportacion(ultima.importId);
          const { olvidarImportacion } = await import('./importar-excel.js');
          olvidarImportacion();
          avisarOk(`Se deshizo: ${borrados} productos borrados`);
          pintarDatos(caja);
        } catch (e) {
          avisarMal('No se pudo deshacer: ' + (e.message || e));
        }
      },
    }),
  ]);
}
