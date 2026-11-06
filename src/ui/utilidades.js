// ui/utilidades.js — Funciones de ayuda para toda la interfaz.

// ---------- Crear elementos HTML ----------
// crear('td', { clase: 'derecha', texto: '$ 25.000' })
// crear('div', { clase: 'tarjeta' }, [hijo1, hijo2])
function crear(etiqueta, opciones = {}, hijos = []) {
  const elemento = document.createElement(etiqueta);
  if (opciones.clase) elemento.className = opciones.clase;
  if (opciones.texto !== undefined && opciones.texto !== null) {
    elemento.textContent = opciones.texto; // siempre textContent: seguro
  }
  if (opciones.valor !== undefined) elemento.value = opciones.valor;
  if (opciones.titulo) elemento.title = opciones.titulo;
  if (opciones.tipo) elemento.type = opciones.tipo;
  if (opciones.alClick) elemento.addEventListener('click', opciones.alClick);
  elemento.append(...hijos);
  return elemento;
}

// ---------- Plata (en centavos) ----------
const formatoPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function pesos(centavos) {
  return formatoPesos.format(centavos / 100);
}

// "25.000" · "25000" · "25.000,50" · "25000.50" → centavos (o null si no es válido)
function parsearMonto(texto) {
  let limpio = String(texto).replace(/[$\s]/g, '');
  if (limpio.includes(',')) {
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else if (!/^\d+\.\d{1,2}$/.test(limpio)) {
    limpio = limpio.replace(/\./g, '');
  }
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100);
}

function centavosATexto(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

const METODOS_PAGO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

// ---------- Fechas ----------
// Date → "2026-11-03" con la fecha LOCAL
function aISO(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function hoyISO() {
  return aISO(new Date());
}

// "2026-11"
function mesActual() {
  return hoyISO().slice(0, 7);
}

// sumarDias("2026-11-30", 1) → "2026-12-01"
function sumarDias(iso, dias) {
  const fecha = new Date(`${iso}T12:00:00`); // mediodía: evita problemas de cambio de hora
  fecha.setDate(fecha.getDate() + dias);
  return aISO(fecha);
}

// "2026-11-03" o "2026-11-03 20:15:00" → "03/11/2026"
function fechaCorta(iso) {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  const mesActualNumero = hoy.getMonth() + 1;
  const yaCumplio = mesActualNumero > mes || (mesActualNumero === mes && hoy.getDate() >= dia);
  if (!yaCumplio) edad -= 1;
  return edad;
}

// ---------- Socios ----------
// "30123456" → "30.123.456"
function formatearDni(dni) {
  return String(dni).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function iniciales(nombre, apellido) {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

// Estado de la cuota → texto y color de la insignia (colores de los discos)
const ESTADOS_CUOTA = {
  al_dia: { texto: 'Al día', clase: 'verde' },
  por_vencer: { texto: 'Por vencer', clase: 'amarilla' },
  vencido: { texto: 'Vencida', clase: 'roja' },
  sin_pagos: { texto: 'Sin pagos', clase: 'gris' },
};

function insigniaEstado(estado) {
  const info = ESTADOS_CUOTA[estado] ?? ESTADOS_CUOTA.sin_pagos;
  return crear('span', { clase: `insignia ${info.clase}`, texto: info.texto });
}

// Frase que explica el vencimiento: "Faltan 12 días", "Venció hace 3 días"...
function textoVencimiento(socio) {
  const dias = socio.dias_restantes;
  if (socio.vence_el === null) return 'Registrá su primer pago para activar la cuota';
  if (dias < 0) return `Venció hace ${-dias} día${dias === -1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Faltan ${dias} días`;
}
