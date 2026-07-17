// =========================================================
// MONGODB - Módulo: EVIDENCIAS MULTIMEDIA
// Sistema de Gestión de Emergencias (SGE)
// =========================================================
// Ejecutar con: mongosh sge_evidencias schema-validation.js

db = db.getSiblingDB("sge_evidencias");

db.createCollection("evidencias", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id_evidencia", "id_alerta", "descripcion", "id_operador", "archivos_multimedia"],
      properties: {
        id_evidencia: {
          bsonType: "string",
          description: "UUID propio del documento (string, generado en backend)"
        },
        id_alerta: {
          bsonType: "string",
          description: "UUID de la alerta en Cassandra (vínculo lógico entre BD)"
        },
        descripcion: {
          bsonType: "string",
          description: "Descripción del cierre / hallazgo del caso"
        },
        id_operador: {
          bsonType: "int",
          description: "ID del operador que cerró el caso (viene del login en PostgreSQL)"
        },
        // -------------------------------------------------------
        // REPLICIDAD (subdocumentos espejo): repl_operador y repl_alerta
        // Desnormalización controlada de los dominios "Usuarios y
        // Recursos" (Postgres) y "Alertas en Tiempo Real" (Cassandra).
        // Se congela aquí una copia mínima al momento de crear la
        // evidencia, para que el módulo de Evidencias pueda mostrar
        // "quién cerró el caso" y "dónde ocurrió" sin tener que
        // consultar Postgres/Cassandra cada vez (evita consultas
        // cruzadas pesadas). No son "required" porque son
        // datos de apoyo, no la clave primaria del documento; si
        // por algún error de red no se pudieron obtener al
        // momento de escribir, la evidencia igual se guarda.
        // -------------------------------------------------------
        repl_operador: {
          bsonType: "object",
          description: "Espejo de datos clave del Operador (dueño real: PostgreSQL)",
          required: ["id_operador"],
          properties: {
            id_operador: { bsonType: "int" },
            nombre: { bsonType: ["string", "null"] }
          }
        },
        repl_alerta: {
          bsonType: "object",
          description: "Espejo de coordenadas básicas de la Alerta (dueño real: Cassandra)",
          required: ["id_alerta"],
          properties: {
            id_alerta: { bsonType: "string" },
            latitud: { bsonType: ["double", "null"] },
            longitud: { bsonType: ["double", "null"] }
          }
        },
        archivos_multimedia: {
          bsonType: "array",
          description: "Array de objetos, cada uno una foto/video",
          items: {
            bsonType: "object",
            required: ["tipo", "url", "fecha_subida"],
            properties: {
              tipo: { enum: ["foto", "video", "audio"] },
              url: { bsonType: "string" },
              nombre_archivo: { bsonType: "string" },
              tamano_kb: { bsonType: ["int", "double"] },
              fecha_subida: { bsonType: "date" }
            }
          }
        },
        estado_caso: {
          enum: ["cerrado", "reabierto"],
          description: "Estado del caso al momento de guardar evidencia"
        },
        activo: {
          bsonType: "bool",
          description: "Soft delete: false = eliminado lógicamente"
        },
        fecha_creacion: { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Índices: acelera búsquedas por alerta y por operador (útil para
// el borrado en cascada manual desde el backend)
db.evidencias.createIndex({ id_alerta: 1 });
db.evidencias.createIndex({ id_operador: 1 });
db.evidencias.createIndex({ activo: 1 });
