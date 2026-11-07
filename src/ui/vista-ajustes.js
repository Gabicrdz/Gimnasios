// ui/vista-ajustes.js — Ajustes: nombre del gimnasio, copias de seguridad y datos del sistema.

(() => {
  const formNombre = document.getElementById('form-nombre-gimnasio');
  const errorNombre = document.getElementById('error-nombre-gimnasio');
  const carpeta = document.getElementById('copias-carpeta');
  const aviso = document.getElementById('copias-aviso');
  const tabla = document.getElementById('tabla-copias');
  const vacio = document.getElementById('copias-vacio');
  const info = document.getElementById('info-sistema');

  const TIPOS = {
    automatica: 'Automática',
    manual: 'Manual',
    'antes-de-restaurar': 'Antes de restaurar',
  };

  // 2400000 bytes → "2,3 MB"
  function tamanio(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  async function cargar() {
    formNombre.elements.nombre.value = configuracion.nombre_gimnasio;
    errorNombre.textContent = '';
    await Promise.all([cargarCopias(), cargarInfo()]);
  }

  // ---------- Nombre del gimnasio ----------
  formNombre.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errorNombre.textContent = '';

    const nuevos = await pedir(
      window.api.guardarConfiguracion({ nombre_gimnasio: formNombre.elements.nombre.value }),
      errorNombre
    );
    if (nuevos === null) return;

    configuracion = nuevos;
    aplicarMarca(); // actualiza el nombre y las iniciales de la barra
    mostrarMensaje('Nombre guardado');
  });

  // ---------- Copias de seguridad ----------
  async function cargarCopias() {
    const datos = await pedir(window.api.listarCopias());
    if (datos === null) return;

    carpeta.textContent = datos.carpeta;

    // Avisos: la última copia automática falló, o hace días que no hay copias
    const masNueva = datos.copias[0];
    const diasSinCopia = masNueva
      ? Math.floor((Date.now() - new Date(masNueva.modificada.replace(' ', 'T')).getTime()) / 86400000)
      : null;

    if (datos.ultimoError) {
      aviso.textContent = `La última copia automática no se pudo hacer: ${datos.ultimoError}`;
      aviso.hidden = false;
    } else if (diasSinCopia !== null && diasSinCopia >= 2) {
      aviso.textContent = `La última copia es de hace ${diasSinCopia} días.`;
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }

    tabla.replaceChildren(
      ...datos.copias.map((copia) =>
        crear('tr', {}, [
          crear('td', { texto: fechaCorta(copia.modificada) + ' ' + copia.modificada.slice(11) }),
          crear('td', { texto: TIPOS[copia.tipo] }),
          crear('td', { clase: 'derecha', texto: tamanio(copia.bytes) }),
          crear('td', { clase: 'acciones-fila' }, [
            crear('button', {
              tipo: 'button',
              clase: 'boton-texto',
              texto: 'Restaurar',
              alClick: () => restaurar(copia.nombre),
            }),
          ]),
        ])
      )
    );
    vacio.hidden = datos.copias.length > 0;
  }

  async function hacerCopiaAhora() {
    const resultado = await pedir(window.api.hacerCopia());
    if (resultado === null) return;
    mostrarMensaje('Copia de seguridad guardada');
    cargarCopias();
  }

  async function elegirCarpeta() {
    const nueva = await pedir(window.api.elegirCarpetaCopias());
    if (nueva === null) return; // canceló o hubo un error (ya se mostró)
    mostrarMensaje('Carpeta de copias actualizada');
    await hacerCopiaAhora(); // primera copia en la carpeta nueva
  }

  // nombre = copia de la lista; null = elegir un archivo con el diálogo de Windows.
  // La confirmación la muestra el main, porque es quien sabe qué hay en el archivo.
  async function restaurar(nombre) {
    const resultado = await pedir(window.api.restaurarCopia(nombre));
    if (resultado === null || resultado.cancelado) return;
    mostrarMensaje(`Copia restaurada (${resultado.socios} socios). Reiniciando…`);
  }

  // ---------- Información del sistema ----------
  async function cargarInfo() {
    const datos = await pedir(window.api.infoSistema());
    if (datos === null) return;

    const dato = (etiqueta, valor) => [
      crear('dt', { texto: etiqueta }),
      crear('dd', { texto: valor }),
    ];
    info.replaceChildren(
      ...dato('Versión del programa', datos.versionPrograma),
      ...dato('Versión de la base', String(datos.versionBase)),
      ...dato('Carpeta de datos', datos.carpetaDatos)
    );
  }

  document.getElementById('btn-copia-ahora').addEventListener('click', hacerCopiaAhora);
  document.getElementById('btn-carpeta-copias').addEventListener('click', elegirCarpeta);
  document.getElementById('btn-restaurar-archivo').addEventListener('click', () => restaurar(null));

  vistas.ajustes = { alMostrar: cargar };
})();
