// escaner.js — leer el código de barras con la cámara del teléfono.
//
// Por qué sin librería: Chrome en Android trae `BarcodeDetector` nativo, que
// lee más rápido y gasta menos batería que cualquier decodificador en JS, y no
// suma un megabyte al precache. El campo `codigoBarras` ya existía en el
// catálogo y el buscador ya lo resolvía de primero (`data/busqueda.js`): lo
// único que faltaba era quién se lo dictara.
//
// Si el navegador no lo trae (iPhone, Firefox), NO se queda sin salida: abre el
// mismo cuadro con el teclado para dictar el código a mano. Peor que la cámara,
// mejor que nada.
//
// La cámara se apaga SIEMPRE al cerrar. Un video corriendo en segundo plano se
// come la batería del teléfono del mostrador en una tarde.

import { el, abrirDialogo, pegar } from '../ui/html.js';
import { avisarMal } from '../ui/avisos.js';
import { sonidoBeep } from '../ui/sonido.js';

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];

export const escanerDisponible = () => typeof window !== 'undefined'
  && 'BarcodeDetector' in window
  && !!navigator.mediaDevices?.getUserMedia;

/**
 * escanear() -> Promise<string | null>
 * Devuelve el código leído (o escrito), o null si cerraron sin leer nada.
 * Nunca lanza: si la cámara falla, cae al teclado.
 */
export function escanear() {
  return new Promise((resolver) => {
    let camara = null;         // MediaStream
    let siguiendo = true;
    let yaRespondio = false;

    const terminar = (codigo) => {
      if (yaRespondio) return;
      yaRespondio = true;
      siguiendo = false;
      for (const via of camara?.getTracks() || []) via.stop();
      d.close();
      resolver(codigo || null);
    };

    const video = el('video', {
      autoplay: '', muted: '', playsinline: '',
      style: 'width:100%;border-radius:var(--radio,12px);background:#000;aspect-ratio:4/3;object-fit:cover',
    });
    video.muted = true;   // como atributo no basta en todos los navegadores

    const estado = el('p', {
      style: 'text-align:center;color:var(--texto-suave);font-size:.9rem;min-height:1.3em',
      texto: 'Apunta al código de barras',
    });

    // Dictar el código a mano: es la salida cuando no hay cámara, y también
    // cuando el código está rayado y no hay forma de que lo lea.
    const aMano = el('input', {
      type: 'text', inputmode: 'numeric', autocomplete: 'off',
      placeholder: 'o escribe el código',
      style: 'text-align:center;letter-spacing:.05em',
    });
    aMano.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && aMano.value.trim()) terminar(aMano.value.trim());
    });

    const d = abrirDialogo('');
    pegar(d,
      el('h2', { texto: 'Pasar el código' }),
      video,
      estado,
      aMano,
      el('div.fila', { style: 'margin-top:.75rem' }, [
        el('button.btn.plano', { type: 'button', texto: 'Cerrar', onclick: () => terminar(null) }),
        el('button.btn.principal', {
          type: 'button', texto: 'Usar el código escrito',
          onclick: () => aMano.value.trim() && terminar(aMano.value.trim()),
        }),
      ])
    );
    d.addEventListener('close', () => terminar(null));

    if (!escanerDisponible()) {
      video.remove();
      estado.textContent = 'Este navegador no puede usar la cámara para leer códigos. Escribe el código.';
      aMano.focus();
      return;
    }

    (async () => {
      try {
        camara = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },   // la de atrás
          audio: false,
        });
        if (!siguiendo) {   // cerraron mientras pedía permiso
          for (const via of camara.getTracks()) via.stop();
          return;
        }
        video.srcObject = camara;
        await video.play().catch(() => {});

        const detector = new BarcodeDetector({ formats: FORMATOS });
        estado.textContent = 'Buscando el código…';

        // Se mira ~6 veces por segundo. Más rápido no lee mejor y calienta el
        // teléfono; más lento se siente trabado.
        while (siguiendo) {
          try {
            const [hallado] = await detector.detect(video);
            if (hallado?.rawValue) {
              sonidoBeep();
              return terminar(hallado.rawValue);
            }
          } catch { /* un cuadro que no se pudo analizar no es un error */ }
          await new Promise((sigue) => setTimeout(sigue, 160));
        }
      } catch (e) {
        // Permiso negado, cámara ocupada por otra app, o sin HTTPS.
        video.remove();
        const negado = e?.name === 'NotAllowedError';
        estado.textContent = negado
          ? 'No diste permiso a la cámara. Puedes escribir el código.'
          : 'No se pudo abrir la cámara. Escribe el código.';
        if (!negado) avisarMal('La cámara no abrió: ' + (e?.name || e?.message || 'desconocido'));
        aMano.focus();
      }
    })();
  });
}
