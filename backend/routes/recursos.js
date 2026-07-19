const express = require("express");
const pgPool = require("../config/postgres");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const { eliminarOperadorEnCascada } = require("../services/cascadeService");
const { sincronizarRecurso, sincronizarOperador } = require("../services/syncService");
const { ordenarRecursosPorPrioridad } = require("../services/geoService");

const router = express.Router();
router.use(verificarToken);

// ---------- OPERADORES ----------

router.get("/operadores", async (req, res) => {
  const result = await pgPool.query(
    `SELECT id_operador, nombre, usuario, rol, activo, fecha_creacion FROM Operadores WHERE activo = TRUE ORDER BY id_operador`
  );
  res.json(result.rows);
});

router.post("/operadores", requireRole("administrador"), async (req, res) => {
  const { nombre, usuario, contrasena, rol } = req.body;
  if (!nombre || !usuario || !contrasena) {
    return res.status(400).json({ error: "nombre, usuario y contrasena son requeridos" });
  }
  const result = await pgPool.query(
    `INSERT INTO Operadores (nombre, usuario, contrasena_hash, rol) VALUES ($1,$2,$3,$4)
     RETURNING id_operador, nombre, usuario, rol, activo`,
    [nombre, usuario, contrasena, rol || "operador"]
  );
  const operador = result.rows[0];

  // Replicidad: apenas nace el Operador (dueño: Postgres), se propaga
  // su tabla espejo repl_operadores a Oracle y Cassandra.
  const replicas = await sincronizarOperador(operador);

  res.status(201).json({ ...operador, replicas });
});

// PUT editar un operador existente (nombre, usuario, rol y, opcionalmente,
// contraseña nueva). Solo el Administrador puede hacerlo. Se usa desde el
// panel de edición de "Usuarios y recursos" en el frontend.
router.put("/operadores/:id", requireRole("administrador"), async (req, res) => {
  const { nombre, usuario, rol, contrasena } = req.body;
  const idOperador = parseInt(req.params.id, 10);

  if (!nombre || !usuario || !rol) {
    return res.status(400).json({ error: "nombre, usuario y rol son requeridos" });
  }

  let result;
  if (contrasena) {
    result = await pgPool.query(
      `UPDATE Operadores SET nombre = $1, usuario = $2, rol = $3, contrasena_hash = $4
       WHERE id_operador = $5 AND activo = TRUE
       RETURNING id_operador, nombre, usuario, rol, activo`,
      [nombre, usuario, rol, contrasena, idOperador]
    );
  } else {
    result = await pgPool.query(
      `UPDATE Operadores SET nombre = $1, usuario = $2, rol = $3
       WHERE id_operador = $4 AND activo = TRUE
       RETURNING id_operador, nombre, usuario, rol, activo`,
      [nombre, usuario, rol, idOperador]
    );
  }

  const operador = result.rows[0];
  if (!operador) {
    return res.status(404).json({ error: "Operador no encontrado o inactivo" });
  }

  // Replicidad: la edición también se propaga a repl_operadores
  const replicas = await sincronizarOperador(operador);

  res.json({ ...operador, replicas });
});

// DELETE en cascada: esto es lo que tu profe quiere ver funcionando
router.delete("/operadores/:id", requireRole("administrador"), async (req, res) => {
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

// -----------------------------------------------------------
// PUNTO 1: Prioridad en Despacho
// -----------------------------------------------------------
// Devuelve los recursos DISPONIBLES ordenados según la prioridad de
// despacho que corresponde al tipo de emergencia:
//   medica     -> 1° Ambulancias, 2° Bomberos, 3° Patrullas
//   incendio   -> 1° Bomberos, 2° Patrullas, 3° Ambulancias
//   seguridad  -> 1° Patrullas, 2° Ambulancias, 3° Bomberos
//   accidente  -> 1° Ambulancias, 2° Patrullas, 3° Bomberos
// El orden se calcula en el backend (geoService.js) para que el
// frontend solo tenga que pintar la lista tal cual la recibe.
router.get("/recursos/despacho/:tipoEmergencia", async (req, res) => {
  const { tipoEmergencia } = req.params;
  const result = await pgPool.query(
    `SELECT * FROM Recursos WHERE activo = TRUE AND estado = 'disponible' ORDER BY id_recurso`
  );
  const ordenados = ordenarRecursosPorPrioridad(result.rows, tipoEmergencia);
  res.json(ordenados);
});

router.post("/recursos", requireRole("administrador"), async (req, res) => {
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

// PUT editar un recurso completo (tipo, placa, estado). Pensado para el
// panel de edición del Administrador (distinto del PUT /estado, que usa
// el flujo de despacho para solo cambiar el estado al asignar/liberar).
router.put("/recursos/:id", requireRole("administrador"), async (req, res) => {
  const { tipo, placa, estado } = req.body;
  if (!tipo || !placa) {
    return res.status(400).json({ error: "tipo y placa son requeridos" });
  }
  const result = await pgPool.query(
    `UPDATE Recursos SET tipo = $1, placa = $2, estado = COALESCE($3, estado)
     WHERE id_recurso = $4 AND activo = TRUE RETURNING *`,
    [tipo, placa, estado || null, req.params.id]
  );
  const recurso = result.rows[0];
  if (!recurso) {
    return res.status(404).json({ error: "Recurso no encontrado o inactivo" });
  }

  const replicas = await sincronizarRecurso(recurso);

  res.json({ ...recurso, replicas });
});

router.put("/recursos/:id/estado", requireRole("operador", "administrador"), async (req, res) => {
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

router.delete("/recursos/:id", requireRole("administrador"), async (req, res) => {
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
