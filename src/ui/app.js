// ui/app.js — Lo que comparte toda la interfaz: navegación, mensajes y pedidos al main.

// Cada vista-*.js se registra acá. Ejemplo: vistas.socios = { alMostrar: cargar }
const vistas = {};

// ---------- Navegación ----------
function mostrarVista(nombre) {
  for (const seccion of document.querySelectorAll('.vista')) {
    seccion.hidden = seccion.id !== `vista-${nombre}`;
  }
  for (const boton of document.querySelectorAll('[data-vista]')) {
    boton.classList.toggle('activo', boton.dataset.vista === nombre);
  }
  // Cada vez que se entra a una vista, recarga sus datos
  vistas[nombre]?.alMostrar?.();
}

for (const boton of document.querySelectorAll('[data-vista]')) {
  boton.addEventListener('click', () => mostrarVista(boton.dataset.vista));
}

// ---------- Mensajes flotantes ----------
const mensaje = document.getElementById('mensaje');
let temporizadorMensaje;

function mostrarMensaje(texto, tipo = 'exito') {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo} visible`;
  clearTimeout(temporizadorMensaje);
  temporizadorMensaje = setTimeout(() => mensaje.classList.remove('visible'), 3000);
}

// ---------- Pedidos al main ----------
// Si sale bien devuelve los datos. Si falla, muestra el error y devuelve null.
// errorEn (opcional): elemento donde mostrar el error, por ejemplo dentro de un diálogo.
async function pedir(promesa, errorEn) {
  const respuesta = await promesa;
  if (respuesta.ok) return respuesta.datos;

  if (errorEn) errorEn.textContent = respuesta.error;
  else mostrarMensaje(respuesta.error, 'error');
  return null;
}

async function confirmar(opciones) {
  const respuesta = await window.api.confirmar(opciones);
  return respuesta.ok && respuesta.datos === true;
}

// ---------- Acciones que usan varias vistas ----------
// Devuelve true si el pago se anuló (para que la vista recargue sus datos)
async function anularPago(pago) {
  const confirmado = await confirmar({
    titulo: 'Anular pago',
    mensaje: `¿Anular el pago de ${pesos(pago.monto_centavos)} del ${fechaCorta(pago.fecha_pago)}?`,
    detalle:
      'El pago no se borra: queda marcado como anulado y deja de contar en la recaudación. ' +
      'El vencimiento del socio se recalcula.',
    boton: 'Anular pago',
  });
  if (!confirmado) return false;

  const resultado = await pedir(window.api.anularPago(pago.id));
  if (resultado === null) return false;

  mostrarMensaje('Pago anulado');
  return true;
}

// ---------- Saltar de una pantalla a otra ----------
// Abre la ficha de un socio (por ejemplo, desde la pantalla de Ingreso)
function irAFichaDeSocio(id) {
  vistas.socios.seleccionar(id); // primero le decimos a la vista qué socio mostrar
  mostrarVista('socios');        // y después la mostramos (carga la lista y la ficha)
}

// Abre el formulario de socio nuevo con el DNI ya escrito
function irANuevoSocio(dni) {
  mostrarVista('socios');
  vistas.socios.nuevo(dni);
}

// Cuando terminaron de cargar todos los scripts, arrancamos en Ingreso:
// es la pantalla que queda abierta en la recepción.
document.addEventListener('DOMContentLoaded', () => mostrarVista('ingreso'));
