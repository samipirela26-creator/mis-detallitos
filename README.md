# Mis Detallitos

PWA de ventas, inventario y **ganancia real** para la papelería Mis Detallitos
G&M C.A. Funciona sin internet, en el teléfono, y es gratis de mantener
(plan Spark de Firebase).

Contexto y decisiones: [`docs/CONTEXT.md`](docs/CONTEXT.md) ·
Qué hacer en Firebase: [`docs/FIREBASE-SETUP.md`](docs/FIREBASE-SETUP.md)

## Qué hace

**Vender** — buscador que aguanta que lo escriban mal, precio fijo o variable,
escalas por cantidad (200 fotocopias salen más baratas solas), cobro en
**dólares, pesos y bolívares mezclados** con vuelto en la moneda que convenga,
fiado, recibo por WhatsApp. **Funciona sin señal**: la venta se registra al
instante y sube sola cuando vuelve el internet, sin duplicarse.

**Inventario** — carga inicial desde **tu propio Excel** (la app adivina las
columnas, muestra vista previa, detecta duplicados y **se puede deshacer
completa**), y un **Estudio de Fotos** que va producto por producto con la
cámara abierta: disparas y salta solo al siguiente.

**Ganancia** — margen por producto, **a qué le estás ganando poco**, qué
vendiste por debajo del costo, cuánto se regaló en descuentos y quién los dio,
ranking de quién vendió más, gráficos y exportación a Excel y PDF.

**Caja** — turnos con fondo, reporte X cuando quieras y cierre Z contando
billete por billete: el sistema compara, no la persona.

**El empleado no ve costos ni ganancias.** No es que estén escondidos en la
pantalla: la app del empleado lee otra colección (`productos_venta`) que no
tiene esos campos, y las reglas de Firestore le niegan la que sí los tiene.

## Cómo correrlo

```bash
npm install                 # solo la primera vez
npm run emuladores          # Firebase local, en http://localhost:5000
npm run sembrar             # usuarios de prueba (en otra terminal)
```

Usuarios de prueba: `dueno@detallitos.test` y `primo@detallitos.test`,
clave `detallitos123` los dos.

```bash
npm test                    # 47 pruebas (dinero, buscador, CSV, reportes, reglas)
npm run reglas              # solo las reglas de seguridad (necesita el emulador)
npm run publicar            # firebase deploy
```

Para probar el importador sin inventar datos:
`node scripts/inventario-de-prueba.mjs > /tmp/prueba.csv`

## Reglas para quien toque el código

- **Si agregas un archivo a `public/`, agrégalo a `PRECACHE_URLS` del service
  worker y sube el número de `CACHE_NAME`.** Si no, el navegador sigue sirviendo
  la versión vieja y vas a perder una hora buscando un bug que no existe.
- **Las 4 hojas de CSS están numeradas y el número es la cascada.** No reordenes
  los `<link>` de `index.html`.
- **Nada de dinero en `float`.** Todo pasa por `core/dinero.js`, en enteros.
- **Nunca mandes `costoUSD` a la app del empleado.** Si cambias el catálogo,
  escribe `productos` y `productos_venta` en el mismo `writeBatch`
  (`data/productos.js` ya lo hace).
- **El CSV se lee con `data/csv.js`, no con SheetJS**: SheetJS convierte "1,91"
  en 191 porque toma la coma como separador de miles.
- **No uses `.append(algo || null)`**: escribe "null" en la pantalla. Usa
  `pegar()` de `ui/html.js`.
- Cualquier cosa delicada (anular, cambiar precio, tocar stock) deja rastro en
  `auditoria`.

## Revisiones de mantenimiento

Antes de subir un cambio, estas dos comprobaciones atrapan los errores que más
se repiten en este proyecto:

```bash
npm test          # con los emuladores corriendo incluye las reglas (51 pruebas)
npm run precache  # avisa si algún archivo nuevo se quedó fuera del service worker
```
