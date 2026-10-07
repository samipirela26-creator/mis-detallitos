// avisos.js — mensajitos y confirmaciones. Nada de alert() ni confirm().
let caja = null;
function contenedor() {
  if (!caja) {
    caja = document.getElementById('avisos') || Object.assign(document.createElement('div'), { id: 'avisos' });
    if (!caja.parentNode) document.body.appendChild(caja);
  }
  return caja;
}

export function avisar(mensaje, tipo = '', ms = 3000) {
  const n = document.createElement('div');
  n.className = `aviso ${tipo}`;
  n.textContent = mensaje;
  contenedor().appendChild(n);
  setTimeout(() => n.remove(), ms);
}
export const avisarOk = (m) => avisar(m, 'ok');
export const avisarMal = (m) => avisar(m, 'mal', 5000);

/** Confirmación con <dialog>. Devuelve true/false. */
export function confirmar(titulo, { detalle = '', aceptar = 'Sí', cancelar = 'No', peligro = false } = {}) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.innerHTML = `
      <h2></h2>
      <p class="detalle"></p>
      <div class="fila" style="margin-top:1rem">
        <button class="btn" value="no"></button>
        <button class="btn ${peligro ? 'peligro' : 'principal'}" value="si"></button>
      </div>`;
    d.querySelector('h2').textContent = titulo;
    const p = d.querySelector('.detalle');
    p.textContent = detalle;
    if (!detalle) p.remove();
    const [bNo, bSi] = d.querySelectorAll('button');
    bNo.textContent = cancelar;
    bSi.textContent = aceptar;
    bNo.onclick = () => { d.close(); resolver(false); };
    bSi.onclick = () => { d.close(); resolver(true); };
    d.addEventListener('close', () => d.remove());
    document.body.appendChild(d);
    d.showModal();
  });
}
