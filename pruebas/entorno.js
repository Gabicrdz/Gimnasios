// pruebas/entorno.js — Prepara un "Electron de mentira" para probar el código de src/db
// con Node, sin abrir la app.
//
// ¿Por qué hace falta? better-sqlite3 está compilado para Electron y no funciona en Node
// común. Para las pruebas lo reemplazamos por node:sqlite (la SQLite que trae Node 22.13+),
// que habla el mismo SQL. Cada archivo de prueba usa una base nueva en una carpeta temporal.

const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  throw new Error('Las pruebas necesitan Node 22.13 o más nuevo. Fijate tu versión con: node -v');
}

// Carpeta temporal para la base y las copias de esta prueba
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'gimnasio-prueba-'));

// Códigos de error de SQLite → los mismos nombres que usa better-sqlite3
const CODIGOS = {
  2067: 'SQLITE_CONSTRAINT_UNIQUE',
  1555: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  787: 'SQLITE_CONSTRAINT_FOREIGNKEY',
  275: 'SQLITE_CONSTRAINT_CHECK',
  1299: 'SQLITE_CONSTRAINT_NOTNULL',
};

function traducir(error) {
  if (error && error.errcode && CODIGOS[error.errcode]) error.code = CODIGOS[error.errcode];
  return error;
}

// Imita la API de better-sqlite3 que usa el sistema: prepare/all/get/run, exec, pragma y transaction
class BaseDePrueba {
  constructor(ruta, opciones = {}) {
    if (opciones.fileMustExist && !fs.existsSync(ruta)) throw new Error('El archivo no existe');
    this.base = new DatabaseSync(ruta, opciones.readonly ? { readOnly: true } : {});
  }

  pragma(texto, opciones) {
    const consulta = this.base.prepare(`PRAGMA ${texto}`);
    if (opciones?.simple) {
      const fila = consulta.get();
      return fila ? Object.values(fila)[0] : undefined;
    }
    return consulta.all();
  }

  exec(sql) {
    try {
      this.base.exec(sql);
    } catch (error) {
      throw traducir(error);
    }
  }

  prepare(sql) {
    const consulta = this.base.prepare(sql);
    const envolver = (metodo) => (...argumentos) => {
      try {
        const resultado = consulta[metodo](...argumentos);
        if (Array.isArray(resultado)) return resultado.map((fila) => ({ ...fila }));
        if (resultado && typeof resultado === 'object') return { ...resultado };
        return resultado;
      } catch (error) {
        throw traducir(error);
      }
    };
    return { all: envolver('all'), get: envolver('get'), run: envolver('run') };
  }

  transaction(funcion) {
    return (...argumentos) => {
      this.base.exec('BEGIN');
      try {
        const resultado = funcion(...argumentos);
        this.base.exec('COMMIT');
        return resultado;
      } catch (error) {
        this.base.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close() {
    this.base.close();
  }
}

// Electron de mentira: solo lo que usa el código de src/db
const electronDePrueba = {
  app: {
    getPath: (nombre) => (nombre === 'documents' ? path.join(carpeta, 'Documentos') : carpeta),
    getVersion: () => '0.0.0-prueba',
  },
};

// Cuando el código pida "better-sqlite3" o "electron", le damos las versiones de prueba
const cargarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === 'better-sqlite3') return BaseDePrueba;
  if (pedido === 'electron') return electronDePrueba;
  return cargarOriginal.call(this, pedido, ...resto);
};

// Que los console.log del sistema ("Migración aplicada"...) no ensucien el resultado
console.log = () => {};

module.exports = { carpeta, DatabaseSync };

// Al terminar, borramos la carpeta temporal (si Windows no deja porque la base sigue
// abierta, no pasa nada: es una carpeta temporal y el sistema la limpia solo)
process.on('exit', () => {
  try {
    fs.rmSync(carpeta, { recursive: true, force: true });
  } catch {
    // sin drama
  }
});
