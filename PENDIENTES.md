# Pendientes

Lo que quedó a medias, para que una sesión nueva lo retome sin preguntar de cero.
Cuando algo se termina, se borra de aquí. Si algo espera una decisión de Samuel,
va en "Esperan tu respuesta" y nadie lo toca hasta que la dé.

Última revisión: 2026-10-19

## Estado

Comprobado contra producción el 19/10, después de cargar los servicios:

- **172 activos**: 160 productos + **12 servicios de impresión**.
- **172 de 172 con precio y costo en pesos.** El costo dejó de estar solo en dólares
  (`scripts/costos-en-pesos.mjs`), así que el margen ya no se abre solo cuando se mueve
  la tasa. 1 producto sin precio, oculto al cliente a propósito.
- **122 costos marcados como estimados** (112 del Excel + 10 servicios que imprimen).
- **0 fugas de costo al espejo público**, verificado producto por producto.
- **0 fotos en producción.** `scripts/fotos-de-carpeta.mjs` ya está commiteado y empareja
  48, pero todavía no se ha corrido contra Firebase: la colección `fotos` no existe.
  Hasta que se corra, el catálogo no muestra ninguna.

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

## Esperan tu respuesta — servicios de impresión (19/10/2026)

Los **12 servicios** están cargados y se pueden vender (`scripts/servicios-impresion.mjs`;
`--borrar` los desactiva, `--actualizar --aplicar` les baja precios y costos nuevos sin
duplicarlos). Faltan dos datos tuyos, y los dos son el mismo tipo de dato:

- [ ] **Cuánto te cuesta el cartucho de tóner de la Canon.** Es el único número que
      falta. Hoy está puesto en **85.000 el cartucho genérico de 2.000 páginas = 43 por
      hoja**, que es precio de mercado colombiano, no tu factura. Afecta solo a las dos
      impresiones B/N en hoja normal; si lo consigues en 60.000, bajan a 30 por hoja.

La tinta ya está resuelta con tu dato: **8 USD el juego de 4 botellas** genéricas de 65 ml
= ~98 pesos el ml. Epson califica el juego en 4.500 páginas en negro y 7.500 a color al 5%
de cobertura, y una hoja cubierta de lado a lado gasta unas 20 veces eso. De ahí salen los
tres números del script: 10 por hoja en negro, 20 a color liviano, 80 la hoja llena.
La tinta es tan barata que **no mueve ningún margen**: lo que los mueve es el papel.

Cuando aparezca la factura del tóner: se cambia `TONER_POR_HOJA` en el script, se corre
`--actualizar --aplicar`, y a los 10 servicios que imprimen se les cae la marca de
"costo estimado". El reparto por impresora ya está puesto como lo dijiste: hoja normal
B/N en la Canon de tóner, y opalina, fotográfico, vinilo y todo el color en la Epson. Los dos plastificados ya no la tienen:
su costo es la mica, y ese sí es precio de factura ($0,05 el carnet y $0,21 la carta).

El resto de los costos del catálogo quedó en pesos asumiendo que **se le compra al
proveedor en pesos**. Si algún producto se paga en dólares, su `costoCOP` está mintiendo
y hay que corregirlo a mano (el respaldo para deshacer todo es
`respaldo-costos-2026-10-19.json`).

## Por hacer

- [ ] **Correr `scripts/fotos-de-carpeta.mjs` contra Firebase.** Las 48 fotos emparejadas
      están en el código pero no en producción: hoy el catálogo no muestra ninguna.

- [ ] **160 productos sin foto** (los 12 servicios no llevan).
      `scripts/generar-imagenes.mjs` `scripts/generar-imagenes.mjs` cubre los 139 y está probado
      en seco; falta la llave en `.secretos/clave-imagenes.txt`. ~$5,56 el lote completo.
      Alternativa sin costo: el Estudio de Fotos con el recorte, ~25 minutos.

## De la investigación de reseñas (19/10/2026)

Ver [`docs/RESENAS.md`](docs/RESENAS.md). En orden de cuánto riesgo de abandono
quitan. Los tres primeros atacan el **registro parcial**, que es como mueren
estas apps: nadie las abandona, se dejan de registrar ventas y los reportes
empiezan a mentir.

