// db/conexion.js — Abre la base de datos, aplica las migraciones
// y tiene ayudantes que usan los demás archivos de /db.

const Database = require('better-sqlite3');
const path = require('node:path');
const { app } = require('electron');

let db = null;
let rutaActual = null;

// ---------- Migraciones ----------
// Cada función de la lista es una versión de la base (posición 0 = versión 1).
// REGLA DE ORO: nunca modificar una migración que ya se ejecutó en la compu
// de un cliente. Para cambiar algo, se agrega una función NUEVA al final.
const MIGRACIONES = [
  // ===== Versión 1 (etapa 1): planes y socios =====
  () => {
    db.exec(`
      CREATE TABLE planes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre          TEXT NOT NULL COLLATE NOCASE UNIQUE,
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos > 0),
        duracion_dias   INTEGER NOT NULL CHECK (duracion_dias > 0),
        activo          INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE socios (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre           TEXT NOT NULL,
        apellido         TEXT NOT NULL,
        dni              TEXT NOT NULL UNIQUE,
        telefono         TEXT,
        fecha_nacimiento TEXT,
        plan_id          INTEGER REFERENCES planes(id) ON DELETE RESTRICT,
        notas            TEXT,
        activo           INTEGER NOT NULL DEFAULT 1,
        creado_en        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX idx_socios_apellido ON socios(apellido);
    `);

    // Planes de ejemplo (el cliente los edita con sus precios reales)
    const insertar = db.prepare(
      'INSERT INTO planes (nombre, precio_centavos, duracion_dias) VALUES (?, ?, ?)'
    );
    insertar.run('Mensual libre', 2500000, 30);
    insertar.run('Mensual 3 veces por semana', 1800000, 30);
    insertar.run('Trimestral libre', 6500000, 90);
  },

  // ===== Versión 2 (etapa 2): pagos y vencimientos =====
  () => {
    db.exec(`
      -- Último día que el socio tiene pagado (inclusive). NULL = nunca pagó.
      ALTER TABLE socios ADD COLUMN vence_el TEXT;
      CREATE INDEX idx_socios_vence ON socios(vence_el);

      CREATE TABLE pagos (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        socio_id       INTEGER NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
        plan_id        INTEGER NOT NULL REFERENCES planes(id) ON DELETE RESTRICT,
        plan_nombre    TEXT NOT NULL,
        monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
        metodo         TEXT NOT NULL
                       CHECK (metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        fecha_pago     TEXT NOT NULL,
        cubre_desde    TEXT NOT NULL,
        cubre_hasta    TEXT NOT NULL,
        notas          TEXT,
        anulado        INTEGER NOT NULL DEFAULT 0,
        anulado_en     TEXT,
        creado_en      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX idx_pagos_socio ON pagos(socio_id);
      CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago);
    `);
  },

  // ===== Versión 3 (etapa 3): asistencias (control de ingreso) =====
  () => {
    db.exec(`
      CREATE TABLE asistencias (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        socio_id     INTEGER NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
        fecha        TEXT NOT NULL,   -- "AAAA-MM-DD"
        hora         TEXT NOT NULL,   -- "HH:MM"
        estado_cuota TEXT NOT NULL,   -- "foto" del estado de la cuota al momento de entrar
        creado_en    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX idx_asistencias_fecha ON asistencias(fecha);
      CREATE INDEX idx_asistencias_socio ON asistencias(socio_id, fecha);
    `);
  },

  // ===== Versión 4 (etapa 4): búsqueda sin acentos + configuración =====
  () => {
    db.exec(`
      -- Nombre y apellido "normalizados" (sin acentos y en minúscula) para buscar y ordenar
      ALTER TABLE socios ADD COLUMN busqueda TEXT NOT NULL DEFAULT '';
      ALTER TABLE socios ADD COLUMN orden TEXT NOT NULL DEFAULT '';
      CREATE INDEX idx_socios_orden ON socios(orden);

      -- Ajustes del sistema, como pares clave → valor
      CREATE TABLE configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
      INSERT INTO configuracion (clave, valor) VALUES ('nombre_gimnasio', 'Mi Gimnasio');
    `);

    // Las columnas nuevas arrancan vacías: las completamos para los socios que ya existen
    const socios = db.prepare('SELECT id, nombre, apellido FROM socios').all();
    const actualizar = db.prepare('UPDATE socios SET busqueda = @busqueda, orden = @orden WHERE id = @id');
    for (const socio of socios) {
      actualizar.run({ id: socio.id, ...camposDeBusqueda(socio.nombre, socio.apellido) });
    }
  },

  // Las próximas migraciones van acá abajo.
];

