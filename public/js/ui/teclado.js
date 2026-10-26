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
import { formatear, MONEDAS, aMenores, aUSD, desdeUSD } from '../core/dinero.js';

/**
 * pedirMonto({ titulo, moneda, inicial, nota }) -> Promise<menores | null>
 * Devuelve el monto en unidades menores, o null si cancelan.
 *
 * Con `monedas` (y `tasas`) el cuadro deja CAMBIAR de moneda y muestra debajo
 * cuánto es en las otras dos. Entonces devuelve `{ menores, moneda, montoUSD }`
 * en vez de un número suelto, porque quien llama ya no sabe en qué moneda
 * terminó el usuario. Sin `monedas` no cambia nada: sigue devolviendo el
 * número, que es como lo usan el arqueo y el vuelto, donde la moneda la manda
 * la gaveta y no se elige.
 */
export function pedirMonto({
  titulo, moneda = 'USD', inicial = 0, nota = '', aceptar = 'Listo',
  monedas = null, tasas = null, permiteCero = false,
} = {}) {
  return new Promise((resolver) => {
    // Las que de verdad se pueden usar: sin tasa del día no hay con qué pasar
    // de bolívares a dólares, y ofrecerla sería prometer una cuenta que no se
    // puede hacer.
    const elegibles = (monedas || []).filter((m) => m === 'USD' || (tasas || {})[m] > 0);
    // OJO: la forma de lo que se devuelve depende de si PIDIERON monedas, no de
    // cuántas quedaron elegibles. Si dependiera de eso, un día sin tasas
    // cargadas dejaría una sola moneda, se devolvería un número donde quien
    // llama espera un objeto, y la venta libre se rompería justo el día que
    // nadie cargó la tasa.
    const devuelveObjeto = Array.isArray(monedas) && monedas.length > 0;
    const eligeMoneda = elegibles.length > 1;          // solo si hay entre qué elegir
    if (elegibles.length && !elegibles.includes(moneda)) moneda = elegibles[0];

    let menores = Math.max(0, Math.round(inicial || 0));
    let dec = MONEDAS[moneda].decimales;
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
    const eco = el('div', { style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-cuerpo);min-height:1.4em' });
    // Las otras dos monedas, debajo y en chico. Es la misma plata dicha de tres
    // maneras, no tres montos: el cliente pregunta "¿y en bolívares?" y la
    // respuesta tiene que estar ahí, sin salir del cuadro a hacer la cuenta.
    const otras = el('div', { style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-pie);min-height:1.2em' });
    const botonOk = el('button.btn.principal', { type: 'button' });

    /** El monto de ahora, en dólares, que es como se guarda todo. */
    const enDolares = () => (moneda === 'USD' ? menores : aUSD(menores, moneda, (tasas || {})[moneda]));

    const pintar = () => {
      const valido = menores > 0 || (permiteCero && menores === 0);
      eco.textContent = menores
        ? `= ${formatear(menores, moneda)}`
        : permiteCero && menores === 0
          ? '= $ 0 (gratis / regalo)'
          : 'Escribe cuánto, o usa los botones';
      botonOk.textContent = menores
        ? `${aceptar} ${formatear(menores, moneda)}`
        : permiteCero && menores === 0
          ? `${aceptar} ($ 0 - regalo)`
          : aceptar;
      botonOk.disabled = valido ? null : true;
      botonOk.style.opacity = valido ? '' : '.5';
      if (!eligeMoneda) return;
      for (const b of botonesMoneda) {
        b.classList.toggle('acento', b.dataset.moneda === moneda);
      }
      otras.textContent = menores
        ? elegibles.filter((m) => m !== moneda)
            .map((m) => formatear(m === 'USD' ? enDolares() : desdeUSD(enDolares(), m, tasas[m]), m))
            .join('   ·   ')
        : '';
    };

    const escribirCampo = () => {
      campo.value = menores ? formatear(menores, moneda, { simbolo: false }) : '';
      pintar();
    };

    const notaCentimos = el('p', {
      texto: 'Con los botones, los últimos dos dígitos son los céntimos.',
      style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-pie);margin:.2rem 0 0',
    });
    notaCentimos.hidden = !dec;

    // Los botones de moneda. Cambiar de moneda NO cambia la plata: 20.000 pesos
    // pasan a ser $ 6,29, no 20.000 dólares. Lo que cambia es en qué se está
    // escribiendo, que es justo lo que uno quiere cuando el cliente paga en
    // otra cosa.
    // Lo exacto que se tecleó en cada moneda. Sin esto, escribir 20.000 pesos,
    // mirar los bolívares y volver devolvía 20.008: cada salto redondea a
    // centavos de dólar y el error se queda pegado. Son 8 pesos, pero
    // aparecieron solos, y una cifra que se mueve sola no se puede mostrar.
    const anotado = {};
    const dolaresDe = (x, m) => (m === 'USD' ? x : aUSD(x, m, tasas[m]));

    const botonesMoneda = [];
    const filaMonedas = el('div', {
      style: 'display:grid;grid-template-columns:repeat(' + Math.max(1, elegibles.length) + ',1fr);gap:.4rem;margin:.1rem 0 .6rem',
    });
    if (eligeMoneda) {
      for (const codigo of elegibles) {
        const b = el('button.btn.plano', {
          type: 'button', style: 'min-height:42px;font-weight:700',
          'data-moneda': codigo, texto: MONEDAS[codigo].nombre,
          onclick: () => {
            if (codigo === moneda) return;
            const usd = enDolares();
            anotado[moneda] = menores;
            moneda = codigo;
            dec = MONEDAS[moneda].decimales;
            const convertido = moneda === 'USD' ? usd : desdeUSD(usd, moneda, tasas[moneda]);
            // Si ya se había escrito en esta moneda y sigue valiendo lo mismo,
            // se devuelve ese número tal cual en vez del de ida y vuelta.
            const previo = anotado[moneda];
            menores = (previo != null && dolaresDe(previo, moneda) === usd) ? previo : convertido;
            campo.inputMode = dec ? 'decimal' : 'numeric';
            if (notaCentimos) notaCentimos.hidden = !dec;
            intacto = true;          // el primer dígito vuelve a reemplazar
            escribirCampo();
          },
        });
        botonesMoneda.push(b);
        filaMonedas.appendChild(b);
      }
    }

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
    // Con monedas a elegir hace falta decir en CUÁL quedó, o quien llama no
    // sabe si ese 20.000 son pesos o bolívares. Sin ellas se devuelve el
    // número pelado, como siempre.
    const listo = () => {
      d.close();
      resolver(devuelveObjeto ? { menores, moneda, montoUSD: enDolares() } : menores);
    };
    botonOk.addEventListener('click', listo);

    pegar(d,
      el('h2', { texto: titulo || 'Monto' }),
      nota ? el('p', { texto: nota, style: 'color:var(--texto-suave);font-size:var(--t-cuerpo);margin-top:-.4rem' }) : null,
      eligeMoneda ? filaMonedas : null,
      campo,
      eco,
      otras,
      // Solo donde hay decimales que confundir. En pesos no hay nada que
      // explicar, y la línea sobraba en la pantalla que más se usa.
      notaCentimos,
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
