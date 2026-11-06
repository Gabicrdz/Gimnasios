// whatsapp.js — Arma el enlace para abrir WhatsApp con un mensaje ya escrito.
// Corre en el MAIN: la ventana nunca puede abrir direcciones de internet por su cuenta.

// WhatsApp necesita el número en formato internacional, sin "0" ni "15":
//   "370 15 412-3456" · "03704123456" · "+54 9 370 4123456"  →  "5493704123456"
// (54 = Argentina, 9 = celular, 370 = característica de Formosa)
function normalizarTelefono(telefono) {
  let digitos = String(telefono ?? '').replace(/\D/g, '');

  digitos = digitos.replace(/^00/, ''); // 0054...
  if (digitos.startsWith('54')) digitos = digitos.slice(2);
  if (digitos.startsWith('9') && digitos.length === 11) digitos = digitos.slice(1);
  digitos = digitos.replace(/^0/, ''); // 0370...

  // Con el "15" de los celulares quedan 12 números: lo sacamos.
  // La característica puede tener 2 (11), 3 (370) o 4 (3717) números.
  if (digitos.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (digitos.slice(largo, largo + 2) === '15') {
        digitos = digitos.slice(0, largo) + digitos.slice(largo + 2);
        break;
      }
    }
  }

  // Un número argentino completo tiene 10 dígitos (característica + número)
  return digitos.length === 10 ? `549${digitos}` : null;
}

function armarEnlaceWhatsApp(telefono, mensaje) {
  if (!telefono) throw new Error('El socio no tiene teléfono cargado');

  const numero = normalizarTelefono(telefono);
  if (!numero) {
    throw new Error(
      'El teléfono no parece un número argentino válido. Cargalo con la característica, por ejemplo: 370 4123456'
    );
  }

  const textoMensaje = String(mensaje ?? '').slice(0, 600);
  // encodeURIComponent convierte espacios, tildes y emojis a un formato válido para una URL
  return `https://wa.me/${numero}?text=${encodeURIComponent(textoMensaje)}`;
}

module.exports = { armarEnlaceWhatsApp, normalizarTelefono };
