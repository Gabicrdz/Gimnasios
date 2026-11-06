// db/planes.js — Planes del gimnasio: precio y duración de cada cuota.

const { obtenerDb, texto, validarId } = require('./conexion');

function limpiarPlan(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos inválidos');

  const plan = {
    nombre: texto(datos.nombre, 60),
    precioCentavos: Number(datos.precioCentavos),
    duracionDias: Number(datos.duracionDias),
  };

  if (!plan.nombre) throw new Error('El nombre del plan es obligatorio');
  if (!Number.isInteger(plan.precioCentavos) || plan.precioCentavos <= 0) {
    throw new Error('El precio debe ser mayor a cero');
  }
  if (!Number.isInteger(plan.duracionDias) || plan.duracionDias < 1 || plan.duracionDias > 366) {
    throw new Error('La duración debe ser entre 1 y 366 días');
  }
  return plan;
}

function traducirError(error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new Error('Ya existe un plan con ese nombre');
  }
  return error;
}

function listarPlanes(opciones) {
  const todos = opciones?.incluirInactivos ? 1 : 0;

  // La subconsulta (SELECT COUNT...) cuenta, para cada plan, cuántos socios activos lo tienen
  return obtenerDb()
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM socios s
               WHERE s.plan_id = p.id AND s.activo = 1) AS cantidad_socios
       FROM planes p
       WHERE @todos = 1 OR p.activo = 1
       ORDER BY p.activo DESC, p.precio_centavos`
    )
    .all({ todos });
}

function crearPlan(datos) {
  const plan = limpiarPlan(datos);
  try {
    const resultado = obtenerDb()
      .prepare(
        `INSERT INTO planes (nombre, precio_centavos, duracion_dias)
         VALUES (@nombre, @precioCentavos, @duracionDias)`
      )
      .run(plan);
    return { id: resultado.lastInsertRowid };
  } catch (error) {
    throw traducirError(error);
  }
}

function actualizarPlan(id, datos) {
  validarId(id);
  const plan = limpiarPlan(datos);
  try {
    const resultado = obtenerDb()
      .prepare(
        `UPDATE planes
         SET nombre = @nombre, precio_centavos = @precioCentavos, duracion_dias = @duracionDias
         WHERE id = @id`
      )
      .run({ ...plan, id });
    if (resultado.changes === 0) throw new Error('El plan ya no existe');
    return { id };
  } catch (error) {
    throw traducirError(error);
  }
}

// Baja lógica: no se borra, se desactiva
function cambiarEstadoPlan(id, activo) {
  validarId(id);
  const resultado = obtenerDb()
    .prepare('UPDATE planes SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id);
  if (resultado.changes === 0) throw new Error('El plan ya no existe');
  return { id, activo: Boolean(activo) };
}

// ---------- Actualización masiva de precios ----------
// Redondeos permitidos, en centavos: sin redondeo, a $100, a $500 o a $1.000
const REDONDEOS = [1, 10000, 50000, 100000];

// Calcula los precios nuevos de los planes activos SIN guardar nada (vista previa)
function calcularAumento(opciones) {
  const porcentaje = Number(opciones?.porcentaje);
  const redondeo = Number(opciones?.redondeo);

  if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 200) {
    throw new Error('El porcentaje tiene que ser mayor a 0 y como máximo 200');
  }
  if (!REDONDEOS.includes(redondeo)) throw new Error('Redondeo inválido');

  const planes = obtenerDb()
    .prepare('SELECT id, nombre, precio_centavos FROM planes WHERE activo = 1 ORDER BY precio_centavos')
    .all();

  return planes.map((plan) => {
    const conAumento = plan.precio_centavos * (1 + porcentaje / 100);
    // Redondea al múltiplo más cercano (por ejemplo, a $100): 27.540 → 27.500
    const nuevo = Math.max(redondeo, Math.round(conAumento / redondeo) * redondeo);
    return { id: plan.id, nombre: plan.nombre, actual: plan.precio_centavos, nuevo };
  });
}

// Aplica el aumento a todos los planes activos, todo junto o nada
function aplicarAumento(opciones) {
  const db = obtenerDb();
  const cambios = calcularAumento(opciones); // se recalcula acá: no confiamos en la ventana
  const actualizar = db.prepare('UPDATE planes SET precio_centavos = ? WHERE id = ?');

  const aplicar = db.transaction(() => {
    for (const cambio of cambios) actualizar.run(cambio.nuevo, cambio.id);
  });
  aplicar();

  return { cantidad: cambios.length };
}

module.exports = {
  listarPlanes,
  crearPlan,
  actualizarPlan,
  cambiarEstadoPlan,
  calcularAumento,
  aplicarAumento,
};
