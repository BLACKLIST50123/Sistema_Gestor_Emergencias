-- =========================================================
-- ORACLE - Módulo: GESTIÓN INSTITUCIONAL
-- Sistema de Gestión de Emergencias (SGE)
-- =========================================================

-- -------------------------------------------------
-- Tabla: Instituciones
-- -------------------------------------------------
CREATE TABLE Instituciones (
    id_institucion   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR2(150) NOT NULL,
    tipo             VARCHAR2(30)  NOT NULL,
    CONSTRAINT chk_tipo_institucion CHECK (tipo IN ('Hospital','Comisaria','Bomberos')),
    activo           NUMBER(1) DEFAULT 1 NOT NULL,   -- soft delete (1=activo, 0=inactivo)
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
    activo                NUMBER(1) DEFAULT 1 NOT NULL,
    CONSTRAINT fk_sede_institucion FOREIGN KEY (id_institucion)
        REFERENCES Instituciones(id_institucion)
);

-- -------------------------------------------------
-- Procedimiento: descontar una cama al derivar un paciente
-- (esto es lo que tu profe probablemente quiere ver en acción:
--  una operación de negocio real, no solo un CRUD plano)
-- -------------------------------------------------
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
