# Lo que la gente odia de las apps como esta

Investigación sobre reseñas reales de Google Play, en español, de apps que
compiten o se parecen a Mis Detallitos: puntos de venta, inventarios, cuadernos
de fiados, facturadores, cierres de caja, calculadoras de tasa y conversores de
moneda. Hecha el 19 de octubre de 2026.

## Qué se leyó, y qué no

- **57.570 reseñas** con texto, de **194 apps** comparables.
- De esas, **8.683 son negativas** (1, 2 o 3 estrellas). Esas son las que se
  clasificaron una por una contra 43 patrones.
- **419 reseñas negativas** mencionan Venezuela, bolívares, BCV, tasa, pago
  móvil o divisas. Ese es el bloque que más importa y se leyó completo, a mano.

Pedías 50.000 reseñas negativas. No existen 50.000 reseñas negativas en español
en esta categoría: las apps comparables no tienen tanto volumen. Para juntar
50.000 **negativas** habría que incluir bancos, préstamos, delivery y juegos,
que no dicen nada útil sobre esta app. Lo que hay aquí es el universo casi
completo de lo negativo en la categoría correcta, y a partir de las ~2.000
reseñas los temas dejaron de aparecer nuevos: están saturados. Más volumen no
habría cambiado la lista.

Dos sesgos que hay que tener presentes al leer esto:

1. **Nadie escribe una reseña porque la app es fea.** Se desinstala y se va. Las
   quejas estéticas explícitas son solo el 2% del total, y eso *no* significa
   que la estética no importe: significa que el daño estético se cobra en
   silencio. Lo que sí deja rastro escrito es la estética que **estorba**:
   letra que no se lee, botones que se tocan mal, pantalla que no cabe.
2. La reseña se escribe en el momento de la rabia. Por eso lo que domina es el
   primer choque, no el uso de meses.

## El hallazgo principal

**El 18% de las menciones negativas son de cosas que pasan antes de que la
persona haya usado la app ni una vez.** Publicidad, carga inicial del
inventario, "no entendí", no abre, no me deja registrarme, me pidió plata a la
tercera factura. La app nunca llegó a demostrar nada.

Todo lo demás reparte así (menciones sobre 8.683 reseñas negativas; una reseña
puede caer en varias):

| Bloque | Menciones | % |
|---|---|---|
| Primeros 5 minutos: nunca llegan a usarla | 1.563 | 18,0% |
| Rendimiento y estabilidad | 431 | 5,0% |
| Confianza: perdí datos, no vuelvo | 393 | 4,5% |
| Realidad local: moneda, impuestos, cómo pago | 393 | 4,5% |
| Hardware del mostrador: impresora, código de barras | 359 | 4,1% |
| Estética y legibilidad | 171 | 2,0% |
| Offline | 141 | 1,6% |

Y los patrones individuales que más se repiten:

| Patrón | Menciones | % de las negativas |
|---|---|---|
| Publicidad invasiva | 815 | 9,4% |
| Cargar el inventario / no se puede importar ni exportar | 286 | 3,3% |
| Impresora térmica | 284 | 3,3% |
| Lenta o trabada | 243 | 2,8% |
| Complicada, no la entiendo | 182 | 2,1% |
| Moneda, tasa, decimales | 180 | 2,1% |
| "Es una estafa" (casi siempre: cobro sorpresa) | 135 | 1,6% |
| No abre / pantalla en blanco | 128 | 1,5% |
| Caro / suscripción | 121 | 1,4% |
| No me deja entrar / registrarme | 121 | 1,4% |

---

## 1. Estética: lo que de verdad frena

Las tres quejas estéticas que aparecen escritas son siempre las mismas, y las
tres son de **legibilidad y puntería**, no de gusto:

> "cambiar el tamaño de la app tiene las letras muy chicas (fecha). Opcion de
> modo oscuro. **Distinguir con colores las deudas de los pagados**."

> "no se ve bien las ventas, muy poco espacio y no se visualiza bien lo que se
> esta vendiendo"

> "la aplicación en las tablet se ve fea, las letras se ven demasiado grandes y
> descuadra todo"

> "No sé puede agrandar el texto, debes usarlo 109% con lentes"

> "Muy desordenada ahora, salen deudores que ya han cancelado y hay que
> borrarlos de a 1"

Lo que se repite, en orden:

