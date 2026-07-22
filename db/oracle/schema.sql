-- =========================================================
-- QUÉ HACE ESTE ARCHIVO (en simple)
-- =========================================================
-- Este archivo crea las tablas de Oracle, la base de datos dueña de
-- las Instituciones (Hospital/Comisaría/Bomberos) y sus Sedes con
-- la capacidad que tienen (camas o calabozos). También trae las
-- tablas espejo (repl_recursos, repl_operadores) que guardan una
-- copia de lo que vive en PostgreSQL, y dos procedimientos que
-- descuentan una cama o un calabozo cada vez que se deriva a
-- alguien.

-- =========================================================
-- ORACLE - Módulo: GESTIÓN INSTITUCIONAL
-- Sistema de Gestión de Emergencias (SGE)
-- =========================================================

-- PUNTO (agregado / corregido): Docker ejecuta este script COMO SYS
-- y CONECTADO AL CDB RAÍZ (no a nuestro PDB, ni como nuestro usuario
-- de la app). Sin estas 2 líneas, las tablas se crean en el lugar
-- equivocado (dueñas de SYS, fuera del PDB FREEPDB1) y el backend
-- —que se conecta como sge_user a FREEPDB1— nunca las encuentra
-- (por eso antes tocaba crearlas a mano). Documentado en:
-- https://github.com/gvenzl/oci-oracle-free
ALTER SESSION SET CONTAINER = FREEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = sge_user;

-- -------------------------------------------------
-- Tabla: Instituciones
-- -------------------------------------------------
CREATE TABLE Instituciones (
    id_institucion   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR2(150) NOT NULL,
    tipo             VARCHAR2(30)  NOT NULL,
    CONSTRAINT chk_tipo_institucion CHECK (tipo IN ('Hospital','Comisaria','Bomberos')),
    activo           BOOLEAN DEFAULT TRUE NOT NULL,   -- soft delete (booleano nativo, Oracle 23ai+)
    fecha_creacion   DATE DEFAULT SYSDATE NOT NULL
);

-- -------------------------------------------------
-- Tabla: Sedes_Capacidad
-- -------------------------------------------------
CREATE TABLE Sedes_Capacidad (
    id_sede               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_institucion        NUMBER NOT NULL,
    direccion             VARCHAR2(200) NOT NULL,
    camas_disponibles     NUMBER DEFAULT 0,
    calabozos_disponibles NUMBER DEFAULT 0,
    latitud               NUMBER(9,6),   -- útil para el mapa: dónde derivar al paciente/detenido
    longitud              NUMBER(9,6),
    activo                BOOLEAN DEFAULT TRUE NOT NULL,
    CONSTRAINT fk_sede_institucion FOREIGN KEY (id_institucion)
        REFERENCES Instituciones(id_institucion)
);

-- -------------------------------------------------
-- REPLICIDAD (Tabla espejo): repl_recursos
-- Desnormalización controlada del dominio "Usuarios y Recursos"
-- (dueño real: PostgreSQL). Copia mínima de solo lectura para
-- que Oracle no tenga que hacer consultas cruzadas a Postgres,
-- por ejemplo al mostrar qué Recursos tiene disponibles una Sede.
--
-- id_recurso NO se autogenera aquí: el ID lo define siempre
-- PostgreSQL (la BD dueña del dato); "nombre" = tipo + placa
-- concatenados, ya que Postgres no tiene una columna "nombre"
-- propia en Recursos (ver backend/services/syncService.js).
-- -------------------------------------------------
CREATE TABLE repl_recursos (
    id_recurso            NUMBER        PRIMARY KEY,
    nombre                VARCHAR2(60)  NOT NULL,
    estado                VARCHAR2(20)  NOT NULL,
    activo                BOOLEAN DEFAULT TRUE NOT NULL,   -- espeja soft delete de Postgres
    fecha_sincronizacion  DATE DEFAULT SYSDATE NOT NULL
);

