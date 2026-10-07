# Mis Detallitos

App web (PWA) de ventas, inventario y **ganancia real** para la papelería
Mis Detallitos. Contexto y decisiones: [`docs/CONTEXT.md`](docs/CONTEXT.md).

## Lo que ya funciona (Fase 0)

- Cáscara PWA instalable, abre sin internet, con service worker versionado.
- Entrada con correo y clave, **roles dueño / empleado** y menú distinto para
  cada uno (el empleado ve 4 botones; no ve costos, ganancias ni configuración).
- Reglas de seguridad de Firestore completas (`firestore.rules`).
- `core/dinero.js`: USD / COP / VES en enteros, pagos mixtos, vuelto, escalas de
  precio por cantidad, margen, autorización por precio bajo. **8 tests pasando.**
- `core/texto.js`: normalización para el buscador (sin acentos, plurales, "250ml").

## Lo que falta

Fases 1 a 6, en ese orden. La 1 (importar Excel + Estudio de Fotos) es la
siguiente y la más urgente, porque sin inventario cargado no hay nada que vender.

## Cómo trabajar en esto

```bash
# 1) Instalar las herramientas (una sola vez)
npm install -g firebase-tools

# 2) Configurar el proyecto (una sola vez)
cp public/js/core/firebase-config.example.js public/js/core/firebase-config.js
# ...y pegar ahí los datos de la consola de Firebase

# 3) Correr todo en local, sin tocar los datos reales
firebase emulators:start
# abre http://localhost:5000  (panel de emuladores en http://localhost:4000)

# 4) Tests de dinero
node --test test/

# 5) Publicar
firebase deploy
```

## Reglas para quien toque el código

- **Si agregas un archivo a `public/`, agrégalo a `PRECACHE_URLS` del service
  worker y sube el número de `CACHE_NAME`.** Si no, el navegador sigue sirviendo
  la versión vieja y vas a perder una hora buscando un bug que no existe.
- **Las 4 hojas de CSS están numeradas y el número es la cascada.** No reordenes
  los `<link>` de `index.html`.
- **Nada de dinero en `float`.** Todo pasa por `core/dinero.js`, en enteros.
- **Nunca mandes `costoUSD` a la app del empleado.** El empleado lee
  `productos_venta` (espejo sin costos); el dueño lee `productos`. Si cambias el
  catálogo, escribe los dos documentos en el mismo `writeBatch`.
- Cualquier escritura de dinero o inventario deja rastro en `auditoria`.
