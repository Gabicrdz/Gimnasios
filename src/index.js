// index.js — Proceso MAIN del sistema de gimnasio.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const conexion = require('./db/conexion');
const planes = require('./db/planes');
const socios = require('./db/socios');
const pagos = require('./db/pagos');
const asistencias = require('./db/asistencias');
const resumen = require('./db/resumen');
const configuracion = require('./db/configuracion');
const copias = require('./db/copias');
const usuarios = require('./db/usuarios');
const sesion = require('./sesion');
const { armarEnlaceWhatsApp } = require('./whatsapp');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Idioma de la app: fechas, calendarios y meses siempre en español de Argentina
// (dd/mm/aaaa), aunque la compu del cliente tenga Windows en inglés.
app.commandLine.appendSwitch('lang', 'es-AR');

// Carpeta de datos FIJA. Electron la arma con el "productName" del package.json:
// si algún día cambiamos el nombre del programa, buscaría la base en otra carpeta
// y el sistema arrancaría vacío. Así queda siempre en ...\AppData\Roaming\gimnasio
app.setPath('userData', path.join(app.getPath('appData'), 'gimnasio'));

let ventana = null;

// Siempre responde { ok: true, datos } o { ok: false, error }.
// El 2.º parámetro es el PERMISO ('libre', 'sesion' o 'admin'): se revisa ANTES de ejecutar
// el canal. Es obligatorio en todos, así un canal nuevo no puede quedar abierto por olvido.
function manejar(canal, permiso, funcion) {
  if (!sesion.PERMISOS.includes(permiso)) throw new Error(`Canal ${canal}: permiso inválido`);
  ipcMain.handle(canal, async (evento, ...argumentos) => {
    try {
      sesion.requerir(permiso);
      const datos = await funcion(...argumentos);
      return { ok: true, datos };
    } catch (error) {
      console.error(`[${canal}]`, error);
      return { ok: false, error: error.message };
    }
  });
}

// ---------- Acceso: usuarios, PIN y sesión ----------
manejar('sesion:estado', 'libre', () => ({
  usuario: sesion.sesionActual(),
  hayUsuarios: usuarios.hayUsuarios(),
  usuarios: usuarios.hayUsuarios() ? usuarios.listarParaIngreso() : [],
}));
manejar('sesion:entrar', 'libre', (usuarioId, pin) => sesion.iniciarSesion(usuarioId, pin));
manejar('sesion:crear-admin', 'libre', (datos) => {
  const { id } = usuarios.crearPrimerAdmin(datos);
  return sesion.abrirSesionDe({ id, nombre: String(datos.nombre).trim().slice(0, 40), rol: 'admin' });
});
manejar('sesion:salir', 'libre', () => {
  sesion.cerrarSesion();
  return true;
});
manejar('sesion:cambiar-pin', 'sesion', (pinActual, pinNuevo) =>
  usuarios.cambiarPin(sesion.sesionActual().id, pinActual, pinNuevo)
);
manejar('usuarios:listar', 'admin', () => usuarios.listarUsuarios());
manejar('usuarios:guardar', 'admin', (id, datos) => {
  const resultado = id ? usuarios.actualizarUsuario(id, datos) : usuarios.crearUsuario(datos);
  if (id) sesion.refrescarSesion({ id, nombre: String(datos.nombre).trim().slice(0, 40), rol: datos.rol });
  return resultado;
});
manejar('usuarios:cambiar-estado', 'admin', (id, activo) =>
  usuarios.cambiarEstadoUsuario(id, activo === true, sesion.sesionActual().id)
);

// ---------- Planes ----------
manejar('planes:listar', 'sesion', (opciones) => planes.listarPlanes(opciones));
manejar('planes:crear', 'admin', (datos) => planes.crearPlan(datos));
manejar('planes:actualizar', 'admin', (id, datos) => planes.actualizarPlan(id, datos));
manejar('planes:cambiar-estado', 'admin', (id, activo) => planes.cambiarEstadoPlan(id, activo));
manejar('planes:calcular-aumento', 'admin', (opciones) => planes.calcularAumento(opciones));
manejar('planes:aplicar-aumento', 'admin', (opciones) => planes.aplicarAumento(opciones));

// ---------- Socios ----------
manejar('socios:listar', 'sesion', (filtros) => socios.listarSocios(filtros));
manejar('socios:obtener', 'sesion', (id) => socios.obtenerSocio(id));
manejar('socios:crear', 'sesion', (datos) => socios.crearSocio(datos));
manejar('socios:actualizar', 'sesion', (id, datos) => socios.actualizarSocio(id, datos));
manejar('socios:cambiar-estado', 'admin', (id, activo) => socios.cambiarEstadoSocio(id, activo));

// ---------- Pagos ----------
manejar('pagos:registrar', 'sesion', (datos) => pagos.registrarPago(datos, sesion.sesionActual().id));
manejar('pagos:anular', 'admin', (id) => pagos.anularPago(id, sesion.sesionActual().id));
manejar('pagos:de-socio', 'sesion', (socioId) => pagos.listarPagosDeSocio(socioId));
manejar('pagos:resumen-mes', 'admin', (mes) => pagos.resumenDelMes(mes));

