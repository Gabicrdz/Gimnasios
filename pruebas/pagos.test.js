// pruebas/pagos.test.js — Cuotas, vencimientos, anulaciones, aumento de precios y resumen.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarSistema, crearSocioConPlan, fechaDesdeHoy } = require('./ayudantes');

const sistema = iniciarSistema();
const { socios, pagos, planes } = sistema;
const { plan, socioId } = crearSocioConPlan(sistema);

function pagar(cubreDesde, extra = {}) {
  return pagos.registrarPago({
    socioId,
    planId: plan.id,
    montoCentavos: plan.precio_centavos,
    metodo: 'efectivo',
    fechaPago: fechaDesdeHoy(0),
    cubreDesde,
    ...extra,
  });
}

test('un plan de 30 días que empieza hoy cubre hasta dentro de 29 días', () => {
  const { cubreHasta } = pagar(fechaDesdeHoy(0));
  assert.equal(cubreHasta, fechaDesdeHoy(29));
  const socio = socios.obtenerSocio(socioId);
  assert.equal(socio.vence_el, fechaDesdeHoy(29));
  assert.equal(socio.estado, 'al_dia');
  assert.equal(socio.dias_restantes, 29);
});

test('el estado cambia según los días que faltan', () => {
  const otro = socios.crearSocio({ nombre: 'Ana', apellido: 'Gómez', dni: '35555555' }).id;
  const pagarOtro = (desde) =>
    pagos.registrarPago({
      socioId: otro, planId: plan.id, montoCentavos: 100, metodo: 'debito',
      fechaPago: fechaDesdeHoy(-40), cubreDesde: desde,
    });

  pagarOtro(fechaDesdeHoy(-40)); // vence hace 11 días
  assert.equal(socios.obtenerSocio(otro).estado, 'vencido');

  const { id } = pagarOtro(fechaDesdeHoy(-27)); // vence en 2 días
  assert.equal(socios.obtenerSocio(otro).estado, 'por_vencer');

  pagos.anularPago(id); // al anular, vuelve a estar vencido
  assert.equal(socios.obtenerSocio(otro).estado, 'vencido');
});

test('anular no borra el pago y no se puede anular dos veces', () => {
  const { id } = pagar(fechaDesdeHoy(30)); // renovación: vence en 59 días
  assert.equal(socios.obtenerSocio(socioId).vence_el, fechaDesdeHoy(59));

  pagos.anularPago(id);
  assert.equal(socios.obtenerSocio(socioId).vence_el, fechaDesdeHoy(29));
  assert.equal(pagos.listarPagosDeSocio(socioId).find((p) => p.id === id).anulado, 1);
  assert.throws(() => pagos.anularPago(id), { message: 'Ese pago ya estaba anulado' });
});

test('rechaza pagos inválidos', () => {
  assert.throws(() => pagar(fechaDesdeHoy(0), { montoCentavos: 0 }), { message: 'El monto debe ser mayor a cero' });
  assert.throws(() => pagar(fechaDesdeHoy(0), { metodo: 'bitcoin' }), { message: 'Elegí un medio de pago' });
  assert.throws(() => pagar(fechaDesdeHoy(0), { fechaPago: fechaDesdeHoy(1) }), {
    message: 'La fecha de pago no puede ser futura',
  });
  assert.throws(() => pagar('2026-02-30'));
});

test('a un socio dado de baja no se le cobra', () => {
  const baja = socios.crearSocio({ nombre: 'Leo', apellido: 'Ruiz', dni: '36666666' }).id;
  socios.cambiarEstadoSocio(baja, false);
  assert.throws(
    () => pagos.registrarPago({
      socioId: baja, planId: plan.id, montoCentavos: 100, metodo: 'efectivo',
      fechaPago: fechaDesdeHoy(0), cubreDesde: fechaDesdeHoy(0),
    }),
    /dado de baja/
  );
});

test('el resumen del mes no cuenta los pagos anulados', () => {
  const mes = fechaDesdeHoy(0).slice(0, 7);
  const resumen = pagos.resumenDelMes(mes);
  const sinAnular = resumen.pagos.filter((p) => p.anulado === 0 && p.fecha_pago.startsWith(mes));
  assert.equal(resumen.cantidad, sinAnular.length);
  assert.equal(resumen.total, sinAnular.reduce((suma, p) => suma + p.monto_centavos, 0));
  assert.throws(() => pagos.resumenDelMes('2026-13'), { message: 'Mes inválido' });
});

test('el pago guarda el nombre del plan como "foto"', () => {
  planes.actualizarPlan(plan.id, { nombre: 'Libre', precioCentavos: plan.precio_centavos, duracionDias: 30 });
  assert.equal(pagos.listarPagosDeSocio(socioId)[0].plan_nombre, 'Mensual libre');
});

test('aumento de precios: vista previa con redondeo y aplicar', () => {
  // $25.000 + 10% = $27.500 ; $18.000 + 10% = $19.800 ; $65.000 + 10% = $71.500
  const vista = planes.calcularAumento({ porcentaje: 10, redondeo: 50000 });
  assert.deepEqual(vista.map((c) => c.nuevo), [2000000, 2750000, 7150000]);

  // calcular NO guarda nada
  assert.equal(planes.listarPlanes({}).find((p) => p.id === plan.id).precio_centavos, 2500000);

  assert.equal(planes.aplicarAumento({ porcentaje: 10, redondeo: 50000 }).cantidad, 3);
  assert.equal(planes.listarPlanes({}).find((p) => p.id === plan.id).precio_centavos, 2750000);

  assert.throws(() => planes.calcularAumento({ porcentaje: 0, redondeo: 1 }));
  assert.throws(() => planes.calcularAumento({ porcentaje: 10, redondeo: 7 }));
});
