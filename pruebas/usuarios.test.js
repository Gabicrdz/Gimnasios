// pruebas/usuarios.test.js — Usuarios con PIN, sesión, permisos y quién cobró cada pago.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iniciarSistema, crearSocioConPlan, fechaDesdeHoy, DatabaseSync } = require('./ayudantes');

const sistema = iniciarSistema();
const { conexion, usuarios, sesion, pagos } = sistema;
const db = () => conexion.obtenerDb();

test('la base nueva no trae ningún usuario (no hay un PIN de fábrica)', () => {
  assert.equal(usuarios.hayUsuarios(), false);
  assert.deepEqual(usuarios.listarParaIngreso(), []);
});

test('el primer administrador se crea una sola vez y el PIN no se guarda en claro', () => {
  const { id } = usuarios.crearPrimerAdmin({ nombre: 'Dueño', pin: '4821' });
  const fila = db().prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  assert.equal(fila.rol, 'admin');
  assert.notEqual(fila.pin_hash, '4821');
  assert.equal(fila.pin_hash.includes('4821'), false);
  assert.equal(fila.pin_sal.length, 32);

  assert.throws(() => usuarios.crearPrimerAdmin({ nombre: 'Otro', pin: '1111' }), {
    message: 'El sistema ya tiene usuarios.',
  });
});

test('el PIN tiene que ser de 4 a 6 números y el nombre no se repite', () => {
  for (const pin of ['123', '1234567', 'abcd', '12 34', '', undefined]) {
    assert.throws(() => usuarios.crearUsuario({ nombre: 'Marta', rol: 'recepcion', pin }), {
      message: 'El PIN tiene que ser de 4 a 6 números.',
    });
  }
  assert.throws(() => usuarios.crearUsuario({ nombre: 'M', rol: 'recepcion', pin: '1234' }));
  assert.throws(() => usuarios.crearUsuario({ nombre: 'Marta', rol: 'jefe', pin: '1234' }));

  usuarios.crearUsuario({ nombre: 'Marta', rol: 'recepcion', pin: '3333' });
  assert.throws(() => usuarios.crearUsuario({ nombre: 'MARTA', rol: 'recepcion', pin: '4444' }), {
    message: 'Ya hay un usuario que se llama "MARTA".',
  });
});

test('verificar PIN: acierta, falla y no deja entrar a un usuario dado de baja', () => {
  const [dueno] = usuarios.listarParaIngreso();
  assert.equal(dueno.nombre, 'Dueño'); // el administrador va primero
  assert.equal(usuarios.verificarPin(dueno.id, '4821').nombre, 'Dueño');
  assert.equal(usuarios.verificarPin(dueno.id, '0000'), null);
  assert.equal(usuarios.verificarPin(dueno.id, 'hola'), null);
  // Lo que sale hacia la ventana nunca incluye el hash ni la sal
  assert.deepEqual(Object.keys(usuarios.listarUsuarios()[0]).sort(), ['activo', 'id', 'nombre', 'rol']);
});

test('siempre queda un administrador y nadie se da de baja a sí mismo', () => {
  const [dueno] = usuarios.listarParaIngreso();
  assert.throws(() => usuarios.cambiarEstadoUsuario(dueno.id, false, dueno.id), {
    message: 'No podés darte de baja a vos mismo.',
  });
  assert.throws(() => usuarios.cambiarEstadoUsuario(dueno.id, false, 999), {
    message: 'Tiene que quedar al menos un administrador.',
  });
  assert.throws(() => usuarios.actualizarUsuario(dueno.id, { nombre: 'Dueño', rol: 'recepcion' }), {
    message: 'Tiene que quedar al menos un administrador. Creá otro antes de cambiar este.',
  });

  // Con un segundo administrador sí se puede
  const { id } = usuarios.crearUsuario({ nombre: 'Socio dueño', rol: 'admin', pin: '5555' });
  usuarios.actualizarUsuario(dueno.id, { nombre: 'Dueño', rol: 'recepcion' });
  usuarios.actualizarUsuario(dueno.id, { nombre: 'Dueño', rol: 'admin' });
  usuarios.cambiarEstadoUsuario(id, false, dueno.id);
  assert.equal(usuarios.listarParaIngreso().some((u) => u.id === id), false);
  assert.throws(() => usuarios.verificarPin(id, '5555'), { message: 'Ese usuario ya no existe.' });
  usuarios.cambiarEstadoUsuario(id, true, dueno.id);
  assert.equal(usuarios.verificarPin(id, '5555').nombre, 'Socio dueño');
});