- [ ] **"Qué pudo pasar" en el cierre con descuadre.** Anulaciones, precios
      bajados a mano, descuentos con su autor y retiros del turno, en la misma
      pantalla del faltante. Los datos ya están en `auditoria`.
- [x] **Respaldo que el dueño pueda guardar.** Hecho (23/10). Configuración →
      Datos: "Bajar respaldo completo" y "Restaurar". El formato está en
      `core/respaldo-formato.js`, aparte de Firestore, con prueba de ida y
      vuelta en `test/respaldo.test.mjs` — exportar, pasar por JSON y volver,
      al centavo y con los id intactos.
      **OJO con restaurar desde la app:** las reglas son append-only a
      propósito (`movimientos` no admite update; `ventas` y `cajas` exigen que
      el uid del documento sea el de quien escribe). Un respaldo trae los uid
      originales, así que el dueño NO puede reponer desde el teléfono lo que
      registró el empleado: la app lo dice y sigue con el resto. Para una
      recuperación de verdad está `scripts/restaurar-respaldo.mjs`, que entra
      con llave de administrador y no pasa por las reglas.
      Falta: **probarlo con los datos reales** — bajar el respaldo, mirar el
      archivo, y correr el script en seco contra producción.
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

## Esperan tu respuesta — del reconteo del dinero (22/10/2026)

- [ ] **Abre la caja antes de vender.** 8 de las 12 ventas se cobraron sin turno abierto
      (21 y 22/10): esa plata entró a la gaveta y ningún arqueo la cuenta.

## Hecho el 23/10/2026

- **La caja entiende los cambios de moneda.** El descuadre más común no era plata perdida:
  la venta es en pesos, el cliente paga con un dólar y el vuelto sale en pesos (o al
  revés). Como el cobro no anota el billete con que pagaron —y está bien que no lo haga—,
  el arqueo terminaba diciendo "sobra $ 5,00" y "faltan 20.500 pesos", y eso se lee como
  que alguien se quedó con algo. Ahora `core/cambio-moneda.js` empareja lo que sobra en una
  moneda con lo que falta en otra a la tasa de hoy; mientras se cuenta, el diálogo de
  cierre ya lo avisa, el reporte Z titula "La caja cuadra: fue un cambio de moneda" y la
  lista de cierres anteriores lo marca en verde en vez de en rojo. Lo que el cambio NO
  explica se dice aparte y con nombre propio ("aparte del cambio falta $ 2,00"): un aviso
  que tape un faltante de verdad sería peor que no tener aviso. La diferencia guardada no
  se toca, sigue siendo la de siempre.

## Límite conocido del arqueo del empleado

Cuando Abraham cierra su turno, su app NO puede leer los retiros, los ingresos ni los
traslados: son del dueño y las reglas de Firestore no se lo permiten (y está bien, de ahí
se deduce la ganancia). Entonces, si sacas plata de la gaveta mientras él tiene el turno
abierto, su cierre va a marcar un faltante de ese tamaño. Dos salidas, cuando moleste:
avisarle que lo escriba en la nota del cierre, o mover el retiro a después de cerrar.
Tu pantalla de Mi dinero sí lo cuenta todo bien.

## Hecho el 22/10/2026 — quinta ronda

- **Cobrar dejó de calcular vueltos.** Se probó al revés —pedir cuánto entregó el cliente y
  que la app restara— y era un estorbo: una pantalla más y un número que escribir con el
  cliente enfrente, para algo que quien atiende hace de cabeza mientras cuenta los billetes.
  Ahora se ve el total, se toca con qué pagó y listo. La gaveta sigue cuadrando: lo que
  queda dentro al final es el total, se haya pagado con el billete que se haya pagado.
- **Ajustar el monto, con el código.** Los precios caen en números que no se pueden dar con
  monedas ($ 1.520) y hay que cobrar 1.500. Antes eso obligaba a cambiarle el precio a un
  producto, que es mentira —el producto no cambió de precio, se redondeó la venta—. Ahora se
  ajusta el total: se guarda aparte (`ajusteUSD`), queda en auditoría con quién lo autorizó,
  y al empleado se le pide el PIN. El reporte por producto sigue mostrando el precio de
  etiqueta y el de ventas muestra lo que de verdad se cobró.
