const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getMongoDb } = require("../config/mongodb");
const { verificarToken } = require("../services/authMiddleware");
const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");

const router = express.Router();
router.use(verificarToken);

// GET evidencias de una alerta específica
router.get("/evidencias/alerta/:idAlerta", async (req, res) => {
  const db = getMongoDb();
  const evidencias = await db.collection("evidencias")
    .find({ id_alerta: req.params.idAlerta, activo: true })
    .toArray();
  res.json(evidencias);
});

// POST nueva evidencia al cerrar un caso
router.post("/evidencias", async (req, res) => {
  const { id_alerta, descripcion, archivos_multimedia } = req.body;
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

  const doc = {
    id_evidencia: uuidv4(),
    id_alerta,
    descripcion,
    id_operador,
    repl_operador,
    repl_alerta,
    archivos_multimedia: (archivos_multimedia || []).map(a => ({
      ...a,
      fecha_subida: new Date()
    })),
    estado_caso: "cerrado",
    activo: true,
    fecha_creacion: new Date()
  };

  const db = getMongoDb();
  await db.collection("evidencias").insertOne(doc);

  res.status(201).json(doc);
});

// POST agregar un archivo multimedia más a una evidencia existente
router.post("/evidencias/:id/archivos", async (req, res) => {
  const db = getMongoDb();
  const nuevoArchivo = { ...req.body, fecha_subida: new Date() };

  await db.collection("evidencias").updateOne(
    { id_evidencia: req.params.id },
    { $push: { archivos_multimedia: nuevoArchivo } }
  );

  res.json({ mensaje: "Archivo agregado", archivo: nuevoArchivo });
});

module.exports = router;
