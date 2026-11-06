// db/resumen.js — Los datos del panel "Resumen": todo lo que el dueño quiere ver de un vistazo.

const { obtenerDb, hoy } = require('./conexion');
const { listarSocios } = require('./socios');
const { resumenDelMes } = require('./pagos');

// "No viene hace X días" = socios en riesgo de darse de baja
const DIAS_SIN_VENIR = 14;

function dosDigitos(numero) {
  return String(numero).padStart(2, '0');
}

// "2026-11" → "2026-10"
function mesAnteriorDe(mes) {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const fecha = new Date(anio, numeroMes - 2, 1);
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`;
}

function obtenerResumen() {
  const db = obtenerDb();
  const fechaHoy = hoy();
  const mes = fechaHoy.slice(0, 7);
  const mesAnterior = mesAnteriorDe(mes);
  const diaDelMes = fechaHoy.slice(8, 10);

  // ---------- Cuotas ----------
  // Reutilizamos listarSocios: el estado de la cuota se calcula en UN solo lugar
  const activos = listarSocios({ mostrar: 'activos' });
  const contar = (estado) => activos.filter((s) => s.estado === estado).length;

  const cuotas = {
    activos: activos.length,
    al_dia: contar('al_dia'),
    por_vencer: contar('por_vencer'),
    vencido: contar('vencido'),
    sin_pagos: contar('sin_pagos'),
  };

  const porVencer = activos
    .filter((s) => s.estado === 'por_vencer')
    .sort((a, b) => a.dias_restantes - b.dias_restantes);

  // Los que vencieron hace menos tiempo primero: son los más fáciles de recuperar
  const vencidos = activos
    .filter((s) => s.estado === 'vencido')
    .sort((a, b) => b.dias_restantes - a.dias_restantes);

  const cumpleanios = activos.filter(
    (s) => s.fecha_nacimiento && s.fecha_nacimiento.slice(5) === fechaHoy.slice(5)
  );

  const nuevosEsteMes = activos.filter((s) => s.creado_en.slice(0, 7) === mes).length;

  // ---------- Socios que dejaron de venir ----------
  // Pagan (al día o por vencer) pero no vienen hace DIAS_SIN_VENIR días o más
  const ultimas = new Map(
    db
      .prepare('SELECT socio_id, MAX(fecha) AS ultima FROM asistencias GROUP BY socio_id')
      .all()
      .map((fila) => [fila.socio_id, fila.ultima])
  );
  const limite = db
    .prepare(`SELECT date(?, '-${DIAS_SIN_VENIR} days') AS limite`)
    .get(fechaHoy).limite;

  const sinVenir = activos
    .filter((s) => s.estado === 'al_dia' || s.estado === 'por_vencer')
    .filter((s) => s.creado_en.slice(0, 10) <= limite) // los recién anotados no cuentan
    .map((s) => ({ ...s, ultima_visita: ultimas.get(s.id) ?? null }))
    .filter((s) => s.ultima_visita === null || s.ultima_visita <= limite)
    .sort((a, b) => (a.ultima_visita ?? '').localeCompare(b.ultima_visita ?? ''));

  // ---------- Plata ----------
  const recaudadoMes = resumenDelMes(mes).total;

  // Para comparar justo: el mes anterior hasta el MISMO día (del 1 al 6, por ejemplo)
  const recaudadoMesAnteriorMismoDia = db
    .prepare(
      `SELECT COALESCE(SUM(monto_centavos), 0) AS total FROM pagos
       WHERE anulado = 0 AND fecha_pago BETWEEN @desde AND @hasta`
    )
    .get({ desde: `${mesAnterior}-01`, hasta: `${mesAnterior}-${diaDelMes}` }).total;

  // ---------- Asistencia ----------
  const ingresosHoy = db
    .prepare('SELECT COUNT(*) AS cantidad FROM asistencias WHERE fecha = ?')
    .get(fechaHoy).cantidad;

  const ultimos30 = db
    .prepare(
      `SELECT COUNT(*) AS ingresos, COUNT(DISTINCT fecha) AS dias
       FROM asistencias
       WHERE fecha BETWEEN date(@hoy, '-30 days') AND date(@hoy, '-1 day')`
    )
    .get({ hoy: fechaHoy });

  // Ingresos por hora en los últimos 30 días (para el gráfico de horarios pico)
  const porHora = db
    .prepare(
      `SELECT CAST(substr(hora, 1, 2) AS INTEGER) AS h, COUNT(*) AS cantidad
       FROM asistencias
       WHERE fecha BETWEEN date(@hoy, '-30 days') AND @hoy
       GROUP BY h
       ORDER BY h`
    )
    .all({ hoy: fechaHoy });

  return {
    fecha: fechaHoy,
    mes,
    mesAnterior,
    cuotas,
    nuevosEsteMes,
    porVencer,
    vencidos,
    cumpleanios,
    sinVenir,
    diasSinVenir: DIAS_SIN_VENIR,
    recaudadoMes,
    recaudadoMesAnteriorMismoDia,
    ingresosHoy,
    promedioDiario: ultimos30.dias > 0 ? Math.round(ultimos30.ingresos / ultimos30.dias) : 0,
    porHora,
  };
}

module.exports = { obtenerResumen };