1. **Letra chica en el dato que importa.** Nunca se quejan del título. Se quejan
   del monto, la fecha, el nombre del cliente: el dato que hay que leer de un
   vistazo con el cliente esperando.
2. **Modo oscuro mal hecho es peor que no tenerlo.** Varias reseñas de 1 y 2
   estrellas son exactamente esto: "la letra sale negra sobre negro". Es un bug
   de contraste, no un gusto.
3. **No distingue estados por color.** Pagado y por cobrar se ven igual. Esto es
   la queja estética más accionable de todas: el color tiene que cargar
   información, no decorar.
4. **Tablet y pantalla grande rompen el diseño.** Hecho para el teléfono, se
   estira y "descuadra todo".
5. **Personalizar no es vanidad.** "Poder poner mi logo en el recibo" aparece una
   y otra vez: el recibo es la cara del negocio ante su cliente.
6. **La publicidad es, en la práctica, el problema estético número uno.** 9,4%.
   Esto no te aplica, y es una ventaja enorme que conviene no perder nunca:

> "la descargué, puse el primer gasto en 5 segundos y me saltó una publicidad de
> 15 segundos. la desinstalé."

> "Tiene tanta publicidad que la desinstale sin poder probarla."

## 2. QA: en qué se rompen de verdad

No se rompen en cosas raras. Se rompen en cuatro sitios:

**a) La actualización que empeoró todo.** 84 menciones, y son las reseñas más
furiosas del corpus. Alguien llevaba dos años trabajando bien y una versión
nueva le cambió el formato del recibo, le quitó una función a pago, o le borró
el trimestre.

> "Con la última actualización he perdido el último trimestre de facturación,
> tengo hecho respaldo, pero no me lo respeta."

> "No hagan actualizaciones si no es para mejorar."

> "Por favor, vuelvan a la interfaz antigua... Más aún para la gente mayor, que
> si ya cuesta adaptarse a las nuevas tecnologías, que lo cambien porque sí, no
> ayuda."

**b) El respaldo que no restaura.** El patrón exacto, repetido: la app ofrece
copia de seguridad, la persona confía, cambia de teléfono, y la copia no vuelve.

> "NO FUNCIONA RESTAURAR COPIA DE SEGURIDAD entonces si se desinstala y se quiere
> instalar nuevamente se pierden todos los datos"

> "Al principio todo excelente. Pero de un momento a otro dejo de funcionar y
> perdí todo, **aún teniendo respaldo**."

> "tuve que cambiar de equipo y pensé que las copias de seguridad se iban a mí
> cuenta de Google como con cualquier app"

Un respaldo que no se probó restaurando no es un respaldo. Y es peor que no
tenerlo, porque la persona dejó de hacer su propio respaldo por confiar en él.

**c) La lentitud en el momento del mostrador.** No les molesta que la app sea
lenta: les molesta que sea lenta *con el cliente enfrente*.

> "es Muy lenta y no puedo darme el lujo a que tarde 5min en cargar cada cosa
> mientras monto un presupuesto... Me hubiese gustado seguir, pero no tuve
> paciencia."

> "he visto abuelos tratar en vano de solucionar rápido pero se les hace tedioso"

**d) No se puede deshacer.** 34 menciones de "me equivoqué y no hay forma de
arreglarlo". Es QA de diseño, no de código:

> "me he equivocado y ahora no puedo eliminar nada, quiero eliminar para
> comenzar de cero"

> "no puedo borrar un código que ingresé mal"

> "No puedo borrar los inventarios de prueba"

Y uno de equipos viejos, que en Venezuela no es un caso borde: Android 7 con la
primera y la última fila del menú inalcanzables, "ocupa mucho espacio, se van a
quedar sin usuarios", "no deja actualizar si no tienes espacio".

## 3. Qué impide que la usen (la primera vez)

**La carga inicial del inventario es la muerte número uno.** 286 menciones. La
persona baja la app con ganas, ve que tiene que meter 400 productos a mano, y
cierra.

> "Crear una tienda es un dolor de cabeza. Me pide forzosamente agregar una
> categoría y ninguna de las que me brinda me sirve... Demasiado tedioso el
> inicio, una vez configurado no dan ganas ni de seguir con la app."

> "lo compre y no deja importar ni exportar"

> "Sería mejor que se pueda exportar a Excel"

**El cobro sorpresa.** No es que no quieran pagar: es que les cortan a mitad de
la prueba, cuando ya metieron el trabajo.

