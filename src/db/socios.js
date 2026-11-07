// db/socios.js — Socios del gimnasio y el estado de su cuota.

const {
  obtenerDb,
  texto,
  validarId,
  fechaOpcional,
  hoy,
  normalizar,
  camposDeBusqueda,
} = require('./conexion');

// "Por vencer" = le quedan esta cantidad de días o menos
const DIAS_AVISO = 5;

const ESTADOS = ['al_dia', 'por_vencer', 'vencido', 'sin_pagos'];

// En LIKE, "%" y "_" son comodines. Si alguien busca "%", los escapamos
// con una barra invertida para que se busquen como texto y no traigan a todos.
function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

// "30.123.456" o "30 123 456" → "30123456" (en la base, siempre solo números)
function normalizarDni(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function limpiarSocio(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos inválidos');

  const socio = {
    nombre: texto(datos.nombre, 60),
    apellido: texto(datos.apellido, 60),
    dni: normalizarDni(datos.dni),
    telefono: texto(datos.telefono, 30),
    fechaNacimiento: fechaOpcional(datos.fechaNacimiento),
    planId: datos.planId ? Number(datos.planId) : null,
    notas: texto(datos.notas, 500),
  };

  if (!socio.nombre) throw new Error('El nombre es obligatorio');
  if (!socio.apellido) throw new Error('El apellido es obligatorio');
  if (!/^\d{7,8}$/.test(socio.dni)) throw new Error('El DNI debe tener 7 u 8 números');
  if (socio.planId !== null) validarId(socio.planId, 'Plan');

  return socio;
}

function traducirError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new Error('Ya existe un socio con ese DNI');
  }
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new Error('El plan elegido no existe');
  }
  return error;
}

// El socio + el nombre de su plan + el estado de la cuota, calculado HOY.
// El estado no se guarda: se calcula en cada consulta, así nunca queda viejo.
// @hoy lo manda JavaScript (función hoy() de conexion.js): UNA sola fuente para la fecha
// de hoy, así SQLite y JavaScript nunca piensan que es un día distinto.
// (DIAS_AVISO es un número nuestro, no del usuario: por eso es seguro ponerlo con ${})
const CONSULTA_SOCIOS = `
  SELECT s.*,
         p.nombre AS plan,
         CASE
           WHEN s.vence_el IS NULL THEN 'sin_pagos'
           WHEN s.vence_el < @hoy THEN 'vencido'
           WHEN s.vence_el <= date(@hoy, '+${DIAS_AVISO} days') THEN 'por_vencer'
           ELSE 'al_dia'
         END AS estado,
         CAST(julianday(s.vence_el) - julianday(@hoy) AS INTEGER) AS dias_restantes
  FROM socios s
  LEFT JOIN planes p ON p.id = s.plan_id
`;

function listarSocios(filtros) {
  const busqueda = texto(filtros?.busqueda, 60);
  const mostrar = ['activos', 'bajas', 'todos'].includes(filtros?.mostrar)
    ? filtros.mostrar
    : 'activos';
  const estado = ESTADOS.includes(filtros?.estado) ? filtros.estado : 'todos';

  // Usamos la consulta de arriba como si fuera una tabla (subconsulta),
  // así podemos filtrar por "estado", que es una columna calculada.
  return obtenerDb()
    .prepare(
      `SELECT * FROM (${CONSULTA_SOCIOS}) AS s
       WHERE (
           s.busqueda LIKE @patron ESCAPE '\\'
           OR (@dni <> '' AND s.dni LIKE '%' || @dni || '%')
         )
         AND (
           @mostrar = 'todos'
           OR (@mostrar = 'activos' AND s.activo = 1)
           OR (@mostrar = 'bajas' AND s.activo = 0)
         )
         AND (@estado = 'todos' OR s.estado = @estado)
       ORDER BY
         CASE WHEN @estado = 'vencido' THEN s.vence_el END,
         s.orden`
    )
    .all({
      patron: `%${escaparLike(normalizar(busqueda))}%`, // "pérez" o "PEREZ" → "%perez%"
      dni: normalizarDni(busqueda),
      mostrar,
      estado,
      hoy: hoy(),
    });
}

function obtenerSocio(id) {
  validarId(id);
  const socio = obtenerDb()
    .prepare(`SELECT * FROM (${CONSULTA_SOCIOS}) AS s WHERE s.id = @id`)
    .get({ id, hoy: hoy() });
  if (!socio) throw new Error('El socio no existe');
  return socio;
}

function crearSocio(datos) {
  const socio = limpiarSocio(datos);
  try {
    const resultado = obtenerDb()
      .prepare(
        `INSERT INTO socios (nombre, apellido, dni, telefono, fecha_nacimiento, plan_id, notas,
                             busqueda, orden)
         VALUES (@nombre, @apellido, @dni, @telefono, @fechaNacimiento, @planId, @notas,
                 @busqueda, @orden)`
      )
      .run({ ...socio, ...camposDeBusqueda(socio.nombre, socio.apellido) });
    return { id: resultado.lastInsertRowid };
  } catch (error) {
    throw traducirError(error);
  }
}

function actualizarSocio(id, datos) {
  validarId(id);
  const socio = limpiarSocio(datos);
  try {
    const resultado = obtenerDb()
      .prepare(
        `UPDATE socios
         SET nombre = @nombre, apellido = @apellido, dni = @dni, telefono = @telefono,
             fecha_nacimiento = @fechaNacimiento, plan_id = @planId, notas = @notas,
             busqueda = @busqueda, orden = @orden
         WHERE id = @id`
      )
      .run({ ...socio, ...camposDeBusqueda(socio.nombre, socio.apellido), id });
    if (resultado.changes === 0) throw new Error('El socio ya no existe');
    return { id };
  } catch (error) {
    throw traducirError(error);
  }
}

// Baja lógica: el socio y su historial se conservan
function cambiarEstadoSocio(id, activo) {
  validarId(id);
  const resultado = obtenerDb()
    .prepare('UPDATE socios SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id);
  if (resultado.changes === 0) throw new Error('El socio ya no existe');
  return { id, activo: Boolean(activo) };
}

module.exports = { listarSocios, obtenerSocio, crearSocio, actualizarSocio, cambiarEstadoSocio };
