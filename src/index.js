// index.js — Proceso MAIN del sistema de gimnasio.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const conexion = require('./db/conexion');
const planes = require('./db/planes');
const socios = require('./db/socios');
const pagos = require('./db/pagos');
const asistencias = require('./db/asistencias');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Idioma de la app: fechas, calendarios y meses siempre en español de Argentina
// (dd/mm/aaaa), aunque la compu del cliente tenga Windows en inglés.
app.commandLine.appendSwitch('lang', 'es-AR');

let ventana = null;

// Siempre responde { ok: true, datos } o { ok: false, error }
function manejar(canal, funcion) {
  ipcMain.handle(canal, async (evento, ...argumentos) => {
    try {
      const datos = await funcion(...argumentos);
      return { ok: true, datos };
    } catch (error) {
      console.error(`[${canal}]`, error);
      return { ok: false, error: error.message };
    }
  });
}

// ---------- Planes ----------
manejar('planes:listar', (opciones) => planes.listarPlanes(opciones));
manejar('planes:crear', (datos) => planes.crearPlan(datos));
manejar('planes:actualizar', (id, datos) => planes.actualizarPlan(id, datos));
manejar('planes:cambiar-estado', (id, activo) => planes.cambiarEstadoPlan(id, activo));

// ---------- Socios ----------
manejar('socios:listar', (filtros) => socios.listarSocios(filtros));
manejar('socios:obtener', (id) => socios.obtenerSocio(id));
manejar('socios:crear', (datos) => socios.crearSocio(datos));
manejar('socios:actualizar', (id, datos) => socios.actualizarSocio(id, datos));
manejar('socios:cambiar-estado', (id, activo) => socios.cambiarEstadoSocio(id, activo));

// ---------- Pagos ----------
manejar('pagos:registrar', (datos) => pagos.registrarPago(datos));
manejar('pagos:anular', (id) => pagos.anularPago(id));
manejar('pagos:de-socio', (socioId) => pagos.listarPagosDeSocio(socioId));
manejar('pagos:resumen-mes', (mes) => pagos.resumenDelMes(mes));

// ---------- Asistencias (control de ingreso) ----------
manejar('asistencias:registrar', (entrada) => asistencias.registrarIngreso(entrada));
manejar('asistencias:hoy', () => asistencias.ingresosDeHoy());
manejar('asistencias:eliminar', (id) => asistencias.eliminarIngreso(id));
manejar('asistencias:de-socio', (socioId) => asistencias.resumenAsistenciaSocio(socioId));

// ---------- Confirmación genérica ----------
manejar('dialogo:confirmar', async (opciones) => {
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  ventana.loadFile(path.join(__dirname, 'index.html'));
  // ventana.webContents.openDevTools();

  ventana.on('closed', () => {
    ventana = null;
  });
}

app.whenReady().then(() => {
  conexion.iniciarBaseDeDatos();
  crearVentana();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  conexion.cerrarBaseDeDatos();
});
