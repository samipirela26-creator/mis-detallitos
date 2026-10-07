// sonido.js — efectos de audio táctiles sin dependencias ni archivos mp3.
// Usa Web Audio API nativa para dar respuesta auditiva instantánea.

let ctx = null;

function obtenerContexto() {
  if (!ctx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) ctx = new AudioCtx();
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Tono corto cuando entra un producto al carrito (880Hz / 80ms) */
export function sonidoBeep() {
  try {
    const audio = obtenerContexto();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audio.currentTime); // A5
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.08);
  } catch (e) {
    // Silencioso si el navegador bloquea audio sin interacción previa
  }
}

/** Arpegio de dos notas alegre cuando se cobra con éxito (523Hz -> 659Hz) */
export function sonidoCobrar() {
  try {
    const audio = obtenerContexto();
    if (!audio) return;
    const t = audio.currentTime;
    
    // Nota 1: C5
    const osc1 = audio.createOscillator();
    const gain1 = audio.createGain();
    osc1.frequency.setValueAtTime(523.25, t);
    gain1.gain.setValueAtTime(0.15, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.connect(gain1);
    gain1.connect(audio.destination);
    osc1.start(t);
    osc1.stop(t + 0.15);

    // Nota 2: E5
    const osc2 = audio.createOscillator();
    const gain2 = audio.createGain();
    osc2.frequency.setValueAtTime(659.25, t + 0.09);
    gain2.gain.setValueAtTime(0.18, t + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc2.connect(gain2);
    gain2.connect(audio.destination);
    osc2.start(t + 0.09);
    osc2.stop(t + 0.3);
  } catch (e) {}
}

/** Tono grave de advertencia (alerta/sin stock/error) */
export function sonidoAlerta() {
  try {
    const audio = obtenerContexto();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, audio.currentTime);
    gain.gain.setValueAtTime(0.1, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
  } catch (e) {}
}
