// ui/app.js — Lo que comparte toda la interfaz: navegación, mensajes y pedidos al main.

// Cada vista-*.js se registra acá. Ejemplo: vistas.socios = { alMostrar: cargar }
const vistas = {};

// Ajustes del sistema (se cargan de la base al arrancar)
let configuracion = { nombre_gimnasio: 'Mi Gimnasio' };

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

// Abre la lista de socios filtrada por un estado de cuota ("vencido", "por_vencer"...)
function irASociosConEstado(estado) {
  vistas.socios.filtrarPorEstado(estado);
  mostrarVista('socios');
}

// Abre el formulario de socio nuevo con el DNI ya escrito
function irANuevoSocio(dni) {
  mostrarVista('socios');
  vistas.socios.nuevo(dni);
}

// ---------- WhatsApp ----------
// Arma el mensaje según la situación del socio. tipo: 'cumpleanios', 'sin_venir'
// o el estado de su cuota ('al_dia', 'por_vencer', 'vencido', 'sin_pagos').
function mensajeWhatsApp(socio, tipo) {
  const gimnasio = configuracion.nombre_gimnasio;
  const vence = socio.vence_el ? fechaCorta(socio.vence_el) : '';

  switch (tipo) {
    case 'cumpleanios':
      return `¡Feliz cumpleaños, ${socio.nombre}! 🎂 Todo el equipo de ${gimnasio} te desea un gran día.`;
    case 'sin_venir':
      return `¡Hola ${socio.nombre}! Hace unos días que no te vemos por ${gimnasio}. ¿Todo bien? ¡Te esperamos!`;
    case 'vencido':
      return `¡Hola ${socio.nombre}! Te escribimos de ${gimnasio}: tu cuota venció el ${vence}. Cuando quieras, pasá por recepción para renovarla. ¡Te esperamos!`;
    case 'por_vencer':
    case 'al_dia':
      return `¡Hola ${socio.nombre}! Te recordamos que tu cuota en ${gimnasio} vence el ${vence}. ¡Te esperamos!`;
    default:
      return `¡Hola ${socio.nombre}! Te escribimos de ${gimnasio}.`;
  }
}

async function avisarPorWhatsApp(socio, tipo) {
  const resultado = await pedir(window.api.abrirWhatsApp(socio.id, mensajeWhatsApp(socio, tipo)));
  if (resultado !== null) mostrarMensaje('Abriendo WhatsApp…');
}

// Botón de WhatsApp (solo si el socio tiene teléfono)
function botonWhatsApp(socio, tipo, clase = 'boton-texto') {
  if (!socio.telefono) return crear('span', { clase: 'sin-telefono', texto: 'Sin teléfono' });
  return crear('button', {
    tipo: 'button',
    clase,
    texto: 'WhatsApp',
    titulo: 'Abrir WhatsApp con un mensaje ya escrito',
    alClick: () => avisarPorWhatsApp(socio, tipo),
  });
}

// ---------- Marca del gimnasio ----------
// "Box Formosa Centro" → "BF"
function inicialesGimnasio(nombre) {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  return palabras
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0))
    .join('')
    .toUpperCase();
}

function aplicarMarca() {
  const nombre = configuracion.nombre_gimnasio;
  document.querySelector('.marca strong').textContent = nombre;
  document.querySelector('.logo').textContent = inicialesGimnasio(nombre);
  document.title = nombre;
}

async function cargarConfiguracion() {
  const datos = await pedir(window.api.obtenerConfiguracion());
  if (datos === null) return;
  configuracion = datos;
  aplicarMarca();
}

// Cuando terminaron de cargar todos los scripts: primero los ajustes y después
// la pantalla de Ingreso, que es la que queda abierta en la recepción.
document.addEventListener('DOMContentLoaded', async () => {
  await cargarConfiguracion();
  mostrarVista('ingreso');
});
