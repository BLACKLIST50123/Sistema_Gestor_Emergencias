-- =========================================================
-- SEED DATA - Cassandra (Alertas en Tiempo Real)
-- Coordenadas de ejemplo en Huaraz, Ancash, Perú
-- =========================================================
USE sge_alertas;

INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (uuid(), 'medica', 'Persona inconsciente en vía pública', 'en_atencion', -9.527900, -77.528900,
        'Plaza de Armas, Huaraz', 3, 2, 1, toTimestamp(now()), toTimestamp(now()));

INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (uuid(), 'seguridad', 'Robo en curso reportado por vecinos', 'pendiente', -9.529200, -77.530100,
        'Jr. Comercio 234, Huaraz', 4, NULL, NULL, toTimestamp(now()), toTimestamp(now()));

INSERT INTO Alertas (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
                      id_operador_reporta, id_recurso_asignado, id_sede_derivacion,
                      fecha_creacion, fecha_actualizacion)
VALUES (uuid(), 'incendio', 'Conato de incendio en vivienda', 'cerrada', -9.524600, -77.532400,
        'Av. Confraternidad Este 567', 3, NULL, NULL, toTimestamp(now()), toTimestamp(now()));

-- Nota: en la práctica, cada INSERT en "Alertas" debe replicarse también
-- en "Alertas_Por_Estado" y "Alertas_Por_Operador" desde el backend,
-- porque en Cassandra tú modelas una tabla por cada consulta.
