# Por qué los negocios pequeños abandonan estas apps

Investigación de octubre de 2026 sobre reseñas y estudios de apps parecidas a
Mis Detallitos (punto de venta, inventario y control de plata para negocios de
una sola tienda): Treinta, Loyverse, Kyte, Square, Shopify POS, Lightspeed,
inFlow, Zoho Inventario, Sortly, "Mi Negocio", Tiendatek.

**Honestidad sobre el tamaño.** No se leyeron 10.000 reseñas una por una: no
hay forma de descargarlas sin las APIs de las tiendas, y Capterra, G2 y
Software Advice bloquean la lectura automática (HTTP 403). Lo que sí se hizo:

- se leyeron **textualmente** las reseñas accesibles de Treinta (App Store
  Colombia, sobre 2.900 calificaciones), Kyte (App Store), "Mi Negocio" (Play)
  y el hilo de comerciantes que se van de Shopify POS;
- se recogió el **resumen de contras** de corpus que suman decenas de miles de
  reseñas (Loyverse y Square en Capterra/G2/Software Advice, Lightspeed, Toast,
  Clover, inFlow, Zoho, Sortly, POS Nation);
- se incorporó el **único estudio con seguimiento real de abandono** que se
  encontró: el piloto de IPA con Tiendatek en Colombia.

Lo que vale de aquí no es el conteo, es que **las mismas ocho causas se repiten
en todas las fuentes**. Lo que sigue es cada causa, la evidencia, y qué nos
toca a nosotros.

---

## El dato que hay que tener pegado en la frente

Piloto de IPA / Frogtek con **Tiendatek** en Colombia (58 tenderos, teléfono
regalado, capacitación en una o dos visitas y seis meses de soporte técnico
gratis):

- **96%** dijo que la recomendaría a un colega.
- A los 10 meses, de 40 encuestados, **solo 10 la seguían usando**.
- De los 15 tenderos que no llevaban ningún registro antes, **seis empezaron a
  usar cuadernos y ninguno adoptó la app**.
- Los que sí la mantuvieron eran los que **ya llevaban cuentas por escrito**.

Dos conclusiones que mandan sobre todo lo demás:

1. **Que les guste no significa que la usen.** Encuestar satisfacción miente.
   Lo único que mide adopción es si las ventas de ayer están registradas.
2. **El enemigo no es la competencia, es el cuaderno.** El cuaderno nunca se
   actualiza, no pide contraseña, no se queda sin batería y no cobra.

Y el modo en que murió: *"no registraron todas las transacciones a través de la
aplicación, lo que limitó su capacidad de aprovechar los informes de
rentabilidad y de inventario"*. **El registro parcial es la enfermedad.** Nadie
decide abandonar; se salta tres ventas en una cola, el inventario deja de
cuadrar, los reportes empiezan a mentir, y el día que el número en pantalla
contradice lo que hay en la gaveta, la app se vuelve un adorno.

---

## Las ocho causas de abandono

### 1. Cargar el inventario la primera vez

Es la barrera número uno para empezar, y aparece sola en las fuentes
hispanohablantes: registrar cientos de productos con nombre, precio y código
es tedioso y **mucha gente abandona antes de empezar**; a mano puede tomar
días. Por eso la competencia vende "55.000 productos precargados" o importar
el Excel que ya tienes. Un comerciante contó que **lo más largo de toda la
implementación fue ordenar el Excel, no configurar el sistema**.

**Nosotros**: cubierto, y es nuestra mejor pieza. Importador que adivina
columnas, vista previa, duplicados, deshacer completa, 1001 productos en 38
segundos, y el Estudio de Fotos aparte porque las fotos son lo engorroso.
Ya corrido de verdad con el catálogo real.

### 2. El "gratis" que después cobra

La causa más repetida en reseñas de Treinta, y la primera de las dos razones
por las que este negocio ya abandonó una app. Textual de App Store Colombia:
*"ahora que deseo volverla a usar me llevo la sorpresa de que cobran por
usarla"*, *"es posible que se tenga que pagar para poder empezar a trabajar"*,
*"para todo toca pagar"*. Loyverse: usuarios que reportan haber tenido que
pagar mensual por lo que empezó gratis. Shopify: funciones básicas que se
mudan a planes de pago. Comerciantes que se van describen la cuenta
duplicándose en cinco años pagando "bloat" que nunca tocan.

