// pruebas/copias.test.js — Copias de seguridad: hacer, listar, validar y restaurar.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iniciarSistema, carpeta, DatabaseSync } = require('./ayudantes');

const sistema = iniciarSistema();
const { conexion, socios, copias } = sistema;

test('hace una copia manual en Documentos\\Copias del gimnasio', () => {
  socios.crearSocio({ nombre: 'Juan', apellido: 'Pérez', dni: '30123456' });
  const { nombre } = copias.hacerCopia('manual');
  assert.match(nombre, /^gimnasio-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_manual\.db$/);

  const lista = copias.listarCopias();
  assert.equal(lista.carpeta, path.join(carpeta, 'Documentos', 'Copias del gimnasio'));
  assert.equal(lista.copias.length, 1);
  assert.ok(lista.copias[0].bytes > 0);
});

test('la copia automática se hace una sola vez por día al abrir', () => {
  copias.copiaAutomatica({ soloSiNoHayDeHoy: true });
  copias.copiaAutomatica({ soloSiNoHayDeHoy: true });
  const automaticas = copias.listarCopias().copias.filter((c) => c.tipo === 'automatica');
  assert.equal(automaticas.length, 1);
});

test('guarda solo las últimas 30 copias automáticas', () => {
  const { carpeta: carpetaCopias } = copias.listarCopias();
  const original = copias.listarCopias().copias.find((c) => c.tipo === 'automatica').nombre;
  for (let dia = 1; dia <= 35; dia++) {
    const nombre = `gimnasio-2020-01-${String(dia).padStart(2, '0')}.db`;
    if (dia <= 31) fs.copyFileSync(path.join(carpetaCopias, original), path.join(carpetaCopias, nombre));
  }
  copias.hacerCopia('automatica'); // al hacer una, borra las más viejas
  const automaticas = copias.listarCopias().copias.filter((c) => c.tipo === 'automatica');
  assert.equal(automaticas.length, 30);
  assert.ok(!automaticas.some((c) => c.nombre === 'gimnasio-2020-01-01.db'));
});

test('solo acepta nombres de copias, nunca rutas', () => {
  assert.throws(() => copias.rutaDeCopia('..\\..\\Windows\\algo.db'));
  assert.throws(() => copias.rutaDeCopia('cualquiera.db'));
});

test('rechaza archivos que no son copias de este sistema', () => {
  const falso = path.join(carpeta, 'falso.db');
  fs.writeFileSync(falso, 'esto no es una base de datos');
  assert.throws(() => copias.validarArchivoDeCopia(falso));

  const otraBase = path.join(carpeta, 'otra.db');
  const otra = new DatabaseSync(otraBase);
  otra.exec('CREATE TABLE clientes (id INTEGER)');
  otra.close();
  assert.throws(() => copias.validarArchivoDeCopia(otraBase), {
    message: 'El archivo no es una copia de seguridad de este sistema.',
  });

  const futura = path.join(carpeta, 'futura.db');
  fs.copyFileSync(path.join(copias.listarCopias().carpeta, copias.listarCopias().copias[0].nombre), futura);
  const base = new DatabaseSync(futura);
  base.exec(`PRAGMA user_version = ${conexion.VERSION_BASE + 1}`);
  base.close();
  assert.throws(() => copias.validarArchivoDeCopia(futura), /más nueva/);
});

test('restaurar vuelve los datos atrás y guarda un respaldo antes', () => {
  const manual = copias.listarCopias().copias.find((c) => c.tipo === 'manual').nombre;
  socios.crearSocio({ nombre: 'Ana', apellido: 'Gómez', dni: '31111111' });
  assert.equal(socios.listarSocios({}).length, 2);

  const resultado = copias.restaurarCopia(copias.rutaDeCopia(manual));
  assert.equal(resultado.socios, 1);
  assert.match(resultado.respaldo, /antes-de-restaurar/);
  assert.equal(conexion.baseAbierta(), false); // la app se reinicia después de restaurar

  conexion.iniciarBaseDeDatos();
  assert.deepEqual(socios.listarSocios({}).map((s) => s.apellido), ['Pérez']);
});
