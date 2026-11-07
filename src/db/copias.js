// db/copias.js — Copias de seguridad de la base de datos.
//
// Cuándo se hacen:
//   · Al abrir el sistema, si todavía no hay copia de hoy.
//   · Al cerrar el sistema (actualiza la copia del día con todo lo de hoy).
//   · Cuando el usuario toca "Hacer copia ahora".
//   · Antes de restaurar otra copia (por si se arrepiente).
//
// Nombres de los archivos:
//   gimnasio-2026-11-06.db                              ← automática (una por día)
//   gimnasio-2026-11-06_18-30_manual.db                 ← manual
//   gimnasio-2026-11-06_18-30_antes-de-restaurar.db     ← antes de restaurar

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { app } = require('electron');
const {
  obtenerDb,
  cerrarBaseDeDatos,
  rutaBaseDeDatos,
  VERSION_BASE,
  hoy,
  horaActual,
} = require('./conexion');

// Cuántas copias automáticas (diarias) se guardan. Las más viejas se borran solas.
const COPIAS_AUTOMATICAS_A_GUARDAR = 30;

const PATRON_COPIA = /^gimnasio-\d{4}-\d{2}-\d{2}(_\d{2}-\d{2}_(manual|antes-de-restaurar))?\.db$/;
const PATRON_AUTOMATICA = /^gimnasio-\d{4}-\d{2}-\d{2}\.db$/;
const TIPOS = ['automatica', 'manual', 'antes-de-restaurar'];

// Si la última copia automática falló (por ejemplo, se desconectó el pendrive),
// lo guardamos para mostrarlo en Ajustes.
let ultimoError = null;

// ---------- Carpeta de copias ----------
function carpetaPorDefecto() {
  return path.join(app.getPath('documents'), 'Copias del gimnasio');
}

function carpetaDeCopias() {
  const fila = obtenerDb()
    .prepare("SELECT valor FROM configuracion WHERE clave = 'carpeta_copias'")
    .get();
  return fila?.valor || carpetaPorDefecto();
}

