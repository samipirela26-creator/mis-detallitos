// config.js — tasas del día, PIN, sinónimos por aprobar y usuarios.
// Todo esto es del dueño; el empleado ni ve el botón.

import { registrar } from '../core/router.js';
import { el, esc, $, fecha, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { ref, col } from '../core/firebase.js';
import { setDoc, getDoc, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { cargarTasas, guardarTasas, sugerirTasas, hoyISO } from '../data/tasas.js';
import { pendientes, aprobar, descartar } from '../data/sinonimos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { hashPin, olvidarHash } from '../ui/pin.js';
import { MONEDAS, aMenores, formatear, aMayores } from '../core/dinero.js';
import { leer } from '../core/estado.js';

registrar('config', {
  titulo: 'Configuración', icono: '⚙️', soloDueno: true,
  async montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta" id="tasas"><div class="cargando">Cargando tasas…</div></div>
      <div class="tarjeta" id="sinonimos" style="margin-top:1rem"><div class="cargando">Cargando sinónimos…</div></div>
      <div class="tarjeta" id="pin" style="margin-top:1rem"></div>
      <div class="tarjeta" id="solicitudes" style="margin-top:1rem"><div class="cargando">Revisando solicitudes…</div></div>
      <div class="tarjeta" id="usuarios" style="margin-top:1rem"><div class="cargando">Cargando usuarios…</div></div>
      <div class="tarjeta" id="datos" style="margin-top:1rem"></div>`;

    pintarTasas($('#tasas', nodo));
    pintarSinonimos($('#sinonimos', nodo));
    pintarPin($('#pin', nodo));
    pintarSolicitudes($('#solicitudes', nodo), () => pintarUsuarios($('#usuarios', nodo)));
    pintarUsuarios($('#usuarios', nodo));
    pintarDatos($('#datos', nodo));
  },
});

// --- tasas del día -----------------------------------------------------------
async function pintarTasas(caja) {
  const actual = await cargarTasas();
  const tasas = leer('tasas') || {};
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: '💱 Tasas de hoy' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:.9rem',
      texto: actual?.deHoy
        ? `Puestas hoy por ${actual.nombreUsuario || 'ti'}.`
        : actual
          ? `⚠️ Las últimas son del ${actual.fecha}. Actualízalas para que los cobros salgan bien.`
          : '⚠️ Todavía no has puesto ninguna tasa. Sin esto solo se puede cobrar en dólares.',
    })
  );

  const entradas = {};
  for (const m of Object.values(MONEDAS)) {
    if (m.codigo === 'USD') continue;
    entradas[m.codigo] = el('input', {
      inputmode: 'decimal',
      value: tasas[m.codigo] ? String(aMayores(tasas[m.codigo], m.codigo)).replace('.', ',') : '',
      placeholder: m.codigo === 'VES' ? '36,50' : '4100',
    });
    caja.appendChild(el('div.campo', {}, [
      el('label', { texto: `${m.nombre} por 1 dólar` }),
      entradas[m.codigo],
    ]));
  }

  caja.appendChild(el('div.fila', {}, [
    el('button.btn.plano', { texto: '🔄 Sugerir', onclick: async () => {
      avisar('Consultando…');
      const s = await sugerirTasas();
      if (!s) return avisarMal('No se pudo consultar. Escríbelas a mano.');
      for (const [codigo, valor] of Object.entries(s)) {
        if (entradas[codigo]) entradas[codigo].value = String(aMayores(valor, codigo)).replace('.', ',');
      }
      avisarOk('Sugerencia puesta. Revísala y guarda.');
    } }),
    el('button.btn.principal', { texto: 'Guardar tasas', onclick: async () => {
      const datos = { fuente: 'manual' };
      for (const [codigo, entrada] of Object.entries(entradas)) {
        datos[codigo] = aMenores(entrada.value, codigo) || 0;
      }
      try {
        await guardarTasas(datos);
        avisarOk('Tasas guardadas');
        pintarTasas(caja);
      } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
    } }),
  ]));
  caja.appendChild(el('p', {
    style: 'color:var(--texto-suave);font-size:.82rem;margin-top:.6rem',
    texto: 'Cada venta guarda la tasa que se usó en ese momento. Cambiar la tasa de hoy no altera las ventas de ayer.',
  }));
}

// --- sinónimos que la app aprendió sola --------------------------------------
async function pintarSinonimos(caja) {
  let lista = [];
  try { lista = await pendientes(); } catch { lista = []; }
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: '🧠 Sinónimos por aprobar' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:.9rem',
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
        el('div', { style: 'font-size:.78rem;color:var(--texto-suave)', texto: fecha(s.ts) }),
      ]),
      el('button.btn.plano', { style: 'min-height:38px', texto: '✕', onclick: async () => { await descartar(s.id); fila.remove(); } }),
      el('button.btn.principal', { style: 'min-height:38px', texto: '✓', onclick: async () => {
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
    el('h2', { texto: '🔐 PIN de autorización' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:.9rem',
      texto: tiene
        ? 'Ya tienes PIN. Se pide cuando un empleado quiere vender por debajo del precio mínimo.'
        : 'Sin PIN, cualquiera puede bajar los precios todo lo que quiera. Ponle uno.',
    }),
    el('div.campo', {}, [entrada]),
    el('button.btn.principal', { texto: tiene ? 'Cambiar PIN' : 'Poner PIN', onclick: async () => {
      const pin = entrada.value.trim();
      if (pin.length < 4) return avisarMal('El PIN debe tener al menos 4 números.');
      try {
        await setDoc(ref('config', 'general'), { pinHash: await hashPin(pin) }, { merge: true });
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
    el('h2', { texto: '🔑 Dar acceso' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:.9rem',
      texto: 'Manda este link a tu mamá y a tu trabajador. Ellos crean su cuenta y aparecen aquí; hasta que les des acceso no ven nada.',
    }),
    el('div.fila', { style: 'margin-bottom:1rem' }, [
      el('input', { id: 'link-invitacion', readonly: '', value: linkDeRegistro() }),
      el('button.btn.principal', { style: 'flex:0 0 auto', texto: '📤 Compartir', onclick: compartirLink }),
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
        el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: esc(u.email || u.id) }),
      ]),
      el('button.btn.plano', { style: 'min-height:38px', texto: '✕', onclick: async () => {
        if (!await confirmar(`¿Rechazar a ${u.nombre}?`, {
          detalle: 'Se borra su solicitud. Puede volver a pedir acceso con el link.',
          aceptar: 'Rechazar', peligro: true,
        })) return;
        await deleteDoc(ref('usuarios', u.id));
        fila.remove();
      } }),
      el('button.btn.principal', { style: 'min-height:38px', texto: '✓ Dar acceso', onclick: async () => {
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
  pegar(caja, el('h2', { texto: '👥 Usuarios' }));
  for (const u of lista.filter((x) => x.rol === 'dueno' || x.activo === true)) {
    caja.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--borde)',
    }, [
      el('div', {}, [
        el('div', { style: 'font-weight:600', html: esc(u.nombre || u.id) }),
        el('div', { style: 'font-size:.78rem;color:var(--texto-suave)', texto: u.id }),
      ]),
      el('span', { class: `etiqueta ${u.rol === 'dueno' ? 'info' : 'ok'}`, texto: u.rol === 'dueno' ? 'Dueño' : 'Empleado' }),
    ]));
  }
  caja.appendChild(el('p', {
    style: 'color:var(--texto-suave);font-size:.85rem;margin-top:.6rem',
    texto: 'Los usuarios se crean en la consola de Firebase (Authentication) y su rol se pone en el documento usuarios/{UID}. Ver docs/FIREBASE-SETUP.md.',
  }));
}

// --- datos -------------------------------------------------------------------
function pintarDatos(caja) {
  caja.innerHTML = '';
  pegar(caja, 
    el('h2', { texto: '💾 Datos' }),
    el('div.fila', {}, [
      el('button.btn.plano', { texto: '📤 Exportar inventario', onclick: async () => {
        const { exportarInventario } = await import('../reports/export-excel.js');
        exportarInventario(catalogo());
      } }),
      el('button.btn.plano', { texto: '🧹 Limpiar caché local', onclick: async () => {
        if (!await confirmar('¿Limpiar el caché?', {
          detalle: 'No se borra nada del servidor. La app volverá a descargar el catálogo y las fotos.',
          aceptar: 'Limpiar',
        })) return;
        const { vaciar, ALMACENES } = await import('../data/idb.js');
        for (const a of Object.values(ALMACENES)) await vaciar(a);
        avisarOk('Caché limpio. Recarga la app.');
      } }),
    ])
  );
}
