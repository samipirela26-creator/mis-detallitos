// pendientes.js — lo que está esperando a alguien.
//
// Cada una de estas cosas ya existía y ya tenía su pantalla; el problema era
// que había que entrar a mirarlas para saber que estaban ahí. El pedido de
// anulación vive dentro de Ventas, las solicitudes de acceso y los sinónimos
// dentro de Configuración, y la tasa vieja solo se nota en la chapita de la
// cabecera. Nadie entra a Configuración "por si acaso": el pedido de anular
// una venta mal cobrada se quedaba días ahí.
//
// Aquí se cuentan todas de un solo golpe para que la barra de abajo pueda
// decir el número, y cada una sabe a qué pantalla manda.

import { col } from '../core/firebase.js';
import { traer, SERVIDOR } from './lectura.js';
import { esDueno, usuarioActual } from '../core/sesion.js';
import { leer } from '../core/estado.js';
import { anulacionesPendientes } from './ventas.js';
import { pendientes as sinonimosPendientes } from './sinonimos.js';
import { diaISO } from '../ui/html.js';

/** Las cuentas que todavía no ha encendido el dueño. */
async function solicitudesDeAcceso(fuente) {
  const lista = await traer(col('usuarios'), fuente);
  return lista.filter((u) => u.rol !== 'dueno' && u.activo !== true).length;
}

/** La tasa de hoy: sin poner, o arrastrada de un día anterior. */
function tasaPendiente() {
  const tasas = leer('tasas') || {};
  const hay = Object.entries(tasas).some(([m, v]) => m !== 'USD' && v > 0);
  if (!hay) return { texto: 'Pon las tasas de hoy', detalle: 'Sin tasa solo se puede cobrar en dólares.' };
  const fecha = leer('tasaFecha');
  if (fecha && fecha !== diaISO()) {
    return { texto: 'La tasa no es de hoy', detalle: `Es del ${fecha.slice(8)}/${fecha.slice(5, 7)}. Cobrar todo el día con ella es perder plata en cada venta.` };
  }
  return null;
}

/**
 * Todo lo que espera, ya listo para pintar: cada cosa trae su texto, su
 * detalle y la pantalla que la resuelve.
 *
 * Nada de esto tumba la lista si falla: son cuatro consultas distintas y la
 * del empleado ni siquiera puede hacer tres de ellas (las reglas de Firestore
 * se lo niegan, y está bien). Lo que falle se calla y las demás siguen.
 */
export async function pendientes({ fuente = SERVIDOR } = {}) {
  const lista = [];
  const dueno = esDueno();
  const uid = usuarioActual()?.uid;

  const anulaciones = await anulacionesPendientes({ fuente }).catch(() => []);
  // El dueño ve todos los pedidos; al empleado solo le importan los suyos, que
  // es lo que todavía no le han contestado.
  const mios = dueno ? anulaciones : anulaciones.filter((a) => a.uid === uid);
  if (mios.length) {
    lista.push(dueno
      ? {
          cuantos: mios.length,
          texto: `${mios.length} ${mios.length === 1 ? 'anulación pedida' : 'anulaciones pedidas'}`,
          detalle: `${mios[0].nombreUsuario || 'Un empleado'} pidió deshacer una venta. Hasta que la atiendas, la venta sigue contando.`,
          urgente: true,
          destino: 'ventas',
        }
      : {
          cuantos: mios.length,
          texto: `${mios.length} ${mios.length === 1 ? 'anulación tuya' : 'anulaciones tuyas'} esperando`,
          detalle: 'El dueño todavía no la ha mirado. La venta sigue como está.',
          destino: 'mis-ventas',
        });
  }

  if (!dueno) return lista;

  const tasa = tasaPendiente();
  if (tasa) lista.push({ cuantos: 1, ...tasa, urgente: true, destino: 'config' });

  const esperando = await solicitudesDeAcceso(fuente).catch(() => 0);
  if (esperando) {
    lista.push({
      cuantos: esperando,
      texto: `${esperando} ${esperando === 1 ? 'persona espera' : 'personas esperan'} acceso`,
      detalle: 'Entró con el link y su cuenta está apagada: no ve nada hasta que la enciendas.',
      destino: 'config',
    });
  }

  const sinonimos = await sinonimosPendientes({ fuente }).catch(() => []);
  if (sinonimos.length) {
    lista.push({
      cuantos: sinonimos.length,
      texto: `${sinonimos.length} ${sinonimos.length === 1 ? 'sinónimo' : 'sinónimos'} por aprobar`,
      detalle: 'Nombres con los que la gente buscó y no encontró. Aprobarlos es un toque.',
      destino: 'config',
    });
  }

  return lista;
}

export const cuantos = (lista) => lista.reduce((t, p) => t + (p.cuantos || 1), 0);
