// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Aquí se manejan las Evidencias: las fotos/videos/audios que un
// operador sube cuando cierra un caso. El archivo en sí (la foto,
// el video) se guarda en el disco del servidor (carpeta uploads/);
// en MongoDB solo se guarda la RUTA de ese archivo y los datos
// alrededor (descripción, quién la subió, a qué alerta pertenece).

const express = require("express");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { getMongoDb } = require("../config/mongodb");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");
const { registrarAuditoria } = require("../services/auditService");

const router = express.Router();
router.use(verificarToken);

// -----------------------------------------------------------
// PUNTO 3: SUBIDA DE ARCHIVOS REALES (MongoDB solo guarda la ruta)
// -----------------------------------------------------------
// multer.diskStorage guarda el archivo físico en la carpeta uploads/
// del backend. En MongoDB NUNCA se guarda el archivo en sí, solo la
// ruta (ruta_archivo) donde quedó guardado en disco.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    // nombre único para no pisar archivos con el mismo nombre
    const nombreUnico = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, nombreUnico);
  }
});
// PUNTO (agregado): antes multer aceptaba CUALQUIER archivo, de
// cualquier tamaño. Ahora se limita a 25 MB por archivo y solo se
// aceptan imágenes/videos/audios (lo mismo que ya sugería el
// atributo "accept" del <input type="file">, pero validado en el
// servidor, que es el que de verdad protege el sistema).
const TIPOS_ARCHIVO_VALIDOS = /^(image|video|audio)\//;
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (!TIPOS_ARCHIVO_VALIDOS.test(file.mimetype)) {
      return cb(new Error("Solo se permiten archivos de imagen, video o audio"));
    }
    cb(null, true);
  }
});

// PUNTO (agregado): traduce los errores de multer (archivo muy
// pesado o tipo no permitido) a un JSON con status 400 legible por
// el frontend, en vez de dejar que rompa la request sin respuesta.
function manejarErrorMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "El archivo supera el límite de 25 MB" });
        }
        return res.status(400).json({ error: "No se pudo subir el archivo" });
      }
      if (err) {
        return res.status(400).json({ error: err.message || "Archivo inválido" });
      }
      next();
    });
  };
}

// ==============================
// GET /EVIDENCIAS/ALERTA/:IDALERTA (VER LAS EVIDENCIAS DE UN CASO)
// ==============================
// Trae todas las evidencias (fotos/videos/audios) que están activas
// y que pertenecen a una alerta puntual, para mostrarlas en el
// Historial 360° de ese caso.
router.get("/evidencias/alerta/:idAlerta", async (req, res) => {
  const db = getMongoDb();
  const evidencias = await db.collection("evidencias")
    .find({ id_alerta: req.params.idAlerta, activo: true })
    .toArray();
  res.json(evidencias);
});

// ==============================
// POST /EVIDENCIAS (CREAR UNA EVIDENCIA NUEVA AL CERRAR UN CASO)
// ==============================
// El frontend envía esto como multipart/form-data (FormData), con
// el campo "archivo" siendo el <input type="file"> real. Antes de
// guardar, "congela" una copia mínima del operador (de Postgres) y
// de la ubicación de la alerta (de Cassandra) dentro del mismo
// documento, para no tener que ir a consultarlas de nuevo cada vez
// que se muestra esta evidencia.
router.post("/evidencias", requireRole("operador", "administrador"), manejarErrorMulter(upload.single("archivo")), async (req, res) => {
  const { id_alerta, descripcion } = req.body;
  const id_operador = req.operador.id_operador; // viene del token (login PostgreSQL)

  if (!id_alerta || !descripcion) {
    return res.status(400).json({ error: "id_alerta y descripcion son requeridos" });
  }

  // -----------------------------------------------------------
  // Replicidad: congelamos AQUÍ (al momento de escribir) una copia
  // mínima del Operador (PostgreSQL) y de la Alerta (Cassandra),
  // para que el módulo de Evidencias no tenga que hacer consultas
  // cruzadas cada vez que se muestra "quién cerró el caso" o
  // "dónde ocurrió". Es "best effort": si una de las dos consultas
  // falla, la evidencia se guarda igual (con ese subdocumento en null).
  // -----------------------------------------------------------
  const repl_operador = { id_operador, nombre: null };
  try {
    const r = await pgPool.query(
      `SELECT nombre FROM Operadores WHERE id_operador = $1`,
      [id_operador]
    );
    repl_operador.nombre = r.rows[0]?.nombre || null;
  } catch (err) {
    console.error("[evidencias] No se pudo obtener repl_operador:", err.message);
  }

  const repl_alerta = { id_alerta, latitud: null, longitud: null };
  try {
    const result = await cassandraClient.execute(
      `SELECT latitud, longitud FROM Alertas WHERE id_alerta = ?`,
      [id_alerta],
      { prepare: true }
    );
    if (result.rows[0]) {
      repl_alerta.latitud = result.rows[0].latitud;
      repl_alerta.longitud = result.rows[0].longitud;
    }
  } catch (err) {
    console.error("[evidencias] No se pudo obtener repl_alerta:", err.message);
  }

  // Si vino un archivo real (multer lo dejó en req.file), armamos su
  // registro con la RUTA en disco. MongoDB solo guarda esa ruta, nunca
  // el binario del archivo.
  const archivos_multimedia = [];
  if (req.file) {
    archivos_multimedia.push({
      nombre_archivo: req.file.originalname,
      ruta_archivo: `/uploads/${req.file.filename}`, // ruta pública servida por express.static
      tipo: req.file.mimetype.startsWith("video") ? "video" : "foto",
      fecha_subida: new Date()
    });
  }

  const doc = {
    id_evidencia: uuidv4(),
    id_alerta,
    descripcion,
    id_operador,
    repl_operador,
    repl_alerta,
    archivos_multimedia,
    estado_caso: "cerrado",
    activo: true,
    fecha_creacion: new Date()
  };

  const db = getMongoDb();
  await db.collection("evidencias").insertOne(doc);

  // Auditoría: queda registro de quién subió esta evidencia.
  await registrarAuditoria(id_operador, "SUBIR_EVIDENCIA", "Evidencias", doc.id_evidencia, `Evidencia subida para la alerta '${id_alerta}'`);

  res.status(201).json(doc);
});

