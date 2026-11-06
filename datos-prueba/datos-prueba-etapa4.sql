-- =====================================================================
-- Datos de prueba – Gimnasio, ETAPA 4A (para que el Resumen se vea completo)
-- Requisitos: datos de las etapas 1, 2 y 3 cargados, y la app abierta una vez
-- con el código de la etapa 4A (migración 4).
-- Ejecutar en DB Browser (Execute SQL) con la app cerrada → Write Changes (Ctrl+S).
-- =====================================================================

-- Dos socios que pagan pero dejaron de venir: borramos sus visitas de las últimas 3 semanas
DELETE FROM asistencias
WHERE socio_id IN (SELECT id FROM socios WHERE dni IN ('40010203', '38040506'))  -- Ezequiel Vera, Paula Ramírez
  AND fecha > date('now', 'localtime', '-21 days');

-- Un cumpleaños HOY: Sebastián Ruiz cumple 34
UPDATE socios
SET fecha_nacimiento = date('now', 'localtime', '-34 years')
WHERE dni = '35070809';

-- ---------- Verificación ----------
SELECT
  (SELECT nombre || ' ' || apellido FROM socios
   WHERE strftime('%m-%d', fecha_nacimiento) = strftime('%m-%d', 'now', 'localtime')) AS cumple_hoy,
  (SELECT COUNT(*) FROM asistencias a JOIN socios s ON s.id = a.socio_id
   WHERE s.dni IN ('40010203', '38040506')
     AND a.fecha > date('now', 'localtime', '-21 days')) AS visitas_recientes_borradas_deberia_ser_0;
