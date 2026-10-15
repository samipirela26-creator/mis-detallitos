// app.js — arranque. Es el único script que carga index.html: todo lo demás
// entra por imports de módulos ES, así que el orden se resuelve solo.

import { iniciar as iniciarSesionVigilada, alCambiarSesion, cerrarSesion, usuarioActual, esDueno, enEspera } from './core/sesion.js';
import { iniciarRouter, registrar, pantallasDeMenu, ir } from './core/router.js';
import { observar, leer } from './core/estado.js';
import { montarEntrar, montarEnEspera } from './ui/pantalla-entrar.js';
import { el, esc, diaISO, pegar } from './ui/html.js';
import { sincronizarCatalogo, parar as pararCatalogo, productos as catalogo } from './data/catalogo.js';
import { cargarTasas, actualizarTasasAuto } from './data/tasas.js';
import { ventasEntre } from './data/ventas.js';
import { gastosEntre } from './data/gastos.js';
import { bajoMinimo } from './data/inventario.js';
import { resumen } from './reports/analisis.js';
import { formatear, MONEDAS } from './core/dinero.js';
import { invalidarIndice } from './data/busqueda.js';

// --- todas las pantallas se registran al importarlas ---
import './features/pos.js';
import './features/buscador.js';
import './features/productos-crud.js';
import './features/importar-excel.js';
import './features/estudio-fotos.js';
import './features/caja.js';
import './features/gastos.js';
import './features/mi-dinero.js';
import './features/clientes.js';
import './features/config.js';
import './features/catalogo-publico.js';
import './reports/panel.js';
import { icono } from './ui/iconos.js';
import { aplicarTema } from './ui/tema.js';

// Antes que nada: si no, se ve un fogonazo claro al abrir en modo oscuro.
aplicarTema();

// --- inicio del dueño --------------------------------------------------------
registrar('panel', {
  titulo: 'Panel', icono: '🏠', menu: true, soloDueno: true, orden: 10,
  async montar(nodo) {
    const productos = catalogo();
    const sinFoto = productos.filter((p) => !p.tieneFoto && p.tipo !== 'servicio').length;
    const incompletos = productos.filter((p) => !p.precioUSD || !p.costoUSD).length;
    const bajos = bajoMinimo(productos);
    const hayTasas = () => Object.values(leer('tasas') || {}).some((t) => t > 0);

    nodo.innerHTML = '';
    const kpis = el('div.kpis', {}, [
      kpi('Vendido hoy', '…'), kpi('Ganancia hoy', '…', 'bueno'),
      kpi('Por cobrar', '…', 'acento'), kpi('Productos', String(productos.length)),
    ]);
    nodo.appendChild(kpis);

    // Las cuentas del día, cuando lleguen (la pantalla no espera).
    const hoy = diaISO();
    Promise.all([ventasEntre(hoy, hoy), gastosEntre(hoy, hoy)])
      .then(([ventas, gastos]) => {
        const costos = Object.fromEntries(catalogo().map((p) => [p.id, p.costoUSD || 0]));
        const r = resumen(ventas, gastos, costos);
        kpis.innerHTML = '';
        pegar(kpis, 
          kpi('Vendido hoy', formatear(r.vendidoUSD)),
          kpi('Ganancia hoy', formatear(r.gananciaBrutaUSD), r.gananciaBrutaUSD >= 0 ? 'bueno' : 'malo'),
          kpi('Por cobrar', formatear(r.porCobrarUSD), r.porCobrarUSD ? 'acento' : ''),
          kpi('Ventas hoy', String(r.cantidad))
        );
      })
      .catch(() => {
        kpis.querySelectorAll('.valor').forEach((v) => { if (v.textContent === '…') v.textContent = '—'; });
      });

    // --- avisos que piden acción ---
    const avisos = el('div');
    if (!productos.length) {
      avisos.appendChild(tarjetaAccion('marca', 'Carga tu inventario',
        'Es lo primero y lo más pesado. Sube tu Excel como lo tengas: la app adivina las columnas, te deja ver una vista previa y se puede deshacer completo.',
        'Importar Excel', 'importar'));
    }
    // Las tasas llegan de Firestore unos instantes después de pintar el panel.
    // Si se decide aquí y ya, el aviso se queda pegado aunque sí estén puestas.
    const tarjetaTasas = tarjetaAccion('amarilla', 'Pon las tasas de hoy',
        'Sin la tasa del bolívar y del peso solo se puede cobrar en dólares.',
        'Poner tasas', 'config');
    avisos.appendChild(tarjetaTasas);

    if (sinFoto) {
      avisos.appendChild(tarjetaAccion('', `${sinFoto} productos sin foto`,
        'En el Estudio de Fotos se hace de corrido: disparas y salta solo al siguiente.',
        'Ir al Estudio', 'fotos'));
    }
    if (incompletos) {
      avisos.appendChild(tarjetaAccion('', `${incompletos} sin precio o sin costo`,
        'Sin costo no se puede saber cuánto estás ganando con ese producto.',
        'Completarlos', 'inventario'));
    }
    if (bajos.length) {
      avisos.appendChild(tarjetaAccion('', `${bajos.length} productos por acabarse`,
        bajos.slice(0, 4).map((p) => p.nombre).join(', ') + (bajos.length > 4 ? '…' : ''),
        'Ver inventario', 'inventario'));
    }
    const seccionPendiente = el('div.seccion', {}, [el('h2', { texto: 'Pendiente' })]);
    nodo.appendChild(seccionPendiente);
    nodo.appendChild(avisos);

    // La tarjeta de las tasas (y con ella toda la sección) aparece o desaparece
    // sola cuando llegan las tasas, que cargan después de pintar el panel.
    const dejarDeMirarTasas = observar('tasas', () => {
      tarjetaTasas.style.display = hayTasas() ? 'none' : '';
      const algoQueHacer = [...avisos.children].some((c) => c.style.display !== 'none');
      seccionPendiente.style.display = algoQueHacer ? '' : 'none';
      avisos.style.display = algoQueHacer ? '' : 'none';
    });

    // --- atajos ---
    nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Atajos' })]));
    nodo.appendChild(el('div.atajos-grid', {}, [
      atajo('chart', 'Reportes', 'Ganancia por producto y margen flojo.', 'reportes'),
      atajo('handshake', 'Deudas', 'Cuentas pendientes por cobrar.', 'clientes'),
      atajo('wallet', 'Mi dinero', 'Cuánto gané y cuánto puedo sacar.', 'mi-dinero'),
      atajo('expense', 'Gastos', 'Salidas de caja por categoría.', 'gastos-dueno'),
      atajo('cash', 'Caja', 'Abrir turno, reporte X y cierre Z.', 'caja-dueno'),
      atajo('settings', 'Configuración', 'Tasas del día, PIN y sinónimos.', 'config'),
    ]));

    return dejarDeMirarTasas;
  },
});

