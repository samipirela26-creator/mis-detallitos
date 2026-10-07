// Pantalla de entrada. Tres usuarios reales: no hay registro público.
import { iniciarSesion } from '../core/sesion.js';
import { avisarMal } from './avisos.js';

export function montarEntrar(nodo) {
  nodo.innerHTML = `
    <div class="login">
      <div class="panel">
        <img src="/icons/logo.webp" width="128" height="128"
             alt="Mis Detallitos G&amp;M C.A">
        <h1 style="color:#fff;margin:.75rem 0 0">Mis Detallitos</h1>
        <p class="lema">Tus ventas, tu inventario y lo que de verdad estás ganando.</p>
      </div>
      <div class="forma">
        <form>
          <h1>Entrar</h1>
          <div class="campo">
            <label for="email">Correo</label>
            <input id="email" name="email" type="email" autocomplete="username"
                   placeholder="tucorreo@gmail.com" required>
          </div>
          <div class="campo">
            <label for="clave">Clave</label>
            <input id="clave" name="clave" type="password" autocomplete="current-password"
                   placeholder="••••••••" required>
          </div>
          <button class="btn principal ancho grande" type="submit">Entrar</button>
        </form>
      </div>
    </div>`;

  const form = nodo.querySelector('form');
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