**Nosotros**: inmune por diseño, y conviene no perderlo. Spark de Firebase, sin
Functions, sin Storage, fotos comprimidas en Firestore. **Cada decisión que
empuje a Blaze** (el proxy de Gemini, mover fotos a Storage) hay que medirla
contra esto: la razón original de existir de esta app fue no pagar.

### 3. Sincronización, respaldo y datos perdidos

El miedo más caro, porque no se recupera la confianza. Reseña de "Mi Negocio":
compró la app dos veces, pasó **casi dos días cargando el inventario**, cambió
de teléfono y **el respaldo no restauró**: perdió todo. Otra: *"si el teléfono
se pierde o se daña toda tu información se va; ese riesgo es demasiado para
tomarlo"*. Treinta: actualizaciones que borraron inventario y no sincronizan
entre web y app. Kyte: pantalla en blanco y *"tengo miedo de que si borro la
app lo pierdo todo"*.

**Nosotros**: bien en la base (Firestore en la nube, no local; funciona en
varios teléfonos; IndexedDB es caché, no la fuente). **Hueco real**: no existe
un "exportar todo" de un botón. `reports/export-excel.js` y `export-pdf.js`
sacan reportes, no el negocio completo. Si mañana se corrompe un documento o
hay que salir de Firebase, no hay copia que el dueño pueda guardar él mismo.

### 4. Que la cola no avance

Shopify POS, de comerciantes que se van: *"los tiempos de cobro ahora son más
largos y esta app NO es más rápida de usar"*, *"ya no se puede ni guardar un
carrito"*, impresoras y lectores que el sistema "olvida y confunde". De otros
sistemas: navegación lenta entre pantallas, demora al pasar de producto a
carrito a cobro, inventario con demasiados pasos "no diseñado para la
operación rápida del comercio". Y el punto que nos toca de frente: **búsqueda
que no encuentra el producto por nombre** — la segunda razón por la que este
negocio abandonó Treinta.

**Nosotros**: atacado y medido (código de barras, `3x lapiz`, chips que se
aprenden solos, billetes de un toque, "Justo", teclado sin soltar las manos,
buscador tolerante a errores a 10 ms sobre 1000 productos). Es nuestra segunda
mejor pieza. **Hueco**: no hay **venta rápida de producto suelto** — ni un
"Varios" ni un monto libre. Cuando entra algo que no está en el catálogo, el
mostrador tiene dos salidas: parar la cola a crear el producto, o cobrar por
fuera. La segunda es exactamente la causa 1 de la enfermedad de Tiendatek. Y
tampoco hay carrito en espera para el cliente que dice "espérame, voy por otra
cosa".

### 5. Offline que miente

Mucha app anuncia modo sin conexión y da menos de lo que promete. Square
guarda los cobros offline con **límite de tiempo y de monto**: lo que no se
reconcilia en la ventana **se pierde**. Lightspeed: lo cobrado offline **no se
liga al historial de ventas ni toca el inventario**, y los reportes no existen
sin señal.

**Nosotros**: mejor que el promedio. La venta se registra al instante con id
local estable, sube sola, no se duplica, y está probado con tres ventas sin
señal. **Deuda conocida y sincera**: el stock en pantalla no baja mientras no
hay señal. Vale la pena dejar ese aviso bien visible, porque el usuario que ve
un número que no se mueve asume que la venta no entró — y vuelve a cobrarla por
fuera.

### 6. La plata que no cuadra

El descuadre es el momento en que se pierde la fe en el sistema. Causas que se
repiten: errores al dar cambio, cobros no registrados, salidas de efectivo sin
comprobante, devoluciones y descuentos omitidos, pagos mezclados sin
conciliar, falta de trazabilidad por turno o por persona. Y el error clásico:
**llevarse el efectivo del día sin registrarlo**, con el sistema marcando un
faltante que no existe.

