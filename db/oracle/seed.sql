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

-- Ubicaciones REALES de Nuevo Chimbote (Ancash), verificadas en Google Maps.
INSERT INTO Instituciones (nombre, tipo) VALUES ('Hospital Regional Eleazar Guzmán Barrón', 'Hospital');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Comisaría de Buenos Aires', 'Comisaria');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Compañía de Bomberos Voluntarios B-107', 'Bomberos');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Bonamedic Centro Médico', 'Hospital');

-- id_institucion 1 = Hospital Regional, 2 = Comisaría, 3 = Bomberos, 4 = Clínica
INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (1, 'Av. Brasil s/n, Nuevo Chimbote', 12, 0, -9.118350, -78.519236);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (2, 'Av. Pacífico E-45, Urb. Buenos Aires, Nuevo Chimbote', 0, 8, -9.127838, -78.521120);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (3, 'Av. Pacífico s/n, Urb. Buenos Aires, Nuevo Chimbote', 0, 0, -9.127821, -78.521481);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (4, 'Av. Argentina Mz. D3 Lote 49, Urb. José Carlos Mariátegui, Nuevo Chimbote', 6, 0, -9.123679, -78.520368);

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