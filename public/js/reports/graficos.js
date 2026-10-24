// graficos.js — gráficos con Chart.js, con la paleta de la marca.
let Chart = null;

async function cargar() {
  if (!Chart) {
    await import('../../vendor/chart.js');
    Chart = window.Chart;
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  }
  // El color del texto se relee en cada carga: si el tema cambió, el gráfico
  // no se queda con el gris del tema anterior.
  Chart.defaults.color = token('--texto-suave', '#6f6a63');
  return Chart;
}

/**
 * Chart.js no entiende `var(--marca)`: necesita un color resuelto. Así que se
 * leen los tokens reales en el momento de pintar.
 *
 * Antes eran cuatro hex a mano que no correspondían a ningún token de la
 * paleta (el turquesa del gráfico era #00a2c8 y el de la marca #0b6a82), y en
 * modo oscuro no seguían al tema.
 */
const token = (nombre, respaldo) =>
  getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || respaldo;

const MARCA = () => token('--marca', '#0b6a82');
const AMARILLO = () => token('--amarillo', '#ffc400');
const VERDE = () => token('--verde', '#1e6f4e');
const ROJO = () => token('--rojo', '#a52a1c');
/** El mismo turquesa de la marca, translúcido, para el relleno bajo la línea. */
const RELLENO = () => `color-mix(in srgb, ${MARCA()} 12%, transparent)`;

const enUSD = (centavos) => centavos / 100;

/** Línea doble: lo vendido y lo ganado, día por día. */
export async function lineaDiaria(lienzo, dias) {
  const C = await cargar();
  return new C(lienzo, {
    type: 'line',
    data: {
      labels: dias.map((d) => d.dia.slice(5)),
      datasets: [
        { label: 'Vendido', data: dias.map((d) => enUSD(d.vendidoUSD)), borderColor: MARCA(), backgroundColor: RELLENO(), fill: true, tension: .35, borderWidth: 3, pointRadius: 2 },
        { label: 'Ganancia', data: dias.map((d) => enUSD(d.gananciaUSD)), borderColor: VERDE(), tension: .35, borderWidth: 3, pointRadius: 2 },
        { label: 'Gastos', data: dias.map((d) => enUSD(d.gastosUSD)), borderColor: ROJO(), borderDash: [5, 4], tension: .35, borderWidth: 2, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` }, grid: { color: token('--borde', '#eee') } }, x: { grid: { display: false } } },
    },
  });
}

/** Barras redondeadas: los que más ganancia dejan. */
export async function barrasProductos(lienzo, productos, { campo = 'gananciaUSD', titulo = 'Ganancia' } = {}) {
  const C = await cargar();
  const top = productos.slice(0, 8);
  return new C(lienzo, {
    type: 'bar',
    data: {
      labels: top.map((p) => (p.nombre.length > 18 ? p.nombre.slice(0, 17) + '…' : p.nombre)),
      datasets: [{
        label: titulo,
        data: top.map((p) => enUSD(p[campo])),
        backgroundColor: top.map((p) => (p[campo] < 0 ? ROJO() : MARCA())),
        borderRadius: 10,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => `$${v}` }, grid: { color: token('--borde', '#eee') } }, y: { grid: { display: false } } },
    },
  });
}

/** Dona: cuánto vendió cada quien. */
export async function donaVendedores(lienzo, vendedores) {
  const C = await cargar();
  return new C(lienzo, {
    type: 'doughnut',
    data: {
      labels: vendedores.map((v) => v.nombre),
      datasets: [{
        data: vendedores.map((v) => enUSD(v.vendidoUSD)),
        backgroundColor: [MARCA(), AMARILLO(), token('--texto-suave', '#6f6a63'), VERDE(), ROJO()],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
    },
  });
}
