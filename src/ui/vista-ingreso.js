// ui/vista-ingreso.js — Pantalla de recepción: el socio da su DNI y se registra su ingreso.

(() => {
  const form = document.getElementById('form-ingreso');
  const input = document.getElementById('ingreso-dni');
  const tarjeta = document.getElementById('ingreso-resultado');
  const reloj = document.getElementById('ingreso-reloj');
  const resumen = document.getElementById('ingresos-resumen');
  const lista = document.getElementById('lista-ingresos');
  const vacio = document.getElementById('ingresos-vacio');

  // Cuántos segundos queda visible el resultado antes de limpiarse solo
  const SEGUNDOS_RESULTADO = 10;

  let temporizadorResultado;
  let fechaMostrada = hoyISO(); // para detectar el cambio de día a medianoche

  // ---------- Reloj ----------
  const formatoFecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  function actualizarReloj() {
    const ahora = new Date();
    const fecha = formatoFecha.format(ahora); // "viernes, 6 de noviembre"
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    reloj.textContent = `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;

    // Pasó la medianoche: la lista de "Hoy" tiene que empezar vacía
    if (hoyISO() !== fechaMostrada) {
      fechaMostrada = hoyISO();
      cargarHoy();
    }
  }

  // ---------- Registrar ingreso ----------
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const entrada = input.value.trim();
    if (!entrada) return;

    input.value = ''; // listo para el próximo socio
    const resultado = await pedir(window.api.registrarIngreso(entrada));
    input.focus();
    if (resultado === null) return;

    mostrarResultado(resultado);
    if (resultado.resultado === 'ok') cargarHoy();
  });

  // Esc: limpiar
  input.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      input.value = '';
      limpiarResultado();
    }
  });

  // ---------- Tarjeta grande con el resultado ----------
  function mostrarResultado(resultado) {
    const { clase, elementos } = armarResultado(resultado);
    tarjeta.className = `ingreso-resultado ${clase}`;
    tarjeta.replaceChildren(...elementos);
    tarjeta.hidden = false;

    clearTimeout(temporizadorResultado);
    temporizadorResultado = setTimeout(limpiarResultado, SEGUNDOS_RESULTADO * 1000);
  }

  function limpiarResultado() {
    clearTimeout(temporizadorResultado);
    tarjeta.hidden = true;
    tarjeta.replaceChildren();
  }

  function boton(texto, clase, alClick) {
    return crear('button', { tipo: 'button', clase: `boton ${clase}`, texto, alClick });
  }

  // Devuelve el color de la tarjeta y su contenido según cada caso
  function armarResultado(r) {
    const titulo = (texto) => crear('strong', { clase: 'resultado-titulo', texto });
    const linea = (texto, clase = 'resultado-linea') => crear('p', { clase, texto });

    if (r.resultado === 'dni_invalido') {
      return {
        clase: 'gris',
        elementos: [
          crear('div', { clase: 'resultado-texto' }, [
            titulo('DNI inválido'),
            linea('Revisá el número: tiene que tener 7 u 8 dígitos.'),
          ]),
        ],
      };
    }

    if (r.resultado === 'no_encontrado') {
      return {
        clase: 'gris',
        elementos: [
          crear('div', { clase: 'resultado-texto' }, [
            titulo(`No hay ningún socio con DNI ${formatearDni(r.dni)}`),
            linea('Si es una persona nueva, registrala como socio.'),
          ]),
          crear('div', { clase: 'resultado-acciones' }, [
            boton('Registrar socio nuevo', 'boton-primario', () => irANuevoSocio(r.dni)),
          ]),
        ],
      };
    }

    const s = r.socio;
    const avatar = crear('span', { clase: 'resultado-avatar', texto: iniciales(s.nombre, s.apellido) });

    if (r.resultado === 'baja') {
      return {
        clase: 'gris',
        elementos: [
          avatar,
          crear('div', { clase: 'resultado-texto' }, [
            titulo(`${s.nombre} ${s.apellido} está dado de baja`),
            linea('Para que vuelva a entrenar, reactivalo y registrá su pago. El ingreso no se registró.'),
          ]),
          crear('div', { clase: 'resultado-acciones' }, [
            boton('Ver ficha', 'boton-secundario', () => irAFichaDeSocio(s.id)),
          ]),
        ],
      };
    }

    // resultado 'ok' o 'repetido': el color depende de la cuota
    const textosCuota = {
      al_dia: `Cuota al día hasta el ${fechaCorta(s.vence_el)}`,
      por_vencer: `Su cuota vence el ${fechaCorta(s.vence_el)} (${textoVencimiento(s).toLowerCase()})`,
      vencido: `Cuota vencida: ${textoVencimiento(s).toLowerCase()}`,
      sin_pagos: 'No tiene pagos registrados',
    };

    const saludo =
      r.resultado === 'repetido'
        ? `${s.nombre} ya ingresó hoy a las ${r.horaAnterior}`
        : `¡Hola, ${s.nombre}!`;

    const debeCobrar = s.estado !== 'al_dia';

    return {
      clase: ESTADOS_CUOTA[s.estado].clase,
      elementos: [
        avatar,
        crear('div', { clase: 'resultado-texto' }, [
          titulo(saludo),
          linea(`${s.nombre} ${s.apellido} · ${s.plan ?? 'Sin plan'} · Visitas este mes: ${r.asistencia.esteMes}`),
          linea(textosCuota[s.estado], 'resultado-cuota'),
        ]),
        ...(debeCobrar
          ? [
              crear('div', { clase: 'resultado-acciones' }, [
                boton('Cobrar cuota', 'boton-primario', () => irAFichaDeSocio(s.id)),
              ]),
            ]
          : []),
      ],
    };
  }

  // ---------- Lista de ingresos de hoy ----------
  async function cargarHoy() {
    const datos = await pedir(window.api.ingresosDeHoy());
    if (datos === null) return;

    const n = datos.total;
    resumen.textContent =
      `${n} ingreso${n === 1 ? '' : 's'}` +
      (datos.conCuotaVencida > 0 ? ` · ${datos.conCuotaVencida} con cuota vencida` : '');

    lista.replaceChildren(
      ...datos.ingresos.map((ingreso) =>
        crear('li', {}, [
          crear('span', { clase: 'hora', texto: ingreso.hora }),
          crear('button', {
            tipo: 'button',
            clase: 'nombre-ingreso',
            texto: `${ingreso.apellido}, ${ingreso.nombre}`,
            titulo: 'Ver ficha',
            alClick: () => irAFichaDeSocio(ingreso.socio_id),
          }),
          insigniaEstado(ingreso.estado_cuota),
          crear('button', {
            tipo: 'button',
            clase: 'boton-texto boton-mini',
            texto: 'Quitar',
            titulo: 'Quitar este ingreso (si se registró por error)',
            alClick: () => quitarIngreso(ingreso),
          }),
        ])
      )
    );

    vacio.hidden = n > 0;
  }

  async function quitarIngreso(ingreso) {
    const confirmado = await confirmar({
      titulo: 'Quitar ingreso',
      mensaje: `¿Quitar el ingreso de ${ingreso.nombre} ${ingreso.apellido} de las ${ingreso.hora}?`,
      detalle: 'Usalo solo si se registró por error (por ejemplo, un DNI mal escrito).',
      boton: 'Quitar',
    });
    if (!confirmado) return;

    const resultado = await pedir(window.api.eliminarIngreso(ingreso.id));
    if (resultado === null) return;

    mostrarMensaje('Ingreso quitado');
    cargarHoy();
    input.focus();
  }

  // ---------- Al entrar a la pantalla ----------
  function alMostrar() {
    limpiarResultado();
    actualizarReloj();
    cargarHoy();
    input.focus();
  }

  setInterval(actualizarReloj, 15000);

  vistas.ingreso = { alMostrar };
})();
