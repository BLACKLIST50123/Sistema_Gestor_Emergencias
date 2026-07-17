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
                    CHECK (rol IN ('operador','supervisor','administrador')),
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
