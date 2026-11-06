// pendientes.js — la lista de pendientes del empleado.
//
// Dos colecciones:
//   pendientes         las plantillas que escribe el dueño (qué y cada cuándo)
//   pendientes_hechos  una marca por día y por pendiente: id `{dia}_{pendienteId}`
//
// El id de la marca es determinista a propósito: tocar la casilla dos veces o
// reintentar sin señal escribe el mismo documento, no uno duplicado. Marcar es
// crear la marca; desmarcar, borrarla.
import { col, ref } from '../core/firebase.js';
import {
  setDoc, deleteDoc, query, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { usuarioActual } from '../core/sesion.js';
import { anotar } from './auditoria.js';
import { encolar } from './cola.js';
import { traer, SERVIDOR } from './lectura.js';
import { diaISO } from '../ui/html.js';

export const listarPendientes = ({ fuente = SERVIDOR } = {}) =>
  traer(query(col('pendientes')), fuente);

/** Las marcas de un día (de todo el equipo). */
export const hechosDelDia = (dia, { fuente = SERVIDOR } = {}) =>
  traer(query(col('pendientes_hechos'), where('dia', '==', dia)), fuente);

/** Las marcas de un rango de días, para ver qué cumple y qué no el equipo. */
export const hechosEntre = (desde, hasta, { fuente = SERVIDOR } = {}) =>
  traer(query(col('pendientes_hechos'), where('dia', '>=', desde), where('dia', '<=', hasta)), fuente);

/** Crea o corrige una plantilla. `datos`: titulo, tipo, dias, fecha, ancla, activo. */
export function guardarPendiente(id, datos) {
  const limpio = {
    titulo: String(datos.titulo || '').trim().slice(0, 120),
    tipo: datos.tipo,
    dias: datos.tipo === 'dias' ? datos.dias || [] : [],
    fecha: datos.tipo === 'unico' ? datos.fecha || diaISO() : null,
    ancla: datos.tipo === 'alterno' ? datos.ancla || diaISO() : null,
    activo: datos.activo !== false,
  };
  if (!limpio.titulo) throw new Error('Falta el texto del pendiente');
  const documento = id ? ref('pendientes', id) : ref('pendientes', `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  encolar(setDoc(documento, { ...limpio, ...(id ? {} : { creado: serverTimestamp() }) }, { merge: true }), 'pendiente');
  anotar(id ? 'pendiente-editado' : 'pendiente-creado', { pendienteId: documento.id, titulo: limpio.titulo });
  return documento.id;
}

export function pausarPendiente(id, activo) {
  encolar(setDoc(ref('pendientes', id), { activo }, { merge: true }), 'pendiente');
}

export function borrarPendiente(id) {
  encolar(deleteDoc(ref('pendientes', id)), 'pendiente-borrado');
  anotar('pendiente-borrado', { pendienteId: id });
}

export function marcarHecho(pendienteId, dia = diaISO()) {
  const u = usuarioActual();
  encolar(setDoc(ref('pendientes_hechos', `${dia}_${pendienteId}`), {
    dia, pendienteId, uid: u.uid, nombreUsuario: u.nombre, ts: serverTimestamp(),
  }), 'pendiente-hecho');
}

export function desmarcarHecho(pendienteId, dia = diaISO()) {
  encolar(deleteDoc(ref('pendientes_hechos', `${dia}_${pendienteId}`)), 'pendiente-desmarcado');
}
