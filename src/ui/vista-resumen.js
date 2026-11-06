// ui/vista-resumen.js — Panel para el dueño: cómo está el gimnasio de un vistazo.

(() => {
  const fecha = document.getElementById('resumen-fecha');
  const recaudado = document.getElementById('res-recaudado');
  const comparacion = document.getElementById('res-comparacion');
  const activos = document.getElementById('res-activos');
  const nuevos = document.getElementById('res-nuevos');
  const ingresosHoy = document.getElementById('res-hoy');
  const promedio = document.getElementById('res-promedio');
  const barraEstados = document.getElementById('res-barra');
  const leyenda = document.getElementById('res-leyenda');
  const listaPorVencer = document.getElementById('res-por-vencer');
  const listaVencidos = document.getElementById('res-vencidos');
  const listaSinVenir = document.getElementById('res-sin-venir');
  const tituloSinVenir = document.getElementById('res-titulo-sin-venir');
  const listaCumples = document.getElementById('res-cumples');
  const graficoHoras = document.getElementById('res-horarios');

  const formatoMes = new Intl.DateTimeFormat('es-AR', { month: 'long' });
  const formatoFecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // "2026-10" → "octubre"
  function nombreMes(mes) {
    const [anio, numero] = mes.split('-').map(Number);
    return formatoMes.format(new Date(anio, numero - 1, 1));
  }

  // Los 4 estados, en el orden en que se muestran en la barra
  const ESTADOS = [
    { clave: 'al_dia', clase: 'verde', texto: 'Al día' },
    { clave: 'por_vencer', clase: 'amarilla', texto: 'Por vencer' },
    { clave: 'vencido', clase: 'roja', texto: 'Vencidas' },
    { clave: 'sin_pagos', clase: 'gris', texto: 'Sin pagos' },
  ];

  async function cargar() {
    const r = await pedir(window.api.obtenerResumen());
    if (r === null) return;

    const textoFecha = formatoFecha.format(new Date(`${r.fecha}T12:00:00`));
    fecha.textContent = textoFecha.charAt(0).toUpperCase() + textoFecha.slice(1);

    renderTarjetas(r);
    renderEstados(r.cuotas);

    renderLista(listaPorVencer, r.porVencer, 'Nadie vence en los próximos días.', (s) => [
      textoVencimiento(s),
      botonWhatsApp(s, 'por_vencer'),
    ]);

    renderLista(listaVencidos, r.vencidos.slice(0, 8), 'No hay cuotas vencidas. ¡Excelente!', (s) => [
      textoVencimiento(s),
      botonWhatsApp(s, 'vencido'),
    ]);

    tituloSinVenir.textContent = `No vienen hace ${r.diasSinVenir} días o más`;
    renderLista(listaSinVenir, r.sinVenir.slice(0, 8), 'Todos los socios vinieron en las últimas dos semanas.', (s) => [
      s.ultima_visita ? `Última vez: ${fechaCorta(s.ultima_visita)}` : 'Nunca vino',
      botonWhatsApp(s, 'sin_venir'),
    ]);

    renderLista(listaCumples, r.cumpleanios, 'Hoy no cumple años ningún socio.', (s) => [
      `Cumple ${calcularEdad(s.fecha_nacimiento)}`,
      botonWhatsApp(s, 'cumpleanios'),
    ]);

    renderHorarios(r.porHora);
  }

  // ---------- Tarjetas de arriba ----------
  function renderTarjetas(r) {
    recaudado.textContent = pesos(r.recaudadoMes);

    // Comparación justa: este mes vs. el anterior HASTA EL MISMO DÍA
    const anterior = r.recaudadoMesAnteriorMismoDia;
    if (anterior > 0) {
      const variacion = Math.round(((r.recaudadoMes - anterior) / anterior) * 100);
      const signo = variacion > 0 ? '+' : '';
      comparacion.textContent = `${signo}${variacion}% que ${nombreMes(r.mesAnterior)} a esta altura del mes`;
      comparacion.className = `comparacion ${variacion >= 0 ? 'sube' : 'baja'}`;
    } else {
      comparacion.textContent = `Sin cobros en ${nombreMes(r.mesAnterior)} para comparar`;
      comparacion.className = 'comparacion';
    }

    activos.textContent = r.cuotas.activos;
    nuevos.textContent =
      r.nuevosEsteMes > 0
        ? `${r.nuevosEsteMes} nuevo${r.nuevosEsteMes === 1 ? '' : 's'} este mes`
        : 'Sin altas este mes';

    ingresosHoy.textContent = r.ingresosHoy;
    promedio.textContent = `Promedio: ${r.promedioDiario} por día (últimos 30 días)`;
  }

  // ---------- Barra con el estado de todas las cuotas ----------
  function renderEstados(cuotas) {
    const total = cuotas.activos || 1;

    barraEstados.replaceChildren(
      ...ESTADOS.filter((e) => cuotas[e.clave] > 0).map((e) => {
        const tramo = crear('span', {
          clase: `tramo ${e.clase}`,
          titulo: `${e.texto}: ${cuotas[e.clave]}`,
        });
        // El ancho de cada tramo es proporcional a la cantidad de socios
        tramo.style.flexGrow = cuotas[e.clave] / total;
        return tramo;
      })
    );

    leyenda.replaceChildren(
      ...ESTADOS.map((e) =>
        crear(
          'button',
          {
            tipo: 'button',
            clase: 'leyenda-item',
            titulo: 'Ver estos socios',
            alClick: () => irASociosConEstado(e.clave),
          },
          [
            crear('span', { clase: `insignia ${e.clase}`, texto: e.texto }),
            crear('strong', { texto: cuotas[e.clave] }),
          ]
        )
      )
    );
  }

  // ---------- Listas (por vencer, vencidos, sin venir, cumpleaños) ----------
  // armarDetalle(socio) devuelve [texto, botón]
  function renderLista(lista, socios, textoVacio, armarDetalle) {
    if (socios.length === 0) {
      lista.replaceChildren(crear('li', { clase: 'lista-vacia', texto: textoVacio }));
      return;
    }

    lista.replaceChildren(
      ...socios.map((socio) => {
        const [detalle, boton] = armarDetalle(socio);
        return crear('li', {}, [
          crear('button', {
            tipo: 'button',
            clase: 'nombre-ingreso',
            texto: `${socio.apellido}, ${socio.nombre}`,
            titulo: 'Ver ficha',
            alClick: () => irAFichaDeSocio(socio.id),
          }),
          crear('span', { clase: 'detalle-lista', texto: detalle }),
          boton,
        ]);
      })
    );
  }

  // ---------- Gráfico de horarios pico (barras hechas con CSS) ----------
  function renderHorarios(porHora) {
    if (porHora.length === 0) {
      graficoHoras.replaceChildren(
        crear('p', { clase: 'texto-tenue', texto: 'Todavía no hay ingresos registrados.' })
      );
      return;
    }

    // Todas las horas entre la primera y la última con gente, aunque alguna tenga 0
    const cantidades = new Map(porHora.map((fila) => [fila.h, fila.cantidad]));
    const desde = porHora[0].h;
    const hasta = porHora[porHora.length - 1].h;
    const maximo = Math.max(...cantidades.values());

    const columnas = [];
    for (let hora = desde; hora <= hasta; hora++) {
      const cantidad = cantidades.get(hora) ?? 0;
      const barra = crear('span', {
        clase: cantidad === maximo ? 'barra-hora pico' : 'barra-hora',
        titulo: `${hora}:00 a ${hora + 1}:00 → ${cantidad} ingresos`,
      });
      barra.style.height = `${Math.max(2, (cantidad / maximo) * 100)}%`;

      columnas.push(
        crear('div', { clase: 'columna-hora' }, [
          crear('span', { clase: 'valor-hora', texto: cantidad || '' }),
          crear('div', { clase: 'pista-hora' }, [barra]),
          crear('span', { clase: 'etiqueta-hora', texto: `${hora}h` }),
        ])
      );
    }

    graficoHoras.replaceChildren(...columnas);
  }

  document.getElementById('res-ver-por-vencer').addEventListener('click', () => irASociosConEstado('por_vencer'));
  document.getElementById('res-ver-vencidos').addEventListener('click', () => irASociosConEstado('vencido'));

  vistas.resumen = { alMostrar: cargar };
})();
