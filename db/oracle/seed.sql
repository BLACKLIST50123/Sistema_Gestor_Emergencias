-- =========================================================
-- QUÉ HACE ESTE ARCHIVO (en simple)
-- =========================================================
-- Llena Oracle con datos de ejemplo: 4 instituciones (hospital,
-- comisaría, bomberos, clínica) con su sede cada una, más las
-- copias de Operadores/Recursos que "nacieron" en PostgreSQL, para
-- poder probar el sistema con datos reales desde el primer arranque.

-- =========================================================
-- SEED DATA - Oracle (Gestión Institucional)
-- =========================================================
-- IDs usados como referencia cruzada consistente en TODOS los
-- seeds del proyecto (Postgres/Oracle/Cassandra/Mongo), como si el
-- administrador hubiera dado de alta cada registro uno por uno
-- desde la página web:
--   Instituciones: 1=Hospital Regional, 2=Comisaría, 3=Bomberos, 4=Clínica
--   Sedes_Capacidad: 1..4 (una por institución, mismo orden)
--   Operadores (Postgres): 1..5 | Recursos (Postgres): 1..6

-- PUNTO (agregado / corregido): cada archivo .sql de
-- /container-entrypoint-initdb.d se ejecuta en SU PROPIA sesión de
-- SQL*Plus (no hereda el ALTER SESSION del schema.sql anterior), así
-- que hay que repetir aquí el cambio de PDB y de esquema, o los
-- INSERT de abajo apuntarían a tablas Instituciones/Sedes_Capacidad
-- que no existen bajo SYS/CDB$ROOT.
ALTER SESSION SET CONTAINER = FREEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = sge_user;

INSERT INTO Instituciones (nombre, tipo) VALUES ('Hospital Regional Ancash', 'Hospital');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Comisaría Central Huaraz', 'Comisaria');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Compañía de Bomberos N°45', 'Bomberos');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Clínica San Pablo', 'Hospital');

-- id_institucion 1 = Hospital Regional, 2 = Comisaría, 3 = Bomberos, 4 = Clínica
INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (1, 'Av. Luzuriaga 123, Huaraz', 12, 0, -9.527500, -77.527800);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (2, 'Jr. Simón Bolívar 456, Huaraz', 0, 10, -9.529800, -77.529500);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (3, 'Av. Confraternidad Internacional 789, Huaraz', 0, 0, -9.525100, -77.531200);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (4, 'Jr. José Olaya 321, Huaraz', 6, 0, -9.530900, -77.526700);

-- -------------------------------------------------------------
-- REPLICIDAD: repl_recursos y repl_operadores (dueño real:
-- PostgreSQL). Se insertan aquí con los MISMOS ids/valores que sus
-- filas maestras en db/postgres/seed.sql, tal como quedarían si
-- syncService.js hubiera hecho el espejo automáticamente al crear
-- cada Operador/Recurso desde la página web.
-- -------------------------------------------------------------
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo) VALUES (1, 'María Fernández Soto', 'mfernandez', 'administrador', TRUE);
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo) VALUES (2, 'Carlos Ramírez Quiroz', 'cramirez', 'operador', TRUE);
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo) VALUES (3, 'Ana Lucía Torres', 'atorres', 'operador', TRUE);
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo) VALUES (4, 'Jorge Luis Medina', 'jmedina', 'operador', TRUE);
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo) VALUES (5, 'Patricia Rojas Vega', 'projas', 'operador', TRUE);

INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (1, 'ambulancia - AMB-101', 'disponible', TRUE);
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (2, 'ambulancia - AMB-102', 'ocupado', TRUE);
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (3, 'patrulla - PNP-234', 'disponible', TRUE);
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (4, 'patrulla - PNP-567', 'ocupado', TRUE);
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (5, 'bomberos - BOM-045', 'disponible', TRUE);
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo) VALUES (6, 'ambulancia - AMB-103', 'mantenimiento', TRUE);

COMMIT;

-- Ejemplo de uso del procedimiento (descuenta 1 cama de la sede 1)
-- EXEC sp_derivar_paciente(1);
