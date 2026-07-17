const express = require("express");
const { getOracleConnection } = require("../config/oracle");
const { verificarToken } = require("../services/authMiddleware");
const { eliminarInstitucionEnCascada } = require("../services/cascadeService");
const { sincronizarInstitucion } = require("../services/syncService");

const router = express.Router();
router.use(verificarToken);

router.get("/instituciones", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `SELECT * FROM Instituciones WHERE activo = 1 ORDER BY id_institucion`
    );
    res.json(result.rows);
  } finally {
    await conn.close();
  }
});

router.post("/instituciones", async (req, res) => {
  const { nombre, tipo } = req.body;
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `INSERT INTO Instituciones (nombre, tipo) VALUES (:nombre, :tipo)
       RETURNING id_institucion INTO :id`,
      { nombre, tipo, id: { dir: require("oracledb").BIND_OUT, type: require("oracledb").NUMBER } }
    );
    const id_institucion = result.outBinds.id[0];

    // Replicidad: apenas nace la Institución (dueña: Oracle), se
    // propaga su tabla espejo repl_instituciones a Postgres y Cassandra.
    // No revertimos el INSERT en Oracle si esto falla (best effort);
    // el detalle queda en "replicas" para que el frontend/logs lo vean.
    const replicas = await sincronizarInstitucion({ id_institucion, nombre, activo: true });

    res.status(201).json({ id_institucion, nombre, tipo, replicas });
  } finally {
    await conn.close();
  }
});

router.delete("/instituciones/:id", async (req, res) => {
  const resultado = await eliminarInstitucionEnCascada(parseInt(req.params.id, 10));
  res.json({ mensaje: "Institución desactivada en cascada", detalle: resultado });
});

// ---------- SEDES / CAPACIDAD ----------

router.get("/sedes", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `SELECT * FROM Sedes_Capacidad WHERE activo = 1 ORDER BY id_sede`
    );
    res.json(result.rows);
  } finally {
    await conn.close();
  }
});

router.post("/sedes", async (req, res) => {
  const { id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud } = req.body;
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `INSERT INTO Sedes_Capacidad
        (id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud)
       VALUES (:id_institucion, :direccion, :camas, :calabozos, :lat, :lng)
       RETURNING id_sede INTO :id`,
      {
        id_institucion, direccion,
        camas: camas_disponibles || 0,
        calabozos: calabozos_disponibles || 0,
        lat: latitud, lng: longitud,
        id: { dir: require("oracledb").BIND_OUT, type: require("oracledb").NUMBER }
      }
    );
    res.status(201).json({ id_sede: result.outBinds.id[0] });
  } finally {
    await conn.close();
  }
});

// Derivar paciente: usa el procedimiento sp_derivar_paciente (resta 1 cama)
router.post("/sedes/:id/derivar-paciente", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    await conn.execute(
      `BEGIN sp_derivar_paciente(:id_sede); END;`,
      [parseInt(req.params.id, 10)]
    );
    res.json({ mensaje: "Cama descontada correctamente" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await conn.close();
  }
});

router.post("/sedes/:id/derivar-detenido", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    await conn.execute(
      `BEGIN sp_derivar_detenido(:id_sede); END;`,
      [parseInt(req.params.id, 10)]
    );
    res.json({ mensaje: "Calabozo descontado correctamente" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await conn.close();
  }
});

module.exports = router;
