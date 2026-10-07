// csv.js — lector de CSV propio.
//
// ¿Por qué no usar el de SheetJS? Porque convierte "1,91" en 191: interpreta la
// coma como separador de miles. Aquí los precios se escriben con coma decimal,
// así que ese "arreglo" automático nos destruiría el inventario sin avisar.
// Este lector NO interpreta números: devuelve texto tal cual y que `aMenores`
// decida, que para eso está probado.

/** Adivina el separador mirando la primera línea. */
export function detectarSeparador(texto) {
  const linea = texto.split(/\r?\n/).find((l) => l.trim()) || '';
  const candidatos = [';', '\t', ',', '|'];
  let mejor = ',', mejorCuenta = 0;
  for (const sep of candidatos) {
    // Cuenta solo los separadores que están FUERA de comillas.
    let cuenta = 0, dentro = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') dentro = !dentro;
      else if (c === sep && !dentro) cuenta++;
    }
    if (cuenta > mejorCuenta) { mejor = sep; mejorCuenta = cuenta; }
  }
  return mejor;
}

/**
 * Devuelve una matriz de strings. Respeta comillas, comillas dobles escapadas
 * (""), saltos de línea dentro de un campo, y el BOM que mete Excel.
 */
export function leerCSV(texto, separador = null) {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);   // BOM de Excel
  const sep = separador || detectarSeparador(texto);

  const filas = [];
  let campo = '';
  let fila = [];
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }   // "" = una comilla
        else dentro = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { dentro = true; continue; }
    if (c === sep) { fila.push(campo.trim()); campo = ''; continue; }
    if (c === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo.trim()); filas.push(fila); }

  return filas.filter((f) => f.some((c) => c !== ''));
}
