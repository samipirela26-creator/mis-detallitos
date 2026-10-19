# Pendientes

Lo que quedó a medias, para que una sesión nueva lo retome sin preguntar de cero.
Cuando algo se termina, se borra de aquí. Si algo espera una decisión de Samuel,
va en "Esperan tu respuesta" y nadie lo toca hasta que la dé.

Última revisión: 2026-10-19

## Estado

Todo lo de la auditoría está **commiteado y desplegado**. Nada pendiente de subir.
Comprobado en producción el 19/10: v30 en el aire, 158 de 160 productos con precio en pesos,
112 costos marcados como estimados, 2 sin precio (ocultos al cliente a propósito),
0 fugas de costo al espejo público, 21 productos con foto.

Lo que queda abajo depende de Samuel: son datos que solo él tiene o cosas que hace con el
teléfono en la mano. **Ninguna sesión debe inventarlos.**

## Esperan tu respuesta

- [ ] **Las dos cajas que faltan.** `Resaltador Pointer` (costo $3,50) y `Marcadores para CD`
      ($1,50). Samuel dijo que el Resaltador es de creyón y que sus números son los reales,
      pero así figura vendiéndose a pérdida ($3,50 de costo contra $1,33 de precio).
      Hay que mirar la factura. No se le inventa un costo.

- [ ] **Revocar la llave de Firebase si estuvo expuesta.** Las dos copias de ~/Descargas ya
      se borraron con `shred`, pero si alguna anduvo en un correo o en una nube, hay que
      revocarla en la consola de Firebase → Cuentas de servicio.

- [ ] **Probar el recorte y la foto en el teléfono.** El marco corrido en fotos verticales ya
      está arreglado y verificado en el navegador, pero sigue sin probarse tomando una foto
      real. Confirmar también que sale en WebP de ~15 KB y no en JPEG de 122 KB.

- [ ] **Poner el PIN.** Ya se puede: el hash salió de la colección pública y las reglas
      nuevas están desplegadas. Comprobado el 19/10: todavía no hay ninguno puesto, así que
      hoy cualquier empleado puede bajar un precio sin que nadie lo frene. Con 6 dígitos en
      vez de 4 es 100 veces más difícil de adivinar.

## Por hacer

- [ ] **139 productos sin foto.** `scripts/generar-imagenes.mjs` cubre los 139 y está probado
      en seco; falta la llave en `.secretos/clave-imagenes.txt`. ~$5,56 el lote completo.
      Alternativa sin costo: el Estudio de Fotos con el recorte, ~25 minutos.

## De la investigación de reseñas (19/10/2026)

Ver [`docs/RESENAS.md`](docs/RESENAS.md). En orden de cuánto riesgo de abandono
quitan. Los tres primeros atacan el **registro parcial**, que es como mueren
estas apps: nadie las abandona, se dejan de registrar ventas y los reportes
empiezan a mentir.

- [ ] **Venta rápida de producto suelto.** Nombre libre y monto libre, sin tocar
      inventario, marcado "fuera de catálogo" en reportes. Sin esto, lo que no
      está en el catálogo se cobra por fuera de la app y los números se arruinan.
- [ ] **"Qué pudo pasar" en el cierre con descuadre.** Anulaciones, precios
      bajados a mano, descuentos con su autor y retiros del turno, en la misma
      pantalla del faltante. Los datos ya están en `auditoria`.
- [ ] **Respaldo que el dueño pueda guardar.** Un botón que baje un JSON con
      catálogo, ventas, cajas, clientes y deudas. "El respaldo no restauró y
      perdí todo" es la queja que no se perdona.
- [ ] **Primera corrida guiada y modo de práctica.** Una venta de ejemplo que no
      toca la caja, y ayuda corta de las tres cosas que asustan: anular, cambiar
      precio, cerrar turno. El empleado que no entiende vuelve al papel.
- [ ] **Carrito en espera** en el punto de venta.
- [ ] **Aviso más visible del stock congelado sin señal**, para que nadie dude de
      que la venta entró y la cobre dos veces.
- [ ] **Camino de vuelta a la versión anterior** si una publicación sale mal, sin
      borrar caché a mano desde el teléfono.

(El PIN ya está arriba, en "Esperan tu respuesta": sin él, la causa "el empleado
hace lo que quiera" sigue abierta.)

## Hecho en la ronda de la auditoría (18/10/2026)

- **Precios fijados en pesos.** `precioCOP` es ahora el precio de verdad y el dólar se deriva
  con la tasa del día; al cargar una tasa nueva, los 158 precios se recalculan solos. El
  catálogo muestra el peso guardado, que es el número de la etiqueta. Respaldo y reversa en
  `respaldo-precios-2026-10-18.json`.
- **112 costos marcados como estimados.** No se borraron: salen con etiqueta "costo estimado"
  en Inventario, el formulario avisa que ese margen no es real y el valor del inventario se
  muestra como aproximado. `scripts/marcar-costos-estimados.mjs --limpiar "<nombre>"` quita la
  marca cuando se carga el costo real de una factura.
- **El hash del PIN salió de la colección pública** (`config/general` → `equipo/seguridad`,
  que solo lee quien trabaja aquí) y pasó de SHA-256 a PBKDF2 con sal y 200.000 vueltas.
- **Las dos llaves de administrador de ~/Descargas, borradas con `shred`.**
- **Los productos sin precio ya no se le muestran al cliente** ni se venden en silencio: el
  punto de venta avisa antes de cobrar $0,00.
- **El importador huele las columnas de costo que son fórmulas** y avisa antes de guardar.
  Probado contra el Excel original: detecta el "precio ÷ 1,30" en 76 de 158 filas.

## Hecho antes (17-18/10/2026)

- Recorte de fotos antes de guardar, con proporciones, giro y el marco ya alineado en verticales.
- WebP garantizado también en iPhone (libwebp en WebAssembly), con ruta relativa.
- Costo por paquete (`12 por 1,80`), con sus trampas tapadas: "12 1,80", negativos, el millar.
- El precio mínimo ahora sí llega al empleado: el PIN se pide cuando debe.
- Las 160 categorías aplicadas, 21 fotos en el catálogo.
- El catálogo público volvió a mostrar bolívares y pesos (le faltaba un índice de Firestore).
- `CACHE_NAME` sube solo cuando cambia `public/`; `npm run publicar` lo revisa antes de desplegar.
