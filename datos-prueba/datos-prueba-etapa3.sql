-- =====================================================================
-- Datos de prueba – Gimnasio, ETAPA 3 (asistencias)
-- Requisitos: datos de las etapas 1 y 2 cargados y la app abierta una vez
-- con el código de la etapa 3 (para que se aplique la migración 3).
-- Ejecutar en DB Browser (Execute SQL) con la app cerrada → Write Changes (Ctrl+S).
--
-- Genera asistencias de los ÚLTIMOS 30 DÍAS (no de hoy: hoy las cargás vos
-- desde la pantalla de Ingreso). Domingos cerrado. Horarios con los picos
-- típicos: temprano a la mañana (7 a 9) y a la tarde-noche (18 a 21).
-- =====================================================================

WITH RECURSIVE
  -- Números del 1 al 30 (días hacia atrás). Una CTE "recursiva" se llama a sí misma.
  dias(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM dias WHERE n < 30
  ),
  -- Cada combinación socio + día, con la fecha calculada
  combinaciones AS (
    SELECT s.id AS socio_id,
           s.vence_el,
           d.n,
           date('now', 'localtime', '-' || d.n || ' days') AS fecha
    FROM socios s
    CROSS JOIN dias d
    WHERE s.activo = 1
  )
INSERT INTO asistencias (socio_id, fecha, hora, estado_cuota)
SELECT
  c.socio_id,
  c.fecha,
  -- Hora "pseudo-aleatoria" pero siempre la misma (sale de multiplicar id y día)
  printf('%02d:%02d',
         CASE WHEN (c.socio_id + c.n) % 3 = 0
              THEN 7 + (c.socio_id % 3)            -- turno mañana: 7 a 9
              ELSE 18 + ((c.socio_id + c.n) % 4)   -- turno tarde: 18 a 21
         END,
         (c.socio_id * 11 + c.n * 7) % 60),
  -- Estado aproximado de la cuota ese día (según su vencimiento actual)
  CASE
    WHEN c.vence_el IS NULL THEN 'sin_pagos'
    WHEN c.vence_el < c.fecha THEN 'vencido'
    WHEN c.vence_el <= date(c.fecha, '+5 days') THEN 'por_vencer'
    ELSE 'al_dia'
  END
FROM combinaciones c
WHERE strftime('%w', c.fecha) <> '0'           -- domingo cerrado
  AND (c.socio_id * 7 + c.n * 13) % 10 < 4     -- cada socio viene ~4 de cada 10 días
  AND NOT EXISTS (                             -- no duplicar si se ejecuta dos veces
    SELECT 1 FROM asistencias a
    WHERE a.socio_id = c.socio_id AND a.fecha = c.fecha
  );

-- ---------- Verificación ----------
SELECT
  COUNT(*)                          AS asistencias_cargadas,
  COUNT(DISTINCT socio_id)          AS socios_distintos,
  MIN(fecha)                        AS desde,
  MAX(fecha)                        AS hasta
FROM asistencias;
