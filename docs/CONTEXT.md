# Mis Detallitos — contexto del proyecto

Papelería. Un local. Tres personas usan la app: el dueño y dos empleados
(su mamá —socia— y su primo). No es un sistema homologado ni factura fiscal:
es control interno de ventas, inventario y **ganancia real**.

## Por qué existe

Se usaba **Treinta** y se abandonó por dos razones: es de pago, y **el buscador
no encontraba los productos** cuando uno no recuerda el nombre exacto.
Las dos razones son las dos quejas más repetidas en las reseñas de todo el
sector; la investigación está en [`RESENAS.md`](RESENAS.md). La
pregunta que el dueño no puede responder hoy es *"¿cuánto le estoy ganando de
verdad a cada cosa?"*.

## Reglas del negocio que mandan el diseño

- **Tres monedas**: USD, COP (pesos) y VES (bolívares). El cliente puede pagar
  mezclando. La contabilidad se lleva **en USD** (si no, la inflación destruye
  los reportes históricos). Cada pago guarda la tasa que se usó ese día y esa
  tasa **nunca** se recalcula hacia atrás.
- **Precio fijo vs precio variable**, por producto. El sacapuntas siempre vale
  lo mismo (fijo). La fotocopia B/N "vale 500 pesos" pero a veces se da en menos
  (variable): el POS pide el precio al vender. Opcionalmente hay escalas por
  cantidad (200 copias salen más baratas).
- **El empleado no ve costos ni ganancias.** No es cosmético: por eso existe la
  colección espejo `productos_venta`. Ocultar el campo en la pantalla no sirve,
  cualquiera lo lee desde la consola del navegador.
- El dueño quiere **tablas, gráficos y ranking de ventas por persona**.
- **Llenar el inventario por primera vez (~1000 productos) es el mayor riesgo.**
  Vía elegida: Excel + un "Estudio de Fotos" aparte, porque las fotos son lo
  engorroso del Excel.

## Plan de fases

0. Esqueleto: PWA, Auth, roles, reglas, dinero. ← **hecha**
1. Catálogo + importar Excel + Estudio de Fotos.
2. Buscador tolerante a errores + sinónimos.
3. Vender (carrito, 3 monedas, precio variable, offline).
4. Caja/turnos, gastos, deudas.
5. Panel del dueño: reportes y gráficos.
6. IA en el buscador, código de barras, sugerencia de tasas.

El plan completo está en `~/.claude/plans/mira-quiero-una-app-sharded-hearth.md`.

## Jerarquía de acciones (las tres reglas de los botones)

Se escribieron en octubre de 2026 porque el reparto se había descuadrado: 71
botones de contorno contra 33 llenos, y en el recibo el turquesa lo llevaba
"Listo" —que solo cierra— mientras "Compartir" quedaba en gris. Cuando casi todo
es contorno, nada resalta y hay que leer los tres botones para decidir.

Hay **tres niveles**, y los tres ya existen en `3-componentes.css`:

| Nivel | Clase | Para qué |
|---|---|---|
| Principal | `.btn.principal` | La acción que vino a hacer. **Una sola por pantalla o diálogo.** |
| Secundario | `.btn.plano` | Alternativas de verdad: otro camino válido. |
| Terciario | `.btn.callado` | Cerrar, cancelar, dejar para después. Sin borde ni fondo. |

Las reglas:

1. **Un solo `.principal` por pantalla o diálogo.** Si hay dos, ninguno resalta.
2. **El `.principal` es la acción siguiente, nunca el que cierra.** Si el botón
   más fuerte de la pantalla no hace nada, está mal puesto. Por eso en el recibo
   el turquesa es "Siguiente venta" (que además devuelve el foco al buscador) y
   no "Listo".
3. **Cancelar y cerrar van en `.callado`** cuando comparten fila con una acción
   real. Si son el único botón —el "Listo" del cierre Z, el "Ver inventario" de
   la pantalla de fotos— pueden ser `.principal`: no compiten con nada.
4. **Lo destructivo va en rojo, aparte, y con `confirmar()`** de
   `ui/avisos.js`, que ya pinta el botón con `peligro: true`. Esto estaba bien
   hecho desde el principio y no se toca.

Y una consecuencia: **la navegación no es una acción.** La píldora de abajo dice
dónde estás; los botones hacen algo. Un botón que solo navega no lleva
`.principal` si en esa pantalla hay algo que hacer.