function cambiarCarpeta(carpeta) {
  if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
    throw new Error('La carpeta elegida no existe');
  }

  // Probamos que se pueda escribir ahí (un pendrive protegido, por ejemplo, no deja)
  const prueba = path.join(carpeta, '.prueba-de-escritura');
  try {
    fs.writeFileSync(prueba, 'ok');
    fs.rmSync(prueba, { force: true });
  } catch {
    throw new Error('No se puede guardar en esa carpeta. Elegí otra.');
  }

  obtenerDb()
    .prepare(
      `INSERT INTO configuracion (clave, valor) VALUES ('carpeta_copias', ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    .run(carpeta);

  return carpeta;
}

// ---------- Hacer copias ----------
function nombreDeCopia(tipo) {
  const fecha = hoy();
  if (tipo === 'automatica') return `gimnasio-${fecha}.db`;
  return `gimnasio-${fecha}_${horaActual().replace(':', '-')}_${tipo}.db`;
}

function hacerCopia(tipo = 'manual') {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de copia inválido');

  const carpeta = carpetaDeCopias();
  try {
    fs.mkdirSync(carpeta, { recursive: true });
  } catch {
    throw new Error(`No se puede usar la carpeta de copias: ${carpeta}`);
  }

  const destino = path.join(carpeta, nombreDeCopia(tipo));
  const temporal = `${destino}.tmp`;
  fs.rmSync(temporal, { force: true });

  // VACUUM INTO: SQLite escribe una copia completa y consistente en un solo archivo,
  // aunque la base esté abierta. Primero va a un archivo temporal y después se renombra:
  // si se corta la luz a la mitad, la copia anterior sigue entera.
  obtenerDb().prepare('VACUUM INTO ?').run(temporal);
  fs.renameSync(temporal, destino);

  if (tipo === 'automatica') borrarCopiasViejas(carpeta);
  ultimoError = null;

  return { nombre: path.basename(destino), carpeta };
}

function borrarCopiasViejas(carpeta) {
  const automaticas = fs
    .readdirSync(carpeta)
    .filter((nombre) => PATRON_AUTOMATICA.test(nombre))
    .sort()
    .reverse(); // las más nuevas primero (el nombre empieza con la fecha)

  for (const nombre of automaticas.slice(COPIAS_AUTOMATICAS_A_GUARDAR)) {
    fs.rmSync(path.join(carpeta, nombre), { force: true });
  }
}

// Copia automática: no debe frenar el sistema si falla, solo avisar en Ajustes
function copiaAutomatica({ soloSiNoHayDeHoy }) {
  try {
    if (soloSiNoHayDeHoy) {
      const destino = path.join(carpetaDeCopias(), nombreDeCopia('automatica'));
      if (fs.existsSync(destino)) return null;
    }
    return hacerCopia('automatica');
  } catch (error) {
    ultimoError = error.message;
    console.error('No se pudo hacer la copia automática:', error);
    return null;
  }
}

// ---------- Listar ----------
function fechaHoraLocal(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ` +
    `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  );
}

function listarCopias() {
  const carpeta = carpetaDeCopias();
  if (!fs.existsSync(carpeta)) return { carpeta, existe: false, copias: [], ultimoError };

  const copias = fs
    .readdirSync(carpeta)
    .filter((nombre) => PATRON_COPIA.test(nombre))
    .map((nombre) => {
      const datos = fs.statSync(path.join(carpeta, nombre));
      const tipo = nombre.includes('_manual')
        ? 'manual'
        : nombre.includes('_antes-de-restaurar')
          ? 'antes-de-restaurar'
          : 'automatica';
      return { nombre, tipo, bytes: datos.size, modificada: fechaHoraLocal(datos.mtime) };
    })
    .sort((a, b) => b.modificada.localeCompare(a.modificada));

  return { carpeta, existe: true, copias, ultimoError };
}

// ---------- Restaurar ----------
// Para restaurar desde la lista: la ventana solo manda el NOMBRE del archivo,
// nunca una ruta. Así no puede pedir que se lea cualquier archivo de la compu.
function rutaDeCopia(nombre) {
  const texto = String(nombre ?? '');
  if (!PATRON_COPIA.test(texto) || path.basename(texto) !== texto) {
    throw new Error('Copia inválida');
  }
  const ruta = path.join(carpetaDeCopias(), texto);
  if (!fs.existsSync(ruta)) throw new Error('Esa copia ya no existe');
  return ruta;
}

// Revisa que el archivo sea una copia de ESTE sistema antes de usarlo
function validarArchivoDeCopia(ruta) {
  let copia;
  try {
    copia = new Database(ruta, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error('No se pudo abrir el archivo.');
  }

  try {
    const tablas = copia
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((tabla) => tabla.name);
    if (!tablas.includes('socios') || !tablas.includes('planes')) {
      throw new Error('NO_ES_COPIA');
    }

    const version = copia.pragma('user_version', { simple: true });
    if (version > VERSION_BASE) throw new Error('VERSION_NUEVA');

    const { cantidad } = copia.prepare('SELECT COUNT(*) AS cantidad FROM socios').get();
    return { version, socios: cantidad };
  } catch (error) {
    if (error.message === 'VERSION_NUEVA') {
      throw new Error(
        'La copia es de una versión más nueva del sistema. Actualizá el programa antes de restaurarla.'
      );
    }
    throw new Error('El archivo no es una copia de seguridad de este sistema.');
  } finally {
    copia.close();
  }
}

// Reemplaza la base actual por la copia. Después hay que reiniciar el programa
// (lo hace index.js) para que abra la base nueva y le aplique las migraciones que falten.
function restaurarCopia(ruta) {
  const info = validarArchivoDeCopia(ruta);

  // Por si se arrepiente: guardamos cómo estaba todo justo antes
  const respaldo = hacerCopia('antes-de-restaurar');

  const destino = rutaBaseDeDatos();
  cerrarBaseDeDatos();
  // Los archivos -wal y -shm son de la base vieja: hay que sacarlos
  for (const extra of ['-wal', '-shm']) fs.rmSync(destino + extra, { force: true });
  fs.copyFileSync(ruta, destino);

  return { ...info, respaldo: respaldo.nombre };
}

module.exports = {
  carpetaDeCopias,
  cambiarCarpeta,
  hacerCopia,
  copiaAutomatica,
  listarCopias,
  rutaDeCopia,
  validarArchivoDeCopia,
  restaurarCopia,
};
