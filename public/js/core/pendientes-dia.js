// pendientes-dia.js — qué pendientes le tocan a un día. Función pura, sin Firebase.
//
// Cuatro formas de repetirse:
//   diario   todos los días
//   dias     ciertos días de la semana (`dias`: 0 = domingo … 6 = sábado)
//   alterno  un día sí, un día no, contando desde `ancla` (ese día toca)
//   unico    solo en `fecha`
//
// Los días son texto 'YYYY-MM-DD' LOCAL (diaISO de ui/html.js), nunca UTC: a las
// 8 de la noche en Venezuela ya es "mañana" en UTC y el pendiente cambiaría de día
// con el empleado todavía trabajando.

export const TIPOS = ['diario', 'dias', 'alterno', 'unico'];
export const NOMBRES_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const MS_DIA = 86400000;

/** Días enteros entre dos fechas ISO (b - a). Se calcula en UTC al mediodía para
 *  que el cambio de hora no meta o saque un día. */
export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / MS_DIA);
}

/** Día de la semana (0 = domingo) de una fecha ISO. */
export const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** ¿Le toca este pendiente a ese día? */
export function tocaHoy(p, dia) {
  if (!p || p.activo === false) return false;
  switch (p.tipo) {
    case 'diario': return true;
    case 'dias': return Array.isArray(p.dias) && p.dias.includes(diaSemana(dia));
    case 'alterno': return !!p.ancla && diasEntre(p.ancla, dia) >= 0 && diasEntre(p.ancla, dia) % 2 === 0;
    case 'unico': return p.fecha === dia;
    default: return false;
  }
}

/** Cómo se dice la repetición, para la lista del dueño. */
export function describirRepeticion(p) {
  switch (p.tipo) {
    case 'diario': return 'Todos los días';
    case 'dias': {
      const orden = [1, 2, 3, 4, 5, 6, 0];
      return orden.filter((n) => p.dias?.includes(n)).map((n) => NOMBRES_DIA[n]).join(' ') || 'Sin días';
    }
    case 'alterno': return 'Un día sí, uno no';
    case 'unico': return `Solo ${p.fecha}`;
    default: return '';
  }
}
