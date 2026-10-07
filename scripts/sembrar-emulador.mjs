// Siembra los usuarios de prueba en el emulador (dueño y empleado).
// Uso:  node scripts/sembrar-emulador.mjs
// Antes hay que tener el emulador corriendo:  npm run emuladores
const PROY = process.env.PROYECTO || 'demo-detallitos';
const NEGOCIO = 'mis-detallitos';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
const FS = `http://127.0.0.1:8080/v1/projects/${PROY}/databases/(default)/documents`;

const USUARIOS = [
  { email: 'dueno@detallitos.test', clave: 'detallitos123', nombre: 'Samuel', rol: 'dueno' },
  { email: 'primo@detallitos.test', clave: 'detallitos123', nombre: 'Primo', rol: 'empleado' },
];

for (const u of USUARIOS) {
  const r = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.clave, returnSecureToken: true }),
  }).catch(() => null);
  const j = r ? await r.json() : {};
  if (!j.localId) { console.error('No se pudo crear', u.email, j.error?.message || '(¿está corriendo el emulador?)'); continue; }
  const doc = await fetch(`${FS}/negocios/${NEGOCIO}/usuarios/${j.localId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {
      nombre: { stringValue: u.nombre },
      rol: { stringValue: u.rol },
      activo: { booleanValue: true },
    } }),
  });
  console.log(u.rol.padEnd(9), u.email, 'clave:', u.clave, doc.ok ? '✓' : await doc.text());
}
