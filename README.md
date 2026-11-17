# Mi Gimnasio

Sistema de gestión para gimnasios chicos: socios, cuotas, pagos y control de ingreso desde la computadora de recepción. Reemplaza el cuaderno o la planilla de Excel y funciona sin internet.

![Pantalla de Mi Gimnasio](docs/captura.jpg)

[Ver el video de la demo en mi portafolio](https://sergio-cardozo.vercel.app/#p-gimnasio)

## Qué hace

- Usuarios con PIN y dos roles (administrador y recepción): cada pago queda registrado con quién lo cobró y quién lo anuló.
- Ingreso por DNI o con lector de código de barras: avisa al instante si la cuota está al día o vencida.
- Cobro con vencimiento automático: calcula hasta qué día cubre cada pago.
- Resumen del gimnasio: recaudación del mes, estado de las cuotas y horarios con más gente.
- Mensajes de WhatsApp armados para reclamar cuotas, saludar cumpleaños y escribir a socios que dejaron de venir.
- Planes con aumento de precios y vista previa antes de aplicar.
- Copias de seguridad automáticas y manuales que se restauran desde el sistema.

## Usuarios y permisos

Al abrir el sistema por primera vez se crea al administrador (el dueño). Después, cada persona entra eligiendo su nombre y escribiendo su PIN de 4 a 6 números.

| | Recepción | Administrador |
|---|:---:|:---:|
| Control de ingreso, alta y edición de socios | ✔ | ✔ |
| Registrar pagos | ✔ | ✔ |
| Anular pagos, dar de baja socios | | ✔ |
| Planes y aumento de precios | | ✔ |
| Resumen del gimnasio | | ✔ |
| Copias de seguridad, ajustes y usuarios | | ✔ |

## Aspectos técnicos

- **Arquitectura segura de Electron:** la interfaz no accede a los archivos ni a internet; todo pasa por canales IPC validados.
- **PIN protegido:** nunca se guarda el PIN, sino su resultado con scrypt y una sal distinta para cada usuario. Tras 5 intentos fallidos hay que esperar 30 segundos.
- **Permisos en el proceso principal:** cada canal IPC declara quién puede usarlo (libre, con sesión o solo administrador) y se revisa antes de ejecutar; esconder un botón en la interfaz no alcanza.
- **Siempre queda un administrador:** el sistema no deja dar de baja ni cambiar de rol al último.
- **Actualizaciones sin perder datos:** la base de datos usa migraciones versionadas.

## Tecnologías

Electron · JavaScript · HTML · CSS · SQLite con better-sqlite3 · Electron Forge · node:test

## Cómo ejecutarlo

Necesitás [Node.js](https://nodejs.org) en su versión LTS.

```bash
npm install
npm start      # abre la aplicación en modo desarrollo
npm test       # corre las pruebas automatizadas
npm run make   # genera el instalador (en Windows, el .exe)
```

La carpeta `datos-prueba` tiene scripts SQL con datos de ejemplo.

## Estructura

```
src/
  index.js     proceso principal de Electron
  preload.js   puente seguro entre la ventana y el proceso principal
  sesion.js    quién está usando el sistema y qué permisos tiene
  db/          acceso a SQLite, usuarios, migraciones y copias de seguridad
  ui/          pantallas de la aplicación (HTML, CSS y JavaScript)
pruebas/       pruebas automatizadas con node:test
datos-prueba/  scripts SQL con datos de ejemplo
```

## Autor

**Sergio Cardozo**, desarrollador full stack en Formosa, Argentina.
[Portafolio](https://sergio-cardozo.vercel.app) · [LinkedIn](https://www.linkedin.com/in/sergiocardozo-dev) · [GitHub](https://github.com/Gabicrdz)
