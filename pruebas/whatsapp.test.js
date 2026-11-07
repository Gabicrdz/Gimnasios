// pruebas/whatsapp.test.js — Números argentinos al formato que pide WhatsApp.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./ayudantes');

const { normalizarTelefono, armarEnlaceWhatsApp } = cargar('whatsapp');

test('acepta las formas comunes de escribir un celular de Formosa', () => {
  for (const telefono of [
    '370 4123456',
    '3704123456',
    '03704123456',
    '370 15 412-3456',
    '0370 15 4123456',
    '+54 9 370 4123456',
    '5493704123456',
  ]) {
    assert.equal(normalizarTelefono(telefono), '5493704123456', telefono);
  }
});

test('funciona con características de 2 y 4 números', () => {
  assert.equal(normalizarTelefono('011 15 4123 4567'), '5491141234567');
  assert.equal(normalizarTelefono('3717 15 412345'), '5493717412345');
});

test('rechaza números incompletos', () => {
  assert.equal(normalizarTelefono('4123456'), null);
  assert.equal(normalizarTelefono(''), null);
});

test('el enlace lleva el mensaje codificado', () => {
  const enlace = armarEnlaceWhatsApp('370 4123456', 'Hola Juan, tu cuota vence mañana');
  assert.equal(enlace, 'https://wa.me/5493704123456?text=Hola%20Juan%2C%20tu%20cuota%20vence%20ma%C3%B1ana');
  assert.throws(() => armarEnlaceWhatsApp('', 'hola'), { message: 'El socio no tiene teléfono cargado' });
  assert.throws(() => armarEnlaceWhatsApp('123', 'hola'), /no parece un número/);
});
