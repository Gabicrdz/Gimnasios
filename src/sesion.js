// sesion.js — Quién está usando el sistema AHORA. Vive en la memoria del proceso main:
// la ventana no puede "decir" quién es, tiene que poner el PIN. Y cada canal del main
// revisa acá si quien pide tiene permiso (la ventana esconde botones, pero la seguridad
// de verdad está en el main).

const usuarios = require('./db/usuarios');

let actual = null;

// Después de 5 PIN mal seguidos, hay que esperar 30 segundos (por usuario)
const MAXIMO_INTENTOS = 5;
const ESPERA_MS = 30_000;
const fallos = new Map();

function iniciarSesion(usuarioId, pin, ahora = Date.now()) {
  const registro = fallos.get(usuarioId) ?? { cantidad: 0, hasta: 0 };
  if (registro.hasta > ahora) {
    throw new Error(`Demasiados intentos. Esperá ${Math.ceil((registro.hasta - ahora) / 1000)} segundos.`);
  }

  const usuario = usuarios.verificarPin(usuarioId, pin);
  if (!usuario) {
    // Si ya había cumplido una espera, vuelve a contar desde cero
    const cantidad = registro.hasta !== 0 ? 1 : registro.cantidad + 1;
    const bloqueado = cantidad >= MAXIMO_INTENTOS;
    fallos.set(usuarioId, { cantidad, hasta: bloqueado ? ahora + ESPERA_MS : 0 });
    throw new Error(bloqueado ? 'PIN incorrecto. Esperá 30 segundos para volver a probar.' : 'PIN incorrecto.');
  }

  fallos.delete(usuarioId);
  actual = usuario;
  return usuario;
}

// Después de crear al primer administrador, entra directo
function abrirSesionDe(usuario) {
  actual = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  return actual;
}

function cerrarSesion() {
  actual = null;
}

function sesionActual() {
  return actual;
}

// Quién puede usar cada canal:
//  'libre'  → sin sesión (pantalla de ingreso)
//  'sesion' → cualquiera que haya puesto su PIN
//  'admin'  → solo el administrador (dueño)
const PERMISOS = ['libre', 'sesion', 'admin'];

function requerir(permiso) {
  if (!PERMISOS.includes(permiso)) throw new Error(`Permiso desconocido: ${permiso}`);
  if (permiso === 'libre') return actual;
  if (!actual) throw new Error('La sesión se cerró. Volvé a ingresar con tu PIN.');
  if (permiso === 'admin' && actual.rol !== 'admin') {
    throw new Error('Eso lo puede hacer solo el administrador.');
  }
  return actual;
}

// Si se edita al usuario que está adentro (nombre o tipo), la sesión se pone al día
function refrescarSesion(usuario) {
  if (actual && usuario && usuario.id === actual.id) actual = { ...actual, ...usuario };
}

// Solo para las pruebas
function reiniciarParaPruebas() {
  actual = null;
  fallos.clear();
}

module.exports = {
  PERMISOS,
  iniciarSesion,
  abrirSesionDe,
  cerrarSesion,
  sesionActual,
  requerir,
  refrescarSesion,
  reiniciarParaPruebas,
};