## El respaldo, y por qué hay DOS caminos (octubre 2026)

El botón de la app y el script de la computadora no son lo mismo, y la
diferencia no es comodidad: es que **las reglas de Firestore impiden restaurar
desde la app, a propósito**.

- `movimientos` (el ledger de inventario) tiene `allow update, delete: if false`.
- `ventas`, `cajas` y `gastos` solo dejan crear si `soyYo()`, es decir si el
  `uid` del documento es el de quien está escribiendo.

Un respaldo trae los **uid originales**. Cuando el dueño intenta reponer una
venta que registró el empleado, la regla la rechaza — y hace bien: eso es lo
que impide que una sesión robada reescriba el historial.

Consecuencia práctica:

| | Qué puede | Cuándo se usa |
|---|---|---|
| Botón en Configuración | Bajar todo. Restaurar lo que las reglas permitan, y **decir qué no entró** | Día a día. Bajar el respaldo cada tanto |
| `scripts/restaurar-respaldo.mjs` | Todo, con llave de administrador | Cuando la base está vacía o a medias |

Lo que NO va en el respaldo, y por qué: `secretos` (llaves de API — un respaldo
se manda por WhatsApp sin pensarlo), `equipo` (el hash del PIN es una
credencial) y `productos_venta` (el espejo del empleado se **reconstruye** desde
`productos`; restaurar uno viejo le devolvería precios que ya no existen).

La regla que manda: **un respaldo que no se ha restaurado no es un respaldo.**
Por eso el formato vive en `core/respaldo-formato.js`, sin tocar Firebase, y
`test/respaldo.test.mjs` lo exporta, lo pasa por JSON y lo trae de vuelta
comprobando que no se perdió ni un centavo ni un id ni un nanosegundo.

## Decisiones técnicas y por qué

- **Módulos ES sin bundler.** No hay paso de compilación que se pueda romper.
  Un solo `<script type="module">` en `index.html`; el orden lo resuelven los
  imports (al contrario de AsistApp, donde el orden de los `<script>` importa).
- **CSS en 4 hojas numeradas: el número es la cascada.** No reordenar los `<link>`.
- **Firestore con `persistentSingleTabManager`**, no multi-tab: con el manejador
  multi-pestaña hay un problema conocido en el que las pestañas en segundo plano
  reanudan los listeners con un token viejo y **se vuelve a cobrar cada
  consulta** (casos reportados de millones de lecturas al mes sin nadie usando
  la app). Una caja registradora no necesita varias pestañas.
- **Todo el dinero en enteros** (`public/js/core/dinero.js`). Nunca float.
- **Ventas con id local estable** → un reintento no duplica la venta.
- **Sin Cloud Functions y sin Cloud Storage por ahora**, para quedarnos en el
  plan gratuito (Spark): los proyectos nuevos necesitan plan Blaze para
  habilitar Functions y Storage. Consecuencias:
  - El espejo `productos_venta` lo escribe la app del dueño en el mismo
    `writeBatch` que `productos` (ver `data/productos.js`).
  - Las fotos van comprimidas (~800px WebP, ~60 KB) en documentos de Firestore
    aparte, cargadas por demanda y guardadas en IndexedDB. Si algún día se pasa
    a Blaze, se mueven a Storage (`storage.rules` ya está escrito).
  - La ayuda con IA del buscador (Fase 6) necesita un proxy del lado servidor
    para no exponer la clave de Gemini: eso sí pide Blaze, o un servicio gratis
    aparte. Se decide cuando se llegue a esa fase.

## Despliegue

`firebase deploy` desde la raíz. Hosting + reglas de Firestore. El proyecto
Firebase es `mis-detallitos` (ver `public/js/core/firebase-config.js`, que **no**
está en el repo).

## Estado (7 de octubre de 2026)

Las fases 0 a 6 están hechas y probadas contra los emuladores con un catálogo
real de 1000 productos. Lo único que falta es lo que depende del dueño: crear el
proyecto en Firebase y pegar el `firebaseConfig`.

Probado de punta a punta:

- importación de 1001 productos desde un CSV desordenado (encabezados raros,
  precios con coma, duplicados y filas con error): 38 segundos, con vista previa
  y deshacer;
- búsqueda con errores de escritura sobre esos 1000 productos: 10 ms por
  búsqueda ("lapis mongol", "sakapunta", "cuadreno" encuentran lo que deben);
