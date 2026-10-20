// config.js — tasas del día, PIN, sinónimos por aprobar y usuarios.
// Todo esto es del dueño; el empleado ni ve el botón.

import { temaGuardado, guardarTema } from '../ui/tema.js';
import { registrar } from '../core/router.js';
import { el, esc, $, fecha, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { ref, col } from '../core/firebase.js';
import { setDoc, getDoc, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { cargarTasas, guardarTasas, sugerirTasas, hoyISO, baseBs, guardarBaseBs, BASES_BS } from '../data/tasas.js';
import { pendientes, aprobar, descartar } from '../data/sinonimos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { hashPin, olvidarHash, salNueva, VUELTAS } from '../ui/pin.js';
import { MONEDAS, aMenores, formatear, aMayores } from '../core/dinero.js';
import { leer } from '../core/estado.js';
import {
  cargarAjustes, guardarAjustes, probar, lista as iaLista,
  PROVEEDORES, FONDOS, AJUSTES_DEF,
} from '../data/estudio-ia.js';

registrar('config', {
  titulo: 'Configuración', icono: '⚙️', soloDueno: true,
  async montar(nodo) {
    nodo.innerHTML = `
      <div class="tarjeta" id="tasas"><div class="cargando">Cargando tasas…</div></div>
      <div class="tarjeta" id="sinonimos" style="margin-top:1rem"><div class="cargando">Cargando sinónimos…</div></div>
      <div class="tarjeta" id="pin" style="margin-top:1rem"></div>
      <div class="tarjeta" id="solicitudes" style="margin-top:1rem"><div class="cargando">Revisando solicitudes…</div></div>
      <div class="tarjeta" id="usuarios" style="margin-top:1rem"><div class="cargando">Cargando usuarios…</div></div>
      <div class="tarjeta" id="catalogo-config" style="margin-top:1rem"></div>
      <div class="tarjeta" id="estudio-ia" style="margin-top:1rem"></div>
      <div class="tarjeta" id="tema" style="margin-top:1rem"></div>
      <div class="tarjeta" id="datos" style="margin-top:1rem"></div>`;

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
      style: 'color:var(--texto-suave);font-size:.9rem',
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
  for (const m of Object.values(MONEDAS)) {
    if (m.codigo === 'USD') continue;
    entradas[m.codigo] = el('input', {
      inputmode: 'decimal',
      value: tasas[m.codigo] ? String(aMayores(tasas[m.codigo], m.codigo)).replace('.', ',') : '',
      placeholder: m.codigo === 'VES' ? '980,61' : '3240',
    });
    caja.appendChild(el('div.campo', {}, [
      el('label', { texto: `${m.nombre} por 1 dólar` }),
      entradas[m.codigo],
    ]));
  }

  // Lo que dice el BCV ahora mismo, para comparar antes de guardar.
  const comparacion = el('p', { style: 'color:var(--texto-suave);font-size:.82rem' });

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
        datos[codigo] = aMenores(entrada.value, codigo) || 0;
      }
      try {
        await guardarTasas(datos);
        avisarOk('Tasas guardadas');
        pintarTasas(caja);
      } catch (e) { avisarMal('No se pudo guardar: ' + (e.message || e)); }
    } }),
  ]));
  caja.appendChild(comparacion);
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
    el('h2', { texto: 'Sinónimos por aprobar' }),
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
      style: 'color:var(--texto-suave);font-size:.9rem',
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
      style: 'color:var(--texto-suave);font-size:.9rem',
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
        el('div', { style: 'font-size:.8rem;color:var(--texto-suave)', html: esc(u.email || u.id) }),
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
    el('h2', { texto: 'Datos' }),
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
      style: 'color:var(--texto-suave);font-size:.9rem',
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
      style: 'color:var(--texto-suave);font-size:.9rem',
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

  const CAJA = 'aspect-ratio:1;display:grid;place-items:center;overflow:hidden;padding:0;font-size:.8rem';
  const antes = el('div.vacio', { style: CAJA, texto: 'Sin probar' });
  const despues = el('div.vacio', { style: CAJA, texto: 'Sin probar' });
  const columna = (rotulo, cuerpo) => el('div', {}, [
    el('div', { style: 'font-size:.72rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--texto-suave);margin-bottom:.3rem', texto: rotulo }),
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
        despues.appendChild(el('div', { style: 'color:var(--rojo);font-size:.8rem;padding:.5rem', texto: e.message || 'Falló' }));
        avisarMal(e.message || 'No se pudo probar');
      }
      ev.target.value = '';
    },
  });

  caja.innerHTML = '';
  pegar(caja,
    el('h2', { texto: 'Fotos con fondo blanco (IA)' }),
    el('p', {
      style: 'color:var(--texto-suave);font-size:.9rem',
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
