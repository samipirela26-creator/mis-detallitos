// pin.js — autorización del dueño para un precio por debajo del mínimo.
//
// El hash vivía en `config/general`, que es de lectura PÚBLICA porque el
// catálogo de clientes lee de ahí la base del bolívar. Cualquiera en internet
// se bajaba el hash, y de un PIN de 4 dígitos solo hay 10.000 posibilidades:
// con SHA-256 a secas se prueban todas en milisegundos. Ahora vive en
// `equipo/seguridad`, que solo lee quien tiene cuenta en el negocio.
//
// Y el hash se endureció: PBKDF2 con sal propia y 200.000 vueltas, así probar
// las 10.000 combinaciones pasa de ser instantáneo a tomar horas.
//
// Lo que esto NO resuelve, y hay que saberlo: el empleado SÍ puede leer ese
// hash (lo necesita para verificar el PIN sin internet del dueño). Blindarlo
// de verdad exige verificar en un servidor, y eso pide plan de pago en
// Firebase. Mientras tanto: un PIN de 6 dígitos en vez de 4 multiplica por 100
// el trabajo de adivinarlo.

import { ref } from '../core/firebase.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { el, abrirDialogo, pegar } from './html.js';
import { esDueno, usuarioActual } from '../core/sesion.js';

export const VUELTAS = 200000;

const aHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Sal nueva al azar, en hexadecimal. Se guarda junto al hash. */
export const salNueva = () => aHex(crypto.getRandomValues(new Uint8Array(16)));

/** PBKDF2-SHA256. Lento a propósito: es lo único que encarece adivinar el PIN. */
export async function hashPin(pin, sal, vueltas = VUELTAS) {
  const codificador = new TextEncoder();
  const clave = await crypto.subtle.importKey('raw', codificador.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: codificador.encode(`detallitos:${sal}`), iterations: vueltas, hash: 'SHA-256' },
    clave, 256);
  return aHex(bits);
}

let guardado = null;
async function cargarPin() {
  if (guardado !== null) return guardado;
  try {
    const snap = await getDoc(ref('equipo', 'seguridad'));
    const d = snap.exists() ? snap.data() : {};
    guardado = d.pinHash ? { hash: d.pinHash, sal: d.pinSal || '', vueltas: d.pinVueltas || VUELTAS } : {};
  } catch { guardado = {}; }
  return guardado;
}
export const olvidarHash = () => { guardado = null; };

/**
 * Pide el PIN del dueño. Devuelve el nombre de quien autorizó, o null.
 * Si quien está usando la app ES el dueño, no pregunta nada.
 */
export async function pedirAutorizacion(motivo = '') {
  if (esDueno()) return usuarioActual().nombre;
  const esperado = await cargarPin();
  if (!esperado.hash) return usuarioActual().nombre;   // sin PIN configurado, no estorba

  return new Promise((resolver) => {
    const entrada = el('input', {
      type: 'password', inputmode: 'numeric', autocomplete: 'off',
      placeholder: '••••', style: 'font-size:1.5rem;text-align:center;letter-spacing:.5em',
    });
    const error = el('p', { style: 'color:var(--rojo);font-size:.9rem;min-height:1.2em' });
    const d = abrirDialogo('');
    const probar = async () => {
      if ((await hashPin(entrada.value, esperado.sal, esperado.vueltas)) === esperado.hash) { d.close(); resolver('Dueño'); }
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