- El recibo muestra el total **en pesos** cuando así se cobró, y ya no repite "Pagó: $X"
  debajo de un total idéntico.

## OJO con el PIN

Mientras no haya PIN puesto, `pedirAutorizacion()` deja pasar a cualquiera —está escrito
así a propósito para no trancar el mostrador en un negocio que todavía no lo configuró—.
Eso significa que **hoy Abraham puede ajustar un total sin que nadie lo apruebe**. Queda
registrado en auditoría con su nombre, pero no se le pide permiso a nadie. Ponerlo es un
minuto en Configuración.

## Hecho el 22/10/2026 — cuarta ronda

- **Las deudas se fijan en PESOS**, como los precios. Antes vivían solo en dólares, así que
  mover el dólar movía lo que la gente debe: los 20.000 de Yenifer se habrían vuelto 25.200
  a cobrar con el dólar a 4.000. Ahora `saldoCOP` es el que manda y el dólar se deriva con
  la tasa del día. Las dos deudas que había quedaron fijadas con el **precio de la etiqueta**
  (`scripts/deudas-en-pesos.mjs`, en seco por defecto): Yenifer $20.000, Mamá $1.000 —
  exacto, no la conversión de 19.996 que habría salido de los dólares.
- La línea del carrito y la venta se llevan ahora el `precioCOP`, para que la deuda de un
  fiado sea el número de la etiqueta y no una conversión.
- **Anular una venta fiada ya borra la deuda.** No lo hacía: el cliente quedaba debiendo
  una mercancía que había devuelto.
- `deudaDe()` y `debe()` viven en `core/dinero.js` y no en `data/clientes.js`: ahí quedaban
  detrás del SDK de Firebase y no se podían probar. 6 tests nuevos en `test/deudas.test.mjs`.

## Hecho el 22/10/2026 — tercera ronda

- **Los bolívares nunca pasan por la gaveta** (`public/js/core/sitios.js`). Lo dijo Samuel:
  entran por pago móvil, no son billetes, y el que atiende no puede dar vuelto en
  bolívares. Van derecho a la caja fuerte. Esto era una bomba de tiempo: el arqueo sumaba
  a la gaveta cada venta cobrada en bolívares y al cerrar el turno iba a reclamar unos
  bolívares que están en un teléfono — un faltante inventado del tamaño de todo lo
  cobrado en Bs. Ahora el arqueo no los pide, y las cuentas del dueño los guardan donde
  están. Si algún día entran bolívares en efectivo, se cambia en ese archivo y nada más.
- **Cargados los Bs 23.545 del conteo**, en la caja fuerte.
- **`rehacer-cuentas.mjs` tiene hora de corte.** Volver a correrlo borraba del saldo el
  efectivo de las ventas hechas DESPUÉS del conteo. Ahora solo neutraliza lo anterior al
  corte y lo posterior se suma encima, así que se puede correr otra vez sin romper nada.

- **Gastos y salidas en una sola pantalla.** El dueño venía a "Gastos" a anotar el pago de
  un trabajador o lo que saca para él, no lo encontraba en el desplegable (eso vivía en
  Mi dinero → Sacar) y lo metía en "Otros", que lo contaba como gasto del negocio y le
  hundía la ganancia del mes. Ahora el desplegable trae los dos grupos —"Gasto del negocio
  (baja la ganancia)" y "Sale de la caja pero no es gasto"— y la app guarda cada cosa en su
  colección, diciendo en pantalla qué va a pasar con esa plata. La lista de abajo muestra
  las dos clases, con su etiqueta. Al empleado solo se le muestran los gastos.
- **Categorías con las palabras de Samuel**: "Sueldos" pasó a "Sueldos / pago de trabajador"
  y se agregó "Herramientas o artículos para el negocio", que no existía.

## Hecho el 22/10/2026 — segunda ronda

