const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getMongoDb } = require("../config/mongodb");
const { verificarToken } = require("../services/authMiddleware");

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

  const doc = {
    id_evidencia: uuidv4(),
    id_alerta,
    descripcion,
    id_operador,
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
