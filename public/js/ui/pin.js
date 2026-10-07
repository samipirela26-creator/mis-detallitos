// pin.js — autorización del dueño para un precio por debajo del mínimo.
//
// El PIN se guarda en la configuración del negocio (solo el dueño la escribe) y
// el empleado nunca lo puede leer: la comparación se hace contra el hash que
// viene en `config/general`, que sí es legible, pero del hash no se saca el PIN.

import { ref } from '../core/firebase.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { el, abrirDialogo, pegar } from './html.js';
import { esDueno, usuarioActual } from '../core/sesion.js';

/** SHA-256 en hexadecimal (lo trae el navegador, no hace falta librería). */
export async function hashPin(pin) {
  const datos = new TextEncoder().encode(`detallitos:${pin}`);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let hashGuardado = null;
async function cargarHash() {
  if (hashGuardado !== null) return hashGuardado;
  try {
    const snap = await getDoc(ref('config', 'general'));
    hashGuardado = snap.exists() ? (snap.data().pinHash || '') : '';
  } catch { hashGuardado = ''; }
  return hashGuardado;
}
export const olvidarHash = () => { hashGuardado = null; };

/**
 * Pide el PIN del dueño. Devuelve el nombre de quien autorizó, o null.
 * Si quien está usando la app ES el dueño, no pregunta nada.
 */
export async function pedirAutorizacion(motivo = '') {
  if (esDueno()) return usuarioActual().nombre;
  const esperado = await cargarHash();
  if (!esperado) return usuarioActual().nombre;   // sin PIN configurado, no estorba

  return new Promise((resolver) => {
    const entrada = el('input', {
      type: 'password', inputmode: 'numeric', autocomplete: 'off',
      placeholder: '••••', style: 'font-size:1.5rem;text-align:center;letter-spacing:.5em',
    });
    const error = el('p', { style: 'color:var(--rojo);font-size:.9rem;min-height:1.2em' });
    const d = abrirDialogo('');
    const probar = async () => {
      if ((await hashPin(entrada.value)) === esperado) { d.close(); resolver('Dueño'); }
      else { error.textContent = 'PIN incorrecto.'; entrada.value = ''; entrada.focus(); }
    };
    pegar(d, 
      el('h2', { texto: 'Autorización del dueño' }),
      el('p', { texto: motivo, style: 'color:var(--texto-suave)' }),
      entrada, error,
      el('div.fila', {}, [
        el('button.btn.plano', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { type: 'button', texto: 'Autorizar', onclick: probar }),
      ])
    );
    entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') probar(); });
    entrada.focus();
  });
}
