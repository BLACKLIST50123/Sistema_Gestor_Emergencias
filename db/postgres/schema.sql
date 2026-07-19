-- =========================================================
-- POSTGRESQL - Módulo: USUARIOS Y RECURSOS
-- Sistema de Gestión de Emergencias (SGE)
-- =========================================================

CREATE DATABASE sge_usuarios_recursos;
-- \c sge_usuarios_recursos

-- -------------------------------------------------
-- Tabla: Operadores
-- -------------------------------------------------
CREATE TABLE Operadores (
    id_operador     SERIAL PRIMARY KEY,
    nombre          VARCHAR(120) NOT NULL,
    usuario         VARCHAR(60)  NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,      -- guardar SIEMPRE hash (bcrypt), nunca texto plano
    rol             VARCHAR(30)  NOT NULL DEFAULT 'operador'
                    CHECK (rol IN ('operador','administrador')),
                    -- Desde v2 el sistema trabaja con 2 roles: 'operador'
                    -- (incluye ahora las funciones que antes tenía
                    -- 'supervisor': lectura del Historial 360° y del
                    -- Panel Supervisor) y 'administrador' (control total,
                    -- incluye CRUD de usuarios/recursos/instituciones/
                    -- sedes y borrado en Historial). Si vienes de la v1
                    -- con datos ya cargados, corre antes
                    -- db/postgres/migration_2_roles.sql.
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,   -- soft delete: nunca DELETE físico
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),
    fecha_baja      TIMESTAMP    NULL
);

-- -------------------------------------------------
-- Tabla: Recursos
-- -------------------------------------------------
CREATE TABLE Recursos (
    id_recurso      SERIAL PRIMARY KEY,
    tipo            VARCHAR(30)  NOT NULL
                    CHECK (tipo IN ('ambulancia','patrulla','bomberos','otro')),
    placa           VARCHAR(15)  NOT NULL UNIQUE,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'disponible'
                    CHECK (estado IN ('disponible','ocupado','mantenimiento','fuera_de_servicio')),
    id_operador_asignado INTEGER NULL REFERENCES Operadores(id_operador),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Índices útiles para el módulo de alertas en tiempo real
CREATE INDEX idx_recursos_estado ON Recursos(estado) WHERE activo = TRUE;
CREATE INDEX idx_operadores_usuario ON Operadores(usuario) WHERE activo = TRUE;

-- -------------------------------------------------
-- REPLICIDAD (Tabla espejo): repl_instituciones
-- Desnormalización controlada del dominio "Gestión Institucional"
-- (dueño real: Oracle). Se guarda aquí una copia mínima de solo
-- lectura para evitar consultas cruzadas pesadas Postgres -> Oracle
-- cuando se necesita, por ejemplo, mostrar el nombre de la
-- institución al lado de un Operador/Recurso.
--
-- id_institucion NO es SERIAL: el ID lo define siempre Oracle
-- (la BD dueña del dato); esta tabla solo refleja, nunca origina.
-- -------------------------------------------------
CREATE TABLE repl_instituciones (
    id_institucion        INTEGER      PRIMARY KEY,
    nombre                VARCHAR(150) NOT NULL,
    activo                BOOLEAN      NOT NULL DEFAULT TRUE,   -- espeja soft delete de Oracle
    fecha_sincronizacion  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repl_instituciones_activo ON repl_instituciones(activo);

-- -------------------------------------------------
-- REPLICIDAD (Tabla espejo): repl_sedes
-- Igual patrón que repl_instituciones: dueña real = Oracle
-- (Sedes_Capacidad). Se guarda aquí una copia mínima de solo
-- lectura para el módulo de Despacho (necesita mostrar camas/
-- calabozos disponibles sin ir a consultar Oracle cada vez).
-- -------------------------------------------------
CREATE TABLE repl_sedes (
    id_sede               INTEGER      PRIMARY KEY,
    id_institucion        INTEGER      NOT NULL,
    direccion             VARCHAR(200) NOT NULL,
    camas_disponibles     INTEGER      NOT NULL DEFAULT 0,
    calabozos_disponibles INTEGER      NOT NULL DEFAULT 0,
    activo                BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_sincronizacion  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repl_sedes_activo ON repl_sedes(activo);

-- -------------------------------------------------
-- Tabla de auditoría: registra "quién hizo qué" (clave para tu profe)
-- -------------------------------------------------
CREATE TABLE Auditoria_Acciones (
    id_auditoria    SERIAL PRIMARY KEY,
    id_operador     INTEGER REFERENCES Operadores(id_operador),
    accion          VARCHAR(50) NOT NULL,       -- 'LOGIN','CREAR_ALERTA','CERRAR_CASO','ELIMINAR_OPERADOR', etc.
    entidad_afectada VARCHAR(50),                -- 'Operadores','Recursos','Alertas','Evidencias'
    id_entidad_afectada VARCHAR(50),
    detalle         TEXT,
    fecha           TIMESTAMP NOT NULL DEFAULT NOW()
);