- venta con pago mixto COP + VES + USD, vuelto correcto y stock descontado
  exacto;
- **tres ventas sin internet**: subieron las tres, una sola vez cada una
  (idempotencia), y el stock cuadró al reconectar;
- caja: fondo + ventas por moneda, y una diferencia de Bs 500 detectada en el
  cierre Z;
- fotos: una imagen de 2000×1500 queda en WebP de pocos KB, se guarda y se lee
  del caché local;
- fiado y abonos; gastos en pesos convertidos a USD con la tasa del día;
- las 12 pruebas de reglas de seguridad, incluida la importante: **el empleado,
  desde la consola del navegador, recibe `permission-denied` al intentar leer
  los costos.**

### Atajos del mostrador (octubre 2026)

Se midió el camino de una venta en toques y se atacaron los peores. Lo que hay
que saber para no deshacerlo sin querer:

- **El código de barras ya se leía** (`data/busqueda.js` lo resuelve de primero,
  antes que cualquier búsqueda por nombre); lo que faltaba era quién lo dictara.
  Eso es `features/escaner.js`, con `BarcodeDetector` nativo — no se metió una
  librería de decodificación para no inflar el precache.
- **Los chips de la pantalla de vender se aprenden solos** (`data/favoritos.js`):
  un contador local en IndexedDB que se divide entre dos cada 300 usos, para que
  lo de la temporada pasada se apague. Antes eran tres nombres escritos en el
  HTML, que sirven el primer día y después mienten.
- **Un número suelto NO se interpreta como cantidad.** Hace falta la `x`
  (`3x lapiz`). Si se aceptara el número solo, pedir un "cuaderno 100 hojas"
  agregaría cien cuadernos. Está probado en `test/velocidad.test.mjs`.
- **El índice de Fuse se arma al cargar el catálogo**, no en el primer tecleo:
  si no, la primera venta del día paga indexar mil productos con el cliente
  esperando.

### Vender sin soltar el teclado (octubre 2026)

En la laptop la mano está en el teclado, no en el pulgar, y antes había que ir
al ratón en cada línea. Hoy una venta completa se hace a ciegas:

| Tecla | Qué hace |
|---|---|
| `/` | Salta al buscador desde cualquier parte de la pantalla de vender |
| `↑` `↓` | Mueve el resaltado por los resultados |
| `Enter` | Agrega el resaltado. Sin resaltar, agrega el primero |
| `Escape` | Limpia el buscador |
| `3x lapiz` | Agrega tres de un golpe |

Dos trampas que ya costaron una vez:

- **El resaltado se reinicia en cada búsqueda nueva** (`pintarResultados`). Si
  no, el índice apunta a un producto que ya no está en pantalla y `Enter` cobra
  cualquier cosa.
- **El atajo de `/` se quita al desmontar la pantalla.** Es un listener en
  `document`, no en el nodo: sin quitarlo se acumula uno nuevo cada vez que se
  vuelve a Vender, y sigue escuchando en las demás pantallas.

Y al cerrar el recibo el foco vuelve solo al buscador, así que la venta
siguiente empieza escribiendo.

### Deuda técnica conocida

- Mientras se está sin señal, el stock que ve la pantalla no baja hasta
  reconectar (la venta sí queda registrada y el stock cuadra después).
- La ayuda de IA en el buscador (Gemini) no está: necesita un proxy del lado
  servidor para no exponer la clave, y eso exige plan Blaze. El buscador local
  ya resuelve los casos reales probados; la IA sería para frases tipo "el palito
  que sirve para pegar anime".
- Las ventas que registra un empleado guardan costo 0 (no lo puede leer); los
  reportes lo completan con el costo actual del catálogo y lo avisan en pantalla.

### El emulador tiene que usar el MISMO id de proyecto que la app

`firebase emulators:start --project mis-detallitos`. Si se arranca con otro id
(por ejemplo `demo-detallitos`) el emulador **no aplica `firestore.rules`** a los
datos de la app: las pruebas por REST pasan contra un proyecto y el navegador
escribe contra otro, y aparecen `permission-denied` imposibles de explicar
(errores que señalan números de línea que en el archivo son comentarios).
Ya pasó una vez; de ahí el `--project mis-detallitos` fijo en `npm run emuladores`.
