// teclado.js — pedir un monto. Se puede ESCRIBIR o teclear con los botones.
//
// Por qué las dos cosas: en el mostrador, con el cliente enfrente y el teléfono
// en una mano, los botones grandes son más rápidos y no tapan la pantalla con
// el teclado del sistema. Pero sentado, o con un número largo, escribir es lo
// natural — y si solo hay botones, parece una calculadora y nadie sabe qué está
// haciendo. Así que el número de arriba es un campo de verdad: se escribe, se
// corrige y se ve.
//
// Debajo del campo siempre se muestra lo que la app ENTENDIÓ ("= $ 20.000").
// Eso es lo que quita la duda de los decimales: 150 en dólares es $ 1,50 y en
// pesos es $ 150, y adivinarlo mirando dígitos sueltos no se le puede pedir a
// nadie.

import { el, abrirDialogo, pegar } from './html.js';
import { formatear, MONEDAS, aMenores } from '../core/dinero.js';

/**
 * pedirMonto({ titulo, moneda, inicial, nota }) -> Promise<menores | null>
 * Devuelve el monto en unidades menores, o null si cancelan.
 */
export function pedirMonto({ titulo, moneda = 'USD', inicial = 0, nota = '', aceptar = 'Listo' } = {}) {
  return new Promise((resolver) => {
    let menores = Math.max(0, Math.round(inicial || 0));
    const dec = MONEDAS[moneda].decimales;
    // El monto sugerido se reemplaza con el primer toque, no se le pega.
    //
    // Antes se le pegaba: con $ 20.000 sugeridos, teclear 2-0-0-0-0 daba
    // $ 200.002 porque cada dígito se multiplicaba por diez sobre lo que ya
    // había. Había que acordarse de darle a la C primero, y nada lo decía.
    let intacto = true;

    const campo = el('input', {
      inputmode: dec ? 'decimal' : 'numeric',
      'aria-label': titulo || 'Monto',
      value: menores ? formatear(menores, moneda, { simbolo: false }) : '',
      placeholder: '0',
      style: 'font-size:2rem;font-weight:700;text-align:center;height:68px;font-family:var(--fuente-cifra,inherit)',
    });
    const eco = el('div', { style: 'text-align:center;color:var(--texto-suave);font-size:.95rem;min-height:1.4em' });
    const botonOk = el('button.btn.principal', { type: 'button' });

    const pintar = () => {
      eco.textContent = menores ? `= ${formatear(menores, moneda)}` : 'Escribe cuánto, o usa los botones';
      botonOk.textContent = menores ? `${aceptar} ${formatear(menores, moneda)}` : aceptar;
      botonOk.disabled = menores ? null : true;
      botonOk.style.opacity = menores ? '' : '.5';
    };

    const escribirCampo = () => {
      campo.value = menores ? formatear(menores, moneda, { simbolo: false }) : '';
      pintar();
    };

    campo.addEventListener('input', () => {
      intacto = false;
      menores = Math.max(0, aMenores(campo.value, moneda) || 0);
      pintar();
    });
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && menores) { ev.preventDefault(); listo(); }
    });

    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'];
    const rejilla = el('div', {
      style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:.75rem 0',
    });
    for (const t of teclas) {
      rejilla.appendChild(el('button.btn.plano', {
        type: 'button', style: 'min-height:58px;font-size:1.3rem',
        onclick: () => {
          if (t === 'C') { menores = 0; }
          else if (t === '←') { menores = Math.floor(menores / 10); }
          else {
            if (intacto) menores = 0;         // el primer dígito reemplaza
            menores = menores * 10 + Number(t);
          }
          intacto = false;
          if (menores > 1e12) menores = Math.floor(menores / 10);
          escribirCampo();
        },
      }, t));
    }

    const d = abrirDialogo('');
    const listo = () => { d.close(); resolver(menores); };
    botonOk.addEventListener('click', listo);

    pegar(d,
      el('h2', { texto: titulo || 'Monto' }),
      nota ? el('p', { texto: nota, style: 'color:var(--texto-suave);font-size:.9rem;margin-top:-.4rem' }) : null,
      campo,
      eco,
      // Solo donde hay decimales que confundir. En pesos no hay nada que
      // explicar, y la línea sobraba en la pantalla que más se usa.
      dec ? el('p', {
        texto: `Con los botones, los últimos dos dígitos son los céntimos.`,
        style: 'text-align:center;color:var(--texto-suave);font-size:.78rem;margin:.2rem 0 0',
      }) : null,
      rejilla,
      el('div.fila', {}, [
        el('button.btn.callado', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        botonOk,
      ])
    );
    pintar();
    // Seleccionado: si escribe, reemplaza la sugerencia sin tener que borrarla.
    campo.focus();
    campo.select();
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
        el('button.btn.callado', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { type: 'button', texto: 'Listo', onclick: () => { d.close(); resolver(Number(entrada.value) || 0); } }),
      ])
    );
    entrada.focus();
    entrada.select();
  });
}