test('editar: el PIN vacío conserva el que tenía y uno nuevo lo reemplaza', () => {
  const marta = usuarios.listarParaIngreso().find((u) => u.nombre === 'Marta');
  usuarios.actualizarUsuario(marta.id, { nombre: 'Marta', rol: 'recepcion', pin: '' });
  assert.ok(usuarios.verificarPin(marta.id, '3333'));
  usuarios.actualizarUsuario(marta.id, { nombre: 'Marta G.', rol: 'recepcion', pin: '7777' });
  assert.equal(usuarios.verificarPin(marta.id, '3333'), null);
  assert.equal(usuarios.verificarPin(marta.id, '7777').nombre, 'Marta G.');
});

test('cambiar el propio PIN pide el actual', () => {
  const marta = usuarios.listarParaIngreso().find((u) => u.nombre === 'Marta G.');
  assert.throws(() => usuarios.cambiarPin(marta.id, '0000', '9999'), { message: 'El PIN actual no es correcto.' });
  assert.throws(() => usuarios.cambiarPin(marta.id, '7777', '12'));
  usuarios.cambiarPin(marta.id, '7777', '9999');
  assert.ok(usuarios.verificarPin(marta.id, '9999'));
});

test('sesión: sin PIN no se entra y 5 errores bloquean 30 segundos', () => {
  sesion.reiniciarParaPruebas();
  const marta = usuarios.listarParaIngreso().find((u) => u.nombre === 'Marta G.');
  const t0 = 1_000_000;

  for (let i = 1; i <= 4; i++) {
    assert.throws(() => sesion.iniciarSesion(marta.id, '0000', t0), { message: 'PIN incorrecto.' });
  }
  assert.throws(() => sesion.iniciarSesion(marta.id, '0000', t0), {
    message: 'PIN incorrecto. Esperá 30 segundos para volver a probar.',
  });
  // Durante la espera, ni el PIN correcto entra
  assert.throws(() => sesion.iniciarSesion(marta.id, '9999', t0 + 10_000), /Demasiados intentos. Esperá 20 segundos/);
  assert.equal(sesion.sesionActual(), null);
  // Pasada la espera, entra y se limpian los intentos
  assert.equal(sesion.iniciarSesion(marta.id, '9999', t0 + 31_000).nombre, 'Marta G.');
  assert.equal(sesion.sesionActual().rol, 'recepcion');
});

test('permisos: libre / sesión / admin', () => {
  sesion.reiniciarParaPruebas();
  assert.equal(sesion.requerir('libre'), null);
  assert.throws(() => sesion.requerir('sesion'), { message: 'La sesión se cerró. Volvé a ingresar con tu PIN.' });
  assert.throws(() => sesion.requerir('admin'), /sesión se cerró/);
  assert.throws(() => sesion.requerir('cualquiera'), /Permiso desconocido/);

  const marta = usuarios.listarParaIngreso().find((u) => u.nombre === 'Marta G.');
  sesion.iniciarSesion(marta.id, '9999');
  assert.equal(sesion.requerir('sesion').nombre, 'Marta G.');
  assert.throws(() => sesion.requerir('admin'), { message: 'Eso lo puede hacer solo el administrador.' });

  sesion.cerrarSesion();
  const dueno = usuarios.listarParaIngreso().find((u) => u.nombre === 'Dueño');
  sesion.iniciarSesion(dueno.id, '4821');
  assert.equal(sesion.requerir('admin').rol, 'admin');
});

