// Pantalla de entrada. Dos usuarios reales + el dueño: no hay registro público.
import { iniciarSesion } from '../core/sesion.js';
import { avisarMal } from './avisos.js';

export function montarEntrar(nodo) {
  nodo.innerHTML = `
    <div class="login">
      <div class="marca">
        <div class="logo">🖇️</div>
        <h1>Mis Detallitos</h1>
        <p style="color:var(--texto-suave)">Entra con tu correo y tu clave</p>
      </div>
      <form class="tarjeta" id="form-entrar">
        <div class="campo">
          <label for="email">Correo</label>
          <input id="email" type="email" autocomplete="username" required>
        </div>
        <div class="campo">
          <label for="clave">Clave</label>
          <input id="clave" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn principal ancho grande" type="submit">Entrar</button>
      </form>
    </div>`;

  const form = nodo.querySelector('#form-entrar');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      await iniciarSesion(form.email.value, form.clave.value);
    } catch (e) {
      const cuales = {
        'auth/invalid-credential': 'Correo o clave incorrectos.',
        'auth/invalid-email': 'Ese correo no es válido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
        'auth/network-request-failed': 'Sin internet: la primera entrada necesita conexión.',
      };
      avisarMal(cuales[e.code] || 'No se pudo entrar. Intenta otra vez.');
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });
  nodo.querySelector('#email').focus();
}
