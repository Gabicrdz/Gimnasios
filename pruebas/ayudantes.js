// pruebas/ayudantes.js — Funciones comunes para todas las pruebas.

const { carpeta, DatabaseSync } = require('./entorno'); // SIEMPRE primero
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const cargar = (modulo) => require(path.join(SRC, modulo));

// Abre una base nueva (con todas las migraciones) y devuelve los módulos del sistema
function iniciarSistema() {
  const conexion = cargar('db/conexion');
  conexion.iniciarBaseDeDatos();
  return {
    conexion,
    planes: cargar('db/planes'),
    socios: cargar('db/socios'),
    pagos: cargar('db/pagos'),
    asistencias: cargar('db/asistencias'),
    resumen: cargar('db/resumen'),
    configuracion: cargar('db/configuracion'),
    copias: cargar('db/copias'),
  };
}

// Fecha "AAAA-MM-DD" a X días de hoy (negativo = en el pasado), calculada igual que el sistema
function fechaDesdeHoy(dias) {
  const fecha = new Date();
  fecha.setHours(12, 0, 0, 0);
  fecha.setDate(fecha.getDate() + dias);
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

// Un plan y un socio listos para usar
function crearSocioConPlan(sistema, dni = '30123456', telefono = '370 4123456') {
  const plan = sistema.planes.listarPlanes({}).find((p) => p.nombre === 'Mensual libre');
  const { id } = sistema.socios.crearSocio({
    nombre: 'Juan',
    apellido: 'Pérez',
    dni,
    telefono,
    planId: plan.id,
  });
  return { plan, socioId: id };
}

module.exports = { carpeta, DatabaseSync, cargar, iniciarSistema, fechaDesdeHoy, crearSocioConPlan };
