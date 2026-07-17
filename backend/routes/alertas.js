const express = require("express");
const { v4: uuidv4 } = require("uuid");
const cassandraClient = require("../config/cassandra");
const pgPool = require("../config/postgres");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const { sincronizarRecurso } = require("../services/syncService");

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
router.post("/alertas", requireRole("operador", "administrador"), async (req, res) => {
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

// -----------------------------------------------------------
// PUNTO 4: FLUJO DE DESPACHO — asignar un Recurso a una Alerta
// -----------------------------------------------------------
// "Match": el operador elige un recurso disponible (Postgres) y lo
// asocia a una alerta (Cassandra). "Trigger": ese mismo request
// cambia el estado del recurso a 'ocupado' (= "En Emergencia" en
// la UI) para que ya no aparezca como disponible para otra alerta.
router.put("/alertas/:id/asignar-recurso", requireRole("operador", "administrador"), async (req, res) => {
  const id_alerta = req.params.id;
  const { id_recurso } = req.body;

  if (!id_recurso) {
    return res.status(400).json({ error: "id_recurso es requerido" });
  }

  // 1) Cambiar el estado del recurso en su BD dueña (PostgreSQL)
  const recursoResult = await pgPool.query(
    `UPDATE Recursos SET estado = 'ocupado' WHERE id_recurso = $1 AND activo = TRUE RETURNING *`,
    [id_recurso]
  );
  const recurso = recursoResult.rows[0];
  if (!recurso) {
    return res.status(404).json({ error: "Recurso no encontrado o inactivo" });
  }

  // Replicidad: el cambio de estado también se propaga a repl_recursos
  const replicas = await sincronizarRecurso(recurso);

  // 2) Vincular el recurso a la alerta y pasarla a 'en_atencion' (Cassandra)
  await cassandraClient.execute(
    `UPDATE Alertas SET id_recurso_asignado = ?, estado = ?, fecha_actualizacion = ? WHERE id_alerta = ?`,
    [id_recurso, "en_atencion", new Date(), id_alerta],
    { prepare: true }
  );

  res.json({
    mensaje: `Recurso ${id_recurso} asignado a la alerta y marcado como 'En Emergencia'`,
    recurso,
    replicas
  });
});

// PUT cambiar estado de una alerta (ej: pendiente -> en_atencion -> cerrada)
router.put("/alertas/:id/estado", requireRole("operador", "administrador"), async (req, res) => {
  const { estado } = req.body;
  const id_alerta = req.params.id;

  await cassandraClient.execute(
    `UPDATE Alertas SET estado = ?, fecha_actualizacion = ? WHERE id_alerta = ?`,
    [estado, new Date(), id_alerta],
    { prepare: true }
  );

  let recursoLiberado = null;

  // Cierre: al cerrar la alerta se libera el recurso asignado
  // (vuelve a 'disponible') para que quede libre para otra emergencia.
  if (estado === "cerrada") {
    const alertaResult = await cassandraClient.execute(
      `SELECT id_recurso_asignado FROM Alertas WHERE id_alerta = ?`,
      [id_alerta],
      { prepare: true }
    );
    const idRecursoAsignado = alertaResult.rows[0]?.id_recurso_asignado;

    if (idRecursoAsignado) {
      const recursoResult = await pgPool.query(
        `UPDATE Recursos SET estado = 'disponible' WHERE id_recurso = $1 RETURNING *`,
        [idRecursoAsignado]
      );
      recursoLiberado = recursoResult.rows[0] || null;
      if (recursoLiberado) {
        await sincronizarRecurso(recursoLiberado);
      }
    }
  }

  res.json({
    mensaje: "Estado actualizado",
    id_alerta,
    estado,
    recursoLiberado,
    // El frontend usa esta bandera para habilitar el botón
    // "Subir evidencia" apenas se cierra el caso.
    habilitarEvidencias: estado === "cerrada"
  });
});

// -----------------------------------------------------------
// PUNTO 4: HISTORIAL 360°
// -----------------------------------------------------------
// Junta en una sola respuesta lo que está repartido en las 4 BD:
//   - Cassandra: los datos de la alerta en sí
//   - PostgreSQL: el recurso que atendió (si hubo uno asignado)
//   - Oracle: la sede/institución de derivación (si hubo una)
//   - MongoDB: las evidencias (fotos/videos) subidas al cerrar el caso
router.get("/historial/:id_alerta", async (req, res) => {
  const id_alerta = req.params.id_alerta;
  const historial = { alerta: null, recurso: null, sede: null, institucion: null, evidencias: [] };

  // 1) Alerta (Cassandra) — es la base: si no existe, no hay nada que juntar
  const alertaResult = await cassandraClient.execute(
    `SELECT * FROM Alertas WHERE id_alerta = ?`,
    [id_alerta],
    { prepare: true }
  );
  historial.alerta = alertaResult.rows[0] || null;
  if (!historial.alerta) {
    return res.status(404).json({ error: "Alerta no encontrada" });
  }

  // 2) Recurso que atendió (PostgreSQL)
  if (historial.alerta.id_recurso_asignado) {
    const r = await pgPool.query(
      `SELECT * FROM Recursos WHERE id_recurso = $1`,
      [historial.alerta.id_recurso_asignado]
    );
    historial.recurso = r.rows[0] || null;
  }

  // 3) Sede / institución de derivación (Oracle)
  if (historial.alerta.id_sede_derivacion) {
    const { getOracleConnection } = require("../config/oracle");
    const conn = await getOracleConnection();
    try {
      const sedeResult = await conn.execute(
        `SELECT * FROM Sedes_Capacidad WHERE id_sede = :id`,
        [historial.alerta.id_sede_derivacion]
      );
      historial.sede = sedeResult.rows[0] || null;

      if (historial.sede) {
        const institucionResult = await conn.execute(
          `SELECT * FROM Instituciones WHERE id_institucion = :id`,
          [historial.sede.ID_INSTITUCION]
        );
        historial.institucion = institucionResult.rows[0] || null;
      }
    } finally {
      await conn.close();
    }
  }

  // 4) Evidencias multimedia (MongoDB)
  const { getMongoDb } = require("../config/mongodb");
  const db = getMongoDb();
  historial.evidencias = await db.collection("evidencias")
    .find({ id_alerta, activo: true })
    .toArray();

  res.json(historial);
});

module.exports = router;