CREATE INDEX idx_repl_recursos_activo ON repl_recursos(activo);

-- -------------------------------------------------
-- REPLICIDAD (Tabla espejo): repl_operadores
-- Desnormalización controlada del dominio "Usuarios y Recursos"
-- (dueño real: PostgreSQL, tabla Operadores). Copia mínima de solo
-- lectura para que, por ejemplo, el módulo de Gestión Institucional
-- pueda mostrar "qué Operador hizo tal derivación" sin consultar
-- Postgres cada vez.
--
-- id_operador NO se autogenera aquí: el ID lo define siempre
-- PostgreSQL (la BD dueña del dato). No se replica la contraseña
-- (nunca, ni siquiera el hash): esta tabla es solo para mostrar
-- nombre/usuario/rol, no para autenticar.
-- -------------------------------------------------
CREATE TABLE repl_operadores (
    id_operador           NUMBER        PRIMARY KEY,
    nombre                VARCHAR2(120) NOT NULL,
    usuario               VARCHAR2(60)  NOT NULL,
    rol                   VARCHAR2(30)  NOT NULL,
    activo                BOOLEAN DEFAULT TRUE NOT NULL,   -- espeja soft delete de Postgres
    fecha_sincronizacion  DATE DEFAULT SYSDATE NOT NULL
);

CREATE INDEX idx_repl_operadores_activo ON repl_operadores(activo);

-- -------------------------------------------------
-- Procedimiento: descontar una cama al derivar un paciente
-- (esto es lo que tu profe probablemente quiere ver en acción:
--  una operación de negocio real, no solo un CRUD plano)
-- -------------------------------------------------
-- ==============================
-- SP_DERIVAR_PACIENTE (PROCEDIMIENTO PARA RESTAR UNA CAMA)
-- ==============================
-- Se llama cuando el operador deriva a un paciente a una sede: le
-- resta 1 a las camas disponibles de esa sede. Si ya no quedan
-- camas, avisa con un error en vez de dejar el número en negativo.
CREATE OR REPLACE PROCEDURE sp_derivar_paciente (
    p_id_sede IN NUMBER
) AS
    v_camas NUMBER;
BEGIN
    SELECT camas_disponibles INTO v_camas
    FROM Sedes_Capacidad
    WHERE id_sede = p_id_sede
    FOR UPDATE;                      -- bloquea la fila para evitar condiciones de carrera

    IF v_camas IS NULL OR v_camas <= 0 THEN
        RAISE_APPLICATION_ERROR(-20001, 'No hay camas disponibles en esta sede.');
    END IF;

    UPDATE Sedes_Capacidad
    SET camas_disponibles = camas_disponibles - 1
    WHERE id_sede = p_id_sede;

    COMMIT;
END sp_derivar_paciente;
/

-- Equivalente para calabozos
-- ==============================
-- SP_DERIVAR_DETENIDO (PROCEDIMIENTO PARA RESTAR UN CALABOZO)
-- ==============================
-- Lo mismo que el procedimiento de arriba, pero para Comisarías:
-- resta 1 a los calabozos disponibles cuando se deriva a un detenido.
CREATE OR REPLACE PROCEDURE sp_derivar_detenido (
    p_id_sede IN NUMBER
) AS
    v_calabozos NUMBER;
BEGIN
    SELECT calabozos_disponibles INTO v_calabozos
    FROM Sedes_Capacidad
    WHERE id_sede = p_id_sede
    FOR UPDATE;

    IF v_calabozos IS NULL OR v_calabozos <= 0 THEN
        RAISE_APPLICATION_ERROR(-20002, 'No hay calabozos disponibles en esta sede.');
    END IF;

    UPDATE Sedes_Capacidad
    SET calabozos_disponibles = calabozos_disponibles - 1
    WHERE id_sede = p_id_sede;

    COMMIT;
END sp_derivar_detenido;
/
