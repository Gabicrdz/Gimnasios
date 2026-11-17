// ui/acceso.js — Pantalla de ingreso: primer uso (crear al administrador), elegir usuario,
// PIN, "Mi PIN" y bloqueo automático por inactividad.

(() => {
  const pantalla = document.getElementById('acceso');
  const formPrimerUso = document.getElementById('form-primer-uso');
  const errorPrimerUso = document.getElementById('error-primer-uso');
  const bloqueIngreso = document.getElementById('acceso-ingreso');
  const listaUsuarios = document.getElementById('acceso-usuarios');
  const formPin = document.getElementById('form-pin');
  const etiquetaPin = document.getElementById('acceso-eligio');
  const inputPin = document.getElementById('acceso-pin');
  const errorPin = document.getElementById('error-pin');

  const dialogoMiPin = document.getElementById('dialogo-mi-pin');
  const formMiPin = document.getElementById('form-mi-pin');
  const errorMiPin = document.getElementById('error-mi-pin');

  let elegido = null; // usuario tocado en la pantalla de ingreso

  // ---------- Mostrar la pantalla de acceso ----------
  function mostrarAcceso(estado) {
    sesion = null;
    elegido = null;
    formPrimerUso.reset();
    formPin.reset();
    errorPrimerUso.textContent = '';
    errorPin.textContent = '';
    pantalla.hidden = false;

    formPrimerUso.hidden = estado.hayUsuarios;
    bloqueIngreso.hidden = !estado.hayUsuarios;
    formPin.hidden = true;

    if (!estado.hayUsuarios) {
      document.getElementById('primer-nombre').focus();
      return;
    }

    listaUsuarios.replaceChildren(
      ...estado.usuarios.map((usuario) =>
        crear(
          'button',
          { tipo: 'button', clase: 'acceso-usuario', alClick: () => elegirUsuario(usuario) },
          [
            crear('span', { clase: 'avatar', texto: usuario.nombre.charAt(0).toUpperCase() }),
            crear('strong', { texto: usuario.nombre }),
            crear('small', { texto: NOMBRE_ROL[usuario.rol] }),
          ]
        )
      )
    );
  }

  function elegirUsuario(usuario) {
    elegido = usuario;
    errorPin.textContent = '';
    formPin.reset();
    etiquetaPin.textContent = `PIN de ${usuario.nombre}`;
    formPin.hidden = false;
    inputPin.focus();
  }

  document.getElementById('btn-otro-usuario').addEventListener('click', () => {
    elegido = null;
    formPin.hidden = true;
  });

  // Se llama al abrir el sistema. Si la ventana se recargó con la sesión abierta, sigue adentro.
  window.iniciarAcceso = async function iniciarAcceso() {
    const estado = await pedir(window.api.estadoSesion());
    if (estado === null) return;
    if (estado.usuario) return entrarAlSistema(estado.usuario);
    mostrarAcceso(estado);
  };

  // ---------- Primer uso ----------
  formPrimerUso.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorPrimerUso.textContent = '';
    const datos = Object.fromEntries(new FormData(formPrimerUso));
    if (datos.pin !== datos.pin2) {
      errorPrimerUso.textContent = 'Los dos PIN no coinciden.';
      return;
    }
    const usuario = await pedir(
      window.api.crearAdministrador({ nombre: datos.nombre, pin: datos.pin }),
      errorPrimerUso
    );
    if (usuario !== null) entrarAlSistema(usuario);
  });

  // ---------- Poner el PIN ----------
  formPin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorPin.textContent = '';
    if (!elegido) return;

    const usuario = await pedir(window.api.entrar(elegido.id, inputPin.value), errorPin);
    if (usuario === null) {
      inputPin.value = '';
      inputPin.focus();
      return;
    }
    entrarAlSistema(usuario);
  });

  // ---------- Salir (bloquear) ----------
  async function cerrarSesion() {
    // Cerramos diálogos abiertos: un <dialog> queda por encima de todo, hasta de esta pantalla
    for (const dialogo of document.querySelectorAll('dialog[open]')) dialogo.close();
    vigilarInactividad(false);
    await window.api.salir();
    const estado = await pedir(window.api.estadoSesion());
    if (estado !== null) mostrarAcceso(estado);
  }

  document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

  // ---------- Bloqueo por inactividad ----------
  // Si nadie toca nada durante 10 minutos, el sistema se bloquea solo: así los datos de los
  // socios no quedan a la vista si la recepción se queda sola.
  const MINUTOS_INACTIVO = 10;
  let temporizador = null;
  const reiniciar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      cerrarSesion().then(() => mostrarMensaje('Se bloqueó por inactividad. Ingresá con tu PIN.', 'error'));
    }, MINUTOS_INACTIVO * 60 * 1000);
  };
  const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];

  window.vigilarInactividad = function vigilarInactividad(activa) {
    clearTimeout(temporizador);
    for (const nombre of EVENTOS) document.removeEventListener(nombre, reiniciar, true);
    if (!activa) return;
    for (const nombre of EVENTOS) document.addEventListener(nombre, reiniciar, true);
    reiniciar();
  };

  // ---------- Mi PIN ----------
  document.getElementById('btn-mi-pin').addEventListener('click', () => {
    formMiPin.reset();
    errorMiPin.textContent = '';
    dialogoMiPin.showModal();
  });
  document.getElementById('btn-cancelar-mi-pin').addEventListener('click', () => dialogoMiPin.close());

  formMiPin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorMiPin.textContent = '';
    const datos = Object.fromEntries(new FormData(formMiPin));
    if (datos.nuevo !== datos.nuevo2) {
      errorMiPin.textContent = 'Los dos PIN nuevos no coinciden.';
      return;
    }
    const resultado = await pedir(window.api.cambiarMiPin(datos.actual, datos.nuevo), errorMiPin);
    if (resultado === null) return;
    dialogoMiPin.close();
    mostrarMensaje('PIN cambiado');
  });
})();