> "haces 2 boletas y ya te pide que pagues... la desinstalé enseguida"

> "Solo me deja probar una factura gratuitamente, **no da tiempo de entender
> cómo funciona antes de empezar a pagar**"

> "Por qué dicen que es gratis si luego de 5 facturas ya te están cobrando"

**Y el que te regala el mercado entero: no pueden pagar desde Venezuela.**

> "no da la opción de pagar desde Venezuela, si no con gusto la compro y doy no
> 5 sino 7 estrellas"

> "si te encuentras en Venezuela como en mi caso no puedo pagar por no tener
> tarjetas en dólares"

> "soy de Venezuela y me parece muy buena la aplicación pero he intentado varias
> veces pagar el servicio y no me deja"

> "20$ la mensualidad en Venezuela y en España solo es 1,8€. De verdad que es
> una estafa total"

> "Es buena la app. Pero no me deja registrarme, soy de Venezuela"

> "Soy de Venezuela y no puedo entrar con mi número de teléfono"

Hay gente pidiendo que le dejen pagar. Toda la competencia seria está cerrada
por el cobro, no por el producto.

## 4. Qué impide que se acostumbren

El hábito se pierde en tres sitios:

1. **Cada venta cuesta demasiados toques.** "cada venta hay que...", "es
   engorroso salir y seleccionar nuevamente", "muchos pasos". Si la app es más
   lenta que el cuaderno en hora pico, pierde el hábito en una semana.
2. **El buscador que no perdona.** Es la queja de hábito más concreta de todas:

   > "antes me dejaba buscar mis clientes con solo escribir una pequeña parte
   > del nombre... Pero ahora no me deja, tengo que poner casi todo el nombre
   > completo **en el orden que lo registré** si no no me aparece"

3. **Volver a configurar lo mismo cada vez.**

   > "es molesto agregar el tipo de moneda a cada rato. Debe haber una
   > configuración que ya quede registrado"

Y cuando se pierde, se pierde del todo: "volví al cuaderno", "mejor el
cuaderno", "la desinstalé".

## 5. Venezuela: lo que ninguna app resuelve

Este es el bloque más importante y el más claro de todos. Las 419 reseñas con
señal venezolana dicen, casi todas, la misma cosa:

**a) Multimoneda real, no conversión de adorno.** Es la petición número uno a
toda app de ventas, y nadie la tiene:

> "Venezuela usamos dólares y bolívares, sería genial colocar dos precios según
> la tasa de cambio o como el cliente quiera pagar" — *a Loyverse*

> "sería bueno que agregaran la opción de que el total lo dé en moneda local y
> extranjero al mismo tiempo. en este caso bolívares y dólares" — *a Loyverse*

> "le falta completar unas funciones como **pagar una misma factura en diferentes
> métodos y diferentes monedas**, es decir una parte en dólares, otra parte en
> euro, bolívares" — *a Zobaze POS*

> "en Venezuela se maneja Bolívar, peso colombiano y dólar y a veces hasta el
> euro... tengo el valor principal en bolívares, y ahí mismo tener la
> información de su valor en pesos y dólares" — *a Mi Negocio Plus*

> "Recomiendo una opción en la que se pueda **anclar los precios en dólares y la
> moneda local**. En Venezuela los precios están anclados al dólar."

> "cuando ponen la opción de multimoneda 😔 para que los clientes puedan ver los
> precios en dólares y al cambio en bolívares" — *a Treinta*

Mis Detallitos ya hace exactamente esto, incluido el cobro mezclado en tres
monedas con vuelto en la que convenga. Es la ventaja competitiva. No es una
función: es la razón de existir, y conviene que sea lo primero que se vea.

**b) El símbolo y la moneda, bloqueados.** Varias apps no dejan ni cambiar el
símbolo, y por eso no les pagan:

> "Necesito poder modificar el símbolo de moneda, soy de Venezuela... **no he
> pagado el servicio premium por eso**" — *a ElementaryPOS*

> "La aplicación NO tiene la moneda Venezolana Bs (ojalá sea por olvido)"

**c) Cifras grandes.** Una app se cayó por no aceptar montos de siete cifras:

> "en mi país Venezuela los montos son de millones, por ejemplo el kilo de café
> 1.300.000... y no me permite colocar la cifra"

