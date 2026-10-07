// pendientes.js — pantallas que todavía no existen, pero ya tienen su lugar.
// Cada una dice en qué fase llega, para que al abrir la app se vea el mapa
// completo y no haya botones que no hacen nada sin explicación.
import { registrar } from '../core/router.js';

const PORVENIR = [
  { id: 'inventario', titulo: 'Inventario', icono: '📦', menu: true, soloDueno: true, fase: 1,
    que: 'Lista de productos con costo, precio, stock y margen. Crear, editar y desactivar.' },
  { id: 'importar', titulo: 'Importar Excel', icono: '📥', soloDueno: true, fase: 1,
    que: 'Plantilla, mapeo de columnas, vista previa, detección de duplicados y deshacer la importación completa.' },
  { id: 'fotos', titulo: 'Estudio de fotos', icono: '📷', menu: true, soloDueno: true, fase: 1,
    que: 'Los productos sin foto, uno por uno, con la cámara ya abierta. Disparas y salta al siguiente.' },
  { id: 'buscar', titulo: 'Buscar', icono: '🔎', menu: true, fase: 2,
    que: 'Buscador que aguanta errores de escritura y sinónimos, y funciona sin internet.' },
  { id: 'vender', titulo: 'Vender', icono: '🧾', menu: true, fase: 3,
    que: 'Carrito, precio fijo o variable, escalas por cantidad, pago en dólares, pesos y bolívares, vuelto y recibo.' },
  { id: 'caja', titulo: 'Mi caja', icono: '💵', menu: true, fase: 4,
    que: 'Abrir turno con el fondo, cerrar contando por denominación, reporte X y cierre Z.' },
  { id: 'gastos', titulo: 'Gastos', icono: '📤', menu: true, fase: 4,
    que: 'Registrar lo que sale, por categoría, con foto del recibo.' },
  { id: 'clientes', titulo: 'Deudas', icono: '🤝', soloDueno: true, fase: 4,
    que: 'Clientes, saldos pendientes y abonos.' },
  { id: 'reportes', titulo: 'Reportes', icono: '📊', soloDueno: true, fase: 5,
    que: 'Ganancia por producto, productos con margen bajo, ranking de empleados, tendencias, exportar.' },
  { id: 'config', titulo: 'Configuración', icono: '⚙️', soloDueno: true, fase: 6,
    que: 'Tasas del día, usuarios, categorías, umbral de descuento que pide PIN.' },
];

export function registrarPendientes() {
  for (const p of PORVENIR) {
    registrar(p.id, {
      titulo: p.titulo,
      icono: p.icono,
      menu: p.menu,
      soloDueno: p.soloDueno,
      montar(nodo) {
        nodo.innerHTML = `
          <div class="tarjeta">
            <span class="etiqueta info">Fase ${p.fase}</span>
            <h1 style="margin-top:.75rem">${p.icono} ${p.titulo}</h1>
            <p>${p.que}</p>
            <p style="color:var(--texto-suave);font-size:.9rem">
              Esta pantalla todavía no está hecha. La cáscara, la sesión, los roles y
              el manejo de dinero ya sí.
            </p>
          </div>`;
      },
    });
  }
}

export const PANTALLAS_PENDIENTES = PORVENIR;
