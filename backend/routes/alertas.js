const express = require("express");
const { v4: uuidv4 } = require("uuid");
const cassandraClient = require("../config/cassandra");
const { verificarToken } = require("../services/authMiddleware");

const router = express.Router();
router.use(verificarToken);

// GET todas las alertas activas (para pintar el mapa)
router.get("/alertas", async (req, res) => {
  const result = await cassandraClient.execute(
    `SELECT * FROM Alertas`,
    [],
    { prepare: true }
  );
  res.json(result.rows);
});

// GET alertas por estado (ej: pendientes para el dashboard)
router.get("/alertas/estado/:estado", async (req, res) => {
  const result = await cassandraClient.execute(
    `SELECT * FROM Alertas_Por_Estado WHERE estado = ?`,
    [req.params.estado],
    { prepare: true }
  );
  res.json(result.rows);
});

// POST nueva alerta -> esto es lo que dispara el pin en el mapa
// y guarda la ubicación en la BD, tal como pediste
router.post("/alertas", async (req, res) => {
  const { tipo, descripcion, latitud, longitud, direccion_referencial, id_recurso_asignado } = req.body;
  const id_alerta = uuidv4();
  const ahora = new Date();
  const id_operador_reporta = req.operador.id_operador;

  if (latitud == null || longitud == null) {
    return res.status(400).json({ error: "latitud y longitud son requeridas" });
  }

  const batch = [
    {
      query: `INSERT INTO Alertas
        (id_alerta, tipo, descripcion, estado, latitud, longitud, direccion_referencial,
         id_operador_reporta, id_recurso_asignado, fecha_creacion, fecha_actualizacion)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      params: [id_alerta, tipo, descripcion, "pendiente", latitud, longitud,
                direccion_referencial, id_operador_reporta, id_recurso_asignado || null, ahora, ahora]
    },
    {
      query: `INSERT INTO Alertas_Por_Estado
        (estado, fecha_creacion, id_alerta, tipo, latitud, longitud, descripcion)
        VALUES (?,?,?,?,?,?,?)`,
      params: ["pendiente", ahora, id_alerta, tipo, latitud, longitud, descripcion]
    },
    {
      query: `INSERT INTO Alertas_Por_Operador
        (id_operador_reporta, fecha_creacion, id_alerta, tipo, estado)
        VALUES (?,?,?,?,?)`,
      params: [id_operador_reporta, ahora, id_alerta, tipo, "pendiente"]
    }
  ];

  await cassandraClient.batch(batch, { prepare: true });

  res.status(201).json({
    id_alerta, tipo, descripcion, estado: "pendiente",
    latitud, longitud, direccion_referencial, fecha_creacion: ahora
  });
});

// PUT cambiar estado de una alerta (ej: pendiente -> en_atencion -> cerrada)
router.put("/alertas/:id/estado", async (req, res) => {
  const { estado } = req.body;
  await cassandraClient.execute(
    `UPDATE Alertas SET estado = ?, fecha_actualizacion = ? WHERE id_alerta = ?`,
    [estado, new Date(), req.params.id],
    { prepare: true }
  );
  res.json({ mensaje: "Estado actualizado", id_alerta: req.params.id, estado });
});

module.exports = router;
