const express = require("express");
const bcrypt = require("bcryptjs");
const pgPool = require("../config/postgres");
const { verificarToken } = require("../services/authMiddleware");
const { eliminarOperadorEnCascada } = require("../services/cascadeService");
const { sincronizarRecurso } = require("../services/syncService");

const router = express.Router();
router.use(verificarToken);

// ---------- OPERADORES ----------

router.get("/operadores", async (req, res) => {
  const result = await pgPool.query(
    `SELECT id_operador, nombre, usuario, rol, activo, fecha_creacion FROM Operadores WHERE activo = TRUE ORDER BY id_operador`
  );
  res.json(result.rows);
});

router.post("/operadores", async (req, res) => {
  const { nombre, usuario, contrasena, rol } = req.body;
  if (!nombre || !usuario || !contrasena) {
    return res.status(400).json({ error: "nombre, usuario y contrasena son requeridos" });
  }
  const hash = await bcrypt.hash(contrasena, 10);
  const result = await pgPool.query(
    `INSERT INTO Operadores (nombre, usuario, contrasena_hash, rol) VALUES ($1,$2,$3,$4)
     RETURNING id_operador, nombre, usuario, rol`,
    [nombre, usuario, hash, rol || "operador"]
  );
  res.status(201).json(result.rows[0]);
});

// DELETE en cascada: esto es lo que tu profe quiere ver funcionando
router.delete("/operadores/:id", async (req, res) => {
  const idOperador = parseInt(req.params.id, 10);
  const resultado = await eliminarOperadorEnCascada(idOperador);
  res.json({
    mensaje: `Operador ${idOperador} desactivado en cascada en las 4 bases de datos`,
    detalle: resultado
  });
});

// ---------- RECURSOS ----------

router.get("/recursos", async (req, res) => {
  const result = await pgPool.query(
    `SELECT * FROM Recursos WHERE activo = TRUE ORDER BY id_recurso`
  );
  res.json(result.rows);
});

router.post("/recursos", async (req, res) => {
  const { tipo, placa, estado } = req.body;
  const result = await pgPool.query(
    `INSERT INTO Recursos (tipo, placa, estado) VALUES ($1,$2,$3) RETURNING *`,
    [tipo, placa, estado || "disponible"]
  );
  const recurso = result.rows[0];

  // Replicidad: apenas nace el Recurso (dueño: Postgres), se propaga
  // su tabla espejo repl_recursos a Oracle y Cassandra.
  const replicas = await sincronizarRecurso(recurso);

  res.status(201).json({ ...recurso, replicas });
});

router.put("/recursos/:id/estado", async (req, res) => {
  const { estado } = req.body;
  const result = await pgPool.query(
    `UPDATE Recursos SET estado = $1 WHERE id_recurso = $2 RETURNING *`,
    [estado, req.params.id]
  );
  const recurso = result.rows[0];

  // El estado ("disponible","ocupado", etc.) es justo el campo que
  // viven las tablas repl_recursos, así que cada cambio de estado
  // también debe re-sincronizarse (no solo la creación).
  const replicas = recurso ? await sincronizarRecurso(recurso) : null;

  res.json({ ...recurso, replicas });
});

router.delete("/recursos/:id", async (req, res) => {
  const result = await pgPool.query(
    `UPDATE Recursos SET activo = FALSE WHERE id_recurso = $1 RETURNING *`,
    [req.params.id]
  );
  const recurso = result.rows[0];

  // Replicidad: el soft delete también se propaga a las réplicas
  // (reusa la misma función de upsert, pasando activo = false).
  const replicas = recurso ? await sincronizarRecurso(recurso) : null;

  res.json({ mensaje: "Recurso desactivado", replicas });
});

module.exports = router;
