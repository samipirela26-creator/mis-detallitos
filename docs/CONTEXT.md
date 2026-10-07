# Mis Detallitos — contexto del proyecto

Papelería. Un local. Tres personas usan la app: el dueño y dos empleados
(su mamá —socia— y su primo). No es un sistema homologado ni factura fiscal:
es control interno de ventas, inventario y **ganancia real**.

## Por qué existe

Se usaba **Treinta** y se abandonó por dos razones: es de pago, y **el buscador
no encontraba los productos** cuando uno no recuerda el nombre exacto. La
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
