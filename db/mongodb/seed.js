// =========================================================
// SEED DATA - MongoDB (Evidencias Multimedia)
// Ejecutar con: mongosh sge_evidencias seed.js
// =========================================================

db = db.getSiblingDB("sge_evidencias");

db.evidencias.insertMany([
  {
    id_evidencia: "ev-0001-uuid",
    id_alerta: "alt-uuid-medica-001",   // debe coincidir con un id_alerta real de Cassandra
    descripcion: "Paciente estabilizado y trasladado al Hospital Regional Ancash. Se adjunta registro fotográfico del lugar y del reporte médico inicial.",
    id_operador: 3,                      // Ana Lucía Torres (PostgreSQL)
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
    id_alerta: "alt-uuid-incendio-003",
    descripcion: "Conato de incendio controlado por bomberos. Sin heridos. Se documenta el estado de la vivienda tras la intervención.",
    id_operador: 4,                      // Jorge Luis Medina
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
