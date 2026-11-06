// db/asistencias.js — Control de ingreso: quién entró al gimnasio y cuándo.

const { obtenerDb, validarId, hoy, horaActual } = require('./conexion');
const { obtenerSocio } = require('./socios');

// Acepta el DNI escrito a mano ("30.123.456") o leído con un lector de código
// de barras del DNI argentino ("00123456789@PEREZ@JUAN@M@30123456@A@14/03/1985@...").
// En el código de barras los datos van separados por "@": buscamos el campo
// que tiene 7 u 8 números (el número de trámite tiene 11, así que no se confunde).
function extraerDni(entrada) {
  const textoEntrada = String(entrada ?? '').trim();

  if (textoEntrada.includes('@')) {
    const campo = textoEntrada.split('@').find((parte) => /^\d{7,8}$/.test(parte.trim()));
    return campo ? campo.trim() : '';
  }

  return textoEntrada.replace(/\D/g, '');
}

// Visitas del mes y última visita de un socio
function resumenAsistenciaSocio(socioId) {
  validarId(socioId, 'Socio');
  const db = obtenerDb();
  const mes = hoy().slice(0, 7);

  const { cantidad } = db
    .prepare(
      `SELECT COUNT(*) AS cantidad FROM asistencias
       WHERE socio_id = @id AND fecha BETWEEN @desde AND @hasta`
    )
    .get({ id: socioId, desde: `${mes}-01`, hasta: `${mes}-31` });

  const ultima = db
    .prepare(
      `SELECT fecha, hora FROM asistencias
       WHERE socio_id = ?
       ORDER BY fecha DESC, hora DESC, id DESC
       LIMIT 1`
    )
    .get(socioId);

  return { esteMes: cantidad, ultima: ultima ?? null };
}

// Registra el ingreso de un socio por su DNI.
// No lanza errores para los casos "normales" de la recepción (DNI desconocido,
// socio de baja, ya entró hoy): devuelve un "resultado" para que la pantalla
// muestre el mensaje que corresponde a cada caso.
function registrarIngreso(entrada) {
  const dni = extraerDni(entrada);
  if (!/^\d{7,8}$/.test(dni)) {
    return { resultado: 'dni_invalido', dni };
  }

  const db = obtenerDb();

  const registrar = db.transaction(() => {
    const fila = db.prepare('SELECT id FROM socios WHERE dni = ?').get(dni);
    if (!fila) return { resultado: 'no_encontrado', dni };

    const socio = obtenerSocio(fila.id); // trae el estado de la cuota calculado hoy
    if (!socio.activo) return { resultado: 'baja', socio };

    const fecha = hoy();

    // Una sola asistencia por día: si pasa la tarjeta dos veces, no se duplica
    const anterior = db
      .prepare('SELECT hora FROM asistencias WHERE socio_id = ? AND fecha = ? ORDER BY id LIMIT 1')
      .get(socio.id, fecha);
    if (anterior) {
      return {
        resultado: 'repetido',
        socio,
        horaAnterior: anterior.hora,
        asistencia: resumenAsistenciaSocio(socio.id),
      };
    }

    // Se registra SIEMPRE, aunque la cuota esté vencida: la decisión de dejarlo
    // pasar la toma la persona de recepción. Guardamos el estado como "foto".
    const hora = horaActual();
    db.prepare(
      'INSERT INTO asistencias (socio_id, fecha, hora, estado_cuota) VALUES (?, ?, ?, ?)'
    ).run(socio.id, fecha, hora, socio.estado);

    return { resultado: 'ok', socio, hora, asistencia: resumenAsistenciaSocio(socio.id) };
  });

  return registrar();
}

function ingresosDeHoy() {
  const fecha = hoy();
  const ingresos = obtenerDb()
    .prepare(
      `SELECT a.id, a.hora, a.estado_cuota, s.id AS socio_id, s.nombre, s.apellido
       FROM asistencias a
       JOIN socios s ON s.id = a.socio_id
       WHERE a.fecha = ?
       ORDER BY a.hora DESC, a.id DESC`
    )
    .all(fecha);

  return {
    fecha,
    ingresos,
    total: ingresos.length,
    conCuotaVencida: ingresos.filter((i) => i.estado_cuota === 'vencido').length,
  };
}

// Acá SÍ borramos: una asistencia cargada por error no es un dato contable
// (a diferencia de un pago). Solo se permite con los ingresos de hoy.
function eliminarIngreso(id) {
  validarId(id);
  const resultado = obtenerDb()
    .prepare('DELETE FROM asistencias WHERE id = ? AND fecha = ?')
    .run(id, hoy());
  if (resultado.changes === 0) throw new Error('Solo se pueden quitar ingresos de hoy');
  return { id };
}

module.exports = { registrarIngreso, ingresosDeHoy, eliminarIngreso, resumenAsistenciaSocio };
