// ui/vista-socios.js — Socios: lista, filtros, ficha, formulario y cobro de cuotas.

(() => {
  // ---------- Elementos: lista y ficha ----------
  const buscador = document.getElementById('buscador-socios');
  const filtroEstado = document.getElementById('filtro-estado');
  const filtroMostrar = document.getElementById('filtro-mostrar');
  const contador = document.getElementById('contador-socios');
  const tabla = document.getElementById('tabla-socios');
  const vacio = document.getElementById('socios-vacio');
  const detalle = document.getElementById('detalle-socio');
  const btnNuevo = document.getElementById('btn-nuevo-socio');

  // ---------- Elementos: formulario de socio ----------
  const dialogoSocio = document.getElementById('dialogo-socio');
  const formSocio = document.getElementById('form-socio');
  const tituloSocio = document.getElementById('titulo-socio');
  const errorSocio = document.getElementById('error-socio');
  const btnCancelarSocio = document.getElementById('btn-cancelar-socio');
  const selectPlanSocio = document.getElementById('socio-plan');

  // ---------- Elementos: formulario de pago ----------
  const dialogoPago = document.getElementById('dialogo-pago');
  const formPago = document.getElementById('form-pago');
  const pagoSocio = document.getElementById('pago-socio');
  const selectPlanPago = document.getElementById('pago-plan');
  const pagoHasta = document.getElementById('pago-hasta');
  const pagoAyuda = document.getElementById('pago-ayuda');
  const errorPago = document.getElementById('error-pago');
  const btnCancelarPago = document.getElementById('btn-cancelar-pago');

  // Coinciden con los "name" del formulario de socio
  const CAMPOS_SOCIO = ['nombre', 'apellido', 'dni', 'telefono', 'fechaNacimiento', 'planId', 'notas'];

  let idSeleccionado = null; // socio cuya ficha se ve a la derecha
  let idEditando = null;     // null = socio nuevo
  let socioCobrando = null;  // socio al que se le está registrando un pago
  let planesPago = [];       // planes que se pueden elegir en el diálogo de pago

  // ---------- Planes para los formularios ----------
  // Planes activos + el plan actual del socio (aunque esté desactivado)
  async function obtenerPlanesDisponibles(planActualId) {
    const planes = await pedir(window.api.listarPlanes({ incluirInactivos: true }));
    if (planes === null) return null;
    return planes.filter((p) => p.activo || p.id === planActualId);
  }

  function opcionesDePlan(planes) {
    return planes.map((p) =>
      crear('option', { valor: p.id, texto: `${p.nombre} — ${pesos(p.precio_centavos)}` })
    );
  }

  // ---------- Lista ----------
  async function cargar() {
    const socios = await pedir(
      window.api.listarSocios({
        busqueda: buscador.value,
        estado: filtroEstado.value,
        mostrar: filtroMostrar.value,
      })
    );
    if (socios === null) return;

    renderTabla(socios);

    if (idSeleccionado !== null) mostrarDetalle(idSeleccionado);
    else renderDetalleVacio();
  }

  function renderTabla(socios) {
    tabla.replaceChildren(
      ...socios.map((socio) => {
        const clases = [];
        if (socio.id === idSeleccionado) clases.push('seleccionada');
        if (!socio.activo) clases.push('inactivo');

        const fila = crear('tr', { clase: clases.join(' ') }, [
          crear('td', {}, [crear('strong', { texto: `${socio.apellido}, ${socio.nombre}` })]),
          crear('td', { texto: formatearDni(socio.dni) }),
          crear('td', { texto: socio.plan ?? 'Sin plan' }),
          crear('td', { texto: socio.vence_el ? fechaCorta(socio.vence_el) : '—' }),
          crear('td', {}, [
            socio.activo
              ? insigniaEstado(socio.estado)
              : crear('span', { clase: 'insignia gris', texto: 'De baja' }),
          ]),
        ]);
        fila.dataset.id = socio.id;
        fila.addEventListener('click', () => seleccionar(socio.id));

        // También con teclado: Tab para llegar a la fila, Enter o Espacio para abrirla
        fila.tabIndex = 0;
        fila.addEventListener('keydown', (evento) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            seleccionar(socio.id);
          }
        });
        return fila;
      })
    );

    const hayFiltro = buscador.value.trim() !== '' || filtroEstado.value !== 'todos';
    vacio.textContent = hayFiltro
      ? 'No hay socios que coincidan con el filtro.'
      : 'No hay socios en esta lista.';
    vacio.hidden = socios.length > 0;
    contador.textContent = `${socios.length} socio${socios.length === 1 ? '' : 's'}`;
  }

  function seleccionar(id) {
    idSeleccionado = id;
    for (const fila of tabla.rows) {
      fila.classList.toggle('seleccionada', Number(fila.dataset.id) === id);
    }
    mostrarDetalle(id);
  }

  // ---------- Ficha del socio ----------
  function renderDetalleVacio() {
    detalle.replaceChildren(
      crear('p', { clase: 'vacio', texto: 'Elegí un socio de la lista para ver su ficha.' })
    );
  }

  async function mostrarDetalle(id) {
    // Pedimos el socio, sus pagos y sus asistencias AL MISMO TIEMPO (no uno después del otro)
    const [socio, pagos, asistencia] = await Promise.all([
      pedir(window.api.obtenerSocio(id)),
      pedir(window.api.listarPagosDeSocio(id)),
      pedir(window.api.resumenAsistenciaSocio(id)),
    ]);
    if (socio === null || pagos === null || asistencia === null) {
      idSeleccionado = null;
      renderDetalleVacio();
      return;
    }

    const edad = calcularEdad(socio.fecha_nacimiento);
    const estado = ESTADOS_CUOTA[socio.estado];

    // Cada dato es un par <dt> (etiqueta) + <dd> (valor)
    const dato = (etiqueta, valor) => [
      crear('dt', { texto: etiqueta }),
      crear('dd', { texto: valor || '—' }),
    ];

    detalle.replaceChildren(
      // Cabecera tipo carnet
      crear('div', { clase: 'detalle-cabecera' }, [
        crear('span', { clase: 'avatar', texto: iniciales(socio.nombre, socio.apellido) }),
        crear('div', {}, [
          crear('h2', { texto: `${socio.nombre} ${socio.apellido}` }),
          crear('p', {
            clase: 'subtitulo',
            texto: `DNI ${formatearDni(socio.dni)}${edad !== null ? ` · ${edad} años` : ''}`,
          }),
        ]),
      ]),

      // Estado de la cuota
      crear('div', { clase: `vencimiento ${socio.activo ? estado.clase : 'gris'}` }, [
        crear('div', { clase: 'vencimiento-titulo' }, [
          crear('strong', {
            texto: socio.vence_el ? `Vence el ${fechaCorta(socio.vence_el)}` : 'Sin pagos',
          }),
          socio.activo
            ? insigniaEstado(socio.estado)
            : crear('span', { clase: 'insignia gris', texto: 'Dado de baja' }),
        ]),
        crear('span', { texto: textoVencimiento(socio) }),
      ]),

      // Acción principal (solo socios activos)
      socio.activo
        ? crear('div', { clase: 'accion-principal' }, [
            crear('button', {
              tipo: 'button',
              clase: 'boton boton-primario boton-ancho',
              texto: 'Registrar pago',
              alClick: () => abrirPago(socio),
            }),
          ])
        : crear('p', {
            clase: 'aviso-baja',
            texto: 'Para cobrarle, primero reactivalo.',
          }),

      crear('dl', { clase: 'lista-datos' }, [
        ...dato('Plan', socio.plan),
        ...dato('Teléfono', socio.telefono),
        ...dato('Nacimiento', socio.fecha_nacimiento ? fechaCorta(socio.fecha_nacimiento) : ''),
        ...dato(
          'Asistencias',
          `${asistencia.esteMes} este mes · última: ` +
            (asistencia.ultima
              ? `${fechaCorta(asistencia.ultima.fecha)} ${asistencia.ultima.hora}`
              : 'nunca')
        ),
        ...dato('Socio desde', fechaCorta(socio.creado_en)),
        ...dato('Notas', socio.notas),
      ]),

      crear('div', { clase: 'seccion' }, [
        crear('h3', { texto: 'Últimos pagos' }),
        renderHistorial(pagos),
      ]),

      crear('div', { clase: 'acciones' }, [
        crear('button', {
          tipo: 'button',
          clase: 'boton boton-secundario',
          texto: 'Editar datos',
          alClick: () => abrirFormularioSocio(socio),
        }),
        ...(socio.telefono && socio.activo
          ? [botonWhatsApp(socio, socio.estado, 'boton boton-secundario')]
          : []),
        crear('button', {
          tipo: 'button',
          clase: socio.activo ? 'boton boton-peligro' : 'boton boton-secundario',
          texto: socio.activo ? 'Dar de baja' : 'Reactivar',
          alClick: () => cambiarEstado(socio),
        }),
      ])
    );
  }

  function renderHistorial(pagos) {
    if (pagos.length === 0) {
      return crear('p', { clase: 'texto-tenue', texto: 'Todavía no tiene pagos.' });
    }

    return crear(
      'ul',
      { clase: 'historial' },
      pagos.map((pago) =>
        crear('li', { clase: pago.anulado ? 'anulado' : '' }, [
          crear('span', { texto: `${fechaCorta(pago.fecha_pago)} · ${pago.plan_nombre}` }),
          crear('span', { clase: 'monto', texto: pesos(pago.monto_centavos) }),
          crear('span', {
            clase: 'detalle-pago',
            texto:
              `Cubre del ${fechaCorta(pago.cubre_desde)} al ${fechaCorta(pago.cubre_hasta)}` +
              ` · ${METODOS_PAGO[pago.metodo]}` +
              (pago.anulado ? ' · Anulado' : ''),
          }),
          pago.anulado
            ? crear('span')
            : crear('button', {
                tipo: 'button',
                clase: 'boton-texto boton-mini',
                texto: 'Anular',
                alClick: async () => {
                  if (await anularPago(pago)) cargar();
                },
              }),
        ])
      )
    );
  }

  // ---------- Registrar pago ----------
  async function abrirPago(socio) {
    const planes = await obtenerPlanesDisponibles(socio.plan_id);
    if (planes === null) return;
    if (planes.length === 0) {
      mostrarMensaje('Primero creá un plan en la sección Planes', 'error');
      return;
    }

    socioCobrando = socio;
    planesPago = planes;
    errorPago.textContent = '';
    pagoSocio.textContent = `${socio.nombre} ${socio.apellido} · DNI ${formatearDni(socio.dni)}`;

    selectPlanPago.replaceChildren(...opcionesDePlan(planes));
    const planInicial = planes.find((p) => p.id === socio.plan_id) ?? planes[0];
    selectPlanPago.value = planInicial.id;

    // ¿Desde qué día cuenta el nuevo período?
    const hoy = hoyISO();
    let desde;
    let explicacion;
    if (socio.vence_el && socio.vence_el >= hoy) {
      // Todavía está al día: sigue desde su vencimiento y no pierde días
      desde = sumarDias(socio.vence_el, 1);
      explicacion = `Todavía tiene pago hasta el ${fechaCorta(socio.vence_el)}: el nuevo período sigue desde el día siguiente, así no pierde días.`;
    } else if (socio.vence_el) {
      desde = hoy;
      explicacion = `Su cuota venció el ${fechaCorta(socio.vence_el)}: el nuevo período empieza hoy.`;
    } else {
      desde = hoy;
      explicacion = 'Es su primer pago: el período empieza hoy.';
    }

    formPago.elements.monto.value = centavosATexto(planInicial.precio_centavos);
    formPago.elements.metodo.value = 'efectivo';
    formPago.elements.fechaPago.value = hoy;
    formPago.elements.fechaPago.max = hoy; // no se pueden cargar pagos con fecha futura
    formPago.elements.cubreDesde.value = desde;
    formPago.elements.notas.value = '';
    pagoAyuda.textContent = `${explicacion} Si el gimnasio cobra distinto, cambiá "Cubre desde".`;
    actualizarHasta();

    dialogoPago.showModal();
    formPago.elements.monto.select();
  }

  function planElegido() {
    return planesPago.find((p) => p.id === Number(selectPlanPago.value));
  }

  // Muestra hasta qué día cubre el pago, según el plan y "Cubre desde"
  function actualizarHasta() {
    const plan = planElegido();
    const desde = formPago.elements.cubreDesde.value;
    if (!plan || !desde) {
      pagoHasta.textContent = '—';
      return;
    }
    const hasta = sumarDias(desde, plan.duracion_dias - 1);
    const dias = plan.duracion_dias;
    pagoHasta.textContent = `${fechaCorta(hasta)} (${dias} día${dias === 1 ? '' : 's'})`;
  }

  selectPlanPago.addEventListener('change', () => {
    const plan = planElegido();
    if (plan) formPago.elements.monto.value = centavosATexto(plan.precio_centavos);
    actualizarHasta();
  });

  formPago.elements.cubreDesde.addEventListener('input', actualizarHasta);

  formPago.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorPago.textContent = '';

    const montoCentavos = parsearMonto(formPago.elements.monto.value);
    if (montoCentavos === null) {
      errorPago.textContent = 'Ingresá un monto válido, por ejemplo 25000 o 25.000';
      return;
    }

    const datos = {
      socioId: socioCobrando.id,
      planId: Number(selectPlanPago.value),
      montoCentavos,
      metodo: formPago.elements.metodo.value,
      fechaPago: formPago.elements.fechaPago.value,
      cubreDesde: formPago.elements.cubreDesde.value,
      notas: formPago.elements.notas.value,
    };

    const resultado = await pedir(window.api.registrarPago(datos), errorPago);
    if (resultado === null) return;

    dialogoPago.close();
    mostrarMensaje(`Pago registrado: cubre hasta el ${fechaCorta(resultado.cubreHasta)}`);
    idSeleccionado = socioCobrando.id;
    cargar();
  });

  btnCancelarPago.addEventListener('click', () => dialogoPago.close());

  // ---------- Formulario de socio ----------
  // socio = null → socio nuevo. dniInicial: para llegar desde Ingreso con el DNI ya escrito.
  async function abrirFormularioSocio(socio, dniInicial = '') {
    idEditando = socio ? socio.id : null;

    const planes = await obtenerPlanesDisponibles(socio?.plan_id ?? null);
    if (planes === null) return;
    selectPlanSocio.replaceChildren(
      crear('option', { valor: '', texto: 'Sin plan' }),
      ...opcionesDePlan(planes)
    );

    tituloSocio.textContent = socio ? 'Editar socio' : 'Nuevo socio';
    errorSocio.textContent = '';

    // Los nombres de la base (fecha_nacimiento) no coinciden con los del formulario (fechaNacimiento)
    const valores = socio
      ? {
          nombre: socio.nombre,
          apellido: socio.apellido,
          dni: socio.dni,
          telefono: socio.telefono,
          fechaNacimiento: socio.fecha_nacimiento,
          planId: socio.plan_id,
          notas: socio.notas,
        }
      : { dni: dniInicial };

    for (const campo of CAMPOS_SOCIO) {
      formSocio.elements[campo].value = valores[campo] ?? '';
    }

    dialogoSocio.showModal();
    formSocio.elements.nombre.focus();
  }

  formSocio.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorSocio.textContent = '';

    const datos = {};
    for (const campo of CAMPOS_SOCIO) {
      datos[campo] = formSocio.elements[campo].value;
    }
    datos.planId = datos.planId ? Number(datos.planId) : null;

    const esNuevo = idEditando === null;
    const resultado = await pedir(
      esNuevo ? window.api.crearSocio(datos) : window.api.actualizarSocio(idEditando, datos),
      errorSocio
    );
    if (resultado === null) return;

    dialogoSocio.close();
    mostrarMensaje(esNuevo ? 'Socio agregado' : 'Cambios guardados');
    idSeleccionado = resultado.id; // queda seleccionado para ver su ficha
    cargar();
  });

  btnCancelarSocio.addEventListener('click', () => dialogoSocio.close());

  // ---------- Dar de baja / reactivar ----------
  async function cambiarEstado(socio) {
    if (socio.activo) {
      const confirmado = await confirmar({
        titulo: 'Dar de baja',
        mensaje: `¿Dar de baja a ${socio.nombre} ${socio.apellido}?`,
        detalle: 'Sus datos y su historial se conservan. Podés reactivarlo cuando vuelva al gimnasio.',
        boton: 'Dar de baja',
      });
      if (!confirmado) return;
    }

    const resultado = await pedir(window.api.cambiarEstadoSocio(socio.id, !socio.activo));
    if (resultado === null) return;

    mostrarMensaje(socio.activo ? 'Socio dado de baja' : 'Socio reactivado');
    cargar();
  }

  // ---------- Eventos de la lista ----------
  let temporizadorBusqueda;
  buscador.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(cargar, 200);
  });

  filtroEstado.addEventListener('change', cargar);
  filtroMostrar.addEventListener('change', cargar);
  btnNuevo.addEventListener('click', () => abrirFormularioSocio(null));

  vistas.socios = {
    alMostrar: cargar,
    // Para que otras pantallas puedan abrir una ficha o el formulario de socio nuevo
    seleccionar: (id) => {
      idSeleccionado = id;
    },
    nuevo: (dni) => abrirFormularioSocio(null, dni),
    // Para llegar desde el Resumen con la lista ya filtrada
    filtrarPorEstado: (estado) => {
      buscador.value = '';
      filtroMostrar.value = 'activos';
      filtroEstado.value = estado;
      idSeleccionado = null;
    },
  };
})();
