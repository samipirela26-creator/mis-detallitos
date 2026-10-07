// app.js — arranque. Es el ÚNICO script que index.html carga: todo lo demás
// entra por imports de módulos ES, así que el orden se resuelve solo (al
// contrario de AsistApp, que usa scripts clásicos y sí depende del orden).

import { iniciar as iniciarSesionVigilada, alCambiarSesion, cerrarSesion, usuarioActual, esDueno } from './core/sesion.js';
import { iniciarRouter, registrar, pantallasDeMenu, ir } from './core/router.js';
import { observar } from './core/estado.js';
import { montarEntrar } from './ui/pantalla-entrar.js';
import { registrarPendientes } from './features/pendientes.js';

// --- pantalla de inicio del dueño (provisional hasta la Fase 5) ---
registrar('panel', {
  titulo: 'Panel', icono: '🏠', menu: true, soloDueno: true, orden: 10,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="rotulo">Vendido hoy</div><div class="valor">—</div></div>
        <div class="kpi bueno"><div class="rotulo">Ganancia hoy</div><div class="valor">—</div></div>
        <div class="kpi acento"><div class="rotulo">Por cobrar</div><div class="valor">—</div></div>
        <div class="kpi"><div class="rotulo">Productos</div><div class="valor">0</div></div>
      </div>

      <div class="seccion"><h2>Lo primero</h2></div>
      <div class="tarjeta marca">
        <h2>Cargar el inventario</h2>
        <p>Es el cuello de botella del proyecto. El orden es: importar el Excel
           como lo tengas, y después ponerle las fotos de corrido.</p>
        <div class="fila">
          <button class="btn principal" data-ir="importar">📥 Importar Excel</button>
          <button class="btn plano" data-ir="fotos">📷 Estudio de fotos</button>
        </div>
      </div>

      <div class="seccion"><h2>Atajos</h2></div>
      <div class="carrusel">
        <div class="tarjeta amarilla">
          <h2>Tasas del día</h2>
          <p style="font-size:.9rem">Bolívares y pesos, para que los cobros salgan bien.</p>
          <span class="etiqueta acento">Fase 6</span>
        </div>
        <div class="tarjeta">
          <h2>Margen bajo</h2>
          <p style="font-size:.9rem">Los productos a los que les estás ganando poco.</p>
          <span class="etiqueta info">Fase 5</span>
        </div>
        <div class="tarjeta">
          <h2>Quién vendió más</h2>
          <p style="font-size:.9rem">Ranking entre tú, tu mamá y tu primo.</p>
          <span class="etiqueta info">Fase 5</span>
        </div>
      </div>`;
    nodo.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
  },
});
registrarPendientes();

// --- cáscara ---
const app = document.getElementById('app');

function pintarCascara() {
  const u = usuarioActual();
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  app.innerHTML = `
    <div class="sin-conexion">Sin conexión — puedes seguir trabajando, se sube solo</div>
    <header class="barra">
      <div class="crece">
        <div style="color:var(--texto-suave);font-size:.9rem">${saludo},</div>
        <div class="saludo">${u.nombre}</div>
      </div>
      <button class="btn plano" id="salir" style="min-height:40px;padding:0 1rem">Salir</button>
      <img class="logo-barra" src="/icons/logo-256.webp" width="46" height="46"
           alt="Mis Detallitos G&amp;M C.A">
    </header>
    <nav class="nav" id="nav"></nav>
    <main id="contenido"></main>`;

  const nav = app.querySelector('#nav');
  for (const p of pantallasDeMenu()) {
    const b = document.createElement('button');
    b.dataset.id = p.id;
    if (p.id === 'vender') b.classList.add('destacado');
    b.innerHTML = `<span class="ico">${p.icono || '•'}</span><span>${p.titulo}</span>`;
    b.onclick = () => ir(p.id);
    nav.appendChild(b);
  }
  app.querySelector('#salir').onclick = () => cerrarSesion();

  document.addEventListener('pantalla-cambiada', (ev) => {
    nav.querySelectorAll('button').forEach((b) => {
      if (b.dataset.id === ev.detail.id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  });

  iniciarRouter(app.querySelector('#contenido'));
}

alCambiarSesion((u) => {
  if (u) pintarCascara();
  else { app.innerHTML = ''; montarEntrar(app); }
});

observar('conexion', (hay) => {
  document.body.classList.toggle('offline', !hay);
}, { inmediato: true });

// --- service worker ---
const puedeSW = 'serviceWorker' in navigator
  && (location.protocol === 'https:' || location.hostname === 'localhost');
if (puedeSW) {
  addEventListener('load', () => {
    navigator.serviceWorker?.register('/service-worker.js').catch((e) => console.warn('[sw]', e));
  });
}

iniciarSesionVigilada().then((u) => {
  console.info('[app] sesión lista:', u ? `${u.nombre} (${u.rol})` : 'sin sesión');
});
