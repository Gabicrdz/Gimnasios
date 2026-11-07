// pruebas/base.test.js — Migraciones, socios (búsqueda y orden) y configuración.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarSistema, crearSocioConPlan } = require('./ayudantes');

const sistema = iniciarSistema();
const { conexion, socios, configuracion } = sistema;

test('la base nueva queda en la última versión', () => {
  const version = conexion.obtenerDb().pragma('user_version', { simple: true });
  assert.equal(version, conexion.VERSION_BASE);
});

test('trae los planes de ejemplo y el nombre por defecto', () => {
  assert.equal(sistema.planes.listarPlanes({}).length, 3);
  assert.equal(configuracion.obtenerConfiguracion().nombre_gimnasio, 'Mi Gimnasio');
});

test('crear socio: valida datos y no repite DNI', () => {
  const { socioId } = crearSocioConPlan(sistema, '30.123.456');
  assert.equal(socios.obtenerSocio(socioId).dni, '30123456'); // guarda solo números
  assert.equal(socios.obtenerSocio(socioId).estado, 'sin_pagos');

  assert.throws(() => socios.crearSocio({ nombre: 'Ana', apellido: 'Gómez', dni: '30123456' }), {
    message: 'Ya existe un socio con ese DNI',
  });
  assert.throws(() => socios.crearSocio({ nombre: 'Ana', apellido: 'Gómez', dni: '123' }), {
    message: 'El DNI debe tener 7 u 8 números',
  });
  assert.throws(() => socios.crearSocio({ nombre: '', apellido: 'Gómez', dni: '31111111' }), {
    message: 'El nombre es obligatorio',
  });
});

test('la búsqueda ignora tildes y mayúsculas, y encuentra por DNI', () => {
  socios.crearSocio({ nombre: 'Martín', apellido: 'Núñez', dni: '32222222' });
  socios.crearSocio({ nombre: 'Lucía', apellido: 'Álvarez', dni: '33333333' });

  const nombres = (busqueda) => socios.listarSocios({ busqueda }).map((s) => s.apellido);

  assert.deepEqual(nombres('nunez'), ['Núñez']);
  assert.deepEqual(nombres('MARTIN'), ['Núñez']);
  assert.deepEqual(nombres('alvarez'), ['Álvarez']);
  assert.deepEqual(nombres('33.333'), ['Álvarez']);
});

test('buscar "%" o "_" no trae a todos (se buscan como texto)', () => {
  assert.equal(socios.listarSocios({ busqueda: '%' }).length, 0);
  assert.equal(socios.listarSocios({ busqueda: '_' }).length, 0);
});

test('el orden alfabético pone "Álvarez" antes que "Gómez" y "Núñez"', () => {
  socios.crearSocio({ nombre: 'Pedro', apellido: 'Gómez', dni: '34444444' });
  const apellidos = socios.listarSocios({}).map((s) => s.apellido);
  assert.deepEqual(apellidos, ['Álvarez', 'Gómez', 'Núñez', 'Pérez']);
});

test('dar de baja oculta al socio de la lista de activos', () => {
  const { id } = socios.listarSocios({ busqueda: 'gomez' })[0];
  socios.cambiarEstadoSocio(id, false);
  assert.equal(socios.listarSocios({ busqueda: 'gomez' }).length, 0);
  assert.equal(socios.listarSocios({ busqueda: 'gomez', mostrar: 'bajas' }).length, 1);
});

test('editar al socio actualiza también la búsqueda', () => {
  const [socio] = socios.listarSocios({ busqueda: 'nunez' });
  socios.actualizarSocio(socio.id, { ...socio, fechaNacimiento: null, planId: null, apellido: 'Ibáñez' });
  assert.equal(socios.listarSocios({ busqueda: 'nunez' }).length, 0);
  assert.equal(socios.listarSocios({ busqueda: 'ibanez' }).length, 1);
});

test('configuración: guarda el nombre y no acepta vacío', () => {
  assert.equal(configuracion.guardarConfiguracion({ nombre_gimnasio: '  Box Formosa ' }).nombre_gimnasio, 'Box Formosa');
  assert.throws(() => configuracion.guardarConfiguracion({ nombre_gimnasio: '   ' }));
});
