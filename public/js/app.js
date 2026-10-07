// app.js — arranque. Es el único script que carga index.html: todo lo demás
// entra por imports de módulos ES, así que el orden se resuelve solo.

import { iniciar as iniciarSesionVigilada, alCambiarSesion, cerrarSesion, usuarioActual, esDueno, enEspera } from './core/sesion.js';
import { iniciarRouter, registrar, pantallasDeMenu, ir } from './core/router.js';
import { observar, leer } from './core/estado.js';
import { montarEntrar, montarEnEspera } from './ui/pantalla-entrar.js';
import { el, esc, diaISO, pegar } from './ui/html.js';
import { sincronizarCatalogo, parar as pararCatalogo, productos as catalogo } from './data/catalogo.js';
import { cargarTasas } from './data/tasas.js';
import { ventasEntre } from './data/ventas.js';
import { gastosEntre } from './data/gastos.js';
import { bajoMinimo } from './data/inventario.js';
import { resumen } from './reports/analisis.js';
import { formatear } from './core/dinero.js';
import { invalidarIndice } from './data/busqueda.js';

// --- todas las pantallas se registran al importarlas ---
import './features/pos.js';
import './features/buscador.js';
import './features/productos-crud.js';
import './features/importar-excel.js';
import './features/estudio-fotos.js';
import './features/caja.js';
import './features/gastos.js';
import './features/clientes.js';
import './features/config.js';
import './reports/panel.js';
import { icono } from './ui/iconos.js';

// --- inicio del dueño --------------------------------------------------------
registrar('panel', {
  titulo: 'Panel', icono: '🏠', menu: true, soloDueno: true, orden: 10,
  async montar(nodo) {
    const productos = catalogo();
    const sinFoto = productos.filter((p) => !p.tieneFoto && p.tipo !== 'servicio').length;
    const incompletos = productos.filter((p) => !p.precioUSD || !p.costoUSD).length;
    const bajos = bajoMinimo(productos);
    const hayTasas = Object.keys(leer('tasas') || {}).length > 0;

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
      avisos.appendChild(tarjetaAccion('marca', '📥 Carga tu inventario',
        'Es lo primero y lo más pesado. Sube tu Excel como lo tengas: la app adivina las columnas, te deja ver una vista previa y se puede deshacer completo.',
        'Importar Excel', 'importar'));
    }
    if (!hayTasas) {
      avisos.appendChild(tarjetaAccion('amarilla', '💱 Pon las tasas de hoy',
        'Sin la tasa del bolívar y del peso solo se puede cobrar en dólares.',
        'Poner tasas', 'config'));
    }
    if (sinFoto) {
      avisos.appendChild(tarjetaAccion('', `📷 ${sinFoto} productos sin foto`,
        'En el Estudio de Fotos se hace de corrido: disparas y salta solo al siguiente.',
        'Ir al Estudio', 'fotos'));
    }
    if (incompletos) {
      avisos.appendChild(tarjetaAccion('', `✏️ ${incompletos} sin precio o sin costo`,
        'Sin costo no se puede saber cuánto estás ganando con ese producto.',
        'Completarlos', 'inventario'));
    }
    if (bajos.length) {
      avisos.appendChild(tarjetaAccion('', `📦 ${bajos.length} productos por acabarse`,
        bajos.slice(0, 4).map((p) => p.nombre).join(', ') + (bajos.length > 4 ? '…' : ''),
        'Ver inventario', 'inventario'));
    }
    if (avisos.children.length) {
      nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Pendiente' })]));
      nodo.appendChild(avisos);
    }

    // --- atajos ---
    nodo.appendChild(el('div.seccion', {}, [el('h2', { texto: 'Atajos' })]));
    nodo.appendChild(el('div.carrusel', {}, [
      atajo('chart', 'Reportes', 'Ganancia por producto, margen flojo y quién vendió más.', 'reportes'),
      atajo('handshake', 'Deudas', 'Quién te debe y cuánto.', 'clientes'),
      atajo('expense', 'Gastos', 'Lo que sale, por categoría.', 'gastos-dueno'),
      atajo('cash', 'Caja', 'Abrir turno, reporte X y cierre Z.', 'caja-dueno'),
      atajo('settings', 'Configuración', 'Tasas, PIN y sinónimos por aprobar.', 'config'),
    ]));
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
  return el('div.tarjeta', { style: 'cursor:pointer', onclick: () => ir(destino) }, [
    el('div', { style: 'color:var(--marca);margin-bottom:.3rem', html: icono(iconoNombre) }),
    el('h2', { texto: titulo }),
    el('p', { style: 'font-size:.88rem;color:var(--texto-suave);margin:0', texto }),
  ]);
}

// --- cáscara -----------------------------------------------------------------
const app = document.getElementById('app');

function pintarCascara() {
  const u = usuarioActual();
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  app.innerHTML = '';
  const nav = el('nav.nav', { id: 'nav' });
  const contenido = el('main', { id: 'contenido' });
  pegar(app, 
    el('div.sin-conexion', { texto: 'Sin conexión — puedes seguir trabajando, se sube solo' }),
    el('header.barra', {}, [
      el('div', { class: 'crece' }, [
        el('div', { style: 'color:var(--texto-suave);font-size:.88rem;font-weight:500', texto: `${saludo},` }),
        el('div.saludo', { html: esc(u.nombre) }),
      ]),
      el('button.btn.plano', { style: 'min-height:38px;padding:0 .9rem;font-size:.88rem', texto: 'Salir', onclick: () => cerrarSesion() }),
      el('img.logo-barra', { src: 'icons/logo-256.webp', width: '44', height: '44', alt: 'Mis Detallitos G&M C.A' }),
    ]),
    nav,
    contenido
  );

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

alCambiarSesion(async (u) => {
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
  cargarTasas();
});

// El índice de búsqueda se rearma cuando cambia el catálogo.
observar('productos', () => invalidarIndice(), { inmediato: false });

observar('conexion', (hay) => {
  document.body.classList.toggle('offline', !hay);
});

// Ventas que quedaron por subir: aviso discreto, nada de alarmas.
observar('pendientes', (n) => {
  if (n > 0) console.info(`[app] ${n} venta(s) esperando señal para subir`);
}, { inmediato: false });

// --- service worker ---
const puedeSW = 'serviceWorker' in navigator
  && (location.protocol === 'https:' || location.hostname === 'localhost');
if (puedeSW) {
  addEventListener('load', () => {
    navigator.serviceWorker?.register('service-worker.js').catch((e) => console.warn('[sw]', e));
  });
}

iniciarSesionVigilada().then((u) => {
  console.info('[app] sesión lista:', u ? `${u.nombre} (${u.rol})` : 'sin sesión');
});
