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
  titulo: 'Panel', icono: '🏠', menu: true, soloDueno: true,
  montar(nodo) {
    const u = usuarioActual();
    nodo.innerHTML = `
      <h1>Hola, ${u?.nombre || ''}</h1>
      <div class="kpis" style="margin:1rem 0">
        <div class="kpi"><div class="rotulo">Vendido hoy</div><div class="valor">—</div></div>
        <div class="kpi bueno"><div class="rotulo">Ganancia hoy</div><div class="valor">—</div></div>
        <div class="kpi"><div class="rotulo">Por cobrar</div><div class="valor">—</div></div>
        <div class="kpi"><div class="rotulo">Productos</div><div class="valor">0</div></div>
      </div>
      <div class="tarjeta">
        <h2>Lo primero: cargar el inventario</h2>
        <p>Ese es el cuello de botella del proyecto. El orden es: importar el Excel,
           y después ponerle las fotos de corrido en el Estudio de Fotos.</p>
        <div class="fila">
          <button class="btn principal" data-ir="importar">📥 Importar Excel</button>
          <button class="btn" data-ir="fotos">📷 Estudio de fotos</button>
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
  app.innerHTML = `
    <div class="sin-conexion">Sin conexión — puedes seguir trabajando, se sube solo</div>
    <header class="barra">
      <strong>🖇️ Mis Detallitos</strong>
      <span class="crece"></span>
      <span class="etiqueta ${esDueno() ? 'info' : 'ok'}">${esDueno() ? 'Dueño' : u.nombre}</span>
      <button class="btn" id="salir" style="min-height:36px;padding:0 .7rem">Salir</button>
    </header>
    <nav class="nav" id="nav"></nav>
    <main id="contenido"></main>`;

  const nav = app.querySelector('#nav');
  for (const p of pantallasDeMenu()) {
    const b = document.createElement('button');
    b.dataset.id = p.id;
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
