-- =====================================================================
-- Datos de prueba – Gimnasio, ETAPA 2 (pagos y vencimientos)
-- Requisitos: haber cargado datos-prueba-etapa1.sql y abierto la app una vez
-- con el código de la etapa 2 (para que se aplique la migración 2).
-- Ejecutar en DB Browser (Execute SQL) con la app cerrada → Write Changes (Ctrl+S).
--
-- Las fechas son RELATIVAS a hoy: "dias_atras = 3" significa que pagó hace 3 días.
-- Así siempre hay socios al día, por vencer y vencidos, lo ejecutes cuando lo ejecutes.
-- =====================================================================

WITH datos(dni, plan, metodo, dias_atras, anulado) AS (
  VALUES
    -- Al día
    ('30123456', 'Mensual libre',              'efectivo',       63, 0),  -- Juan Pérez: 3 pagos seguidos
    ('30123456', 'Mensual libre',              'efectivo',       33, 0),
    ('30123456', 'Mensual libre',              'efectivo',        3, 0),
    ('40111222', 'Trimestral libre',           'transferencia',  20, 0),  -- Lucía Fernández
    ('41444555', 'Mensual 3 veces por semana', 'efectivo',       10, 0),  -- Matías Gómez
    ('35666777', 'Semestral libre',            'credito',       100, 0),  -- Nicolás Romero
    ('33100200', 'Mensual libre',              'transferencia',   5, 1),  -- Gabriel Medina: pago ANULADO (error de carga)
    ('33100200', 'Mensual libre',              'debito',          5, 0),  --   ...y el pago correcto
    ('45200300', 'Mensual 3 veces por semana', 'transferencia',  15, 0),  -- Julieta Herrera
    ('46400500', 'Mensual 3 veces por semana', 'efectivo',        2, 0),  -- Agustina Giménez
    ('41700800', 'Mensual libre',              'transferencia',   1, 0),  -- Lucas Castro
    ('40010203', 'Semestral libre',            'transferencia',   8, 0),  -- Ezequiel Vera
    ('38040506', 'Mensual libre',              'debito',         12, 0),  -- Paula Ramírez
    ('42050607', 'Trimestral libre',           'efectivo',       50, 0),  -- Tomás Morales
    ('35070809', 'Mensual libre',              'credito',         7, 0),  -- Sebastián Ruiz
    ('41080910', 'Mensual 3 veces por semana', 'efectivo',        6, 0),  -- Carolina Ledesma

    -- Por vencer (les quedan 5 días o menos)
    ('32456789', 'Mensual 3 veces por semana', 'transferencia',  58, 0),  -- María González
    ('32456789', 'Mensual 3 veces por semana', 'transferencia',  28, 0),  --   vence mañana
    ('38222333', 'Mensual libre',              'debito',         26, 0),  -- Diego López: faltan 3 días
    ('43555666', 'Mensual libre',              'transferencia',  29, 0),  -- Valentina Díaz: vence HOY
    ('43800900', 'Mensual 3 veces por semana', 'efectivo',       27, 0),  -- Micaela Ortiz: faltan 2 días

    -- Vencidos
    ('28987654', 'Mensual libre',              'efectivo',       75, 0),  -- Carlos Rodríguez
    ('28987654', 'Mensual libre',              'efectivo',       45, 0),  --   vencido hace 16 días
    ('42333444', 'Promo estudiantes 2025',     'efectivo',       40, 0),  -- Sofía Martínez (plan desactivado)
    ('44777888', 'Promo estudiantes 2025',     'efectivo',       31, 0),  -- Camila Sosa: vencida hace 2 días
    ('27888999', 'Mensual libre',              'efectivo',       94, 0),  -- Martín Benítez
    ('27888999', 'Mensual libre',              'efectivo',       64, 0),
    ('27888999', 'Mensual libre',              'efectivo',       34, 0),  --   vencido hace 5 días
    ('39999000', 'Trimestral libre',           'transferencia',  95, 0),  -- Florencia Acosta
    ('2345678',  'Mensual libre',              'efectivo',       60, 0),  -- Ramón Ojeda: hace 31 días
    ('39060708', 'Mensual 3 veces por semana', 'transferencia',  35, 0),  -- Belén Domínguez

    -- Dados de baja (historial viejo)
    ('29500600', 'Mensual libre',              'efectivo',      210, 0),  -- Pablo Molina
    ('37600700', 'Trimestral libre',           'transferencia', 300, 0),  -- Rocío Silva
    ('44020304', 'Mensual 3 veces por semana', 'efectivo',      150, 0)   -- Antonella Ríos

    -- Sin pagos: Federico Aguirre, Andrea Núñez y Leandro Cabrera (a propósito)
)
INSERT INTO pagos (socio_id, plan_id, plan_nombre, monto_centavos, metodo,
                   fecha_pago, cubre_desde, cubre_hasta, anulado, anulado_en)
SELECT
  s.id,
  p.id,
  p.nombre,
  p.precio_centavos,
  d.metodo,
  date('now', 'localtime', '-' || d.dias_atras || ' days'),
  date('now', 'localtime', '-' || d.dias_atras || ' days'),
  date('now', 'localtime', '-' || d.dias_atras || ' days', '+' || (p.duracion_dias - 1) || ' days'),
  d.anulado,
  CASE WHEN d.anulado = 1 THEN datetime('now', 'localtime') END
FROM datos d
JOIN socios s ON s.dni = d.dni
JOIN planes p ON p.nombre = d.plan
-- Evita duplicados si se ejecuta dos veces
WHERE NOT EXISTS (
  SELECT 1 FROM pagos x
  WHERE x.socio_id = s.id
    AND x.metodo = d.metodo
    AND x.fecha_pago = date('now', 'localtime', '-' || d.dias_atras || ' days')
);

-- El vencimiento de cada socio = último día cubierto por sus pagos no anulados
-- (es lo mismo que hace recalcularVencimiento() en db/pagos.js)
UPDATE socios
SET vence_el = (SELECT MAX(cubre_hasta) FROM pagos
                WHERE pagos.socio_id = socios.id AND pagos.anulado = 0);

-- ---------- Verificación: cuántos socios activos hay en cada estado ----------
SELECT
  CASE
    WHEN vence_el IS NULL THEN 'sin pagos'
    WHEN vence_el < date('now', 'localtime') THEN 'vencido'
    WHEN vence_el <= date('now', 'localtime', '+5 days') THEN 'por vencer'
    ELSE 'al día'
  END AS estado,
  COUNT(*) AS socios
FROM socios
WHERE activo = 1
GROUP BY estado
ORDER BY socios DESC;