Vale la pena probar la app con montos de 7 y 8 cifras en bolívares, en pantalla
chica, a ver si cabe y si no se desborda el tipo numérico.

**d) La tasa: de dónde sale y cuándo.** Las apps de tasa viven de esta queja, y
es la misma desconfianza que caería sobre cualquier app de ventas que convierta:

> "Me toca verificar siempre porque no es fidedigno el valor del dólar que
> muestra"

> "me vi obligado a desinstalarla ya que no es confiable, la actualización es
> tardía"

> "el precio a veces no coincide con el de la página oficial del Banco Central"

Lección aplicable: la pantalla tiene que decir **qué tasa se usó y de cuándo
es**, visible en la venta y en el recibo. Si el cliente reclama, la app tiene que
poder defender su número. Lo mismo que ya se hace con el cierre Z — "el sistema
compara, no la persona" — hace falta para la tasa.

**e) Fiado, que aquí es la mitad del negocio.** Las apps de fiado venezolanas y
latinoamericanas se quejan todas de lo mismo: no hay buscador, no hay orden
alfabético, no distingue pagado de pendiente por color, hay que borrar los
cancelados uno por uno, y no se puede mandar el estado de cuenta por WhatsApp
con el formato propio.

**f) Un dueño afuera y el negocio aquí.** Caso real y repetido, y es un
diferenciador que ya está medio construido:

> "estoy en EEUU, mi cajera en Venezuela puede facturar y yo ver el inventario
> desde acá?"

**g) Nada de IVA ni factura fiscal.** 89 menciones de impuestos en el corpus
general (SAT, SUNAT, DIAN), pero **en el bloque venezolano casi nadie pide
factura fiscal ni SENIAT**: piden nota de entrega y recibo por WhatsApp. No hay
que construir facturación fiscal para este mercado.

---

## Qué hacer con esto, en orden

Mis Detallitos ya está del lado bueno en lo más grande: multimoneda real,
offline de verdad, sin publicidad, sin cobro sorpresa, importador de Excel con
vista previa y deshacer, y el empleado que no ve costos. Eso cubre, de entrada,
los cuatro bloques que matan a la competencia.

Lo que esta investigación dice que falta revisar, en orden de cuánto duele:

1. **Probar restaurar, no solo respaldar.** Es el patrón que más confianza
   destruye en todo el corpus, y el que llega sin aviso. Si hay exportación,
   tiene que haber una prueba que exporte, borre e importe de vuelta, y cuadre
   peso por peso.
2. **Mostrar la tasa usada y su fecha** en la venta y en el recibo. Es el seguro
   contra la desconfianza del punto 5d, y es barato.
3. **Montos de 7 y 8 cifras**, en pantalla chica, en los tres sitios donde se
   escribe plata. Caso real de abandono.
4. **El texto base está en 14px** (`public/css/1-base.css:72`). Para el dueño de
   50 años en el mostrador con el cliente esperando, eso es chico. Las quejas de
   legibilidad del punto 1 apuntan justo ahí: no al titular, al monto y al
   nombre. Vale subir el cuerpo o, mejor, dar un ajuste de tamaño.
5. **Color que informe en fiado**: pagado y pendiente tienen que distinguirse de
   un vistazo, no por leer.
6. **Revisar el modo oscuro pantalla por pantalla.** Ya existe en
   `1-base.css`. El riesgo no es no tenerlo: es que una pantalla quede con
   texto oscuro sobre fondo oscuro. Eso son reseñas de una estrella.
7. **La app en tablet.** "Se descuadra todo" fue una queja repetida y es el
   equipo natural del mostrador.
8. **Deshacer en todo lo que se escribe mal**, no solo en el importador (que ya
   lo tiene). Precio, código, línea del carrito.
9. **El buscador de clientes/fiados tiene que perdonar igual que el de
   productos.** El buscador de productos ya aguanta que se escriba mal; la
   queja textual del punto 4 es exactamente sobre el de clientes.
10. **Regla de actualizaciones**: no mover de sitio lo que la gente ya aprendió,
    y nunca cambiar el formato del recibo sin avisar. El corpus es inequívoco:
    la actualización que reacomoda la pantalla cuesta más reseñas que el bug que
    arregla.

Los datos crudos de esta investigación (57.570 reseñas, el clasificador y los
conteos) quedaron fuera del repositorio, en el directorio temporal de la
sesión.
