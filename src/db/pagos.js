// db/pagos.js — Cobro de cuotas, anulaciones y recaudación del mes.

const { obtenerDb, texto, validarId, hoy, fechaObligatoria } = require('./conexion');

const METODOS = ['efectivo', 'transferencia', 'debito', 'credito'];

// El vencimiento del socio = el último día cubierto por sus pagos NO anulados.
// Es la ÚNICA función que modifica socios.vence_el: así nunca queda desincronizado.
function recalcularVencimiento(socioId) {
  obtenerDb()
    .prepare(
      `UPDATE socios
       SET vence_el = (SELECT MAX(cubre_hasta) FROM pagos
                       WHERE socio_id = @id AND anulado = 0)
       WHERE id = @id`
    )
    .run({ id: socioId });
}

function limpiarPago(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos inválidos');

  const pago = {
    socioId: Number(datos.socioId),
    planId: Number(datos.planId),
    montoCentavos: Number(datos.montoCentavos),
    metodo: String(datos.metodo ?? ''),
    fechaPago: fechaObligatoria(datos.fechaPago, 'Fecha de pago'),
    cubreDesde: fechaObligatoria(datos.cubreDesde, 'Cubre desde'),
    notas: texto(datos.notas, 200),
  };

  validarId(pago.socioId, 'Socio');
  validarId(pago.planId, 'Plan');
  if (!Number.isInteger(pago.montoCentavos) || pago.montoCentavos <= 0) {
    throw new Error('El monto debe ser mayor a cero');
  }
  if (!METODOS.includes(pago.metodo)) throw new Error('Elegí un medio de pago');
  if (pago.fechaPago > hoy()) throw new Error('La fecha de pago no puede ser futura');

  return pago;
}

function registrarPago(datos) {
  const pago = limpiarPago(datos);
  const db = obtenerDb();

  // TRANSACCIÓN: guardar el pago, cambiar el plan del socio y actualizar su
  // vencimiento son una sola operación. Si algo falla, no queda nada a medias.
  const registrar = db.transaction(() => {
    const socio = db
      .prepare('SELECT id, activo, plan_id FROM socios WHERE id = ?')
      .get(pago.socioId);
    if (!socio) throw new Error('El socio no existe');
    if (!socio.activo) {
      throw new Error('El socio está dado de baja. Reactivalo antes de registrar un pago.');
    }

    const plan = db
      .prepare('SELECT id, nombre, duracion_dias, activo FROM planes WHERE id = ?')
      .get(pago.planId);
    if (!plan) throw new Error('El plan no existe');
    if (!plan.activo && plan.id !== socio.plan_id) throw new Error('Ese plan está desactivado');

    // Último día cubierto = desde + (duración - 1).
    // Un plan de 30 días que empieza el 1/11 cubre hasta el 30/11 inclusive.
    // El "hasta" lo calcula SIEMPRE el main: no confiamos en lo que mande la ventana.
    const { hasta } = db
      .prepare(`SELECT date(@desde, '+' || (@dias - 1) || ' days') AS hasta`)
      .get({ desde: pago.cubreDesde, dias: plan.duracion_dias });

    // plan_nombre y monto se guardan como "foto" del momento:
    // si mañana el plan cambia de nombre o de precio, este pago no cambia.
    const resultado = db
      .prepare(
        `INSERT INTO pagos (socio_id, plan_id, plan_nombre, monto_centavos, metodo,
                            fecha_pago, cubre_desde, cubre_hasta, notas)
         VALUES (@socioId, @planId, @planNombre, @montoCentavos, @metodo,
                 @fechaPago, @cubreDesde, @cubreHasta, @notas)`
      )
      .run({ ...pago, planNombre: plan.nombre, cubreHasta: hasta });

    // Si pagó un plan distinto al que tenía, queda anotado en el nuevo
    db.prepare('UPDATE socios SET plan_id = ? WHERE id = ?').run(plan.id, socio.id);
    recalcularVencimiento(socio.id);

    return { id: resultado.lastInsertRowid, cubreHasta: hasta };
  });

  return registrar();
}

// Anular NO borra: el pago queda registrado (para el control de caja)
// y el vencimiento del socio se recalcula sin contarlo.
function anularPago(id) {
  validarId(id);
  const db = obtenerDb();

  const anular = db.transaction(() => {
    const pago = db.prepare('SELECT id, socio_id, anulado FROM pagos WHERE id = ?').get(id);
    if (!pago) throw new Error('El pago no existe');
    if (pago.anulado) throw new Error('Ese pago ya estaba anulado');

    db.prepare(
      `UPDATE pagos SET anulado = 1, anulado_en = datetime('now', 'localtime') WHERE id = ?`
    ).run(id);
    recalcularVencimiento(pago.socio_id);

    return { id };
  });

  return anular();
}

function listarPagosDeSocio(socioId) {
  validarId(socioId, 'Socio');
  return obtenerDb()
    .prepare(
      `SELECT * FROM pagos
       WHERE socio_id = ?
       ORDER BY fecha_pago DESC, id DESC
       LIMIT 12`
    )
    .all(socioId);
}

// mes = "2026-11"
function resumenDelMes(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw new Error('Mes inválido');

  // Truco: de "2026-11-01" a "2026-11-31" abarca todo noviembre aunque tenga 30 días,
  // porque las fechas se comparan como texto ("2026-11-30" < "2026-11-31" < "2026-12-01").
  const rango = { desde: `${mes}-01`, hasta: `${mes}-31` };
  const db = obtenerDb();

  const pagos = db
    .prepare(
      `SELECT p.*, s.nombre || ' ' || s.apellido AS socio
       FROM pagos p
       JOIN socios s ON s.id = p.socio_id
       WHERE p.fecha_pago BETWEEN @desde AND @hasta
       ORDER BY p.fecha_pago DESC, p.id DESC`
    )
    .all(rango);

  // Los totales NO cuentan los pagos anulados
  const totales = db
    .prepare(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_centavos), 0) AS total
       FROM pagos
       WHERE fecha_pago BETWEEN @desde AND @hasta AND anulado = 0`
    )
    .get(rango);

  const porMetodo = db
    .prepare(
      `SELECT metodo, COUNT(*) AS cantidad, SUM(monto_centavos) AS total
       FROM pagos
       WHERE fecha_pago BETWEEN @desde AND @hasta AND anulado = 0
       GROUP BY metodo
       ORDER BY total DESC`
    )
    .all(rango);

  return { pagos, cantidad: totales.cantidad, total: totales.total, porMetodo };
}

module.exports = { registrarPago, anularPago, listarPagosDeSocio, resumenDelMes };
