// ui/vista-planes.js — Pantalla de planes: precio y duración de cada cuota.
// Todo va dentro de (() => { ... })() para que sus variables no choquen con otras vistas.

(() => {
  const tabla = document.getElementById('tabla-planes');
  const vacio = document.getElementById('planes-vacio');
  const casillaInactivos = document.getElementById('planes-inactivos');
  const btnNuevo = document.getElementById('btn-nuevo-plan');
  const dialogo = document.getElementById('dialogo-plan');
  const form = document.getElementById('form-plan');
  const titulo = document.getElementById('titulo-plan');
  const error = document.getElementById('error-plan');
  const btnCancelar = document.getElementById('btn-cancelar-plan');

  let idEditando = null; // null = plan nuevo

  // ---------- Lista ----------
  async function cargar() {
    const planes = await pedir(
      window.api.listarPlanes({ incluirInactivos: casillaInactivos.checked })
    );
    if (planes === null) return;

    tabla.replaceChildren(
      ...planes.map((plan) =>
        crear('tr', { clase: plan.activo ? '' : 'inactivo' }, [
          crear('td', {}, [crear('strong', { texto: plan.nombre })]),
          crear('td', { clase: 'derecha', texto: pesos(plan.precio_centavos) }),
          crear('td', { texto: `${plan.duracion_dias} días` }),
          crear('td', { clase: 'derecha', texto: plan.cantidad_socios }),
          crear('td', {}, [
            crear('span', {
              clase: plan.activo ? 'insignia verde' : 'insignia gris',
              texto: plan.activo ? 'Activo' : 'Inactivo',
            }),
          ]),
          crear('td', { clase: 'acciones-fila' }, [
            crear('button', {
              tipo: 'button',
              clase: 'boton-texto',
              texto: 'Editar',
              alClick: () => abrirFormulario(plan),
            }),
            crear('button', {
              tipo: 'button',
              clase: 'boton-texto',
              texto: plan.activo ? 'Desactivar' : 'Activar',
              alClick: () => cambiarEstado(plan),
            }),
          ]),
        ])
      )
    );

    vacio.hidden = planes.length > 0;
  }

  // ---------- Formulario ----------
  function abrirFormulario(plan) {
    idEditando = plan ? plan.id : null;
    titulo.textContent = plan ? 'Editar plan' : 'Nuevo plan';
    error.textContent = '';

    form.elements.nombre.value = plan?.nombre ?? '';
    form.elements.precio.value = plan ? centavosATexto(plan.precio_centavos) : '';
    form.elements.duracion.value = plan?.duracion_dias ?? 30;

    dialogo.showModal();
    form.elements.nombre.focus();
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.textContent = '';

    const precioCentavos = parsearMonto(form.elements.precio.value);
    if (precioCentavos === null) {
      error.textContent = 'Ingresá un precio válido, por ejemplo 25000 o 25.000';
      return;
    }

    const datos = {
      nombre: form.elements.nombre.value,
      precioCentavos,
      duracionDias: Number(form.elements.duracion.value),
    };

    const esNuevo = idEditando === null;
    const resultado = await pedir(
      esNuevo ? window.api.crearPlan(datos) : window.api.actualizarPlan(idEditando, datos),
      error
    );
    if (resultado === null) return;

    dialogo.close();
    mostrarMensaje(esNuevo ? 'Plan creado' : 'Plan actualizado');
    cargar();
  });

  // ---------- Activar / desactivar ----------
  async function cambiarEstado(plan) {
    if (plan.activo) {
      const n = plan.cantidad_socios;
      const confirmado = await confirmar({
        titulo: 'Desactivar plan',
        mensaje: `¿Desactivar el plan "${plan.nombre}"?`,
        detalle:
          n > 0
            ? `${n} socio${n === 1 ? ' lo tiene' : 's lo tienen'} asignado y lo van a conservar, pero no se podrá elegir para socios nuevos.`
            : 'No se podrá elegir para socios nuevos. Podés volver a activarlo cuando quieras.',
        boton: 'Desactivar',
      });
      if (!confirmado) return;
    }

    const resultado = await pedir(window.api.cambiarEstadoPlan(plan.id, !plan.activo));
    if (resultado === null) return;

    mostrarMensaje(plan.activo ? 'Plan desactivado' : 'Plan activado');
    cargar();
  }

  // ---------- Actualizar todos los precios ----------
  const dialogoAumento = document.getElementById('dialogo-aumento');
  const formAumento = document.getElementById('form-aumento');
  const tablaAumento = document.getElementById('tabla-aumento');
  const errorAumento = document.getElementById('error-aumento');

  function opcionesAumento() {
    return {
      porcentaje: Number(String(formAumento.elements.porcentaje.value).replace(',', '.')),
      redondeo: Number(formAumento.elements.redondeo.value),
    };
  }

  // Vista previa: pide al main los precios nuevos SIN guardarlos
  async function actualizarVistaPrevia() {
    errorAumento.textContent = '';
    const cambios = await pedir(window.api.calcularAumento(opcionesAumento()), errorAumento);
    if (cambios === null) {
      tablaAumento.replaceChildren();
      return;
    }

    tablaAumento.replaceChildren(
      ...cambios.map((c) =>
        crear('tr', {}, [
          crear('td', { texto: c.nombre }),
          crear('td', { clase: 'derecha', texto: pesos(c.actual) }),
          crear('td', { clase: 'derecha nuevo-precio', texto: pesos(c.nuevo) }),
        ])
      )
    );
  }

  let temporizadorVistaPrevia;
  formAumento.addEventListener('input', () => {
    clearTimeout(temporizadorVistaPrevia);
    temporizadorVistaPrevia = setTimeout(actualizarVistaPrevia, 200);
  });

  document.getElementById('btn-aumento').addEventListener('click', () => {
    formAumento.elements.porcentaje.value = '10';
    formAumento.elements.redondeo.value = '10000';
    dialogoAumento.showModal();
    formAumento.elements.porcentaje.select();
    actualizarVistaPrevia();
  });

  formAumento.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const opciones = opcionesAumento();

    const confirmado = await confirmar({
      titulo: 'Actualizar precios',
      mensaje: `¿Aumentar ${String(opciones.porcentaje).replace('.', ',')}% todos los planes activos?`,
      detalle: 'Los pagos ya registrados no cambian: guardan el precio del día en que se cobraron.',
      boton: 'Actualizar',
    });
    if (!confirmado) return;

    const resultado = await pedir(window.api.aplicarAumento(opciones), errorAumento);
    if (resultado === null) return;

    dialogoAumento.close();
    mostrarMensaje(`Precios actualizados en ${resultado.cantidad} planes`);
    cargar();
  });

  document.getElementById('btn-cancelar-aumento').addEventListener('click', () => dialogoAumento.close());

  // ---------- Eventos ----------
  btnNuevo.addEventListener('click', () => abrirFormulario(null));
  btnCancelar.addEventListener('click', () => dialogo.close());
  casillaInactivos.addEventListener('change', cargar);

  // Registrar la vista en app.js
  vistas.planes = { alMostrar: cargar };
})();
