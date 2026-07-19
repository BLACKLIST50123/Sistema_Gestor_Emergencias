-- =========================================================
-- MIGRACIÓN v2 - Cassandra
-- Corre esto UNA VEZ sobre tu keyspace ya existente.
-- Solo agrega las 2 tablas espejo nuevas; no toca nada de lo
-- que ya tenías (Alertas, Alertas_Por_Estado, etc).
--
-- Uso:
--   docker exec -i sge_cassandra cqlsh -k sge_alertas < db/cassandra/migration_v2.cql
-- =========================================================

USE sge_alertas;

CREATE TABLE IF NOT EXISTS repl_operadores (
    id_operador           INT PRIMARY KEY,
    nombre                TEXT,
    usuario               TEXT,
    rol                   TEXT,
    activo                BOOLEAN,
    fecha_sincronizacion  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repl_sedes (
    id_sede                INT PRIMARY KEY,
    id_institucion         INT,
    direccion              TEXT,
    camas_disponibles      INT,
    calabozos_disponibles  INT,
    activo                 BOOLEAN,
    fecha_sincronizacion   TIMESTAMP
);
