# Qué hacer en Firebase (paso a paso, en orden)

Todo esto se hace en https://console.firebase.google.com y **no requiere pagar
nada**: nos quedamos en el plan gratuito (Spark).

## 1. Crear el proyecto

1. *Agregar proyecto* → nombre: **mis-detallitos**.
2. Google Analytics: **desactivar**. No hace falta y mete ruido.

## 2. Registrar la app web

1. En *Descripción general del proyecto*, el botón **`</>`** (Web).
2. Apodo: `detallitos-pwa`. **No** marcar Firebase Hosting todavía.
3. Copiar el bloque `firebaseConfig` que aparece y pegarlo en
   `public/js/core/firebase-config.js`.
   (Esas claves no son secretas: lo que protege los datos son las reglas.)

## 3. Authentication

1. *Authentication* → *Comenzar*.
2. Habilitar **solo** *Correo electrónico/contraseña*. Nada de registro con
   Google ni teléfono.
3. En *Users*, crear a mano **3 usuarios** y anotar el UID de cada uno:
   - el tuyo (dueño)
   - tu mamá
   - tu primo
4. En *Settings → User actions*, **desactivar** "Habilitar la creación de
   usuarios" si aparece la opción: así nadie se registra solo.

## 4. Firestore

1. *Firestore Database* → *Crear base de datos*.
2. Modo: **producción** (empieza cerrado; las reglas buenas las subimos nosotros).
3. Ubicación: **`nam5` (us-central)** o la más cercana. **No se puede cambiar
   después**, así que no le des vueltas: cualquiera de las dos sirve.
4. Crear a mano los documentos de usuario, en la colección:
   `negocios/mis-detallitos/usuarios/{UID}`
   con estos campos:

   | campo | tipo | valor |
   |---|---|---|
   | `nombre` | string | "Samuel" / "Mamá" / "Primo" |
   | `rol` | string | `dueno` para ti, `empleado` para los otros dos |
   | `activo` | boolean | `true` |

   **Si un usuario no tiene documento o no dice `dueno`, la app lo trata como
   empleado.** Es a propósito: el que falla, falla hacia el lado seguro.

## 5. Subir las reglas (desde la terminal, no desde la consola)

La herramienta ya está instalada en el proyecto, así que todo va con `npx`
(no hace falta instalar nada global).

```bash
npx firebase login
```

```bash
npx firebase use --add
```
(elegir **mis-detallitos** y ponerle el apodo `produccion`)

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

## 6. Hosting

```bash
npx firebase deploy --only hosting
```
Queda publicado en `https://mis-detallitos.web.app`. Desde el teléfono:
abrir ese link en Chrome → *Agregar a la pantalla de inicio*.

## Lo que NO vamos a habilitar (y por qué)

- **Cloud Storage** y **Cloud Functions**: en los proyectos nuevos exigen el
  plan **Blaze** (tarjeta de crédito). Se pueden evitar:
  - las fotos van comprimidas dentro de Firestore (~60 KB cada una);
  - el espejo sin costos lo escribe tu propia app.
- Se pasa a Blaze **solo** cuando lleguemos a la IA del buscador (Fase 6) y si
  hace falta. Blaze tiene cuota gratis mensual, pero igual pide tarjeta.

## Cuotas gratis del plan Spark (lo que nos importa)

| Recurso | Límite diario | ¿Nos aprieta? |
|---|---|---|
| Lecturas de Firestore | 50.000 | No, si el catálogo se cachea (y se cachea). |
| Escrituras | 20.000 | No. 200 ventas al día son ~1.000 escrituras. |
| Almacenamiento | 1 GiB | Las fotos comprimidas de 1.000 productos son ~60 MB. |
| Hosting | 10 GB/mes de transferencia | No. |

Revisar *Uso y facturación* en la consola la primera semana para confirmarlo.