// ---------- Asistencias (control de ingreso) ----------
manejar('asistencias:registrar', 'sesion', (entrada) => asistencias.registrarIngreso(entrada));
manejar('asistencias:hoy', 'sesion', () => asistencias.ingresosDeHoy());
manejar('asistencias:eliminar', 'sesion', (id) => asistencias.eliminarIngreso(id));
manejar('asistencias:de-socio', 'sesion', (socioId) => asistencias.resumenAsistenciaSocio(socioId));

// ---------- Resumen y configuración ----------
manejar('resumen:obtener', 'admin', () => resumen.obtenerResumen());
manejar('configuracion:obtener', 'libre', () => configuracion.obtenerConfiguracion());
manejar('configuracion:guardar', 'admin', (datos) => configuracion.guardarConfiguracion(datos));

// ---------- WhatsApp ----------
// La ventana solo manda el id del socio y el texto. El teléfono lo busca el main en la
// base y el enlace lo arma el main: así la ventana no puede abrir cualquier dirección.
manejar('sistema:whatsapp', 'sesion', async (socioId, mensaje) => {
  const socio = socios.obtenerSocio(socioId);
  await shell.openExternal(armarEnlaceWhatsApp(socio.telefono, mensaje));
  return true;
});

// ---------- Copias de seguridad ----------
manejar('copias:listar', 'admin', () => copias.listarCopias());
manejar('copias:hacer', 'admin', () => copias.hacerCopia('manual'));

manejar('copias:elegir-carpeta', 'admin', async () => {
  const resultado = await dialog.showOpenDialog(ventana, {
    title: 'Elegí dónde guardar las copias de seguridad',
    defaultPath: copias.carpetaDeCopias(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (resultado.canceled || resultado.filePaths.length === 0) return null;
  return copias.cambiarCarpeta(resultado.filePaths[0]);
});

// Restaurar: la ventana manda el nombre de una copia de la lista,
// o null para elegir un archivo con el diálogo de Windows.
manejar('copias:restaurar', 'admin', async (nombre) => {
  let ruta;
  if (nombre) {
    ruta = copias.rutaDeCopia(nombre);
  } else {
    const resultado = await dialog.showOpenDialog(ventana, {
      title: 'Elegí la copia de seguridad a restaurar',
      defaultPath: copias.carpetaDeCopias(),
      properties: ['openFile'],
      filters: [{ name: 'Copias de seguridad', extensions: ['db'] }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return { cancelado: true };
    ruta = resultado.filePaths[0];
  }

  const info = copias.validarArchivoDeCopia(ruta);
  const { response } = await dialog.showMessageBox(ventana, {
    type: 'warning',
    title: 'Restaurar copia de seguridad',
    message: `¿Reemplazar TODOS los datos actuales por los de la copia "${path.basename(ruta)}"?`,
    detail:
      `La copia tiene ${info.socios} socios. Antes de restaurar se guarda una copia de los ` +
      'datos actuales, por si te arrepentís. El sistema se va a reiniciar.',
    buttons: ['Restaurar', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return { cancelado: true };

  const resultado = copias.restaurarCopia(ruta);

  // Reiniciamos para abrir la base restaurada (y aplicarle las migraciones que falten).
  // El pequeño retraso deja que la respuesta llegue a la ventana.
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 400);
  return { ...resultado, reiniciando: true };
});

// ---------- Información del sistema (para Ajustes y soporte técnico) ----------
manejar('sistema:info', 'admin', () => ({
  versionPrograma: app.getVersion(),
  versionBase: conexion.VERSION_BASE,
  carpetaDatos: app.getPath('userData'),
}));

// ---------- Confirmación genérica ----------
manejar('dialogo:confirmar', 'sesion', async (opciones) => {
  const { titulo = 'Confirmar', mensaje = '¿Seguro?', detalle = '', boton = 'Aceptar' } =
    opciones ?? {};

  const { response } = await dialog.showMessageBox(ventana, {
    type: 'warning',
    title: String(titulo),
    message: String(mensaje),
    detail: String(detalle),
    buttons: [String(boton), 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
});

// ---------- Ventana ----------
function crearVentana() {
  ventana = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 1000,
    minHeight: 640,
    icon: path.join(__dirname, '..', 'assets', 'icono.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Ya son los valores por defecto de Electron: los dejamos escritos para que quede claro
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  ventana.loadFile(path.join(__dirname, 'index.html'));

  // SEGURIDAD: la ventana no puede irse a otra página ni abrir ventanas nuevas.
  // Sin esto, si alguien arrastra un archivo o una foto a la ventana, Electron
  // reemplaza el sistema por ese archivo.
  ventana.webContents.on('will-navigate', (evento) => evento.preventDefault());
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // ventana.webContents.openDevTools();

  ventana.on('closed', () => {
    ventana = null;
  });
}

app.whenReady().then(() => {
  conexion.iniciarBaseDeDatos();
  copias.copiaAutomatica({ soloSiNoHayDeHoy: true }); // si falla, avisa en Ajustes
  crearVentana();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Al cerrar: actualizamos la copia del día con todo lo que se hizo hoy y cerramos la base
app.on('will-quit', () => {
  if (!conexion.baseAbierta()) return;
  copias.copiaAutomatica({ soloSiNoHayDeHoy: false });
  conexion.cerrarBaseDeDatos();
});
