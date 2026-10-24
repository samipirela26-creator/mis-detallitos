// producto-publico.js — qué del producto puede ver el empleado, y qué NO.
//
// Está aquí, en un módulo sin dependencias, porque esta regla la necesitan dos
// mundos que no se pueden importar entre sí: la app (`data/productos.js`, que
// usa el SDK web de Firebase) y los scripts de mantenimiento que corren en Node
// con la llave de administrador (`scripts/restaurar-respaldo.mjs`).
//
// Tenerla escrita dos veces era el camino directo a que un día el espejo
// público se rehiciera desde un script con una lista de campos desactualizada y
// le filtrara el costo al empleado. Una sola lista, un solo sitio.

/**
 * Los campos que NUNCA viajan a `productos_venta`.
 *
 * Es una lista de EXCLUSIÓN y no de inclusión a propósito: si mañana alguien
 * agrega un campo nuevo al producto, llega solo al empleado. Lo que se olvida
 * es un dato de más, no un dato de menos — y los que no pueden salir están
 * todos aquí, enumerados.
 */
export const SECRETOS = [
  'costoUSD', 'costoCOP', 'costoPaquete', 'costoEstimado',
  'margenObjetivo', 'proveedor', 'notaCosto',
];

/**
 * El producto tal como lo ve el empleado: sin costos ni nada que los deduzca.
 *
 * El `precioMinimoUSD` SÍ viaja cuando el dueño puso uno: es un piso de venta
 * que él eligió, no el costo. Sin él, `requiereAutorizacion` le daba `0` al
 * empleado y el PIN no se pedía nunca, justo a quien debía frenar. Cuando no
 * hay mínimo puesto no se manda nada, porque ahí el campo sí delataría el
 * costo (sería el costo redondeado).
 */
export function versionVenta(p) {
  const copia = { ...p };
  for (const campo of SECRETOS) delete copia[campo];
  if (!(copia.precioMinimoUSD > 0)) delete copia.precioMinimoUSD;
  delete copia.incompleto;
  return copia;
}
