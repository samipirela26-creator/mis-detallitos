// teclado.js — teclado numérico grande para el precio y las cantidades.
// Pensado para el mostrador: botones de 60px, sin decimales que se peleen con
// el teclado del teléfono, y el precio se escribe como en las calculadoras
// (los dígitos entran por la derecha).

import { el, abrirDialogo, pegar } from './html.js';
import { formatear, MONEDAS } from '../core/dinero.js';

/**
 * pedirMonto({ titulo, moneda, inicial, nota }) -> Promise<menores | null>
 * Devuelve el monto en unidades menores, o null si cancelan.
 */
export function pedirMonto({ titulo, moneda = 'USD', inicial = 0, nota = '', aceptar = 'Listo' } = {}) {
  return new Promise((resolver) => {
    let menores = Math.max(0, Math.round(inicial || 0));
    const dec = MONEDAS[moneda].decimales;

    const pantalla = el('div.cifra-gigante', { style: 'text-align:center;margin:.5rem 0' });
    const pintar = () => { pantalla.textContent = formatear(menores, moneda); };
    pintar();

    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'];
    const rejilla = el('div', {
      style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:1rem 0',
    });
    for (const t of teclas) {
      rejilla.appendChild(el('button.btn.plano', {
        type: 'button', style: 'min-height:58px;font-size:1.3rem',
        onclick: () => {
          if (t === 'C') menores = 0;
          else if (t === '←') menores = Math.floor(menores / 10);
          else menores = menores * 10 + Number(t);
          if (menores > 1e12) menores = Math.floor(menores / 10);
          pintar();
        },
      }, t));
    }

    const d = abrirDialogo('');
    pegar(d, 
      el('h2', { texto: titulo || 'Monto' }),
      nota ? el('p', { texto: nota, style: 'color:var(--texto-suave);font-size:.9rem' }) : null,
      pantalla,
      el('p', {
        texto: dec ? 'Los últimos dos dígitos son los decimales' : 'Sin decimales',
        style: 'text-align:center;color:var(--texto-suave);font-size:.8rem',
      }),
      rejilla,
      el('div.fila', {}, [
        el('button.btn.plano', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { type: 'button', texto: aceptar, onclick: () => { d.close(); resolver(menores); } }),
      ])
    );
  });
}

/** pedirCantidad({ titulo, inicial }) -> Promise<number | null>. Acepta decimales. */
export function pedirCantidad({ titulo = 'Cantidad', inicial = 1, unidad = '' } = {}) {
  return new Promise((resolver) => {
    const d = abrirDialogo('');
    const entrada = el('input', {
      type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: String(inicial),
      style: 'font-size:1.6rem;text-align:center;height:64px',
    });
    const sumar = (n) => { entrada.value = String(Math.max(0, (Number(entrada.value) || 0) + n)); };
    pegar(d, 
      el('h2', { texto: titulo }),
      entrada,
      unidad ? el('p', { texto: unidad, style: 'text-align:center;color:var(--texto-suave)' }) : null,
      el('div.fila', { style: 'margin:.75rem 0' },
        [1, 5, 10, 50, 100].map((n) =>
          el('button.btn.plano', { type: 'button', texto: `+${n}`, onclick: () => sumar(n) }))),
      el('div.fila', {}, [
        el('button.btn.plano', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { type: 'button', texto: 'Listo', onclick: () => { d.close(); resolver(Number(entrada.value) || 0); } }),
      ])
    );
    entrada.focus();
    entrada.select();
  });
}
