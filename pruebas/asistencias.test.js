// pruebas/asistencias.test.js — Ingreso por DNI (a mano o con lector de código de barras).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarSistema, crearSocioConPlan } = require('./ayudantes');

const sistema = iniciarSistema();
const { asistencias, socios } = sistema;
const { socioId } = crearSocioConPlan(sistema, '30123456');

test('DNI inválido o desconocido', () => {
  assert.equal(asistencias.registrarIngreso('123').resultado, 'dni_invalido');
  assert.equal(asistencias.registrarIngreso('99999999').resultado, 'no_encontrado');
});

test('registra el ingreso escrito a mano con puntos', () => {
  const ingreso = asistencias.registrarIngreso('30.123.456');
  assert.equal(ingreso.resultado, 'ok');
  assert.equal(ingreso.socio.id, socioId);
  assert.equal(ingreso.asistencia.esteMes, 1);
});

test('si pasa dos veces el mismo día, no se duplica', () => {
  assert.equal(asistencias.registrarIngreso('30123456').resultado, 'repetido');
  assert.equal(asistencias.ingresosDeHoy().total, 1);
});

test('lee el código de barras del DNI', () => {
  socios.crearSocio({ nombre: 'Ana', apellido: 'Gómez', dni: '31222333' });
  const codigo = '00123456789@GOMEZ@ANA@F@31222333@A@14/03/1985@01/01/2020';
  const ingreso = asistencias.registrarIngreso(codigo);
  assert.equal(ingreso.resultado, 'ok');
  assert.equal(ingreso.socio.dni, '31222333');
  assert.equal(ingreso.socio.estado, 'sin_pagos'); // entra igual: decide la recepción
});

test('un socio dado de baja no queda registrado', () => {
  const id = socios.crearSocio({ nombre: 'Leo', apellido: 'Ruiz', dni: '32444555' }).id;
  socios.cambiarEstadoSocio(id, false);
  assert.equal(asistencias.registrarIngreso('32444555').resultado, 'baja');
  assert.equal(asistencias.ingresosDeHoy().total, 2);
});

test('se puede quitar un ingreso de hoy', () => {
  const [ultimo] = asistencias.ingresosDeHoy().ingresos;
  asistencias.eliminarIngreso(ultimo.id);
  assert.equal(asistencias.ingresosDeHoy().total, 1);
  assert.throws(() => asistencias.eliminarIngreso(ultimo.id), {
    message: 'Solo se pueden quitar ingresos de hoy',
  });
});
