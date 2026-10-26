// pos.js — VENDER. La pantalla que más se usa y la que no se puede trabar.
//
// Decisiones que vienen del mostrador real:
//  - El cursor arranca en el buscador y vuelve al buscador después de cada
//    producto: se vende escribiendo, sin tocar menús.
//  - Precio fijo entra solo; precio variable abre el teclado y pide el monto.
//  - Las escalas por cantidad recalculan el precio al cambiar la cantidad
//    (200 fotocopias salen más baratas sin que nadie tenga que acordarse).
//  - Si el precio queda por debajo del mínimo, la línea se marca y pide PIN.
//  - Se cobra en dólares, pesos o bolívares: se toca con cuál pagó y ya.
//  - NO se calcula vuelto. Quien atiende lo hace de cabeza mientras cuenta los
//    billetes; pedirle que lo escriba era una pantalla de más con el cliente
//    esperando. Lo que sí se puede es ajustar el total cuando cae en un número
//    que no se puede dar con monedas ($ 1.520 → $ 1.500), y eso pide el código.

import { registrar, ir } from '../core/router.js';
import { el, esc, $, abrirDialogo, pegar } from '../ui/html.js';
import { avisar, avisarOk, avisarMal, confirmar } from '../ui/avisos.js';
import { pedirMonto, pedirCantidad } from '../ui/teclado.js';
import { pedirAutorizacion } from '../ui/pin.js';
import { buscar, sinResultados, buscarClientes } from '../data/busqueda.js';
import { recordarBusqueda, aprenderDe } from '../data/sinonimos.js';
import { productos as catalogo } from '../data/catalogo.js';
import { pintarFoto } from '../data/fotos.js';
import { cargarFavoritos, favoritos, contarUso } from '../data/favoritos.js';
import { icono } from '../ui/iconos.js';
import { registrarVenta } from '../data/ventas.js';
import { turnoAbierto } from '../data/caja.js';
import { listarClientes, guardarCliente, deudaDe } from '../data/clientes.js';
import { CACHE } from '../data/lectura.js';
import { leer, escribir, observar } from '../core/estado.js';
import {
  MONEDAS, formatear, desdeUSD, aUSD, crearPago,
  precioPorCantidad, totalesVenta, requiereAutorizacion,
} from '../core/dinero.js';
import { recibo } from '../reports/recibo.js';
import { sonidoBeep, sonidoCobrar, sonidoAlerta } from '../ui/sonido.js';

// --- carrito (vive en el estado, así sobrevive a cambiar de pantalla) -------
const carrito = () => leer('carrito') || [];
const ponerCarrito = (lineas) => escribir('carrito', lineas);

function agregar(producto, { cantidad = 1, precioUSD = null } = {}) {
  const lineas = [...carrito()];
  const i = lineas.findIndex((l) => l.productoId === producto.id && !l.precioEditado);
  if (i >= 0 && precioUSD === null) {
    lineas[i] = { ...lineas[i], cantidad: lineas[i].cantidad + cantidad };
    lineas[i].precioUSD = lineas[i].tipoPrecio === 'variable'
      ? lineas[i].precioUSD
      : precioPorCantidad(producto, lineas[i].cantidad);
  } else {
    const base = precioUSD ?? precioPorCantidad(producto, cantidad);
    lineas.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad,
      precioUSD: base,
      // El precio en PESOS viaja con la línea: es el de la etiqueta y el que
      // hace falta si la venta queda fiada, porque la deuda se fija en pesos.
      // Derivarlo después con la tasa deja la deuda a 19.996 cuando la etiqueta
      // decía 20.000, y eso es justo lo que se discute.
      precioCOP: producto.precioCOP || 0,
      // El peso de la etiqueta sin tramos aplicados, para poder volver a él
      // cuando baja la cantidad. Es el gemelo de `precioOriginalUSD`.
      precioCOPOriginal: producto.precioCOP || 0,
      precioOriginalUSD: producto.precioUSD || base,
      costoUSD: producto.costoUSD || 0,
      tipoPrecio: producto.tipoPrecio,
      escalas: producto.escalas || [],
      unidad: producto.unidad,
      esServicio: producto.tipo === 'servicio',
      precioEditado: precioUSD !== null && precioUSD !== (producto.precioUSD || 0),
      autorizadoPor: null,
    });
  }
  ponerCarrito(lineas);
  aprenderDe(producto);
  sonidoBeep();
}

/**
 * El precio de una línea como se dice en voz alta: el PESO de la etiqueta.
 *
 * Mismo criterio que el total del carrito. Mostrar el dólar aquí y el peso
 * abajo obligaba a hacer la cuenta de cabeza para saber si el precio que se
 * está mirando es el que el cliente acaba de oír.
 */
function precioDeEtiqueta(linea, tasas = {}) {
  if (linea.precioCOP > 0) return formatear(linea.precioCOP, 'COP');
  if (tasas.COP) return formatear(desdeUSD(linea.precioUSD, 'COP', tasas.COP), 'COP');
  return formatear(linea.precioUSD);
}

const quitar = (i) => ponerCarrito(carrito().filter((_, j) => j !== i));
const vaciar = () => ponerCarrito([]);

