// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Llena MongoDB con 2 evidencias de ejemplo (ligadas a alertas
// reales de Cassandra) y con las copias de Instituciones/Operadores/
// Recursos/Sedes que "nacieron" en las otras bases de datos.

// =========================================================
// SEED DATA - MongoDB (Evidencias Multimedia + Replicidad)
// Ejecutar con: mongosh sge_evidencias seed.js
// =========================================================
// id_alerta usa los MISMOS UUIDs fijos definidos en
// db/cassandra/seed.cql, para que el vínculo lógico Mongo -> Cassandra
// sea real (antes se usaban UUIDs inventados que no existían en
// Cassandra). id_operador usa los MISMOS ids de db/postgres/seed.sql.

db = db.getSiblingDB("sge_evidencias");

db.evidencias.insertMany([
  {
    id_evidencia: "ev-0001-uuid",
    id_alerta: "a1111111-1111-1111-1111-111111111111",   // Alerta médica (Cassandra), Operador 3
    descripcion: "Paciente estabilizado y trasladado al Hospital Regional Ancash. Se adjunta registro fotográfico del lugar y del reporte médico inicial.",
    id_operador: 3,                      // Ana Lucía Torres (PostgreSQL)
    // REPLICIDAD (agregado): subdocumentos espejo congelados al
    // momento de crear la evidencia, igual que hace el backend en
    // routes/evidencias.js (repl_operador desde Postgres, repl_alerta
    // desde Cassandra).
    repl_operador: { id_operador: 3, nombre: "Ana Lucía Torres" },
    repl_alerta: { id_alerta: "a1111111-1111-1111-1111-111111111111", latitud: -9.527900, longitud: -77.528900 },
    archivos_multimedia: [
      {
        tipo: "foto",
        url: "https://storage.sge.local/evidencias/ev-0001/foto1.jpg",
        nombre_archivo: "escena_01.jpg",
        tamano_kb: 2450,
        fecha_subida: new Date()
      },
      {
        tipo: "video",
        url: "https://storage.sge.local/evidencias/ev-0001/video1.mp4",
        nombre_archivo: "traslado.mp4",
        tamano_kb: 18320,
        fecha_subida: new Date()
      }
    ],
    estado_caso: "cerrado",
    activo: true,
    fecha_creacion: new Date()
  },
  {
    id_evidencia: "ev-0002-uuid",
    id_alerta: "a3333333-3333-3333-3333-333333333333",   // Alerta de incendio (Cassandra), Operador 4
    descripcion: "Conato de incendio controlado por bomberos. Sin heridos. Se documenta el estado de la vivienda tras la intervención.",
    id_operador: 4,                      // Jorge Luis Medina
    repl_operador: { id_operador: 4, nombre: "Jorge Luis Medina" },
    repl_alerta: { id_alerta: "a3333333-3333-3333-3333-333333333333", latitud: -9.524600, longitud: -77.532400 },
    archivos_multimedia: [
      {
        tipo: "foto",
        url: "https://storage.sge.local/evidencias/ev-0002/foto1.jpg",
        nombre_archivo: "vivienda_danos.jpg",
        tamano_kb: 3100,
        fecha_subida: new Date()
      }
    ],
    estado_caso: "cerrado",
    activo: true,
    fecha_creacion: new Date()
  }
]);

// =========================================================
// REPLICIDAD (agregado): repl_instituciones, repl_recursos,
// repl_operadores y repl_sedes con los MISMOS ids/valores que sus
// filas maestras en Oracle/PostgreSQL (ver seed.sql de cada motor),
// tal como quedarían si syncService.js hubiera hecho el espejo
// automáticamente al crear cada registro desde la página web.
// =========================================================

db.repl_instituciones.insertMany([
  { id_institucion: 1, nombre: "Hospital Regional Ancash", activo: true, fecha_sincronizacion: new Date() },
  { id_institucion: 2, nombre: "Comisaría Central Huaraz", activo: true, fecha_sincronizacion: new Date() },
  { id_institucion: 3, nombre: "Compañía de Bomberos N°45", activo: true, fecha_sincronizacion: new Date() },
  { id_institucion: 4, nombre: "Clínica San Pablo", activo: true, fecha_sincronizacion: new Date() }
]);

db.repl_operadores.insertMany([
  { id_operador: 1, nombre: "María Fernández Soto", usuario: "mfernandez", rol: "administrador", activo: true, fecha_sincronizacion: new Date() },
  { id_operador: 2, nombre: "Carlos Ramírez Quiroz", usuario: "cramirez", rol: "operador", activo: true, fecha_sincronizacion: new Date() },
  { id_operador: 3, nombre: "Ana Lucía Torres", usuario: "atorres", rol: "operador", activo: true, fecha_sincronizacion: new Date() },
  { id_operador: 4, nombre: "Jorge Luis Medina", usuario: "jmedina", rol: "operador", activo: true, fecha_sincronizacion: new Date() },
  { id_operador: 5, nombre: "Patricia Rojas Vega", usuario: "projas", rol: "operador", activo: true, fecha_sincronizacion: new Date() }
]);

db.repl_recursos.insertMany([
  { id_recurso: 1, nombre: "ambulancia - AMB-101", estado: "disponible", activo: true, fecha_sincronizacion: new Date() },
  { id_recurso: 2, nombre: "ambulancia - AMB-102", estado: "ocupado", activo: true, fecha_sincronizacion: new Date() },
  { id_recurso: 3, nombre: "patrulla - PNP-234", estado: "disponible", activo: true, fecha_sincronizacion: new Date() },
  { id_recurso: 4, nombre: "patrulla - PNP-567", estado: "ocupado", activo: true, fecha_sincronizacion: new Date() },
  { id_recurso: 5, nombre: "bomberos - BOM-045", estado: "disponible", activo: true, fecha_sincronizacion: new Date() },
  { id_recurso: 6, nombre: "ambulancia - AMB-103", estado: "mantenimiento", activo: true, fecha_sincronizacion: new Date() }
]);

db.repl_sedes.insertMany([
  { id_sede: 1, id_institucion: 1, direccion: "Av. Luzuriaga 123, Huaraz", camas_disponibles: 12, calabozos_disponibles: 0, activo: true, fecha_sincronizacion: new Date() },
  { id_sede: 2, id_institucion: 2, direccion: "Jr. Simón Bolívar 456, Huaraz", camas_disponibles: 0, calabozos_disponibles: 8, activo: true, fecha_sincronizacion: new Date() },
  { id_sede: 3, id_institucion: 3, direccion: "Av. Confraternidad Internacional 789, Huaraz", camas_disponibles: 0, calabozos_disponibles: 0, activo: true, fecha_sincronizacion: new Date() },
  { id_sede: 4, id_institucion: 4, direccion: "Jr. José Olaya 321, Huaraz", camas_disponibles: 6, calabozos_disponibles: 0, activo: true, fecha_sincronizacion: new Date() }
]);
