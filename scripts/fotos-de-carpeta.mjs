// Mete en el catálogo las fotos de una carpeta, emparejadas a mano con cada
// producto.
//
// Uso:  node scripts/fotos-de-carpeta.mjs            → procesa y arma la hoja de revisión
//       node scripts/fotos-de-carpeta.mjs --subir    → además las guarda en el inventario
//
// Por qué el emparejamiento está escrito a mano aquí abajo y no lo adivina el
// programa: los nombres de archivo no dicen nada ("OIP.webp",
// "assets_task_01k4d73...png"), así que lo único que sirve es MIRAR cada foto y
// reconocer el producto. Eso se hizo una vez, con hojas de contacto numeradas,
// y el resultado quedó en esta tabla: número de foto → nombre exacto del
// producto en el inventario.
//
// Las fotos ganan a las que están puestas hoy: las de antes eran genéricas de
// bancos libres (el mismo borrador rosado repetido en once productos), y estas
// son de los artículos que de verdad se venden, con su marca.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { productos, col } from './admin.mjs';

const INDICE = '/tmp/claude-1000/hojas/indice.json';
const SALIDA = 'imagenes-carpeta';
const LADO = 800;
const TOPE_BYTES = 900 * 1024;

// foto → producto. Solo lo que se reconoce sin dudar: una foto en el producto
// equivocado es peor que un producto sin foto.
const EMPAREJADO = {
  171: 'Calculadora Pequeña',
  2: 'Hoja de Examen',
  37: 'Colores Norma original',
  137: 'Colores Kores',
  57: 'Sacapunta Discovery',
  58: 'Pega loka',
  112: 'Resaltador',
  64: 'Compas',
  103: 'Palillos de altura',
  100: 'Boligrafo pompon',
  108: 'Marcador gliter',
  128: 'Borrador de balones',
  105: 'Borrador de animalito y alienigena',
  42: 'Liquipeiper',
  160: 'Pega en barra pequeña',
  165: 'Silicona liquida 100ml',
  138: 'Set de regla',
  141: 'Cuter',
  189: 'Tijeras para niños',
  92: 'Papel bond',
  144: 'Cuadernos Sencillos',
  145: 'Stiker para libro o libreta',
  101: 'Notas Adhesivas X5 KST',
  45: 'Cartucheras',
  154: 'Sacapunta de metal',
  85: 'Borrador Nata',
  176: 'Foami Escarchado',
  50: 'Plastilina Largas',
  51: 'Plastilinas Cortas',
  130: 'Bicolor',
  185: 'Lapices',
  113: 'Minas de repuesto',
  183: 'Borradores de paleta',
  118: 'Regla de 30 cm',
  148: 'Regla flexible',
  181: 'Lonchera',
  38: 'Libro Contable',
  159: 'Marcadores Color Pens',
  161: 'Cinta plastica pequeña',
  147: 'Foami tipo carta',
  156: 'Marcador acrilico',
  63: 'Boligrafos neón',
  116: 'Boligrafo multipunta',
  91: 'Cartulina grande doble faz',
  151: 'Pega blanca 250g',
  71: 'Tijeras de oficina',
  166: 'Silicon Barra Fina',
  134: 'Libreta Skole',
};

const subir = process.argv.includes('--subir');
const indice = new Map(JSON.parse(readFileSync(INDICE, 'utf8')).map((x) => [x.n, x.ruta]));
const catalogo = new Map((await productos()).map((p) => [p.nombre, p]));
mkdirSync(SALIDA, { recursive: true });

const hechas = [];
const fallidas = [];

for (const [n, nombre] of Object.entries(EMPAREJADO)) {
  const ruta = indice.get(Number(n));
  const producto = catalogo.get(nombre);
  if (!ruta) { fallidas.push(`foto ${n}: no está en el índice`); continue; }
  if (!producto) { fallidas.push(`"${nombre}": no existe en el inventario`); continue; }
  try {
    // Cuadrado con fondo blanco, como el resto del catálogo. `flatten` tapa la
    // transparencia (muchas vienen recortadas) y `contain` no corta el producto.
    const imagen = await sharp(ruta)
      .flatten({ background: '#ffffff' })
      .resize(LADO, LADO, { fit: 'contain', background: '#ffffff' })
      .webp({ quality: 82 })
      .toBuffer();
    const destino = join(SALIDA, `${producto.id}.webp`);
    writeFileSync(destino, imagen);
    hechas.push({ n: Number(n), id: producto.id, nombre, ruta: destino, bytes: imagen.length, tenia: !!producto.tieneFoto });
  } catch (e) {
    fallidas.push(`foto ${n} (${nombre}): ${e.message}`);
  }
}

console.log(`${hechas.length} fotos listas · ${fallidas.length} fallaron`);
console.log(`   reemplazan una foto vieja: ${hechas.filter((h) => h.tenia).length}`);
console.log(`   productos que no tenían:   ${hechas.filter((h) => !h.tenia).length}`);
for (const f of fallidas) console.log('   ✗', f);

writeFileSync(join(SALIDA, '_resultado.json'), JSON.stringify(hechas, null, 2));

if (!subir) {
  console.log(`\nNada se escribió en el inventario. Revisa ${SALIDA}/ y repite con --subir`);
  process.exit(0);
}

let n = 0;
for (const h of hechas) {
  const datos = `data:image/webp;base64,${readFileSync(h.ruta).toString('base64')}`;
  const bytes = Math.round((datos.length * 3) / 4);
  if (bytes > TOPE_BYTES) { console.log(`${h.nombre}: muy pesada, se salta`); continue; }
  const lote = col('productos').firestore.batch();
  lote.set(col('fotos').doc(h.id), { datos, bytes, origen: 'carpeta del dueño', ts: new Date() });
  lote.set(col('productos').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  lote.set(col('productos_venta').doc(h.id), { tieneFoto: true, fotoPendiente: false }, { merge: true });
  await lote.commit();
  console.log(`  ${++n}/${hechas.length}  ${h.nombre}`);
}
console.log(`\nListo: ${n} fotos en el catálogo.`);
