-- =========================================================
-- SEED DATA - PostgreSQL (Usuarios y Recursos)
-- Nota: las contraseñas aquí están en texto plano SOLO como
-- referencia legible. En seed.js del backend se insertan
-- ya hasheadas con bcrypt, que es lo que debes usar en real.
-- =========================================================

INSERT INTO Operadores (nombre, usuario, contrasena_hash, rol) VALUES
('María Fernández Soto',   'mfernandez', '50123', 'administrador'),
('Carlos Ramírez Quiroz',  'cramirez',   '50123', 'operador'),
('Ana Lucía Torres',       'atorres',    '50123', 'operador'),
('Jorge Luis Medina',      'jmedina',    '50123', 'operador'),
('Patricia Rojas Vega',    'projas',     '50123', 'operador');

INSERT INTO Recursos (tipo, placa, estado, id_operador_asignado) VALUES
('ambulancia', 'AMB-101', 'disponible', NULL),
('ambulancia', 'AMB-102', 'ocupado',    3),
('patrulla',   'PNP-234', 'disponible', NULL),
('patrulla',   'PNP-567', 'ocupado',    4),
('bomberos',   'BOM-045', 'disponible', NULL),
('ambulancia', 'AMB-103', 'mantenimiento', NULL);

-- Ejemplo de registro de auditoría
INSERT INTO Auditoria_Acciones (id_operador, accion, entidad_afectada, id_entidad_afectada, detalle) VALUES
(1, 'LOGIN', 'Operadores', '1', 'Inicio de sesión exitoso'),
(3, 'CREAR_ALERTA', 'Alertas', 'ALT-2026-0001', 'Alerta creada desde módulo de recursos');