function kpi(rotulo, valor, clase = '') {
  return el(`div.kpi${clase ? '.' + clase : ''}`, {}, [
    el('div.rotulo', { texto: rotulo }),
    el('div.valor', { texto: valor }),
  ]);
}

function tarjetaAccion(clase, titulo, texto, boton, destino) {
  return el(`div.tarjeta${clase ? '.' + clase : ''}`, { style: 'margin-bottom:.85rem' }, [
    el('h2', { texto: titulo }),
    el('p', { style: 'font-size:.92rem', texto }),
    el('button.btn.principal', { texto: boton, onclick: () => ir(destino) }),
  ]);
}

function atajo(iconoNombre, titulo, texto, destino) {
  return el('div.atajo-card', { onclick: () => ir(destino) }, [
    el('div.ico-wrap', { html: icono(iconoNombre) }),
    el('h2', { texto: titulo }),
    el('p', { texto }),
  ]);
}

// --- cáscara -----------------------------------------------------------------
const app = document.getElementById('app');
let dejarDeMirarTasas = null;

function pintarCascara() {
  const u = usuarioActual();
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  // La chapita de las tasas se crea vacía y se llena sola cuando lleguen.
  // Antes se pintaba de una, y como las tasas cargan después del login, no
  // aparecía nunca.
  const chapitaTasas = el('div.tasas-badge', { style: 'display:none' });

  app.innerHTML = '';
  const nav = el('nav.nav', { id: 'nav' });
  const contenido = el('main', { id: 'contenido' });
  pegar(app, 
    el('div.sin-conexion', { texto: 'Sin conexión — puedes seguir trabajando, se sube solo' }),
    el('header.barra', {}, [
      el('div', { class: 'crece' }, [
        el('div', { style: 'color:var(--texto-suave);font-size:.82rem;font-weight:500', texto: `${saludo},` }),
        el('div.saludo', { html: esc(u.nombre) }),
      ]),
      chapitaTasas,
      el('button.btn.plano', { style: 'min-height:36px;padding:0 .85rem;font-size:.82rem', texto: 'Salir', onclick: () => cerrarSesion() }),
      // El logo entra a Configuración. Va en un <button> de verdad, no un
      // onclick sobre el <img>: así se llega con el tabulador y el lector de
      // pantalla lo anuncia. Sólo para el dueño, que es quien tiene esa
      // pantalla; al empleado le queda el logo como adorno.
      esDueno()
        ? el('button.logo-boton', {
            type: 'button', 'aria-label': 'Ajustes',
            onclick: () => ir('config'),
          }, [
            el('img.logo-barra', { src: 'icons/logo-256.webp', width: '40', height: '40', alt: '' }),
          ])
        : el('img.logo-barra', { src: 'icons/logo-256.webp', width: '40', height: '40', alt: 'Mis Detallitos G&M C.A' }),
    ]),
    nav,
    contenido
  );

  // Las tasas se guardan en unidades menores (36,50 Bs/$ se guarda como 3650),
  // así que hay que formatearlas o la chapita diría "VES: 3650".
  dejarDeMirarTasas?.();
  dejarDeMirarTasas = observar('tasas', (t) => {
    const texto = Object.entries(t || {})
      .filter(([m, valor]) => m !== 'USD' && MONEDAS[m] && valor > 0)
      .map(([m, valor]) => `${m}: <span>${formatear(valor, m, { simbolo: false })}</span>`)
      .join('  ·  ');
    chapitaTasas.innerHTML = texto ? `💱 ${texto}` : '';
    chapitaTasas.style.display = texto ? '' : 'none';
  });

  for (const p of pantallasDeMenu()) {
    const b = el('button', {
      'data-id': p.id,
      class: p.id === 'vender' ? 'destacado' : '',
      onclick: () => ir(p.id),
    }, [
      el('span.ico', { html: icono(p.icono || p.id) }),
      el('span', { texto: p.titulo }),
    ]);
    nav.appendChild(b);
  }

  document.addEventListener('pantalla-cambiada', (ev) => {
    nav.querySelectorAll('button').forEach((b) => {
      if (b.dataset.id === ev.detail.id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  });

  iniciarRouter(contenido);
}

function esRutaPublica() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0];
  return hash === 'catalogo';
}

alCambiarSesion(async (u) => {
  if (esRutaPublica()) {
    location.href = 'catalogo.html';
    return;
  }
  if (!u) {
    pararCatalogo();
    app.innerHTML = '';
    montarEntrar(app);
    return;
  }
  // Se registró con el link pero el dueño todavía no lo habilitó: no ve nada.
  if (enEspera()) {
    pararCatalogo();
    montarEnEspera(app, u, () => cerrarSesion());
    return;
  }
  pintarCascara();
  sincronizarCatalogo();
  // Primero lo que haya guardado (es instantáneo) y después, si hoy nadie puso
  // la tasa, se trae sola la del BCV.
  cargarTasas().then(() => actualizarTasasAuto());
});

addEventListener('hashchange', () => {
  const u = usuarioActual();
  if (esRutaPublica()) {
    location.href = 'catalogo.html';
  } else if (!u) {
    if (location.hash !== '#/entrar') {
      pararCatalogo();
      app.innerHTML = '';
      montarEntrar(app);
    }
  } else {
    if (!document.querySelector('.nav')) {
      pintarCascara();
    }
  }
});

// El índice de búsqueda se rearma cuando cambia el catálogo.
observar('productos', () => invalidarIndice(), { inmediato: false });

observar('conexion', (hay) => {
  document.body.classList.toggle('offline', !hay);
});

// Lo que quedó por subir: aviso discreto, nada de alarmas.
observar('pendientes', (n) => {
  if (n > 0) console.info(`[app] ${n} escritura(s) esperando señal para subir`);
}, { inmediato: false });

// --- service worker ---
const puedeSW = 'serviceWorker' in navigator
  && (location.protocol === 'https:' || location.hostname === 'localhost');
// Registrarlo no basta: sin esto, en un teléfono con la app instalada los
// cambios tardaban días en verse. Dos razones, y las dos hay que atacarlas.
//
//  1. El navegador sólo busca una versión nueva del service worker cuando
//     NAVEGAS. Una PWA abierta desde el icono casi nunca navega: se queda
//     meses con el mismo archivo. Por eso se le pide update() a mano cada vez
//     que la app vuelve al frente.
//  2. Aunque el worker nuevo tome el control (hace skipWaiting), la pantalla
//     que ya está abierta sigue con el HTML, el CSS y el JS viejos en memoria.
//     Hay que recargar.
//
// La recarga se hace cuando la app se va al fondo, NUNCA mientras se mira:
// esto es una caja registradora y recargar en medio de una venta se lleva el
// carrito por delante. Al volver, ya está la versión nueva puesta.
if (puedeSW) {
  let hayVersionNueva = false;

  addEventListener('load', async () => {
    let registro;
    try {
      registro = await navigator.serviceWorker.register('service-worker.js');
    } catch (e) {
      return console.warn('[sw]', e);
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      hayVersionNueva = true;
      console.info('[sw] versión nueva lista; se aplica al volver a abrir');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registro.update().catch(() => {});  // sin red, da igual: se reintenta
      } else if (hayVersionNueva) {
        hayVersionNueva = false;
        location.reload();
      }
    });
  });
}

iniciarSesionVigilada().then((u) => {
  console.info('[app] sesión lista:', u ? `${u.nombre} (${u.rol})` : 'sin sesión');
});
