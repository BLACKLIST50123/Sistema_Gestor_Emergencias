-- =========================================================
-- QUÉ HACE ESTE ARCHIVO (en simple)
-- =========================================================
-- Llena PostgreSQL con datos de ejemplo: 5 operadores (usuarios del
-- sistema), 6 recursos (ambulancias/patrullas/bomberos) y las copias
-- de Instituciones/Sedes que "nacieron" en Oracle, para que la base
-- de datos no arranque vacía y se pueda probar el sistema de una vez.

-- =========================================================
-- SEED DATA - PostgreSQL (Usuarios y Recursos)
-- Nota: las contraseñas aquí están en texto plano SOLO como
-- referencia legible. En producción real deben quedar hasheadas
-- con bcrypt (así las guarda el backend al crear un Operador).
-- =========================================================

-- Operadores 1..5 (mismos ids referenciados desde repl_operadores
-- en Oracle/Cassandra/Mongo)
INSERT INTO Operadores (nombre, usuario, contrasena_hash, rol) VALUES
('María Fernández Soto',   'mfernandez', '50123', 'administrador'),
('Carlos Ramírez Quiroz',  'cramirez',   '50123', 'operador'),
('Ana Lucía Torres',       'atorres',    '50123', 'operador'),
('Jorge Luis Medina',      'jmedina',    '50123', 'operador'),
('Patricia Rojas Vega',    'projas',     '50123', 'operador');

-- Recursos 1..6 (mismos ids referenciados desde repl_recursos
-- en Oracle/Cassandra/Mongo)
INSERT INTO Recursos (tipo, placa, estado, id_operador_asignado) VALUES
('ambulancia', 'AMB-101', 'disponible', NULL),
('ambulancia', 'AMB-102', 'ocupado',    3),
('patrulla',   'PNP-234', 'disponible', NULL),
('patrulla',   'PNP-567', 'ocupado',    4),
('bomberos',   'BOM-045', 'disponible', NULL),
('ambulancia', 'AMB-103', 'mantenimiento', NULL);

-- -------------------------------------------------------------
-- REPLICIDAD: repl_instituciones y repl_sedes (dueño real: Oracle).
-- Se insertan con los MISMOS ids/valores que sus filas maestras en
-- db/oracle/seed.sql, tal como quedarían si syncService.js hubiera
-- hecho el espejo automáticamente al crear cada Institución/Sede
-- desde la página web.
-- -------------------------------------------------------------
INSERT INTO repl_instituciones (id_institucion, nombre, activo) VALUES
(1, 'Hospital Regional Eleazar Guzmán Barrón', TRUE),
(2, 'Comisaría de Buenos Aires', TRUE),
(3, 'Compañía de Bomberos Voluntarios B-107', TRUE),
(4, 'Bonamedic Centro Médico', TRUE);

INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo) VALUES
(1, 1, 'Av. Brasil s/n, Nuevo Chimbote', 12, 0, TRUE),
(2, 2, 'Av. Pacífico E-45, Urb. Buenos Aires, Nuevo Chimbote', 0, 8, TRUE),
(3, 3, 'Av. Pacífico s/n, Urb. Buenos Aires, Nuevo Chimbote', 0, 0, TRUE),
(4, 4, 'Av. Argentina Mz. D3 Lote 49, Urb. José Carlos Mariátegui, Nuevo Chimbote', 6, 0, TRUE);

-- Ejemplo de registro de auditoría
INSERT INTO Auditoria_Acciones (id_operador, accion, entidad_afectada, id_entidad_afectada, detalle) VALUES
(1, 'LOGIN', 'Operadores', '1', 'Inicio de sesión exitoso'),
(3, 'CREAR_ALERTA', 'Alertas', 'ALT-2026-0001', 'Alerta creada desde módulo de recursos');