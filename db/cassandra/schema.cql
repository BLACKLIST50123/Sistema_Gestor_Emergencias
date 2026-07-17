-- =========================================================
-- CASSANDRA - Módulo: ALERTAS EN TIEMPO REAL
-- Sistema de Gestión de Emergencias (SGE)
-- =========================================================
-- Cassandra se usa aquí porque las alertas se escriben en
-- alto volumen y en tiempo real (muchas escrituras concurrentes,
-- pocas actualizaciones). El modelado es "query-first": creamos
-- una tabla por cada forma en la que vamos a CONSULTAR los datos.

CREATE KEYSPACE IF NOT EXISTS sge_alertas
WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1   -- en producción real: 3
};

USE sge_alertas;

-- -------------------------------------------------
-- Tabla principal: Alertas (consulta por id_alerta)
-- -------------------------------------------------
CREATE TABLE Alertas (
    id_alerta        UUID PRIMARY KEY,
    tipo             TEXT,              -- 'medica','seguridad','incendio','accidente'
    descripcion      TEXT,
    estado           TEXT,              -- 'pendiente','en_atencion','cerrada'
    latitud          DOUBLE,            -- para el mapa interactivo (Leaflet)
    longitud         DOUBLE,
    direccion_referencial TEXT,
    id_operador_reporta INT,            -- referencia lógica a Operadores (PostgreSQL)
    id_recurso_asignado INT,            -- referencia lógica a Recursos (PostgreSQL)
    id_sede_derivacion  INT,            -- referencia lógica a Sedes_Capacidad (Oracle)
    fecha_creacion   TIMESTAMP,
    fecha_actualizacion TIMESTAMP
);

-- -------------------------------------------------
-- Tabla de consulta: Alertas por estado (para el dashboard
-- "mostrar todas las pendientes en el mapa")
-- -------------------------------------------------
CREATE TABLE Alertas_Por_Estado (
    estado           TEXT,
    fecha_creacion   TIMESTAMP,
    id_alerta        UUID,
    tipo             TEXT,
    latitud          DOUBLE,
    longitud          DOUBLE,
    descripcion      TEXT,
    PRIMARY KEY (estado, fecha_creacion, id_alerta)
) WITH CLUSTERING ORDER BY (fecha_creacion DESC);

-- -------------------------------------------------
-- Tabla de consulta: Alertas por operador (historial de quién reportó qué)
-- -------------------------------------------------
CREATE TABLE Alertas_Por_Operador (
    id_operador_reporta INT,
    fecha_creacion       TIMESTAMP,
    id_alerta            UUID,
    tipo                 TEXT,
    estado               TEXT,
    PRIMARY KEY (id_operador_reporta, fecha_creacion, id_alerta)
) WITH CLUSTERING ORDER BY (fecha_creacion DESC);

-- -------------------------------------------------
-- REPLICIDAD (Tablas espejo): repl_instituciones y repl_recursos
-- Cassandra es el motor que más se beneficia de esto: como el
-- dashboard de Alertas necesita mostrar en el mapa el nombre de
-- la institución de derivación y el estado del recurso asignado,
-- sin estas tablas espejo cada carga del mapa dispararía consultas
-- síncronas a Oracle y Postgres (inviable con escrituras/lecturas
-- de alto volumen). En Cassandra un INSERT con la misma partition
-- key actúa como upsert, así que estas tablas se mantienen con
-- INSERT normales desde el backend (ver syncService.js).
--
-- Igual que en los otros motores: el ID lo definen SIEMPRE las
-- BD dueñas del dato (Oracle para instituciones, Postgres para
-- recursos), nunca se genera aquí.
-- -------------------------------------------------
CREATE TABLE repl_instituciones (
    id_institucion        INT PRIMARY KEY,
    nombre                TEXT,
    activo                BOOLEAN,
    fecha_sincronizacion  TIMESTAMP
);

CREATE TABLE repl_recursos (
    id_recurso            INT PRIMARY KEY,
    nombre                TEXT,
    estado                TEXT,
    activo                BOOLEAN,
    fecha_sincronizacion  TIMESTAMP
);

-- Nota importante para tu profe sobre "eliminar en cascada" en Cassandra:
-- Cassandra NO tiene FOREIGN KEYS ni CASCADE. Si se elimina un Operador
-- en PostgreSQL, el backend debe recorrer Alertas_Por_Operador con ese
-- id y actualizar/eliminar manualmente en las 3 tablas (patrón Saga,
-- ver backend/services/cascadeService.js)