**Nosotros**: la parte dura está hecha y es de lo mejor que tiene la app
(turnos con fondo, X y Z contando billete por billete, el sistema compara y no
la persona; caja y caja fuerte separadas; retiros con categoría y motivo;
traslados que no cambian el total; la tasa de cada pago congelada). Ya se
detectó una diferencia de Bs 500 en una prueba real. **Lo que falta no es
contar, es explicar**: cuando el Z da faltante, nada ayuda a encontrar dónde.
Un "qué pudo pasar" en la pantalla del descuadre — ventas anuladas del turno,
precios bajados a mano, retiros sin comprobante, descuentos y quién los dio —
convierte una pelea con el empleado en una revisión de cinco renglones. Todo
eso ya está en `auditoria`; solo no está puesto junto en ese momento.

### 7. El empleado no la usa

Resistencia al cambio, miedo a la tecnología, y lo más concreto: **un cajero
que nadie llevó por las anulaciones, las devoluciones y los cambios de precio
a mano comete errores caros**. Empleados frustrados con el sistema en hora
pico frenan la cola y vuelven al papel.

**Nosotros**: es nuestro riesgo mayor y menos trabajado. Tres personas, dos de
ellas empleados, y la app **no tiene modo de práctica, ni primera corrida
guiada, ni una ayuda donde se vea cómo se anula una venta**. Está todo bien
pensado por dentro (los permisos, el PIN, el espejo sin costos) y nada pensado
para la primera semana de quien no lo construyó. Ojo también con el PIN: según
`PENDIENTES.md` todavía no hay ninguno puesto.

### 8. Soporte y actualizaciones que rompen

Treinta, textual: *"NO HAY ATENCIÓN HUMANA — ante cualquier falla del
inventario, errores de borrar inventarios, poco intuitiva, NUNCA se puede
contactar con un humano"*; actualizan sin avisar y rompen otras funciones.
Loyverse: una actualización cambió cómo se llega al historial de ventas y la
gente se perdió. Clover a Toast, migración dominante, motivo principal:
soporte terrible.

**Nosotros**: el soporte somos nosotros, eso está resuelto. El riesgo
trasladado es el **service worker**: una versión nueva que se publique mal deja
al mostrador con la app vieja o a medias, y eso aquí se siente igual que una
actualización que rompe. Ya existe el aviso de precache y el `CACHE_NAME`
automático; el que falta es el camino de vuelta: poder decirle a la app
"vuelve a la versión de ayer" sin que nadie borre caché a mano desde el
teléfono.

---

## Lo que nos toca, en orden

Lo de arriba, ordenado por cuánto riesgo de abandono quita por hora de
trabajo. Los tres primeros atacan directamente el registro parcial, que es la
causa real de muerte.

1. **Venta rápida de producto suelto** (`features/` del punto de venta). Un
   renglón con nombre libre y monto libre, que descuenta nada del inventario y
   queda marcado como "fuera de catálogo" en los reportes. Es la válvula que
   evita que se cobre por fuera de la app. Barato y es lo más importante.
2. **Poner el PIN.** Ya está pendiente y sin él la causa 7 está abierta: hoy
   cualquiera baja un precio sin que nadie lo frene.
3. **"Qué pudo pasar" en el cierre con descuadre.** Armado con lo que ya
   guarda `auditoria`: anulaciones, precios bajados, descuentos y retiros del
   turno, en la misma pantalla del faltante.
4. **Respaldo que el dueño pueda guardar.** Un botón que baje un JSON con
   catálogo, ventas, cajas, clientes y deudas. Es el seguro contra la causa 3 y
   también contra quedar amarrados a Firebase.
5. **Primera corrida guiada y modo de práctica.** Una venta de ejemplo que no
   toca la caja, y una ayuda corta de las tres cosas que asustan: anular,
   cambiar precio, cerrar turno.
6. **Carrito en espera** en el punto de venta.
7. **Aviso más visible del stock congelado sin señal**, para que nadie dude de
   que la venta entró.
