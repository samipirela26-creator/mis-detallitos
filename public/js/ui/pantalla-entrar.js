// Pantalla de entrada y de registro por invitación.
//
// El dueño reparte el link de la app. Quien lo reciba puede crearse su cuenta,
// pero nace APAGADA: no ve nada hasta que el dueño la encienda desde
// Configuración. Por eso el link se puede mandar por WhatsApp sin miedo.

import { iniciarSesion, crearCuenta, refrescarUsuario } from '../core/sesion.js';
import { avisarMal } from './avisos.js';
import { el, $, pegar } from './html.js';

const MENSAJES = {
  'auth/invalid-credential': 'Correo o clave incorrectos.',
  'auth/invalid-email': 'Ese correo no es válido.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'La clave no es esa.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'auth/network-request-failed': 'Sin internet: la primera entrada necesita conexión.',
  'auth/email-already-in-use': 'Ya hay una cuenta con ese correo. Entra en vez de registrarte.',
  'auth/weak-password': 'La clave es muy corta: ponle al menos 6 caracteres.',
  'auth/operation-not-allowed': 'El registro está cerrado. Pídele al dueño que te cree la cuenta.',
};

export function montarEntrar(nodo) {
  // Si el link que repartió el dueño trae #/registro, abre directo el registro.
  let modo = location.hash.includes('registro') ? 'registro' : 'entrar';

  function pintar() {
    nodo.innerHTML = '';
    const panel = el('div.panel', {}, [
      el('img', { src: 'icons/logo.webp', width: '128', height: '128', alt: 'Mis Detallitos G&M C.A' }),
      el('h1', { style: 'color:#fff;margin:.75rem 0 0', texto: 'Mis Detallitos' }),
      el('p', { class: 'lema', texto: 'Tus ventas, tu inventario y lo que de verdad estás ganando.' }),
    ]);

    const form = el('form');
    const caja = el('div.forma', {}, [form]);
    pegar(nodo, el('div.login', {}, [panel, caja]));

    if (modo === 'entrar') {
      pegar(form,
        el('h1', { texto: 'Entrar' }),
        campo('email', 'Correo', { type: 'email', autocomplete: 'username', placeholder: 'tucorreo@gmail.com' }),
        campo('clave', 'Clave', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' }),
        el('button.btn.principal.ancho.grande', { type: 'submit', texto: 'Entrar' }),
        el('button.btn.plano.ancho', {
          type: 'button', style: 'margin-top:.75rem', texto: 'No tengo cuenta todavía',
          onclick: () => { modo = 'registro'; pintar(); },
        })
      );
    } else {
      pegar(form,
        el('h1', { texto: 'Crear mi cuenta' }),
        el('p', {
          style: 'color:var(--texto-suave);font-size:.92rem;margin-top:-.5rem',
          texto: 'Crea tu cuenta y avísale al dueño para que te dé acceso. Hasta que él te habilite no vas a ver nada.',
        }),
        campo('nombre', '¿Cómo te llamas?', { autocomplete: 'name', placeholder: 'Tu nombre' }),
        campo('email', 'Correo', { type: 'email', autocomplete: 'username', placeholder: 'tucorreo@gmail.com' }),
        campo('clave', 'Clave', { type: 'password', autocomplete: 'new-password', placeholder: 'mínimo 6 caracteres' }),
        el('button.btn.principal.ancho.grande', { type: 'submit', texto: 'Crear cuenta' }),
        el('button.btn.plano.ancho', {
          type: 'button', style: 'margin-top:.75rem', texto: 'Ya tengo cuenta, quiero entrar',
          onclick: () => { modo = 'entrar'; pintar(); },
        })
      );
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const boton = form.querySelector('button[type="submit"]');
      const textoOriginal = boton.textContent;
      boton.disabled = true;
      boton.textContent = modo === 'entrar' ? 'Entrando…' : 'Creando…';
      try {
        if (modo === 'entrar') {
          await iniciarSesion(form.email.value, form.clave.value);
        } else {
          if (!form.nombre.value.trim()) throw { code: 'sin-nombre' };
          await crearCuenta(form.nombre.value, form.email.value, form.clave.value);
        }
      } catch (e) {
        avisarMal(e.code === 'sin-nombre' ? 'Escribe tu nombre.' : (MENSAJES[e.code] || 'No se pudo. Intenta otra vez.'));
        boton.disabled = false;
        boton.textContent = textoOriginal;
      }
    });

    form.querySelector('input')?.focus();
  }

  pintar();
}

function campo(nombre, etiqueta, props = {}) {
  return el('div.campo', {}, [
    el('label', { for: nombre, texto: etiqueta }),
    el('input', { id: nombre, name: nombre, required: '', ...props }),
  ]);
}

/** Pantalla de "espera a que te habiliten". No muestra ni un dato del negocio. */
export function montarEnEspera(nodo, usuario, alSalir) {
  nodo.innerHTML = '';
  pegar(nodo, el('div.login', {}, [
    el('div.panel', {}, [
      el('img', { src: 'icons/logo.webp', width: '110', height: '110', alt: '' }),
      el('h1', { style: 'color:#fff;margin:.75rem 0 0', texto: 'Mis Detallitos' }),
    ]),
    el('div.forma', {}, [
      el('div', { style: 'max-width:380px' }, [
        el('div', { style: 'font-size:2.5rem;text-align:center', texto: '⏳' }),
        el('h1', { style: 'text-align:center', texto: `Hola, ${usuario.nombre}` }),
        el('p', {
          style: 'text-align:center;color:var(--texto-suave)',
          texto: 'Tu cuenta quedó creada, pero el dueño todavía no te ha dado acceso. Avísale y vuelve a abrir la app.',
        }),
        el('p', {
          style: 'text-align:center;color:var(--texto-suave);font-size:.85rem',
          texto: usuario.email,
        }),
        el('button.btn.plano.ancho', {
          style: 'margin-top:1rem', texto: 'Ya me habilitaron, revisar',
          onclick: async (ev) => {
            ev.target.textContent = 'Revisando…';
            await refrescarUsuario();
            // Si sigue sin acceso, el refresco no cambia de pantalla: avisamos.
            setTimeout(() => {
              if (document.querySelector('.login')) ev.target.textContent = 'Todavía no — revisar otra vez';
            }, 1200);
          },
        }),
        el('button.btn.plano.ancho', { style: 'margin-top:.5rem', texto: 'Salir', onclick: alSalir }),
      ]),
    ]),
  ]));
}
