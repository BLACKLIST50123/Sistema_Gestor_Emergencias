-- =========================================================
-- MIGRACIÓN v2 - PostgreSQL
-- Corre esto UNA VEZ sobre tu base de datos ya existente
-- (la que ya tiene datos cargados en el volumen de Docker).
-- No borra nada: solo migra el rol 'supervisor' -> 'operador'
-- y agrega la tabla espejo nueva repl_sedes.
--
-- Uso:
--   docker exec -i sge_postgres psql -U <tu_usuario> -d sge_usuarios_recursos < db/postgres/migration_v2.sql
-- =========================================================

-- 1) Ya no existen 3 roles, solo 2. Los operadores que tenían
--    'supervisor' pasan a 'operador' (que ahora incluye esas
--    funciones de solo lectura: Panel Supervisor + Historial 360°).
UPDATE Operadores SET rol = 'operador' WHERE rol = 'supervisor';

-- 2) Reemplazar el CHECK viejo (3 roles) por el nuevo (2 roles).
--    El nombre del constraint puede variar según cómo Postgres lo
--    haya autogenerado; si el ALTER falla por nombre incorrecto,
--    revisa con: \d Operadores  y ajusta el nombre abajo.
ALTER TABLE Operadores DROP CONSTRAINT IF EXISTS operadores_rol_check;
ALTER TABLE Operadores ADD CONSTRAINT operadores_rol_check
  CHECK (rol IN ('operador','administrador'));

-- 3) Tabla espejo nueva: repl_sedes (dueña real: Oracle).
CREATE TABLE IF NOT EXISTS repl_sedes (
    id_sede               INTEGER      PRIMARY KEY,
    id_institucion        INTEGER      NOT NULL,
    direccion             VARCHAR(200) NOT NULL,
    camas_disponibles     INTEGER      NOT NULL DEFAULT 0,
    calabozos_disponibles INTEGER      NOT NULL DEFAULT 0,
    activo                BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_sincronizacion  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repl_sedes_activo ON repl_sedes(activo);
