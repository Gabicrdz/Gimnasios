-- =====================================================================
-- Datos de prueba – Gimnasio, ETAPA 1 (planes y socios)
-- Ejecutar en DB Browser for SQLite sobre gimnasio.db (con la app cerrada)
-- y después tocar "Escribir cambios" (Ctrl+S).
--
-- INSERT OR IGNORE: si un dato ya existe (mismo nombre de plan o mismo DNI),
-- lo saltea en lugar de dar error. Por eso se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- Planes extra ----------
-- Los planes 1, 2 y 3 ya los crea la migración (Mensual libre, Mensual 3 veces, Trimestral).
INSERT OR IGNORE INTO planes (nombre, precio_centavos, duracion_dias, activo) VALUES
  ('Pase diario',            300000,   1, 1),
  ('Semestral libre',      12000000, 180, 1),
  ('Promo estudiantes 2025', 1500000, 30, 0);  -- plan DESACTIVADO (para probar el paso 6)

-- ---------- Socios ----------
-- Columnas: nombre, apellido, dni, telefono, fecha_nacimiento, plan_id, notas, activo, creado_en
-- plan_id 1 = Mensual libre · 2 = Mensual 3 veces por semana · 3 = Trimestral libre
-- Los planes nuevos se buscan por nombre con una subconsulta (no sabemos su id de antemano).
INSERT OR IGNORE INTO socios
  (nombre, apellido, dni, telefono, fecha_nacimiento, plan_id, notas, activo, creado_en)
VALUES
  ('Juan',      'Pérez',     '30123456', '370 4123456', '1985-03-14', 1, '', 1, '2024-02-10 18:30:00'),
  ('María',     'González',  '32456789', '370 4234567', '1988-07-22', 2, 'Lesión en rodilla derecha, evitar sentadillas profundas', 1, '2024-03-05 09:15:00'),
  ('Carlos',    'Rodríguez', '28987654', '370 4345678', '1980-11-02', 1, '', 1, '2024-04-18 19:45:00'),
  ('Lucía',     'Fernández', '40111222', '370 4456789', '1997-01-30', 3, 'Objetivo: bajar de peso', 1, '2024-05-02 08:00:00'),
  ('Diego',     'López',     '38222333', '370 4567890', '1995-09-09', 1, '', 1, '2024-06-11 20:10:00'),
  ('Sofía',     'Martínez',  '42333444', '370 4678901', '2000-04-17',
      (SELECT id FROM planes WHERE nombre = 'Promo estudiantes 2025'), 'Estudiante UNaF', 1, '2025-03-01 17:00:00'),
  ('Matías',    'Gómez',     '41444555', '370 4789012', '1999-12-05', 2, '', 1, '2024-08-23 18:00:00'),
  ('Valentina', 'Díaz',      '43555666', NULL,          '2001-06-28', 1, '', 1, '2024-09-14 10:30:00'),
  ('Nicolás',   'Romero',    '35666777', '370 4890123', '1991-02-11',
      (SELECT id FROM planes WHERE nombre = 'Semestral libre'), '', 1, '2025-01-08 19:00:00'),
  ('Camila',    'Sosa',      '44777888', '370 4901234', '2003-08-19',
      (SELECT id FROM planes WHERE nombre = 'Promo estudiantes 2025'), 'Estudiante', 1, '2025-03-03 16:20:00'),
  ('Martín',    'Benítez',   '27888999', '370 4012345', '1979-05-25', 1, 'Hipertensión controlada, consultar antes de rutinas intensas', 1, '2024-01-15 07:45:00'),
  ('Florencia', 'Acosta',    '39999000', '370 4112233', '1996-10-03', 3, '', 1, '2025-02-20 18:40:00'),
  ('Gabriel',   'Medina',    '33100200', '370 4223344', '1989-12-24', 1, '', 1, '2025-04-07 20:30:00'),
  ('Julieta',   'Herrera',   '45200300', '370 4334455', '2004-03-08', 2, 'Viene con su hermana', 1, '2025-05-12 17:10:00'),
  ('Federico',  'Aguirre',   '31300400', '370 4445566', '1986-07-07', NULL, 'Solo viene con pase diario', 1, '2025-06-01 09:00:00'),
  ('Agustina',  'Giménez',   '46400500', '370 4556677', '2005-11-15', 2, '', 1, '2025-07-19 18:15:00'),
  ('Pablo',     'Molina',    '29500600', '370 4667788', '1982-01-20', 1, '', 0, '2024-03-22 19:30:00'),
  ('Rocío',     'Silva',     '37600700', '370 4778899', '1994-05-05', 3, 'Se mudó a Corrientes', 0, '2024-07-01 08:30:00'),
  ('Lucas',     'Castro',    '41700800', '370 4889900', '1998-08-30', 1, '', 1, '2025-08-25 19:50:00'),
  ('Micaela',   'Ortiz',     '43800900', '370 4990011', '2001-02-14', 2, '', 1, '2025-09-10 17:30:00'),
  ('Ramón',     'Ojeda',     '2345678',  '370 4001122', '1955-09-18', 1, 'DNI de 7 dígitos (prueba)', 1, '2024-02-01 08:00:00'),
  ('Andrea',    'Núñez',     '34900100', '370 4113344', '1990-04-01', 1, '', 1, '2025-10-02 18:00:00'),
  ('Ezequiel',  'Vera',      '40010203', '370 4224455', '1997-06-16',
      (SELECT id FROM planes WHERE nombre = 'Semestral libre'), '', 1, '2025-10-20 20:00:00'),
  ('Antonella', 'Ríos',      '44020304', '370 4335566', '2002-09-27', 2, '', 0, '2025-04-15 16:45:00'),
  ('Leandro',   'Cabrera',   '36030405', NULL,          NULL,         NULL, 'Datos incompletos (prueba)', 1, '2026-01-12 19:20:00'),
  ('Paula',     'Ramírez',   '38040506', '370 4446677', '1995-12-12', 1, '', 1, '2026-02-03 18:10:00'),
  ('Tomás',     'Morales',   '42050607', '370 4557788', '2000-07-31', 3, '', 1, '2026-03-16 07:30:00'),
  ('Belén',     'Domínguez', '39060708', '370 4668899', '1996-03-21', 2, '', 1, '2026-05-05 17:55:00'),
  ('Sebastián', 'Ruiz',      '35070809', '370 4779900', '1992-10-10', 1, 'Quiere entrenar para un triatlón', 1, '2026-08-18 19:05:00'),
  ('Carolina',  'Ledesma',   '41080910', '370 4880011', '1999-01-03', 2, '', 1, '2026-10-28 18:25:00');

-- ---------- Verificación ----------
-- Al ejecutar, DB Browser muestra el resultado de esta última consulta:
SELECT
  (SELECT COUNT(*) FROM planes)                    AS total_planes,
  (SELECT COUNT(*) FROM socios)                    AS total_socios,
  (SELECT COUNT(*) FROM socios WHERE activo = 1)   AS socios_activos,
  (SELECT COUNT(*) FROM socios WHERE activo = 0)   AS socios_de_baja;
