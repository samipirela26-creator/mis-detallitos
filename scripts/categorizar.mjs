// Propone una categoría para cada producto del inventario.
//
// Uso:  node scripts/categorizar.mjs            → muestra la propuesta, NO escribe
//       node scripts/categorizar.mjs --csv      → la misma propuesta en CSV
//       node scripts/categorizar.mjs --aplicar  → la escribe en Firestore
//
// Las reglas son a mano y en orden: gana la PRIMERA que coincida. Es a
// propósito que sea aburrido y se pueda leer de corrido — una categoría mal
// puesta en 160 productos se arregla moviendo una línea, no reentrenando nada.
//
// Los productos se buscan por nombre Y por sus alias (que ya traen los errores
// de escritura del mostrador), así que "liquipeiper" cae en correctores igual
// que "corrector".

import { productos, col } from './admin.mjs';

// El orden manda: lo más específico va arriba.
const REGLAS = [
  ['Pegamentos y cintas',   /pega|pegamento|silicon|silicona|cinta|teipe|adhesiv/i],
  ['Borradores y correctores', /borrador|goma de borrar|liquipeiper|corrector|liquid paper/i],
  ['Sacapuntas',            /sacapunta|saca punta|tajalapiz|afilalapiz/i],
  ['Marcadores y resaltadores', /marcador|sharpie|resaltador|subrayador|marcatextos/i],
  ['Escritura',             /boligrafo|lapiz|lapices|portamina|minas|bicolor|creyon|colores|tapa para lapiz|kit de lapices/i],
  ['Medición y corte',      /regla|compas|tijera|cuter|cutter|estilete|escuadra|geometri/i],
  ['Cuadernos y papel',     /cuaderno|libreta|block|bloc |papel|hoja|ficha|libro|talonario|agenda|acetato|examen/i],
  ['Archivo y oficina',     /carpeta|folder|sobre|separador|clip|chinche|grapa|perforador|abre hueco|gancho sujetador|notas adhesivas|stiker|sticker|almohadilla|tinta para almohadilla/i],
  ['Arte y manualidades',   /foami|fomi|cartulina|plastilina|pintura|tempera|pincel|brocha|limpia pipa|lana|crepe|seda|lustrillo|palillos de altura/i],
  ['Regalos y fiesta',      /caja|lazo|globo|peluche|moño/i],
  ['Escolar y accesorios',  /cartuchera|lonchera|calculadora|paraguas|estuche/i],
];

// Lo que las reglas no agarran bien: se dice a mano, por nombre exacto.
const A_MANO = {
  // Estos los desviaban sus propios alias: "chinches de COLORES" caía en
  // Escritura, "clips de PAPEL" en Cuadernos, "sujetaPAPELES" igual.
  'Cartucheras': 'Escolar y accesorios',
  'Chinches': 'Archivo y oficina',
  'Clips': 'Archivo y oficina',
  'Gancho sujetador de metal': 'Archivo y oficina',
  'Globos de colores': 'Regalos y fiesta',
  'Caja grande con transparente': 'Regalos y fiesta',
  'Carpeta de gancho para una hoja': 'Archivo y oficina',
  'Notas Adhesivas X5 KST': 'Archivo y oficina',
  'Curitas': 'Varios',
  'Pañitos Amarillos': 'Varios',
  'Gancho de metal': 'Varios',
  'Gancho de ropa mediano': 'Varios',
  'Mini gancho de ropa': 'Varios',
  'Barra de silicona liquida': 'Pegamentos y cintas',
  'Almohadilla standard': 'Archivo y oficina',
  'Agenda de muñecos': 'Cuadernos y papel',
  'Portamina de Stitch': 'Escritura',
  'Peluche llavero': 'Regalos y fiesta',
};

const categorizar = (p) => {
  if (A_MANO[p.nombre]) return A_MANO[p.nombre];
  const texto = `${p.nombre} ${p.alias || ''}`;
  for (const [categoria, patron] of REGLAS) if (patron.test(texto)) return categoria;
  return 'Varios';
};

const csv = process.argv.includes('--csv');
const aplicar = process.argv.includes('--aplicar');

const todos = await productos();
const propuesta = todos.map((p) => ({ ...p, nueva: categorizar(p) }));

if (csv) {
  console.log('id,nombre,categoria_actual,categoria_propuesta');
  for (const p of propuesta) {
    const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    console.log([p.id, p.nombre, p.categoria, p.nueva].map(campo).join(','));
  }
  process.exit(0);
}

const grupos = new Map();
for (const p of propuesta) {
  if (!grupos.has(p.nueva)) grupos.set(p.nueva, []);
  grupos.get(p.nueva).push(p.nombre);
}

for (const [categoria, nombres] of [...grupos].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${categoria}  (${nombres.length})`);
  for (const n of nombres) console.log(`   · ${n}`);
}

const cambian = propuesta.filter((p) => (p.categoria || '') !== p.nueva);
console.log(`\n${cambian.length} de ${todos.length} productos cambiarían de categoría.`);

if (!aplicar) {
  console.log('Esto fue solo la propuesta. Para escribirla:  node scripts/categorizar.mjs --aplicar');
  process.exit(0);
}

// Firestore aguanta 500 operaciones por lote; de 400 en 400 vamos sobrados.
let hechos = 0;
for (let i = 0; i < cambian.length; i += 400) {
  const lote = col('productos').firestore.batch();
  for (const p of cambian.slice(i, i + 400)) {
    lote.set(col('productos').doc(p.id), { categoria: p.nueva }, { merge: true });
    // El catálogo público lee de su propia colección: se le pone igual.
    lote.set(col('productos_venta').doc(p.id), { categoria: p.nueva }, { merge: true });
  }
  await lote.commit();
  hechos += Math.min(400, cambian.length - i);
  console.log(`  ${hechos}/${cambian.length} escritos`);
}
console.log('Listo.');