function migrar() {
  const versionActual = db.pragma('user_version', { simple: true });

  MIGRACIONES.forEach((migracion, indice) => {
    const version = indice + 1;
    if (version <= versionActual) return; // ya estaba aplicada

    // Cada migración en su transacción: o se aplica completa o no se aplica
    const aplicar = db.transaction(() => {
      migracion();
      db.pragma(`user_version = ${version}`);
    });
    aplicar();
    console.log(`Migración ${version} aplicada`);
  });
}

// ---------- Abrir y cerrar ----------
// Dónde está guardada la base (la usan las copias de seguridad)
function rutaBaseDeDatos() {
  return rutaActual ?? path.join(app.getPath('userData'), 'gimnasio.db');
}

function iniciarBaseDeDatos() {
  const ruta = rutaBaseDeDatos();
  rutaActual = ruta;
  db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrar();
  console.log('Base de datos lista en:', ruta);
}

// Los demás módulos piden la base con esta función (y no con una variable)
// porque cuando hacen el require, la base todavía no está abierta.
function obtenerDb() {
  if (!db) throw new Error('La base de datos no está iniciada');
  return db;
}

function cerrarBaseDeDatos() {
  if (db) db.close();
  db = null; // así nadie la usa cerrada por error
}

function baseAbierta() {
  return db !== null;
}

// Versión de la base que espera este programa = cantidad de migraciones
const VERSION_BASE = MIGRACIONES.length;

// ---------- Ayudantes para validar ----------
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Convierte a texto, saca espacios de los bordes y recorta al máximo permitido
function texto(valor, maximo) {
  return String(valor ?? '').trim().slice(0, maximo);
}

function validarId(id, nombre = 'ID') {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${nombre} inválido`);
  }
}

// Fecha de hoy en la compu, como "AAAA-MM-DD"
function hoy() {
  const fecha = new Date();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

// "Núñez" → "nunez": sin acentos y en minúscula, para buscar y ordenar bien.
// normalize('NFD') separa cada letra de su acento ("ú" → "u" + "´")
// y el replace borra los acentos sueltos.
function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Las dos columnas de búsqueda de un socio.
// "busqueda" tiene los dos órdenes para encontrar "juan perez" y "perez juan".
function camposDeBusqueda(nombre, apellido) {
  const n = normalizar(nombre);
  const a = normalizar(apellido);
  return { busqueda: `${n} ${a} | ${a} ${n}`, orden: `${a} ${n}` };
}

// Hora actual de la compu, como "HH:MM"
function horaActual() {
  const fecha = new Date();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

// "2026-02-31" tiene buen formato pero no existe. SQLite no avisa:
// lo convierte en silencio a "2026-03-03". Por eso lo verificamos acá.
function esFechaReal(valor) {
  if (!FECHA_VALIDA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

// Fecha que puede venir vacía: devuelve null o "AAAA-MM-DD"
function fechaOpcional(valor) {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return null;
  if (!esFechaReal(limpio)) throw new Error('Fecha inválida');
  return limpio;
}

// Fecha que no puede faltar
function fechaObligatoria(valor, nombreCampo) {
  const limpio = String(valor ?? '').trim();
  if (!esFechaReal(limpio)) throw new Error(`${nombreCampo}: fecha inválida`);
  return limpio;
}

module.exports = {
  iniciarBaseDeDatos,
  obtenerDb,
  cerrarBaseDeDatos,
  baseAbierta,
  rutaBaseDeDatos,
  VERSION_BASE,
  texto,
  validarId,
  hoy,
  horaActual,
  normalizar,
  camposDeBusqueda,
  fechaOpcional,
  fechaObligatoria,
  FECHA_VALIDA,
};
