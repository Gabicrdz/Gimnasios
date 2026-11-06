// preload.js — Lo que la ventana puede pedirle al main.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Planes
  listarPlanes: (opciones) => ipcRenderer.invoke('planes:listar', opciones),
  crearPlan: (datos) => ipcRenderer.invoke('planes:crear', datos),
  actualizarPlan: (id, datos) => ipcRenderer.invoke('planes:actualizar', id, datos),
  cambiarEstadoPlan: (id, activo) => ipcRenderer.invoke('planes:cambiar-estado', id, activo),

  // Socios
  listarSocios: (filtros) => ipcRenderer.invoke('socios:listar', filtros),
  obtenerSocio: (id) => ipcRenderer.invoke('socios:obtener', id),
  crearSocio: (datos) => ipcRenderer.invoke('socios:crear', datos),
  actualizarSocio: (id, datos) => ipcRenderer.invoke('socios:actualizar', id, datos),
  cambiarEstadoSocio: (id, activo) => ipcRenderer.invoke('socios:cambiar-estado', id, activo),

  // Pagos
  registrarPago: (datos) => ipcRenderer.invoke('pagos:registrar', datos),
  anularPago: (id) => ipcRenderer.invoke('pagos:anular', id),
  listarPagosDeSocio: (socioId) => ipcRenderer.invoke('pagos:de-socio', socioId),
  resumenPagosMes: (mes) => ipcRenderer.invoke('pagos:resumen-mes', mes),

  // Asistencias (control de ingreso)
  registrarIngreso: (entrada) => ipcRenderer.invoke('asistencias:registrar', entrada),
  ingresosDeHoy: () => ipcRenderer.invoke('asistencias:hoy'),
  eliminarIngreso: (id) => ipcRenderer.invoke('asistencias:eliminar', id),
  resumenAsistenciaSocio: (socioId) => ipcRenderer.invoke('asistencias:de-socio', socioId),

  // Diálogos
  confirmar: (opciones) => ipcRenderer.invoke('dialogo:confirmar', opciones),
});
