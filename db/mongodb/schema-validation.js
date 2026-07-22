// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo crea las colecciones de MongoDB y les pone reglas de
// validación (qué campos son obligatorios y de qué tipo). Es dueño
// de "evidencias" (fotos/videos/audios de los casos cerrados), y
// también guarda las 4 colecciones espejo (repl_instituciones,
// repl_recursos, repl_operadores, repl_sedes) con copias de lo que
// vive en las otras 3 bases de datos.

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
            required: ["tipo", "fecha_subida"],
            properties: {
              tipo: { enum: ["foto", "video", "audio"] },
              url: { bsonType: "string" },
              ruta_archivo: { bsonType: "string" },
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

// =========================================================
// REPLICIDAD (agregado): tablas espejo repl_* en MongoDB
// =========================================================
// Hasta ahora MongoDB solo tenía "evidencias" (con subdocumentos
// repl_operador/repl_alerta congelados por evidencia). Se agregan
// aquí las mismas 4 colecciones espejo que ya existen en
// Postgres/Oracle/Cassandra, para que Mongo también pueda mostrar
// nombres de Instituciones/Recursos/Operadores/Sedes sin tener que
// consultar los otros 3 motores cada vez. Las escribe únicamente
// syncService.js (backend/services/syncService.js) vía upsert; el
// resto del sistema solo las lee.
//
// Igual que en los demás motores: el id NUNCA lo genera Mongo,
// siempre lo define la BD dueña real del dato (Oracle para
// instituciones/sedes, PostgreSQL para operadores/recursos).

db.createCollection("repl_instituciones", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id_institucion", "nombre", "activo"],
      properties: {
        id_institucion: { bsonType: "int", description: "Id definido por Oracle (dueño real)" },
        nombre: { bsonType: "string" },
        activo: { bsonType: "bool" },
        fecha_sincronizacion: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
db.repl_instituciones.createIndex({ id_institucion: 1 }, { unique: true });
db.repl_instituciones.createIndex({ activo: 1 });

db.createCollection("repl_recursos", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id_recurso", "nombre", "estado", "activo"],
      properties: {
        id_recurso: { bsonType: "int", description: "Id definido por PostgreSQL (dueño real)" },
        nombre: { bsonType: "string", description: "tipo + placa concatenados (Postgres no tiene columna 'nombre')" },
        estado: { bsonType: "string" },
        activo: { bsonType: "bool" },
        fecha_sincronizacion: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
db.repl_recursos.createIndex({ id_recurso: 1 }, { unique: true });
db.repl_recursos.createIndex({ activo: 1 });

db.createCollection("repl_operadores", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id_operador", "nombre", "usuario", "rol", "activo"],
      properties: {
        id_operador: { bsonType: "int", description: "Id definido por PostgreSQL (dueño real)" },
        nombre: { bsonType: "string" },
        usuario: { bsonType: "string" },
        rol: { bsonType: "string", description: "'operador' o 'administrador'; nunca se replica la contraseña" },
        activo: { bsonType: "bool" },
        fecha_sincronizacion: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
db.repl_operadores.createIndex({ id_operador: 1 }, { unique: true });
db.repl_operadores.createIndex({ activo: 1 });

db.createCollection("repl_sedes", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id_sede", "id_institucion", "direccion", "activo"],
      properties: {
        id_sede: { bsonType: "int", description: "Id definido por Oracle (dueño real)" },
        id_institucion: { bsonType: "int" },
        direccion: { bsonType: "string" },
        camas_disponibles: { bsonType: ["int", "double"] },
        calabozos_disponibles: { bsonType: ["int", "double"] },
        activo: { bsonType: "bool" },
        fecha_sincronizacion: { bsonType: "date" }
      }
    }
  },
  validationLevel: "moderate",
  validationAction: "error"
});
db.repl_sedes.createIndex({ id_sede: 1 }, { unique: true });
db.repl_sedes.createIndex({ activo: 1 });
