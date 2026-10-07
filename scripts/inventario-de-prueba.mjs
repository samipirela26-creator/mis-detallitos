// Genera un CSV de 1000 productos desordenado a propósito (encabezados raros,
// precios con coma, duplicados, filas con error) para probar el importador.
// Uso:  node scripts/inventario-de-prueba.mjs > /tmp/inventario-prueba.csv
const BASES = ['Lápiz', 'Lapicero', 'Borrador', 'Sacapuntas', 'Cuaderno', 'Resma', 'Carpeta', 'Tijera',
  'Pega', 'Marcador', 'Regla', 'Compás', 'Témpera', 'Cartulina', 'Foami', 'Silicón', 'Grapadora',
  'Perforadora', 'Clips', 'Sobre'];
const VARIANTES = ['Mongol', 'Kilométrico', 'Nata', 'Metálico', 'Escolar', 'Carta', 'Oficio', 'Grande',
  'Pequeño', 'Azul', 'Rojo', 'Verde', 'Negro', 'x12', 'x24', 'Doble', 'Fino', 'Grueso', 'Premium', 'Económico'];

const filas = [['Descripcion del articulo', 'CANTIDAD', 'Precio Venta', 'Costo Unitario', 'Rubro', 'Sinonimos']];
let n = 0;
for (const b of BASES) for (const v of VARIANTES) for (const extra of ['', ' 2', ' Pro']) {
  if (n >= 1000) continue;
  const costo = Math.random() * 3 + 0.1;
  const precio = costo * (1.1 + Math.random() * 0.9);
  filas.push([`${b} ${v}${extra}`.trim(), Math.floor(Math.random() * 200),
    precio.toFixed(2).replace('.', ','), costo.toFixed(2).replace('.', ','), b,
    n % 7 === 0 ? `${b.toLowerCase()}, ${v.toLowerCase()}` : '']);
  n++;
}
filas.push(['Lápiz Mongol', 50, '0,50', '0,30', 'Lápiz', '']);     // duplicado del catálogo
filas.push(['Lápiz Mongol', 50, '0,50', '0,30', 'Lápiz', '']);     // duplicado interno
filas.push(['', 10, '1,00', '0,50', '', '']);                       // sin nombre
filas.push(['Producto sin precio', 5, '', '', 'Varios', '']);       // incompleto

console.log(filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
