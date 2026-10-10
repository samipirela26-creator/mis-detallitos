// tema.js — claro, oscuro o lo que diga el teléfono.
//
// El tema se aplica como data-tema en <html>. Sin el atributo manda
// prefers-color-scheme, que es lo que la mayoría espera: la app sigue al
// sistema sin que nadie toque nada.

const CLAVE = 'detallitos:tema';
const TEMAS = ['auto', 'claro', 'oscuro'];

export function temaGuardado() {
  try {
    const t = localStorage.getItem(CLAVE);
    return TEMAS.includes(t) ? t : 'auto';
  } catch {
    return 'auto'; // modo incógnito o almacenamiento bloqueado
  }
}

/** Pinta el tema. Se llama antes de montar nada para no ver un parpadeo. */
export function aplicarTema(tema = temaGuardado()) {
  const html = document.documentElement;
  if (tema === 'auto') html.removeAttribute('data-tema');
  else html.setAttribute('data-tema', tema);

  // La barra del navegador en el teléfono también cambia de color.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const oscuro = tema === 'oscuro'
      || (tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', oscuro ? '#101719' : '#0b6a82');
  }
}

export function guardarTema(tema) {
  if (!TEMAS.includes(tema)) return;
  try { localStorage.setItem(CLAVE, tema); } catch { /* da igual: se aplica igual */ }
  aplicarTema(tema);
}

// En modo auto hay que repintar si el teléfono cambia solo al anochecer.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (temaGuardado() === 'auto') aplicarTema('auto');
});