// --- pantalla ---------------------------------------------------------------
registrar('vender', {
  titulo: 'Vender', icono: '🧾', menu: true, orden: 30,
  montar(nodo) {
    nodo.innerHTML = `
      <div class="buscador-pos">
        <input id="q" type="search" inputmode="search" autocomplete="off" enterkeyhint="search"
               placeholder="Busca el producto o pasa el código…">
        <div class="chips-barra" id="atajos" style="margin-top:.45rem"></div>
      </div>
      <div id="resultados"></div>
      <div id="carrito"></div>`;

    const q = $('#q', nodo);
    const cajaResultados = $('#resultados', nodo);
    const cajaCarrito = $('#carrito', nodo);

    /**
     * Los atajos de un toque.
     *
     * Antes eran tres chips escritos a mano en el HTML ("Fotocopia B/N",
     * "Impresión") que BUSCABAN ese texto. Servía el primer día y después
     * mentía: los servicios se renombraron y los chips quedaron buscando
     * nombres que ya no existen.
     *
     * Ahora salen de lo que de verdad se vende: primero lo más usado
     * (favoritos, que se aprende solo), y lo que falte se completa con los
     * servicios —fotocopias, plastificado— que son los de venta más repetida y
     * los que no se quiere ir a buscar cincuenta veces al día. Y el toque
     * AGREGA el producto, no llena el buscador.
     */
    function pintarAtajos() {
      const barra = $('#atajos', nodo);
      if (!barra) return;
      barra.innerHTML = '';
      const todos = catalogo();

      const masUsados = favoritos(todos, 6);
      const servicios = todos
        .filter((p) => p.tipo === 'servicio' && p.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      const puestos = new Set();
      const atajos = [];
      for (const p of [...masUsados, ...servicios]) {
        if (puestos.has(p.id) || atajos.length >= 8) continue;
        puestos.add(p.id);
        atajos.push(p);
      }

      // Primero de todos, SIEMPRE visible: la barra de atajos se desborda a lo
      // ancho y la barra de scroll está escondida, así que lo que quedaba al
      // final (esto) no se veía ni se sabía que estaba. Y es justo lo que se
      // necesita cuando el cliente trae algo que no está en el catálogo: un
      // pago, una deuda vieja, algo suelto.
      barra.appendChild(el('button.chip', {
        type: 'button', texto: '+ Venta libre', style: 'border-color:var(--marca);color:var(--marca);font-weight:700',
        onclick: () => ventaLibre(),
      }));

      for (const p of atajos) {
        barra.appendChild(el('button.chip', {
          type: 'button',
          title: p.nombre,
          // Se corta por el MEDIO, no por el final: "Impresión en papel
          // fotográfico" y "…full color" cortadas al final quedan idénticas y
          // no hay manera de saber cuál se está tocando. El nombre completo
          // queda en el tooltip.
          texto: acortar(p.nombre),
          onclick: () => elegir(p),
        }));
      }
    }

    /** Deja el nombre corto SIN perder lo que lo distingue de otro parecido. */
    function acortar(nombre, tope = 26) {
      if (nombre.length <= tope) return nombre;
      const cola = Math.max(10, Math.floor(tope / 2) - 1);
      return `${nombre.slice(0, tope - cola - 1)}…${nombre.slice(-cola)}`;
    }

    pintarAtajos();
    // Los favoritos viven en el disco del aparato: cuando terminan de cargar,
    // los atajos se rehacen con lo aprendido.
    cargarFavoritos().then(pintarAtajos);

    // --- buscar mientras escribe ---
    let temporizador;
    q.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => pintarResultados(q.value), 120);
    });
    // Cuál de los resultados está resaltado. -1 = ninguno todavía.
    let resaltado = -1;

    /**
     * Mueve el resaltado con ↑ ↓ y cobra el resaltado con Enter.
     *
     * Antes Enter se llevaba SIEMPRE el primer resultado, a ciegas: si lo que
     * querías era el segundo, había que soltar el teclado e ir al ratón. En la
     * laptop eso es parar en cada línea. (El README ya prometía las flechas.)
     */
    function moverResaltado(paso, total) {
      if (!total) return;
      resaltado = resaltado < 0
        ? (paso > 0 ? 0 : total - 1)
        : (resaltado + paso + total) % total;
      pintarResaltado();
    }

    function pintarResaltado() {
      const filas = [...cajaResultados.querySelectorAll('li')];
      filas.forEach((li, i) => {
        const activa = i === resaltado;
        li.classList.toggle('resaltado', activa);
        if (activa) li.scrollIntoView({ block: 'nearest' });
      });
    }

    q.addEventListener('keydown', (ev) => {
      const r = buscar(q.value, catalogo());
      const total = sinResultados(r) ? 0 : r.length;

      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();                       // que no mueva el cursor del input
        moverResaltado(ev.key === 'ArrowDown' ? 1 : -1, total);
        return;
      }
      if (ev.key === 'Enter') {
        // Sin resaltar, Enter sigue tomando el primero: es lo que hace quien
        // escribe el nombre completo y no mira la lista.
        if (total) { elegir(r[resaltado < 0 ? 0 : resaltado]); ev.preventDefault(); }
        return;
      }
      if (ev.key === 'Escape') { q.value = ''; resaltado = -1; pintarResultados(''); }
    });

    function pintarResultados(texto) {
      recordarBusqueda(texto);
      const r = buscar(texto, catalogo());
      // Lista nueva, resaltado a cero: si no, el índice apunta a un producto
      // que ya no está en pantalla y Enter cobra cualquier cosa.
      resaltado = -1;
      cajaResultados.innerHTML = '';
      if (!texto.trim()) return;

      if (sinResultados(r)) {
        cajaResultados.appendChild(el('div.tarjeta', { style: 'margin-top:.75rem;text-align:center' }, [
          el('p', { texto: `No encontré nada con "${texto}".` }),
          el('p', {
            style: 'font-size:var(--t-cuerpo);color:var(--texto-suave)',
            texto: 'Prueba con otra palabra, o cóbralo como venta libre.',
          }),
          el('button.btn.acento', { texto: 'Cobrarlo como venta libre', onclick: () => ventaLibre(texto) }),
        ]));
        return;
      }

      const lista = el('ul.resultados');
      for (const p of r) {
        const img = el('img.miniatura', { alt: '', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
        if (p.tieneFoto) pintarFoto(img, p.id);
        const agotado = p.tipo !== 'servicio' && p.stock <= 0;
        lista.appendChild(el('li', { onclick: () => elegir(p) }, [
          img,
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { style: 'font-weight:600', html: esc(p.nombre) }),
            el('div', {
              style: 'font-size:var(--t-pie);color:var(--texto-suave)',
              html: `${esc(p.categoria || 'Sin categoría')}${p.tipo === 'servicio' ? '' : ` · ${p.stock} ${esc(p.unidad || 'u')}`}`,
            }),
          ]),
          el('div', { style: 'text-align:right' }, [
            el('div', { style: 'font-weight:700', texto: p.tipoPrecio === 'variable' ? 'Precio libre' : formatear(p.precioUSD) }),
            agotado ? el('span.etiqueta.mal', { texto: 'Sin stock' }) : null,
          ]),
        ]));
      }
      cajaResultados.appendChild(lista);
    }

    async function elegir(p) {
      // Lo que se agrega al carrito es lo que sube a los atajos mañana.
      contarUso(p);
      if (p.tipo !== 'servicio' && p.stock <= 0) {
        const seguir = await confirmar('Ese producto está en cero', {
          detalle: 'El inventario dice que no queda ninguno. ¿Lo vendes igual? El stock quedará en negativo y se verá en el reporte.',
          aceptar: 'Venderlo igual', cancelar: 'No',
        });
        if (!seguir) return;
      }

      // Precio fijo en 0: alguien lo cargó incompleto. Antes entraba a la venta
      // sin decir nada (y el PIN tampoco salta, porque el mínimo también es 0).
      if (p.tipoPrecio !== 'variable' && !(p.precioUSD > 0)) {
        const seguir = await confirmar(`"${p.nombre}" no tiene precio`, {
          detalle: 'Si lo vendes así, se cobra $0,00. Lo normal es ponerle su precio en Inventario primero.',
          aceptar: 'Regalarlo igual', cancelar: 'Mejor no',
        });
        if (!seguir) return;
      }

      if (p.tipoPrecio === 'variable') {
        // El precio acordado se teclea en PESOS, que es como se acuerda en el
        // mostrador ("son 2.000"), y se puede cambiar de moneda ahí mismo.
        const tasas = leer('tasas') || {};
        const monedas = ['COP', 'VES', 'USD'].filter((m) => m === 'USD' || tasas[m] > 0);
        const enPesos = p.precioCOP > 0 ? p.precioCOP
          : (p.precioUSD && tasas.COP ? desdeUSD(p.precioUSD, 'COP', tasas.COP) : 0);
        const r = await pedirMonto({
          titulo: p.nombre,
          nota: p.precioCOP ? `Lo normal es ${formatear(p.precioCOP, 'COP')}`
            : p.precioUSD ? `Lo normal es ${formatear(p.precioUSD)}`
            : 'Escribe el precio acordado',
          inicial: monedas[0] === 'COP' ? enPesos : (p.precioUSD || 0),
          moneda: monedas[0], monedas, tasas,
          aceptar: 'Agregar',
        });
        if (r === null) return;
        const monto = r.montoUSD;
        let autorizado = null;
        if (requiereAutorizacion(p, monto)) {
          autorizado = await pedirAutorizacion(`${p.nombre} a ${formatear(monto)} está por debajo del mínimo.`);
          if (!autorizado) return avisarMal('Sin autorización no se puede poner ese precio.');
        }
        agregar(p, { precioUSD: monto });
        const l = carrito();
        l[l.length - 1].autorizadoPor = autorizado;
        l[l.length - 1].precioEditado = monto !== p.precioUSD;
        // El peso exacto solo se sabe si se tecleó EN pesos. Si lo puso en
        // bolívares o en dólares, el de la etiqueta ya no vale y se borra: más
        // vale convertir el total que cobrar un peso que nadie acordó.
        const pesoAcordado = r.moneda === 'COP' ? r.menores : 0;
        l[l.length - 1].precioCOP = pesoAcordado;
        l[l.length - 1].precioCOPOriginal = pesoAcordado;
        ponerCarrito(l);
      } else {
        agregar(p);
      }
      q.value = '';
      cajaResultados.innerHTML = '';
      q.focus();
    }

    /**
     * VENTA LIBRE: cobrar algo que no está en el catálogo.
     *
     * No es solo "producto suelto". Lo que de verdad pasa en el mostrador es
     * que entra plata que no es una venta de estante: una deuda vieja que
     * pagaron, un trabajo que se hizo a mano, algo que se vendió y no estaba
     * cargado. Si eso no se puede registrar, se cobra por fuera de la app y
     * los reportes del mes mienten.
     *
     * Lleva ganancia aparte porque sin eso la app asume que TODO es ganancia
     * (costo 0): $5 de una deuda de mercancía que costó $4 entrarían como $5
     * de ganancia y el margen del mes se infla solo. La ganancia estimada se
     * guarda como costo (monto − ganancia), que es lo que ya entienden los
     * reportes, y la línea queda marcada como estimada.
     */
    async function ventaLibre(nombreSugerido = '') {
      const linea = await pedirVentaLibre(nombreSugerido);
      if (!linea) return;
      ponerCarrito([...carrito(), linea]);
      q.value = '';
      cajaResultados.innerHTML = '';
      q.focus();
    }

    // --- carrito ---
    function pintarCarrito() {
      const lineas = carrito();
      cajaCarrito.innerHTML = '';
      if (!lineas.length) {
        cajaCarrito.appendChild(el('div.vacio', {}, [
          el('div', { style: 'font-size:2.5rem', texto: '' }),
          el('p', { texto: 'Busca un producto para empezar la venta.' }),
        ]));
        return;
      }

      const t = totalesVenta(lineas);
      const tasas = leer('tasas') || {};
      const tabla = el('div.tarjeta', { style: 'margin-top:1rem' });

      lineas.forEach((l, i) => {
        // Menos / cantidad / más, ahí mismo. Lo normal en el mostrador es
        // "dame otro", y eso no puede costar abrir un formulario. Los botones
        // llevan su signo visible: antes estaban vacíos y no se veía nada.
        const paso = (delta) => {
          const nueva = Math.max(0, (Number(l.cantidad) || 0) + delta);
          if (nueva === 0) return quitar(i);
          const copia = [...carrito()];
          copia[i] = { ...copia[i], cantidad: nueva, precioUSD: precioPorCantidad(copia[i], nueva) };
          ponerCarrito(copia);
        };
        const botonCantidad = (signo, delta, etiqueta) => el('button.btn.plano', {
          type: 'button', 'aria-label': etiqueta, title: etiqueta, texto: signo,
          style: 'min-width:44px;min-height:44px;font-size:1.3rem;font-weight:700;padding:0;flex:0 0 auto',
          onclick: () => paso(delta),
        });

        tabla.appendChild(el('div', {
          style: 'display:flex;gap:.5rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--borde);flex-wrap:wrap',
        }, [
          el('div', { style: 'flex:1 1 140px;min-width:0' }, [
            // Tope de dos renglones: un nombre largo hacía la fila altísima y
            // en un carrito de seis líneas había que scrollear para ver el total.
            el('div', {
              style: 'font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer',
              html: esc(l.nombre), onclick: () => editarLinea(i),
            }),
            el('div', { style: 'font-size:var(--t-pie);display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;margin-top:.1rem' }, [
              // EL PRECIO ES UN BOTÓN, y se le nota.
              //
              // Antes, para rebajar algo había que saber que el nombre del
              // producto se podía tocar. Nada lo decía, y es lo que más se
              // hace en el mostrador: "llévatelos en 6.000". Quien no lo sabía
              // —o sea, cualquiera— no tenía cómo bajar un precio.
              el('button.btn.plano', {
                type: 'button',
                title: `Cambiar el precio de ${l.nombre}`,
                'aria-label': `Cambiar el precio de ${l.nombre}`,
                style: 'min-height:30px;padding:.1rem .5rem;font-size:var(--t-pie);font-weight:600;'
                     + 'border-style:dashed;flex:0 0 auto',
                texto: `✎ ${precioDeEtiqueta(l, leer('tasas') || {})} c/u`,
                onclick: () => cambiarPrecio(i),
              }),
              l.precioEditado ? el('span.etiqueta.alerta', { texto: 'precio cambiado' }) : null,
              l.fueraDeCatalogo ? el('span.etiqueta.info', { texto: 'venta libre' }) : null,
            ]),
          ]),
          botonCantidad('−', -1, `Quitar uno de ${l.nombre}`),
          el('span', {
            style: 'min-width:2ch;text-align:center;font-weight:700;font-size:1.05rem',
            texto: String(l.cantidad),
          }),
          botonCantidad('+', 1, `Agregar otro de ${l.nombre}`),
          el('div.cifra', {
            style: 'font-weight:700;min-width:5ch;text-align:right;flex:0 0 auto;white-space:nowrap',
            // En la misma moneda que el precio de arriba y que el TOTAL de
            // abajo. Con la fila en dólares y el total en pesos, los números de
            // la misma pantalla no sumaban y parecía que faltaba plata.
            texto: l.precioCOP > 0
              ? formatear(Math.round(l.cantidad * l.precioCOP), 'COP')
              : tasas.COP
                ? formatear(desdeUSD(Math.round(l.cantidad * l.precioUSD), 'COP', tasas.COP), 'COP')
                : formatear(Math.round(l.cantidad * l.precioUSD)),
          }),
          el('button.btn.plano', {
            type: 'button', 'aria-label': `Quitar ${l.nombre} de la venta`, title: 'Quitar',
            style: 'min-width:44px;min-height:44px;padding:0;flex:0 0 auto', html: icono('trash'),
            onclick: () => quitar(i),
          }),
        ]));
      });

      // El total GRANDE va en pesos, que es la moneda de la etiqueta, la del
      // cuadro de cobrar y la que el cliente acaba de oír. El dólar queda
      // debajo: es la moneda de cuenta del negocio, no la de la conversación.
      // (En pesos se dice el de las etiquetas sumadas, no el convertido: es el
      // mismo número que va a salir en el cobro y el que ya leyó en el estante.)
      const totalEnPesos = tasas.COP
        ? (t.totalCOP != null ? t.totalCOP : desdeUSD(t.totalUSD, 'COP', tasas.COP))
        : null;
      const totalGrande = totalEnPesos != null
        ? formatear(totalEnPesos, 'COP')
        : formatear(t.totalUSD);
      tabla.appendChild(el('div', { style: 'padding-top:.9rem' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:.5rem' }, [
          el('span', { style: 'color:var(--texto-suave);font-weight:600', texto: 'TOTAL' }),
          el('span.cifra-gigante', { texto: totalGrande }),
        ]),
        el('div', {
          style: 'color:var(--texto-suave);font-size:var(--t-cuerpo);text-align:right',
          texto: [
            totalEnPesos != null ? formatear(t.totalUSD) : null,
            tasas.VES ? formatear(desdeUSD(t.totalUSD, 'VES', tasas.VES), 'VES') : null,
          ].filter(Boolean).join('   ·   ') || 'Pon las tasas del día para ver bolívares y pesos',
        }),
      ]));

      cajaCarrito.appendChild(tabla);
      cajaCarrito.appendChild(el('div.fila', { style: 'margin-top:1rem' }, [
        el('button.btn.plano', { texto: 'Vaciar', onclick: async () => {
          if (await confirmar('¿Vaciar la venta?', { aceptar: 'Sí, vaciar', peligro: true })) vaciar();
        } }),
        el('button.btn.principal.grande', { style: 'flex:2', texto: `Cobrar ${totalGrande}`, onclick: cobrar }),
      ]));
    }

    /**
     * Cambiar el precio de una línea, EN PESOS.
     *
     * Vive aparte de `editarLinea` porque ahora se llega aquí de dos maneras:
     * tocando el precio en la fila (lo normal) o entrando por la ficha de la
     * línea. Antes solo existía el segundo camino, escondido detrás del nombre.
     *
     * Y se pregunta en pesos porque así es como se acuerda en el mostrador:
     * "llévatelos en 6.000". El dólar es la moneda de cuenta de adentro, no la
     * de la conversación. Con el teclado en dólares había que traducir de
     * cabeza a centavos, y por eso bajar un precio era imposible en la práctica.
     */
    async function cambiarPrecio(i) {
      const lineas = [...carrito()];
      const l = lineas[i];
      if (!l) return;
      // El peso de la línea se cambia junto con el dólar: si se quedara el de
      // la etiqueta, rebajar una línea bajaría el total en dólares y lo dejaría
      // igual en pesos, que es lo que el cliente está mirando.
      const tasas = leer('tasas') || {};
      const monedas = ['COP', 'VES', 'USD'].filter((m) => m === 'USD' || tasas[m] > 0);
      const r = await pedirMonto({
        titulo: `Precio de ${l.nombre}`,
        nota: l.cantidad > 1 ? `Es el precio de CADA UNO. Se llevan ${l.cantidad}.` : '',
        inicial: monedas[0] === 'COP' && l.precioCOP > 0 ? l.precioCOP
          : monedas[0] === 'COP' && tasas.COP ? desdeUSD(l.precioUSD, 'COP', tasas.COP)
          : l.precioUSD,
        moneda: monedas[0], monedas, tasas,
      });
      if (r === null) return;
      const p = r.montoUSD;
      const producto = catalogo().find((x) => x.id === l.productoId) || { costoUSD: l.costoUSD };
      if (requiereAutorizacion(producto, p)) {
        const quien = await pedirAutorizacion(`${l.nombre} a ${formatear(p)} está por debajo del mínimo.`);
        if (!quien) return avisarMal('Sin autorización no se puede poner ese precio.');
        l.autorizadoPor = quien;
      }
      l.precioUSD = p;
      const pesoAcordado = r.moneda === 'COP' ? r.menores : 0;
      l.precioCOP = pesoAcordado;
      l.precioCOPOriginal = pesoAcordado;
      l.precioEditado = p !== l.precioOriginalUSD;
      lineas[i] = l;
      ponerCarrito(lineas);
    }

    async function editarLinea(i) {
      const lineas = [...carrito()];
      const l = lineas[i];
      const d = abrirDialogo('');
      pegar(d,
        el('h2', { html: esc(l.nombre) }),
        el('div.fila', { style: 'margin:1rem 0' }, [
          el('button.btn.plano', { texto: 'Cantidad', onclick: async () => {
            d.close();
            const c = await pedirCantidad({ titulo: l.nombre, inicial: l.cantidad, unidad: l.unidad });
            if (c === null || c <= 0) return;
            l.cantidad = c;
            if (l.tipoPrecio !== 'variable' && !l.precioEditado) {
              // Escalas: 200 copias cuestan menos que 10, sin que nadie se acuerde.
              const nuevo = precioPorCantidad({ precioUSD: l.precioOriginalUSD, escalas: l.escalas }, c);
              if (nuevo !== l.precioUSD) {
                l.precioUSD = nuevo;
                avisar(`Precio por cantidad: ${formatear(nuevo)} c/u`);
              }
            }
            lineas[i] = l;
            ponerCarrito(lineas);
          } }),
          el('button.btn.plano', { texto: 'Precio', onclick: () => { d.close(); cambiarPrecio(i); } }),
        ]),
        el('button.btn.plano.ancho', { texto: 'Cerrar', onclick: () => d.close() })
      );
    }

    /**
     * En la laptop la mano está en el teclado, no en el pulgar: "/" salta al
     * buscador desde donde sea. Solo cuando NO se está escribiendo en un
     * campo, para que se pueda teclear una barra con normalidad.
     */
    const atajoBuscar = (ev) => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const a = document.activeElement;
      const escribiendo = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
      if (escribiendo || document.querySelector('dialog[open]')) return;
      ev.preventDefault();
      q.focus();
      q.select();
    };
    document.addEventListener('keydown', atajoBuscar);

    const dejarDeObservar = observar('carrito', pintarCarrito);
    // El catálogo llega después de montar la pantalla (lo trae el listener de
    // Firestore): sin esto los atajos se pintan vacíos y ahí se quedan.
    const dejarDeObservarProductos = observar('productos', pintarAtajos);
    q.focus();
    return () => {
      dejarDeObservar();
      dejarDeObservarProductos();
      // Sin esto el atajo se queda escuchando en todas las demás pantallas y
      // se acumula uno nuevo cada vez que se vuelve a Vender.
      document.removeEventListener('keydown', atajoBuscar);
    };
  },
});

