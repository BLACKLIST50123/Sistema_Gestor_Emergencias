-- =========================================================
-- MIGRACIÓN v3 - Oracle: estandarizar ACTIVO a BOOLEAN nativo
-- =========================================================
-- PUNTO 5 de la actualización pedida: el campo ACTIVO deja de
-- manejar 1/0 (NUMBER) y pasa a manejar TRUE/FALSE (BOOLEAN nativo).
--
-- Requiere Oracle Database 23ai (o superior) — es la primera
-- versión de Oracle con tipo BOOLEAN soportado en columnas de
-- tabla SQL (antes solo existía en PL/SQL). Si vienes de la v2
-- del proyecto (imagen gvenzl/oracle-xe:21-slim), primero migra
-- tu docker-compose.yml a gvenzl/oracle-free:23-slim-faststart
-- (ver docker-compose.yml de esta versión).
--
-- Oracle no permite un ALTER TABLE ... MODIFY directo de
-- NUMBER(1) a BOOLEAN, así que el patrón es:
--   1) agregar una columna BOOLEAN nueva
--   2) copiar los datos traduciendo 1/0 -> TRUE/FALSE
--   3) soltar la columna vieja y renombrar la nueva
--
-- Uso:
--   docker exec -i sge_oracle sqlplus sge_user/tu_password@//localhost:1521/FREEPDB1 @db/oracle/migration_v3_boolean.sql
-- =========================================================

-- ---------- Instituciones ----------
ALTER TABLE Instituciones ADD activo_bool BOOLEAN DEFAULT TRUE NOT NULL;
UPDATE Instituciones SET activo_bool = CASE WHEN activo = 1 THEN TRUE ELSE FALSE END;
ALTER TABLE Instituciones DROP COLUMN activo;
ALTER TABLE Instituciones RENAME COLUMN activo_bool TO activo;

-- ---------- Sedes_Capacidad ----------
ALTER TABLE Sedes_Capacidad ADD activo_bool BOOLEAN DEFAULT TRUE NOT NULL;
UPDATE Sedes_Capacidad SET activo_bool = CASE WHEN activo = 1 THEN TRUE ELSE FALSE END;
ALTER TABLE Sedes_Capacidad DROP COLUMN activo;
ALTER TABLE Sedes_Capacidad RENAME COLUMN activo_bool TO activo;

-- ---------- repl_recursos ----------
ALTER TABLE repl_recursos ADD activo_bool BOOLEAN DEFAULT TRUE NOT NULL;
UPDATE repl_recursos SET activo_bool = CASE WHEN activo = 1 THEN TRUE ELSE FALSE END;
ALTER TABLE repl_recursos DROP COLUMN activo;
ALTER TABLE repl_recursos RENAME COLUMN activo_bool TO activo;
CREATE INDEX idx_repl_recursos_activo ON repl_recursos(activo);

-- ---------- repl_operadores ----------
ALTER TABLE repl_operadores ADD activo_bool BOOLEAN DEFAULT TRUE NOT NULL;
UPDATE repl_operadores SET activo_bool = CASE WHEN activo = 1 THEN TRUE ELSE FALSE END;
ALTER TABLE repl_operadores DROP COLUMN activo;
ALTER TABLE repl_operadores RENAME COLUMN activo_bool TO activo;
CREATE INDEX idx_repl_operadores_activo ON repl_operadores(activo);

COMMIT;

-- Nota: PostgreSQL, Cassandra y MongoDB ya usaban BOOLEAN nativo
-- para "activo" desde el inicio del proyecto; Oracle era el único
-- motor pendiente porque su driver/servidor no soportaba BOOLEAN en
-- columnas de tabla hasta la versión 23ai.
