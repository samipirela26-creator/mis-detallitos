// admin.mjs — conexión de administrador a Firestore, para los scripts de
// mantenimiento que se corren desde la computadora (no desde la app).
//
// La llave vive en `.secretos/clave-admin.json`, que está en .gitignore. Esta
// llave se salta TODAS las reglas de Firestore: lo que corra aquí puede leer y
// escribir cualquier cosa del negocio. Por eso los scripts que la usan avisan
// antes de escribir y se pueden correr en seco.

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const NEGOCIO = process.env.NEGOCIO || 'mis-detallitos';
const RUTA_LLAVE = process.env.LLAVE_ADMIN || '.secretos/clave-admin.json';

// Con FIRESTORE_EMULATOR_HOST (p. ej. para grabar el video tutorial) se conecta
// al emulador local: no hace falta llave y no se toca nada real.
const ENEMULADOR = !!process.env.FIRESTORE_EMULATOR_HOST;

if (!ENEMULADOR && !existsSync(RUTA_LLAVE)) {
  console.error(`No encuentro la llave en ${RUTA_LLAVE}.`);
  console.error('Descárgala en Firebase → Configuración → Cuentas de servicio y guárdala ahí.');
  process.exit(1);
}

export const proyecto = ENEMULADOR ? 'mis-detallitos' : JSON.parse(readFileSync(RUTA_LLAVE, 'utf8')).project_id;
if (ENEMULADOR) initializeApp({ projectId: proyecto });
else initializeApp({ credential: cert(JSON.parse(readFileSync(RUTA_LLAVE, 'utf8'))), projectId: proyecto });

export const db = getFirestore();

/** Colección del negocio: col('productos') */
export const col = (nombre) => db.collection('negocios').doc(NEGOCIO).collection(nombre);

/** Todos los productos, ya ordenados por categoría y nombre. */
export async function productos() {
  const snap = await col('productos').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz', 'es') ||
      (a.nombre || '').localeCompare(b.nombre || '', 'es'));
}
