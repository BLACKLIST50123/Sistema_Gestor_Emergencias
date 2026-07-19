-- =========================================================
-- MIGRACIÓN v2 - Oracle
-- Corre esto UNA VEZ sobre tu base de datos ya existente.
-- Solo agrega la tabla espejo nueva repl_operadores; no toca
-- nada de lo que ya tenías (Instituciones, Sedes_Capacidad, etc).
--
-- Uso (DataGrip, o):
--   docker exec -i sge_oracle sqlplus sge_user/tu_password@//localhost:1521/XEPDB1 @db/oracle/migration_v2.sql
-- =========================================================

CREATE TABLE repl_operadores (
    id_operador           NUMBER        PRIMARY KEY,
    nombre                VARCHAR2(120) NOT NULL,
    usuario               VARCHAR2(60)  NOT NULL,
    rol                   VARCHAR2(30)  NOT NULL,
    activo                NUMBER(1) DEFAULT 1 NOT NULL,
    fecha_sincronizacion  DATE DEFAULT SYSDATE NOT NULL
);

CREATE INDEX idx_repl_operadores_activo ON repl_operadores(activo);