/**
 * El formulario de la venta libre: qué fue, cuánto entró y cuánto de eso es
 * ganancia. Devuelve la línea lista para el carrito, o null si cancelan.
 *
 * La ganancia arranca igual al monto (lo normal en una papelería: un trabajo
 * hecho a mano es casi todo ganancia) y se puede bajar de un toque. Nunca
 * puede ser mayor que el monto: eso sería ganar más de lo que entró.
 */
function pedirVentaLibre(nombreSugerido = '') {
  return new Promise((resolver) => {
    // El monto se piensa en PESOS, igual que en el cobro y que en la etiqueta
    // del estante: nadie hace una venta suelta pensando en centavos de dólar.
    // Por dentro se guarda en dólares, como todo, pero eso no se le pide al
    // que está en el mostrador. Y las tres monedas se ven a la vez, porque la
    // pregunta del cliente es "¿y en bolívares?".
    const tasas = leer('tasas') || {};
    const MONEDAS_LIBRE = ['COP', 'VES', 'USD'].filter((m) => m === 'USD' || tasas[m] > 0);
    let moneda = MONEDAS_LIBRE[0];
    const enMoneda = (usd) => (moneda === 'USD' ? usd : desdeUSD(usd, moneda, tasas[moneda]));
    const otrasMonedas = (usd) => MONEDAS_LIBRE
      .filter((m) => m !== moneda)
      .map((m) => formatear(m === 'USD' ? usd : desdeUSD(usd, m, tasas[m]), m))
      .join('   ·   ');

    // `monto` y `ganancia` viven en DÓLARES, que es como se guardan. Pero se
    // muestra la cifra EXACTA que se tecleó (`montoTal`, en `moneda`): si se
    // mostrara el dólar convertido de vuelta, 20.000 pesos se verían como
    // 20.008 por el redondeo a centavos, y una cifra que se mueve sola no se
    // le puede enseñar a nadie.
    let monto = 0, montoTal = 0;
    let ganancia = 0, gananciaTal = 0;
    let gananciaTocada = false;

    /** Lo que se escribió, si sigue siendo de esta moneda; si no, el convertido. */
    const comoSeVe = (usd, tal) => formatear(
      tal != null && Math.abs(usd - (moneda === 'USD' ? tal : aUSD(tal, moneda, tasas[moneda]))) === 0
        ? tal : enMoneda(usd),
      moneda,
    );

    const d = abrirDialogo('');
    const nombre = el('input', {
      placeholder: 'Ej: deuda vieja de Pedro, trabajo a mano…',
      value: nombreSugerido || '',
    });
    const botonMonto = el('button.btn.plano.ancho', { type: 'button' });
    const eco = el('div', {
      style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-pie);min-height:1.2em;margin-top:.25rem',
    });
    const botonGanancia = el('button.btn.plano.ancho', { type: 'button', style: 'margin-top:.4rem' });
    const aceptar = el('button.btn.principal', { type: 'button', style: 'flex:2', texto: 'Agregar' });

    const pintar = () => {
      botonMonto.textContent = monto
        ? `Monto: ${comoSeVe(monto, montoTal)}`
        : 'Pon el monto que entró';
      botonGanancia.textContent = !monto
        ? 'Ganancia: se pone después del monto'
        : ganancia >= monto
          ? `Ganancia estimada: todo (${comoSeVe(monto, montoTal)})`
          : `Ganancia estimada: ${comoSeVe(ganancia, gananciaTal)} de ${comoSeVe(monto, montoTal)}`;
      // La misma plata en las otras dos, para no tener que salir a calcularla.
      eco.textContent = monto ? otrasMonedas(monto) : '';
      botonGanancia.disabled = monto ? null : true;
      aceptar.disabled = monto ? null : true;
      aceptar.style.opacity = monto ? '' : '.5';
    };

    botonMonto.addEventListener('click', async () => {
      const m = await pedirMonto({
        titulo: nombre.value.trim() || 'Venta libre',
        nota: 'Lo que entró a la caja', inicial: montoTal || enMoneda(monto), aceptar: 'Listo',
        moneda, monedas: MONEDAS_LIBRE, tasas,
      });
      if (m === null) return;
      // Si cambió de moneda allá adentro, esa se queda: es en la que está
      // pensando el monto, y la ganancia se le pregunta en la misma.
      const cambioMoneda = m.moneda !== moneda;
      moneda = m.moneda;
      monto = m.montoUSD;
      montoTal = m.menores;
      // Mientras no la toquen, la ganancia sigue al monto. Si ya la fijaron, se
      // respeta, pero nunca por encima de lo que entró.
      if (!gananciaTocada) { ganancia = monto; gananciaTal = montoTal; }
      else {
        ganancia = Math.min(ganancia, monto);
        // Lo tecleado de la ganancia era de la moneda vieja, o quedó capado
        // por el monto: en los dos casos deja de valer como cifra exacta.
        gananciaTal = (cambioMoneda || ganancia === monto) ? null : gananciaTal;
        if (ganancia === monto) gananciaTal = montoTal;
      }
      pintar();
    });

    botonGanancia.addEventListener('click', async () => {
      const g = await pedirMonto({
        titulo: '¿Cuánto de eso es ganancia?',
        nota: `Entraron ${comoSeVe(monto, montoTal)}. Si no te costó nada, déjalo completo.`,
        inicial: gananciaTal || enMoneda(ganancia), aceptar: 'Listo',
        moneda, monedas: MONEDAS_LIBRE, tasas,
      });
      if (g === null) return;
      // La ganancia se pregunta en la moneda del monto, pero si la cambian
      // allá adentro, el monto se pasa a esa misma: los dos números se leen
      // juntos ("500 de 20.000") y en dos monedas distintas no se leen.
      if (g.moneda !== moneda) { moneda = g.moneda; montoTal = null; }
      ganancia = Math.min(g.montoUSD, monto);
      gananciaTal = ganancia === g.montoUSD ? g.menores : null;
      gananciaTocada = true;
      pintar();
    });

    aceptar.addEventListener('click', () => {
      if (!monto) return;
      d.close();
      resolver({
        productoId: null,
        nombre: nombre.value.trim() || 'Venta libre',
        cantidad: 1,
        precioUSD: monto,
        precioOriginalUSD: monto,
        // Si se tecleó en pesos, ese peso exacto viaja con la línea: es el que
        // se cobra y el que queda si la venta se deja fiada. Si se tecleó en
        // otra moneda no hay peso acordado, y el total se convierte.
        precioCOP: moneda === 'COP' ? (montoTal || 0) : 0,
        precioCOPOriginal: moneda === 'COP' ? (montoTal || 0) : 0,
        // La ganancia estimada se guarda como costo: así los reportes, el
        // margen y el cierre de caja la cuentan sin tocar nada más.
        costoUSD: Math.max(0, monto - ganancia),
        gananciaEstimadaUSD: ganancia,
        tipoPrecio: 'variable',
        escalas: [],
        esServicio: true,
        fueraDeCatalogo: true,
        // No se marca "precio cambiado": no hay precio de catálogo que cambiar,
        // y la etiqueta roja en cada venta libre solo asusta al dueño.
        precioEditado: false,
        autorizadoPor: null,
      });
    });

    pegar(d,
      el('h2', { texto: 'Venta libre' }),
      el('p', {
        style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
        texto: 'Para lo que no está en el catálogo: una deuda vieja que te pagaron, '
             + 'un trabajo hecho a mano, algo suelto. No toca el inventario.',
      }),
      el('div.campo', {}, [el('label', { texto: '¿Qué fue?' }), nombre]),
      botonMonto,
      eco,
      botonGanancia,
      el('p', {
        style: 'color:var(--texto-suave);font-size:var(--t-pie);margin:.4rem 0 0',
        texto: 'La ganancia es estimada: sirve para que el reporte del mes no cuente '
             + 'como ganancia una plata que ya te había costado.',
      }),
      el('div.fila', { style: 'margin-top:1rem' }, [
        el('button.btn.callado', { type: 'button', texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        aceptar,
      ])
    );
    pintar();
    nombre.focus();
  });
}

// --- cobrar ------------------------------------------------------------------
//
// Lo más corto posible, porque es lo que se hace cien veces al día: se ve el
// total, se toca con qué pagó, y se acabó.
//
// AQUÍ NO SE CALCULA VUELTO, a propósito. Se probó al revés —pedir cuánto
// entregó el cliente y que la app restara— y era un estorbo: una pantalla más,
// un número que escribir con el cliente esperando, y para algo que quien
// atiende hace de cabeza mientras cuenta los billetes. La app no tiene por qué
// opinar de eso.
//
// Lo que sí hace falta es AJUSTAR EL MONTO. Los precios caen en números que no
// existen en monedas: $ 1.520 no se puede cobrar porque no hay con qué dar los
// 20. Se le quitan y se cobra 1.500. Eso antes había que hacerlo línea por
// línea, cambiando el precio de un producto, que es mentira: el producto no
// cambió de precio, se redondeó la venta. Ahora se ajusta el total, queda
// escrito quién lo hizo y cuánto, y al empleado se le pide el código.
//
// Y la gaveta sigue cuadrando: lo que entra es el total: si pagan con un
// billete grande, el vuelto sale de la gaveta y la diferencia es el total
// igual. Por eso no hace falta anotar el billete.
async function cobrar() {
  const lineas = carrito();
  if (!lineas.length) return;
  const t = totalesVenta(lineas);
  const tasas = leer('tasas') || {};

  // El monto se piensa y se ajusta en PESOS, que es la moneda de la etiqueta.
  // Si no hay tasa cargada, se trabaja en dólares y el ajuste también.
  const monedaMonto = tasas.COP ? 'COP' : 'USD';
  const enMoneda = (usd) => (monedaMonto === 'USD' ? usd : desdeUSD(usd, monedaMonto, tasas[monedaMonto]));
  const aDolares = (monto) => (monedaMonto === 'USD' ? monto : aUSD(monto, monedaMonto, tasas[monedaMonto]));

  // El total en pesos se SUMA de las etiquetas, no se convierte del dólar: así
  // la pantalla dice 20.000 y no 20.008 (ver `totalesVenta`). Si alguna línea
  // no sabe su peso —un precio acordado a mano— se convierte el total entero,
  // que es lo que se hacía siempre.
  let montoCobrado = (monedaMonto === 'COP' && t.totalCOP != null)
    ? t.totalCOP
    : enMoneda(t.totalUSD);
  const totalDeEtiqueta = montoCobrado;        // sin ajustar, para comparar
  let ajustadoPor = null;
  // Si NO se tocó "Ajustar el monto", no hay ajuste que guardar. Antes se
  // deducía comparando dólares, y al sumar pesos exactos esa resta podía dar
  // un centavo: la venta quedaba marcada como "subida" sin que nadie la
  // tocara, y pidiendo un autorizante que no existía.
  let ajustado = false;
  const totalUSD = () => (ajustado ? aDolares(montoCobrado) : t.totalUSD);
  const ajusteUSD = () => (ajustado ? aDolares(montoCobrado) - t.totalUSD : 0);

  const d = abrirDialogo('');
  const resumen = el('div');
  const botonesMoneda = el('div.fila', { style: 'margin:.75rem 0;flex-wrap:wrap' });

  function pintar() {
    resumen.innerHTML = '';
    const ajuste = ajusteUSD();
    pegar(resumen,
      el('div', { style: 'text-align:center' }, [
        el('div', { style: 'color:var(--texto-suave);font-size:var(--t-pie)', texto: 'TOTAL A COBRAR' }),
        el('div.cifra-gigante', { texto: formatear(montoCobrado, monedaMonto) }),
        // Las otras monedas, debajo y en chico: sirven para decir el precio,
        // no para cobrar en dos monedas a la vez.
        el('div', {
          style: 'color:var(--texto-suave);font-size:var(--t-cuerpo)',
          texto: Object.keys(MONEDAS)
            .filter((m) => m !== monedaMonto && (m === 'USD' || tasas[m]))
            .map((m) => formatear(m === 'USD' ? totalUSD() : desdeUSD(totalUSD(), m, tasas[m]), m))
            .join('   ·   '),
        }),
        ajuste ? el('div', {
          style: `font-size:var(--t-pie);font-weight:600;color:${ajuste < 0 ? 'var(--ambar)' : 'var(--verde)'}`,
          // Lo rebajado se dice en la moneda en que se rebajó, comparando con
          // el total de la etiqueta y no con el dólar convertido de vuelta.
          texto: `${ajuste < 0 ? 'Rebajado' : 'Subido'} ${formatear(Math.abs(totalDeEtiqueta - montoCobrado), monedaMonto)}`
               + (ajustadoPor ? ` · autorizó ${ajustadoPor}` : ''),
        }) : null,
      ])
    );

    botonesMoneda.innerHTML = '';
    for (const codigo of Object.keys(MONEDAS)) {
      if (codigo !== 'USD' && !tasas[codigo]) continue;
      // En la moneda del monto se cobra el monto EXACTO que se ve arriba. Si se
      // recalculara desde el dólar, un ajuste a 1.500 podía cobrarse en 1.501:
      // el dólar no tiene suficientes decimales para volver al peso sin error.
      const enEsa = codigo === monedaMonto ? montoCobrado
        : codigo === 'USD' ? totalUSD()
        : desdeUSD(totalUSD(), codigo, tasas[codigo]);
      botonesMoneda.appendChild(el('button.btn.plano', {
        style: 'flex:1 1 44%;min-height:60px;flex-direction:column;gap:.1rem',
        onclick: () => terminar(codigo, enEsa),
      }, [
        el('span', { style: 'font-weight:700', texto: MONEDAS[codigo].nombre }),
        el('span', { style: 'font-size:var(--t-pie);color:var(--texto-suave)', texto: formatear(enEsa, codigo) }),
      ]));
    }
  }

  /** Ajustar el total: quitarle los 20 que no se pueden dar. */
  async function ajustar() {
    const nuevo = await pedirMonto({
      titulo: 'Ajustar el monto',
      nota: `El total es ${formatear(totalDeEtiqueta, monedaMonto)}. `
          + 'Déjalo en lo que de verdad vas a cobrar.',
      moneda: monedaMonto, inicial: montoCobrado, aceptar: 'Dejarlo en',
    });
    if (nuevo === null || nuevo === montoCobrado) return;
    // Subirlo o bajarlo lo decide el dueño, o el código. Sin esto, cualquiera
    // podría rebajar una venta y nadie se enteraría.
    const quien = await pedirAutorizacion(
      `Cambiar el total de ${formatear(totalDeEtiqueta, monedaMonto)} `
      + `a ${formatear(nuevo, monedaMonto)}.`);
    if (!quien) return avisarMal('Sin autorización no se puede cambiar el total.');
    ajustadoPor = quien;
    montoCobrado = nuevo;
    ajustado = true;
    pintar();
  }

  // El candado del cobro. NO va por botón, va por cuadro: los tres botones de
  // moneda y el de fiado son cuatro caminos a la MISMA venta, y el toque de más
  // casi nunca cae dos veces en el mismo sitio.
  //
  // Lo que pasó el 26/10 (ver `unSoloToque`): nueve toques en "Pesos" mientras
  // `turnoAbierto()` esperaba señal, los nueve esperando en el mismo await, y
  // al volver la señal, nueve ventas iguales dentro de 15 milisegundos.
  let cobrando = false;

  async function terminar(moneda, monto, { fiadoA = null } = {}) {
    if (cobrando) return;
    cobrando = true;
    // Que se VEA que está cobrando, o el que atiende vuelve a tocar con razón.
    for (const b of d.querySelectorAll('button')) b.disabled = true;
    const aviso = el('p', {
      style: 'text-align:center;color:var(--texto-suave);font-size:var(--t-cuerpo);margin:.6rem 0 0',
      texto: fiadoA ? 'Anotando el fiado…' : 'Cobrando…',
    });
    d.append(aviso);
    try {
      const turno = await turnoAbierto().catch(() => null);
      // Pagó justo: se cobra el total en la moneda que se tocó. No se anota
      // ningún billete ni ningún vuelto, porque lo que queda en la gaveta al
      // final del día es el total igual.
      // Los botones de moneda pagan la venta ENTERA, así que este pago la
      // cubre: su valor en dólares es el de la venta, no uno recalculado que
      // puede caer a un centavo y dejar un saldo que nadie debe.
      const pagos = fiadoA ? [] : [crearPago(moneda, monto, tasas, { montoUSD: totalUSD() })];
      const { id, venta } = await registrarVenta({
        lineas, pagos,
        ajusteUSD: ajusteUSD(),
        ajustadoPor,
        // El monto en pesos se guarda siempre que se haya pensado en pesos,
        // aunque pague en otra moneda: es el precio que se acordó.
        totalCOP: monedaMonto === 'COP' ? montoCobrado : null,
        clienteId: fiadoA?.id || null,
        fiado: !!fiadoA,
        sinTurno: !turno,
      });
      d.close();
      vaciar();
      sonidoCobrar();
      if (fiadoA) avisarOk(`Queda fiado a ${fiadoA.nombre}`);
      else if (turno) avisarOk('Venta registrada');
      // Vender con la caja cerrada es normal: las ventas rápidas de la calle
      // se hacen así y no hay gaveta que contar. Lo que hace falta decir no es
      // "abre la caja" sino DÓNDE quedó esa plata, para que se pueda entregar.
      else avisar('Venta registrada con la caja cerrada: esa plata queda contigo, no en la gaveta. '
                + 'Cuando llegues, pásala a la caja en Mi dinero → Mover.');
      recibo({ id, venta, tasas, alCerrar: () => $('#q')?.focus() });
    } catch (e) {
      sonidoAlerta();
      avisarMal(e.message || 'No se pudo registrar la venta.');
      // No se cobró: se devuelven los botones para poder reintentar. Si se
      // cobró, el cuadro ya se cerró y no hay nada que devolver.
      cobrando = false;
      aviso.remove();
      for (const b of d.querySelectorAll('button')) b.disabled = false;
    }
  }

  pegar(d,
    el('h2', { texto: 'Cobrar' }),
    resumen,
    el('button.btn.callado.ancho', {
      style: 'margin-top:.5rem', texto: 'Ajustar el monto', onclick: ajustar,
    }),
    el('p', { style: 'color:var(--texto-suave);font-size:var(--t-pie);margin-top:1rem', texto: '¿Con qué te pagó?' }),
    botonesMoneda,
    el('button.btn.plano.ancho', {
      style: 'margin-top:.25rem', texto: 'Dejarlo fiado',
      onclick: async () => {
        const elegido = await elegirCliente();
        if (!elegido) return;
        terminar(null, 0, { fiadoA: elegido });
      },
    }),
    el('button.btn.callado.ancho', { style: 'margin-top:.5rem', texto: 'Cancelar', onclick: () => d.close() })
  );
  pintar();
}

/** Elegir (o crear al vuelo) el cliente del fiado. */
function elegirCliente() {
  return new Promise(async (resolver) => {
    // De la caché, que es instantánea: este cuadro se abre en medio de un
    // cobro y no puede esperar a la señal. La lista del servidor llega abajo y
    // repinta (ver data/lectura.js).
    let clientes = await listarClientes({ fuente: CACHE }).catch(() => []);
    const d = abrirDialogo('');
    const entrada = el('input', { placeholder: 'Nombre o teléfono' });
    const lista = el('div', { style: 'max-height:40vh;overflow:auto;margin:.75rem 0' });
    const pintar = (filtro = '') => {
      lista.innerHTML = '';
      for (const c of buscarClientes(clientes, filtro)) {
        lista.appendChild(el('button.btn.plano.ancho', {
          style: 'justify-content:space-between;margin-bottom:.4rem',
          onclick: () => { d.close(); resolver(c); },
        }, [
          el('span', { html: esc(c.nombre) }),
          // Lo que ya debe, en pesos: es el dato que decide si se le fía otra vez.
          el('span', { style: 'color:var(--texto-suave)', texto: (() => {
            const d = deudaDe(c, leer('tasas') || {});
            if (!d.USD) return '';
            return `debe ${d.COP ? formatear(d.COP, 'COP') : formatear(d.USD)}`;
          })() }),
        ]));
      }
    };
    entrada.addEventListener('input', () => pintar(entrada.value));
    pintar();
    listarClientes()
      .then((lista) => { clientes = lista; if (d.open) pintar(entrada.value); })
      .catch(() => {});
    pegar(d, 
      el('h2', { texto: 'Fiado — ¿a quién?' }),
      entrada, lista,
      el('div.fila', {}, [
        el('button.btn.callado', { texto: 'Cancelar', onclick: () => { d.close(); resolver(null); } }),
        el('button.btn.principal', { texto: 'Crear cliente', onclick: async () => {
          const nombre = entrada.value.trim();
          if (!nombre) return;
          const id = await guardarCliente({ nombre });
          d.close();
          resolver({ id, nombre, saldoUSD: 0, saldoCOP: 0 });
        } }),
      ])
    );
    entrada.focus();
  });
}

export { agregar, carrito, vaciar };