test('cada pago guarda quién lo cobró y quién lo anuló', () => {
  const { plan, socioId } = crearSocioConPlan(sistema, '30999888');
  const dueno = usuarios.listarParaIngreso().find((u) => u.nombre === 'Dueño');
  const marta = usuarios.listarParaIngreso().find((u) => u.nombre === 'Marta G.');
  const datos = {
    socioId,
    planId: plan.id,
    montoCentavos: plan.precio_centavos,
    metodo: 'efectivo',
    fechaPago: fechaDesdeHoy(0),
    cubreDesde: fechaDesdeHoy(0),
  };

  const { id } = pagos.registrarPago(datos, marta.id);
  const sinUsuario = pagos.registrarPago({ ...datos, cubreDesde: fechaDesdeHoy(30) });

  let lista = pagos.listarPagosDeSocio(socioId);
  assert.equal(lista.find((p) => p.id === id).cobrado_por, 'Marta G.');
  assert.equal(lista.find((p) => p.id === sinUsuario.id).cobrado_por, null);

  pagos.anularPago(id, dueno.id);
  const del_mes = pagos.resumenDelMes(fechaDesdeHoy(0).slice(0, 7)).pagos.find((p) => p.id === id);
  assert.equal(del_mes.cobrado_por, 'Marta G.');
  assert.equal(del_mes.anulado_por_nombre, 'Dueño');
});

test('migración 5 sobre una base de la versión 4 con datos: no pierde nada', () => {
  const { socioId } = crearSocioConPlan(sistema, '30777666');
  const { plan } = crearSocioConPlan(sistema, '30777555');
  pagos.registrarPago({
    socioId,
    planId: plan.id,
    montoCentavos: 1000,
    metodo: 'efectivo',
    fechaPago: fechaDesdeHoy(0),
    cubreDesde: fechaDesdeHoy(0),
  });
  const ruta = conexion.rutaBaseDeDatos();
  conexion.cerrarBaseDeDatos();

  // Dejamos la base como estaba en la versión 4 (sin usuarios y sin las columnas nuevas)
  const vieja = new DatabaseSync(ruta);
  vieja.exec(`
    ALTER TABLE pagos DROP COLUMN usuario_id;
    ALTER TABLE pagos DROP COLUMN anulado_por;
    DROP TABLE usuarios;
    PRAGMA user_version = 4;
  `);
  const pagosAntes = vieja.prepare('SELECT COUNT(*) AS n FROM pagos').get().n;
  const sociosAntes = vieja.prepare('SELECT COUNT(*) AS n FROM socios').get().n;
  vieja.close();

  conexion.iniciarBaseDeDatos(); // aplica la migración 5
  assert.equal(db().pragma('user_version', { simple: true }), conexion.VERSION_BASE);
  assert.equal(db().prepare('SELECT COUNT(*) AS n FROM pagos').get().n, pagosAntes);
  assert.equal(db().prepare('SELECT COUNT(*) AS n FROM socios').get().n, sociosAntes);
  assert.equal(usuarios.hayUsuarios(), false); // vuelve a pedir crear al administrador
  assert.equal(db().prepare('SELECT usuario_id FROM pagos LIMIT 1').get().usuario_id, null);
});

test('guardia: todos los canales del main declaran permiso y los delicados son de administrador', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const canales = [...codigo.matchAll(/manejar\('([^']+)',\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
  const total = (codigo.match(/^manejar\('/gm) ?? []).length;
  assert.equal(canales.length, total, 'hay un canal sin permiso');
  for (const [, permiso] of canales) assert.ok(['libre', 'sesion', 'admin'].includes(permiso));

  const permisoDe = Object.fromEntries(canales);
  for (const canal of [
    'pagos:anular', 'pagos:resumen-mes', 'resumen:obtener', 'planes:crear', 'planes:actualizar',
    'planes:cambiar-estado', 'planes:aplicar-aumento', 'planes:calcular-aumento', 'socios:cambiar-estado',
    'configuracion:guardar', 'copias:listar', 'copias:hacer', 'copias:elegir-carpeta', 'copias:restaurar',
    'sistema:info', 'usuarios:listar', 'usuarios:guardar', 'usuarios:cambiar-estado',
  ]) {
    assert.equal(permisoDe[canal], 'admin', `${canal} tiene que ser solo de administrador`);
  }
  // Lo que se puede hacer sin PIN es lo mínimo para entrar
  const libres = Object.keys(permisoDe).filter((c) => permisoDe[c] === 'libre').sort();
  assert.deepEqual(libres, [
    'configuracion:obtener', 'sesion:crear-admin', 'sesion:entrar', 'sesion:estado', 'sesion:salir',
  ]);
});
