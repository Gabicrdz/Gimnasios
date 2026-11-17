// db/usuarios.js — Usuarios del sistema con PIN.
//
// El PIN NUNCA se guarda: se guarda el resultado de pasarlo por scrypt (una cuenta "lenta
// a propósito", así probar miles de PIN por segundo no sirve) junto con una sal al azar
// distinta para cada usuario. Para revisar un PIN se repite la cuenta y se comparan.

const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { obtenerDb, texto, validarId } = require('./conexion');

const ROLES = ['admin', 'recepcion'];
const FORMATO_PIN = /^\d{4,6}$/;

function hashDePin(pin, sal = randomBytes(16).toString('hex')) {
  return { hash: scryptSync(pin, sal, 32).toString('hex'), sal };
}

function pinCorrecto(pin, hash, sal) {
  const calculado = Buffer.from(hashDePin(pin, sal).hash, 'hex');
  const guardado = Buffer.from(hash, 'hex');
  // timingSafeEqual tarda lo mismo acierte o no: no da pistas por el tiempo de respuesta
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

function validarPin(pin) {
  if (!FORMATO_PIN.test(String(pin ?? ''))) throw new Error('El PIN tiene que ser de 4 a 6 números.');
  return String(pin);
}

function limpiarUsuario(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos inválidos');
  const nombre = texto(datos.nombre, 40);
  if (nombre.length < 2) throw new Error('Escribí el nombre del usuario (mínimo 2 letras).');
  const rol = String(datos.rol ?? '');
  if (!ROLES.includes(rol)) throw new Error('Elegí el tipo de usuario.');
  return { nombre, rol };
}

// Lo único que sale hacia la ventana: nunca el hash ni la sal
const COLUMNAS_PUBLICAS = 'id, nombre, rol, activo';

// Para la pantalla de ingreso: solo los activos, el dueño primero
function listarParaIngreso() {
  return obtenerDb()
    .prepare(
      `SELECT id, nombre, rol FROM usuarios WHERE activo = 1
       ORDER BY CASE rol WHEN 'admin' THEN 0 ELSE 1 END, nombre`
    )
    .all();
}

// Para Ajustes (administración): incluye los dados de baja
function listarUsuarios() {
  return obtenerDb()
    .prepare(
      `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios
       ORDER BY activo DESC, CASE rol WHEN 'admin' THEN 0 ELSE 1 END, nombre`
    )
    .all();
}

function hayUsuarios() {
  return obtenerDb().prepare('SELECT 1 FROM usuarios LIMIT 1').get() !== undefined;
}

function otrosAdminsActivos(exceptoId) {
  return obtenerDb()
    .prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE activo = 1 AND rol = 'admin' AND id <> ?`)
    .get(exceptoId).n;
}

function nombreRepetido(nombre, exceptoId) {
  return (
    obtenerDb()
      .prepare('SELECT 1 FROM usuarios WHERE activo = 1 AND nombre = ? COLLATE NOCASE AND id <> ?')
      .get(nombre, exceptoId) !== undefined
  );
}

// El primer arranque: solo funciona mientras NO exista ningún usuario
function crearPrimerAdmin(datos) {
  if (hayUsuarios()) throw new Error('El sistema ya tiene usuarios.');
  return crearUsuario({ ...datos, rol: 'admin' });
}

function crearUsuario(datos) {
  const { nombre, rol } = limpiarUsuario(datos);
  const pin = validarPin(datos.pin);
  if (nombreRepetido(nombre, 0)) throw new Error(`Ya hay un usuario que se llama "${nombre}".`);

  const { hash, sal } = hashDePin(pin);
  const { lastInsertRowid } = obtenerDb()
    .prepare('INSERT INTO usuarios (nombre, rol, pin_hash, pin_sal) VALUES (?, ?, ?, ?)')
    .run(nombre, rol, hash, sal);
  return { id: Number(lastInsertRowid) };
}

// El PIN es opcional al editar: si viene vacío, se conserva el que tenía
function actualizarUsuario(id, datos) {
  validarId(id, 'Usuario');
  const { nombre, rol } = limpiarUsuario(datos);
  const db = obtenerDb();

  return db.transaction(() => {
    const anterior = db.prepare('SELECT rol, activo FROM usuarios WHERE id = ?').get(id);
    if (!anterior) throw new Error('Ese usuario no existe.');
    if (nombreRepetido(nombre, id) && anterior.activo) {
      throw new Error(`Ya hay un usuario que se llama "${nombre}".`);
    }
    if (anterior.activo && anterior.rol === 'admin' && rol !== 'admin' && otrosAdminsActivos(id) === 0) {
      throw new Error('Tiene que quedar al menos un administrador. Creá otro antes de cambiar este.');
    }

    db.prepare('UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?').run(nombre, rol, id);
    if (String(datos.pin ?? '') !== '') {
      const { hash, sal } = hashDePin(validarPin(datos.pin));
      db.prepare('UPDATE usuarios SET pin_hash = ?, pin_sal = ? WHERE id = ?').run(hash, sal, id);
    }
    return { id };
  })();
}

// Baja lógica: no puede entrar más, pero lo que hizo queda registrado con su nombre
function cambiarEstadoUsuario(id, activo, quienLoHace) {
  validarId(id, 'Usuario');
  const db = obtenerDb();
  const usuario = db.prepare('SELECT nombre, rol, activo FROM usuarios WHERE id = ?').get(id);
  if (!usuario) throw new Error('Ese usuario no existe.');

  if (!activo) {
    if (id === quienLoHace) throw new Error('No podés darte de baja a vos mismo.');
    if (usuario.rol === 'admin' && otrosAdminsActivos(id) === 0) {
      throw new Error('Tiene que quedar al menos un administrador.');
    }
  } else if (nombreRepetido(usuario.nombre, id)) {
    throw new Error(`Ya hay otro usuario activo que se llama "${usuario.nombre}".`);
  }
  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
  return { id };
}

// Revisa el PIN. Devuelve el usuario (sin hash) o null si no coincide.
function verificarPin(id, pin) {
  validarId(id, 'Usuario');
  const u = obtenerDb()
    .prepare('SELECT id, nombre, rol, pin_hash, pin_sal FROM usuarios WHERE id = ? AND activo = 1')
    .get(id);
  if (!u) throw new Error('Ese usuario ya no existe.');
  if (!FORMATO_PIN.test(String(pin ?? '')) || !pinCorrecto(String(pin), u.pin_hash, u.pin_sal)) {
    return null;
  }
  return { id: u.id, nombre: u.nombre, rol: u.rol };
}

// Cada uno cambia su propio PIN, poniendo el actual
function cambiarPin(id, pinActual, pinNuevo) {
  if (!verificarPin(id, pinActual)) throw new Error('El PIN actual no es correcto.');
  const { hash, sal } = hashDePin(validarPin(pinNuevo));
  obtenerDb().prepare('UPDATE usuarios SET pin_hash = ?, pin_sal = ? WHERE id = ?').run(hash, sal, id);
  return { id };
}

module.exports = {
  ROLES,
  listarParaIngreso,
  listarUsuarios,
  hayUsuarios,
  crearPrimerAdmin,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  verificarPin,
  cambiarPin,
};
