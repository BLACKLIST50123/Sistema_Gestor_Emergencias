-- =========================================================
-- SEED DATA - Oracle (Gestión Institucional)
-- =========================================================

INSERT INTO Instituciones (nombre, tipo) VALUES ('Hospital Regional Ancash', 'Hospital');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Comisaría Central Huaraz', 'Comisaria');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Compañía de Bomberos N°45', 'Bomberos');
INSERT INTO Instituciones (nombre, tipo) VALUES ('Clínica San Pablo', 'Hospital');

-- id_institucion 1 = Hospital Regional, 2 = Comisaría, 3 = Bomberos, 4 = Clínica
INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (1, 'Av. Luzuriaga 123, Huaraz', 12, 0, -9.527500, -77.527800);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (2, 'Jr. Simón Bolívar 456, Huaraz', 0, 8, -9.529800, -77.529500);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (3, 'Av. Confraternidad Internacional 789, Huaraz', 0, 0, -9.525100, -77.531200);

INSERT INTO Sedes_Capacidad (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
VALUES (4, 'Jr. José Olaya 321, Huaraz', 6, 0, -9.530900, -77.526700);

COMMIT;

-- Ejemplo de uso del procedimiento (descuenta 1 cama de la sede 1)
-- EXEC sp_derivar_paciente(1);