// POST agregar un archivo multimedia más a una evidencia existente
// ==============================
// POST /EVIDENCIAS/:ID/ARCHIVOS (SUMAR OTRO ARCHIVO A UNA EVIDENCIA YA CREADA)
// ==============================
// Cuando el operador selecciona varios archivos a la vez, el
// frontend crea la evidencia con el primero (POST /evidencias) y
// después llama esta ruta una vez por cada archivo restante, para
// ir agregándolos a la misma evidencia sin crear documentos duplicados.
router.post("/evidencias/:id/archivos", requireRole("operador", "administrador"), manejarErrorMulter(upload.single("archivo")), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Debes adjuntar un archivo (campo 'archivo')" });
  }

  const nuevoArchivo = {
    nombre_archivo: req.file.originalname,
    ruta_archivo: `/uploads/${req.file.filename}`,
    tipo: req.file.mimetype.startsWith("video") ? "video" : "foto",
    fecha_subida: new Date()
  };

  const db = getMongoDb();
  await db.collection("evidencias").updateOne(
    { id_evidencia: req.params.id },
    { $push: { archivos_multimedia: nuevoArchivo } }
  );

  res.json({ mensaje: "Archivo agregado", archivo: nuevoArchivo });
});

// -----------------------------------------------------------
// DELETE de un registro de Evidencias — SOLO Administrador.
// Evidencias es dueña única de sus datos en MongoDB (no existe
// repl_evidencias en Postgres/Oracle/Cassandra: ningún otro motor
// "posee" una copia de una evidencia, solo la referencian por
// id_alerta/id_operador), así que a diferencia de Operadores,
// Instituciones o Sedes, dar de baja una evidencia NO dispara
// sincronizarX() de syncService.js: el soft delete queda contenido
// enteramente en la colección "evidencias" de MongoDB.
// -----------------------------------------------------------
// ==============================
// DELETE /EVIDENCIAS/:ID (DESACTIVAR UN REGISTRO DE EVIDENCIA)
// ==============================
// Solo el Administrador puede usar esto (igual que el borrado del
// Historial 360°). Es un soft delete: en vez de eliminar el
// documento físicamente, se marca activo=false y se guarda
// fecha_baja, para no perder el rastro de auditoría ni dejar
// rutas de archivo colgando (uploads/) sin registro.
router.delete("/evidencias/:id", requireRole("administrador"), async (req, res) => {
  const db = getMongoDb();
  const r = await db.collection("evidencias").updateOne(
    { id_evidencia: req.params.id, activo: true },
    { $set: { activo: false, fecha_baja: new Date() } }
  );
  // DELETE físico alternativo:
  // const r = await db.collection("evidencias").deleteOne({ id_evidencia: req.params.id });

  if (r.matchedCount === 0) {
    return res.status(404).json({ error: "La evidencia no existe o ya estaba desactivada" });
  }

  // Auditoría: queda registro de qué administrador desactivó esta evidencia.
  await registrarAuditoria(req.operador.id_operador, "ELIMINAR_EVIDENCIA", "Evidencias", req.params.id, "Evidencia desactivada");

  res.json({ mensaje: "Evidencia desactivada correctamente" });
});

module.exports = router;
