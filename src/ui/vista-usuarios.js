// ui/vista-usuarios.js — Panel "Usuarios" dentro de Ajustes (solo administrador).

(() => {
  const tabla = document.getElementById('tabla-usuarios');
  const dialogo = document.getElementById('dialogo-usuario');
  const formulario = document.getElementById('form-usuario');
  const titulo = document.getElementById('titulo-usuario');
  const error = document.getElementById('error-usuario');
  const etiquetaPin = document.getElementById('etiqueta-usuario-pin');

  let editando = null; // usuario que se está editando (null = uno nuevo)

  async function cargar() {
    const usuarios = await pedir(window.api.listarUsuarios());
    if (usuarios === null) return;

    tabla.replaceChildren(
      ...usuarios.map((usuario) => {
        const soyYo = sesion && usuario.id === sesion.id;
        return crear('tr', { clase: usuario.activo ? '' : 'inactivo' }, [
          crear('td', {}, [
            crear('strong', { texto: usuario.nombre }),
            ...(soyYo ? [crear('small', { clase: 'texto-tenue', texto: ' (vos)' })] : []),
          ]),
          crear('td', { texto: NOMBRE_ROL[usuario.rol] }),
          crear('td', {}, [
            crear('span', {
              clase: `insignia ${usuario.activo ? 'verde' : 'gris'}`,
              texto: usuario.activo ? 'Activo' : 'De baja',
            }),
          ]),
          crear('td', { clase: 'acciones-fila' }, [
            crear('button', {
              tipo: 'button',
              clase: 'boton-texto',
              texto: 'Editar',
              alClick: () => abrir(usuario),
            }),
            // Uno no se da de baja a sí mismo (el main también lo impide)
            ...(soyYo
              ? []
              : [
                  crear('button', {
                    tipo: 'button',
                    clase: 'boton-texto',
                    texto: usuario.activo ? 'Dar de baja' : 'Reactivar',
                    alClick: () => cambiarEstado(usuario),
                  }),
                ]),
          ]),
        ]);
      })
    );
  }

  function abrir(usuario = null) {
    editando = usuario;
    formulario.reset();
    error.textContent = '';
    titulo.textContent = usuario ? `Editar a ${usuario.nombre}` : 'Nuevo usuario';
    etiquetaPin.textContent = usuario
      ? 'PIN nuevo (dejalo vacío para no cambiarlo)'
      : 'PIN (4 a 6 números)';
    if (usuario) {
      formulario.elements.nombre.value = usuario.nombre;
      formulario.elements.rol.value = usuario.rol;
    }
    dialogo.showModal();
    formulario.elements.nombre.focus();
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.textContent = '';
    const datos = Object.fromEntries(new FormData(formulario));
    const resultado = await pedir(window.api.guardarUsuario(editando?.id ?? null, datos), error);
    if (resultado === null) return;

    // Si se editó al propio usuario, la barra se pone al día
    if (editando && sesion && editando.id === sesion.id) {
      entrarAlSistemaSinCambiarVista({ ...sesion, nombre: datos.nombre.trim(), rol: datos.rol });
    }
    dialogo.close();
    mostrarMensaje(editando ? 'Usuario guardado' : 'Usuario creado');
    cargar();
  });

  async function cambiarEstado(usuario) {
    if (usuario.activo) {
      const confirmado = await confirmar({
        titulo: 'Dar de baja',
        mensaje: `¿Dar de baja a ${usuario.nombre}?`,
        detalle:
          'No va a poder entrar más al sistema. Los pagos que cobró siguen figurando a su nombre. Podés reactivarlo cuando quieras.',
        boton: 'Dar de baja',
      });
      if (!confirmado) return;
    }
    const resultado = await pedir(window.api.cambiarEstadoUsuario(usuario.id, !usuario.activo));
    if (resultado === null) return;
    mostrarMensaje(usuario.activo ? 'Usuario dado de baja' : 'Usuario reactivado');
    cargar();
  }

  // Actualiza el nombre y el tipo de la barra sin volver a abrir Ingreso
  function entrarAlSistemaSinCambiarVista(usuario) {
    sesion = usuario;
    document.getElementById('usuario-nombre').textContent = usuario.nombre;
    document.getElementById('usuario-rol').textContent = NOMBRE_ROL[usuario.rol];
  }

  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrir());
  document.getElementById('btn-cancelar-usuario').addEventListener('click', () => dialogo.close());

  vistas.usuarios = { alMostrar: cargar };
})();