8. **Camino de vuelta a la versión anterior** si una publicación sale mal.

## Lo que ya está bien y no se toca

Cargar el inventario desde Excel, el buscador tolerante a errores, la
velocidad del mostrador, offline sin duplicar ventas, el cierre de caja
contado por el sistema, las tres monedas con la tasa congelada, y que el
empleado no pueda leer los costos ni desde la consola. Cada una de esas es una
de las ocho causas ya cerrada.

## Fuentes

- [IPA / Frogtek — Tiendatek, Colombia (resumen del estudio, PDF)](https://poverty-action.org/sites/default/files/publications/IPA%20-%20Una%20aplicacio%CC%81n%20mo%CC%81vil%20como%20herramienta%20para%20mejorar%20el%20registro%20de%20transacciones%20comerciales%20y%20las%20pra%CC%81cticas%20contables%20de%20los%20minoristas.pdf)
  · [ficha del estudio](https://es.poverty-action.org/study/mobile-application-tool-improving-record-keeping-and-accounting-practices-micro-retailers)
- [Treinta — reseñas App Store Colombia](https://apps.apple.com/co/app/1644703591?see-all=reviews&platform=iphone)
  · [Treinta en Google Play](https://play.google.com/store/apps/details?id=com.treintaapp)
- [Loyverse POS — Capterra](https://www.capterra.com/p/150632/Loyverse-POS/reviews/)
  · [G2](https://www.g2.com/products/loyverse-free-pos/reviews)
  · [Software Advice](https://www.softwareadvice.com/retail/loyverse-profile/reviews/)
- [Kyte POS — reseñas App Store](https://apps.apple.com/us/app/kyte-pos-inventory-and-store/id1345983058?see-all=reviews)
- ["Mi Negocio" (Inventario - POS) en Google Play](https://play.google.com/store/apps/details?id=com.segb_d3v3l0p.minegocio)
- [Shopify POS — "Reasons why the new POS sucks and we are leaving"](https://community.shopify.com/t/reasons-why-the-new-pos-sucks-and-we-are-leaving/27359)
  · [efecto del cambio de suscripción en negocios pequeños](https://community.shopify.com/t/how-has-the-recent-pos-subscription-change-affected-small-businesses/54749)
- [Square Point of Sale — Capterra](https://www.capterra.com/p/275802/Square-Point-of-Sale/reviews/)
  · [Software Advice](https://www.softwareadvice.com/retail/square-point-of-sale-profile/reviews/)
- [Límites del modo offline, comparativa de sistemas](https://kwickos.com/blog/pos-system-offline-mode-guide.html)
  · [Magestore](https://www.magestore.com/blog/pos-offline-mode/)
- [inFlow Inventory — Software Advice](https://www.softwareadvice.com/scm/inflow-inventory-profile/reviews/)
  · [Zoho Inventario — Capterra](https://www.capterra.com/p/146241/Zoho-Inventory/reviews/)
- [Cargar el inventario como barrera para empezar](https://tiendatek.info/co/blog/como-cargar-tu-inventario-en-minutos-con-los-55-000-productos-precargados)
  · [implementar un POS paso a paso](https://pulpos.com/blog/como-implementar-un-punto-de-venta-sin-problemas/)
- [Causas de descuadre en el cierre de caja](https://nuvvo.org/blog/cierre-de-caja-punto-de-venta.html)
  · [arqueo automatizado](https://www.kame.cl/blog/gestion-administrativa/cierre-de-caja-sin-errores-como-un-sistema-pos-automatiza-el-arqueo-y-ahorra-horas-de-trabajo/)
- [Resistencia del personal y capacitación en POS](https://koronapos.com/blog/point-of-sale-training/)
  · [quejas de clientes que nacen del POS](https://www.suntoyo.com.sg/blog/11-common-customer-complaints-that-could-be-traced-back-to-your-pos-system/)
- [Churn en negocios pequeños: causas y señales tempranas](https://www.bigin.com/small-business-express/Churn-in-small-businesses-Causes-early-warnings-strategies-to-reduce-churn.html)