- **Las cuentas de dinero se rehicieron desde el conteo a mano** de Samuel
  (`scripts/rehacer-cuentas.mjs`, en seco por defecto, `--aplicar` para hacerlo). Se
  borraron los 5 ingresos y el retiro viejos (respaldo en `respaldo-cuentas-2026-10-22.json`,
  y la operación quedó en `auditoria`). **Las 13 ventas, los gastos y los clientes no se
  tocaron.** Quedó así:

  | | Dólares | Pesos |
  |---|---|---|
  | **Caja** | $ 5,00 | $ 38.000 (15.000 en monedas + 23.000 en billetes) |
  | **Caja fuerte** | $ 11,00 | $ 398.500 (16.500 en monedas + 382.000 en billetes) |

  El conteo entró como "Dinero inicial" y, al lado, un "Ajuste de conteo" por moneda que
  neutraliza lo registrado ANTES del conteo (si no, la app le sumaba encima el efectivo de
  las ventas viejas y el total salía de más). Todo con su explicación escrita.

- **Deudores, claro.** La pantalla se llamaba "Deudas" y era una lista plana con un número.
  Ahora: los que deben van arriba y aparte de los que están al día, cada uno dice **hace
  cuánto** debe (ámbar al mes, rojo a los dos), y la ficha muestra **qué se llevó fiado y
  qué ha abonado**, con fechas y productos. "Cobrarle todo" llena el abono con el saldo
  completo. Y el panel avisa quién te debe y cuánto, que es la plata que más fácil se
  pierde. (Índice nuevo: `ventas` por `clienteId + ts`.)

## Hecho el 22/10/2026

- **El empleado ya puede ver su reporte X y cerrar su turno.** Sus consultas de ventas y
  gastos pedían la colección completa y las reglas las rechazaban ENTERAS, así que el
  arqueo se caía en silencio y se quedaba sin el "debería haber". Ahora se filtran por su
  uid (el índice `uid + ts` ya existía para ventas; se agregó el de gastos).

- **Reconteo completo del dinero** (`node scripts/contar-dinero.mjs`, solo lee, `--detalle`
  lista movimiento por movimiento). Rehace la cuenta desde cero, moneda por moneda y sitio
  por sitio, y dice qué no cuadra y por qué.
- **El vuelto se registra.** Era la causa de los faltantes: una venta de $0,79 pagada con un
  billete de 5.000 pesos dejaba al arqueo esperando los 5.000 completos. Ahora el cobro
  pregunta en qué moneda sale el cambio, la venta lo guarda (`vuelto`) y el arqueo lo resta.
  Las ventas viejas se reconstruyen con la tasa que ellas mismas dejaron congelada.
- **El arqueo dejó de perder movimientos.** `esperadoDelTurno` ahora cuenta también los
  abonos de fiados, el dinero que se mete y los traslados a la caja fuerte, y ya no filtra
  por quién lo anotó: la gaveta es una sola. El reporte X muestra el desglose de qué entró
  y qué salió, y "Cobrado" es cobrado de verdad (sin lo fiado y menos el vuelto).
- **Los fiados cobrados cuentan como plata.** `dineroPorLugar` ignoraba los abonos: una
  deuda que te pagaban no aparecía en ninguna parte y el total salía por debajo de lo que
  había en la gaveta. Los abonos guardan ahora `dia` y `lugar`.
- **"Conté mi dinero" pasó a ser "Cuadrar lo contado".** Antes cargaba el conteo completo
  como un ingreso nuevo: cargarlo dos veces duplicaba la plata. Ahora muestra cuánto
  debería haber de cada moneda y anota solo la diferencia, como "Ajuste de conteo".

- **Venta libre** en el punto de venta: nombre libre, monto libre y **ganancia estimada**
  aparte. No toca inventario y la línea queda marcada `fueraDeCatalogo` y
  `gananciaEstimada` en la venta, para poder separarlas en los reportes. El atajo va
  **primero** en la barra: antes quedaba al final de una barra que se desborda con la
  barra de scroll escondida, así que no se veía y no había manera de hacer una.
- **Cambiar la foto de un producto que ya tiene.** Tocar la miniatura en Inventario (o
  "Cambiar foto" en la ficha) abre ver / cambiar / quitar. Antes el único camino era
  arrastrar el archivo desde una computadora: en el teléfono no había ninguno, porque el
  Estudio de Fotos solo lista los productos SIN foto. Guardar la ficha ya no pisa el
  `tieneFoto` nuevo, y un error al guardar la foto ahora se avisa en pantalla.

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
