-- =========================================================
-- SEED DATA - Cassandra (Alertas en Tiempo Real)
-- Coordenadas de ejemplo en Huaraz, Ancash, Perú
-- =========================================================
-- Los id_alerta usan UUIDs FIJOS (en vez de uuid() aleatorio) para
-- poder referenciarlos también desde db/mongodb/seed.js (evidencias),
-- igual que en un uso real donde el id de la Alerta nace en Cassandra
-- y viaja "por fuera" hacia MongoDB al cerrar el caso.
--
-- id_alerta 1 = a1111111-1111-1111-1111-111111111111 (médica, en_atencion)
-- id_alerta 2 = a2222222-2222-2222-2222-222222222222 (seguridad, pendiente)
-- id_alerta 3 = a3333333-3333-3333-3333-333333333333 (incendio, cerrada)
--
-- Cada alerta se inserta en las 3 tablas de consulta (Alertas,
-- Alertas_Por_Estado, Alertas_Por_Operador) porque en Cassandra se
-- modela "una tabla por consulta": así es como el backend las
-- mantiene sincronizadas en tiempo real (ver alertas.js), acá se
-- deja precargado el mismo resultado a mano.
USE sge_alertas;

-- -------------------------------------------------
-- Alerta 1: médica, en atención (Operador 3 = Ana Lucía Torres,
-- Recurso 2 = AMB-102, derivada a Sede 1 = Hospital Regional)
-- -------------------------------------------------
INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (a1111111-1111-1111-1111-111111111111, 'medica', 'Persona inconsciente en vía pública', 'en_atencion', -9.527900, -77.528900,
        'Plaza de Armas, Huaraz', 3, 2, 1, '2026-07-15T10:00:00.000+0000', '2026-07-15T10:12:00.000+0000');

INSERT INTO Alertas_Por_Estado (estado, fecha_creacion, id_alerta, tipo, latitud, longitud, descripcion)
VALUES ('en_atencion', '2026-07-15T10:00:00.000+0000', a1111111-1111-1111-1111-111111111111, 'medica', -9.527900, -77.528900,
        'Persona inconsciente en vía pública');

INSERT INTO Alertas_Por_Operador (id_operador_reporta, fecha_creacion, id_alerta, tipo, estado)
VALUES (3, '2026-07-15T10:00:00.000+0000', a1111111-1111-1111-1111-111111111111, 'medica', 'en_atencion');

-- -------------------------------------------------
-- Alerta 2: seguridad, pendiente (Operador 4 = Jorge Luis Medina,
-- sin recurso/sede asignados todavía)
-- -------------------------------------------------
INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (a2222222-2222-2222-2222-222222222222, 'seguridad', 'Robo en curso reportado por vecinos', 'pendiente', -9.529200, -77.530100,
        'Jr. Comercio 234, Huaraz', 4, null, null, '2026-07-16T09:30:00.000+0000', '2026-07-16T09:30:00.000+0000');

INSERT INTO Alertas_Por_Estado (estado, fecha_creacion, id_alerta, tipo, latitud, longitud, descripcion)
VALUES ('pendiente', '2026-07-16T09:30:00.000+0000', a2222222-2222-2222-2222-222222222222, 'seguridad', -9.529200, -77.530100,
        'Robo en curso reportado por vecinos');

INSERT INTO Alertas_Por_Operador (id_operador_reporta, fecha_creacion, id_alerta, tipo, estado)
VALUES (4, '2026-07-16T09:30:00.000+0000', a2222222-2222-2222-2222-222222222222, 'seguridad', 'pendiente');

-- -------------------------------------------------
-- Alerta 3: incendio, cerrada (Operador 3 = Ana Lucía Torres)
-- -------------------------------------------------
INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (a3333333-3333-3333-3333-333333333333, 'incendio', 'Conato de incendio en vivienda', 'cerrada', -9.524600, -77.532400,
        'Av. Confraternidad Este 567', 3, null, null, '2026-07-10T18:45:00.000+0000', '2026-07-10T20:05:00.000+0000');

INSERT INTO Alertas_Por_Estado (estado, fecha_creacion, id_alerta, tipo, latitud, longitud, descripcion)
VALUES ('cerrada', '2026-07-10T18:45:00.000+0000', a3333333-3333-3333-3333-333333333333, 'incendio', -9.524600, -77.532400,
        'Conato de incendio en vivienda');

INSERT INTO Alertas_Por_Operador (id_operador_reporta, fecha_creacion, id_alerta, tipo, estado)
VALUES (3, '2026-07-10T18:45:00.000+0000', a3333333-3333-3333-3333-333333333333, 'incendio', 'cerrada');

-- -------------------------------------------------------------
-- REPLICIDAD (agregado): repl_instituciones, repl_recursos,
-- repl_operadores y repl_sedes con los MISMOS ids/valores que sus
-- filas maestras en Oracle/Postgres (ver seed.sql de cada motor),
-- tal como quedarían si syncService.js hubiera hecho el espejo
-- automáticamente al crear cada registro desde la página web.
-- -------------------------------------------------------------
INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion) VALUES (1, 'Hospital Regional Ancash', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion) VALUES (2, 'Comisaría Central Huaraz', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion) VALUES (3, 'Compañía de Bomberos N°45', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion) VALUES (4, 'Clínica San Pablo', true, '2026-07-01T08:00:00.000+0000');

INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion) VALUES (1, 'María Fernández Soto', 'mfernandez', 'administrador', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion) VALUES (2, 'Carlos Ramírez Quiroz', 'cramirez', 'operador', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion) VALUES (3, 'Ana Lucía Torres', 'atorres', 'operador', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion) VALUES (4, 'Jorge Luis Medina', 'jmedina', 'operador', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion) VALUES (5, 'Patricia Rojas Vega', 'projas', 'operador', true, '2026-07-01T08:00:00.000+0000');

INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (1, 'ambulancia - AMB-101', 'disponible', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (2, 'ambulancia - AMB-102', 'ocupado', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (3, 'patrulla - PNP-234', 'disponible', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (4, 'patrulla - PNP-567', 'ocupado', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (5, 'bomberos - BOM-045', 'disponible', true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion) VALUES (6, 'ambulancia - AMB-103', 'mantenimiento', true, '2026-07-01T08:00:00.000+0000');

INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion) VALUES (1, 1, 'Av. Luzuriaga 123, Huaraz', 12, 0, true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion) VALUES (2, 2, 'Jr. Simón Bolívar 456, Huaraz', 0, 8, true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion) VALUES (3, 3, 'Av. Confraternidad Internacional 789, Huaraz', 0, 0, true, '2026-07-01T08:00:00.000+0000');
INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion) VALUES (4, 4, 'Jr. José Olaya 321, Huaraz', 6, 0, true, '2026-07-01T08:00:00.000+0000');

-- Nota: en la práctica, cada INSERT en "Alertas" debe replicarse también
-- en "Alertas_Por_Estado" y "Alertas_Por_Operador" desde el backend
-- (ya reflejado arriba en este seed), porque en Cassandra se modela
-- una tabla por cada forma de consulta.
