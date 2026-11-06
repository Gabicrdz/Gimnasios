// ui/vista-pagos.js — Pagos del mes: recaudación total, por medio de pago y detalle.

(() => {
  const inputMes = document.getElementById('pagos-mes');
  const total = document.getElementById('pagos-total');
  const cantidad = document.getElementById('pagos-cantidad');
  const metodos = document.getElementById('pagos-metodos');
  const tabla = document.getElementById('tabla-pagos');
  const vacio = document.getElementById('pagos-vacio');

  async function cargar() {
    if (!inputMes.value) inputMes.value = mesActual();

    const resumen = await pedir(window.api.resumenPagosMes(inputMes.value));
    if (resumen === null) return;

    // Tarjetas
    total.textContent = pesos(resumen.total);
    cantidad.textContent = resumen.cantidad;

    metodos.replaceChildren(
      ...(resumen.porMetodo.length > 0
        ? resumen.porMetodo.map((m) =>
            crear('div', { clase: 'fila-metodo' }, [
              crear('span', { texto: `${METODOS_PAGO[m.metodo]} (${m.cantidad})` }),
              crear('strong', { texto: pesos(m.total) }),
            ])
          )
        : [crear('span', { clase: 'texto-tenue', texto: 'Sin cobros este mes' })])
    );

    // Tabla (incluye los anulados, tachados, para el control de caja)
    tabla.replaceChildren(
      ...resumen.pagos.map((pago) =>
        crear('tr', { clase: pago.anulado ? 'anulado' : '' }, [
          crear('td', { texto: fechaCorta(pago.fecha_pago) }),
          crear('td', {}, [crear('strong', { texto: pago.socio })]),
          crear('td', { texto: pago.plan_nombre }),
          crear('td', {
            texto: `${fechaCorta(pago.cubre_desde)} al ${fechaCorta(pago.cubre_hasta)}`,
          }),
          crear('td', { texto: METODOS_PAGO[pago.metodo] }),
          crear('td', { clase: 'derecha monto', texto: pesos(pago.monto_centavos) }),
          crear('td', { clase: 'acciones-fila' }, [
            pago.anulado
              ? crear('span', { clase: 'insignia gris', texto: 'Anulado' })
              : crear('button', {
                  tipo: 'button',
                  clase: 'boton-texto',
                  texto: 'Anular',
                  alClick: async () => {
                    if (await anularPago(pago)) cargar();
                  },
                }),
          ]),
        ])
      )
    );

    vacio.hidden = resumen.pagos.length > 0;
  }

  inputMes.addEventListener('change', cargar);

  vistas.pagos = { alMostrar: cargar };
})();
