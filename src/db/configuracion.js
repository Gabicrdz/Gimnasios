// db/configuracion.js — Ajustes del sistema (por ahora, el nombre del gimnasio).
// Se guardan como pares clave → valor, así agregar un ajuste nuevo no necesita
// cambiar la estructura de la tabla.

const { obtenerDb, texto } = require('./conexion');

// Valores por defecto si una clave todavía no existe en la base
const POR_DEFECTO = {
  nombre_gimnasio: 'Mi Gimnasio',
};

function obtenerConfiguracion() {
  const filas = obtenerDb().prepare('SELECT clave, valor FROM configuracion').all();
  const configuracion = { ...POR_DEFECTO };
  for (const fila of filas) configuracion[fila.clave] = fila.valor;
  return configuracion;
}

function guardarConfiguracion(datos) {
  const nombre = texto(datos?.nombre_gimnasio, 40);
  if (!nombre) throw new Error('El nombre del gimnasio es obligatorio');

  // INSERT ... ON CONFLICT: si la clave ya existe, actualiza su valor ("upsert")
  obtenerDb()
    .prepare(
      `INSERT INTO configuracion (clave, valor) VALUES ('nombre_gimnasio', ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    .run(nombre);

  return obtenerConfiguracion();
}

module.exports = { obtenerConfiguracion, guardarConfiguracion };
