// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo junta dos módulos que viven en la misma base de
// datos (PostgreSQL): los Operadores (los usuarios que usan el
// sistema, con su rol) y los Recursos (ambulancias, patrullas,
// bomberos). Acá se puede listar, crear, editar, cambiar de estado
// y dar de baja tanto a unos como a otros, y cada cambio se propaga
// automáticamente a las tablas espejo de las otras bases de datos.

const express = require("express");
const pgPool = require("../config/postgres");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const { eliminarOperadorEnCascada } = require("../services/cascadeService");
const { sincronizarRecurso, sincronizarOperador } = require("../services/syncService");
const { ordenarRecursosPorPrioridad } = require("../services/geoService");
const { registrarAuditoria } = require("../services/auditService");

const router = express.Router();
router.use(verificarToken);

// PUNTO (agregado): expresiones regulares de validación, iguales a
// las que ya usa el frontend, para que aunque alguien llame a la API
// directo (sin pasar por el formulario) no pueda meter datos sucios.
// - NOMBRE_PERSONA_REGEX: nombre completo de un operador -> solo
//   letras (con tildes/ñ) y espacios, nada de números ni símbolos.
// - USUARIO_REGEX: usuario de login -> letras, números, "_" y "."
//   sin espacios (para que no se rompa el login por espacios raros).
// - PLACA_REGEX: 3 letras + guión + 3 números, como en el seed
//   (AMB-101, PNP-234, BOM-045).
const NOMBRE_PERSONA_REGEX = /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]+$/;
const USUARIO_REGEX = /^[A-Za-z0-9_.]+$/;
const PLACA_REGEX = /^[A-Za-z]{3}-\d{3}$/;

// ---------- OPERADORES ----------

// ==============================
// GET /OPERADORES (LISTAR OPERADORES, ACTIVOS O TODOS)
// ==============================
// PUNTO (agregado): por defecto sigue devolviendo solo los activos
// (para no romper nada que ya dependa de esta ruta), pero si se pide
// con ?incluirInactivos=true trae también los desactivados, con los
// activos siempre primero (activo DESC) para que la tabla del panel
// de administración los pueda pintar en blanco arriba / gris abajo.
router.get("/operadores", async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true" || req.query.incluirInactivos === "1";
  const result = incluirInactivos
    ? await pgPool.query(
        `SELECT id_operador, nombre, usuario, rol, activo, fecha_creacion FROM Operadores ORDER BY activo DESC, id_operador`
      )
    : await pgPool.query(
        `SELECT id_operador, nombre, usuario, rol, activo, fecha_creacion FROM Operadores WHERE activo = TRUE ORDER BY id_operador`
      );
  res.json(result.rows);
});

// PUNTO (agregado): valores permitidos, deben calzar con el <select>
// de rol y de tipo en el frontend, y con los CHECK de la base de datos.
const ROLES_VALIDOS = ["operador", "administrador"];
const TIPOS_RECURSO_VALIDOS = ["ambulancia", "patrulla", "bomberos", "otro"];
const ESTADOS_RECURSO_VALIDOS = ["disponible", "ocupado", "mantenimiento", "fuera_de_servicio"];

// ==============================
// POST /OPERADORES (CREAR UN OPERADOR NUEVO)
// ==============================
// Solo Administrador. Valida los campos obligatorios y el rol,
// crea el operador en PostgreSQL (dueño) y avisa si el usuario ya
// existía (usuario es UNIQUE), y propaga la copia a repl_operadores.
router.post("/operadores", requireRole("administrador"), async (req, res) => {
  const { nombre, usuario, contrasena, rol } = req.body;
  if (!nombre || !usuario || !contrasena) {
    return res.status(400).json({ error: "nombre, usuario y contrasena son requeridos" });
  }
  if (!NOMBRE_PERSONA_REGEX.test(nombre)) {
    return res.status(400).json({ error: "El nombre completo solo puede contener letras y espacios" });
  }
  if (!USUARIO_REGEX.test(usuario)) {
    return res.status(400).json({ error: "El usuario solo puede contener letras, números, '_' y '.', sin espacios" });
  }
  if (rol && !ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `rol debe ser uno de: ${ROLES_VALIDOS.join(", ")}` });
  }

  let result;
  try {
    result = await pgPool.query(
      `INSERT INTO Operadores (nombre, usuario, contrasena_hash, rol) VALUES ($1,$2,$3,$4)
       RETURNING id_operador, nombre, usuario, rol, activo`,
      [nombre, usuario, contrasena, rol || "operador"]
    );
  } catch (err) {
    // PUNTO (agregado): antes esto tiraba un error 500 feo de Postgres
    // (violación de UNIQUE en "usuario"). Ahora se compara contra lo
    // que ya existe en la BD y se devuelve un mensaje claro para el toast.
    if (err.code === "23505") {
      return res.status(400).json({ error: "Ya existe un operador con ese nombre de usuario" });
    }
    throw err;
  }
  const operador = result.rows[0];

  // Replicidad: apenas nace el Operador (dueño: Postgres), se propaga
  // su tabla espejo repl_operadores a Oracle y Cassandra.
  const replicas = await sincronizarOperador(operador);

  // Auditoría: queda registro de quién creó a este operador.
  await registrarAuditoria(req.operador.id_operador, "CREAR_OPERADOR", "Operadores", operador.id_operador, `Operador '${operador.usuario}' creado con rol '${operador.rol}'`);

  res.status(201).json({ ...operador, replicas });
});

// PUT editar un operador existente (nombre, usuario, rol y, opcionalmente,
// contraseña nueva). Solo el Administrador puede hacerlo. Se usa desde el
// panel de edición de "Usuarios y recursos" en el frontend.
// ==============================
// PUT /OPERADORES/:ID (EDITAR UN OPERADOR)
// ==============================
// La contraseña es opcional aquí (solo se cambia si mandan una
// nueva); el resto de campos sí son obligatorios.
router.put("/operadores/:id", requireRole("administrador"), async (req, res) => {
  const { nombre, usuario, rol, contrasena } = req.body;
  const idOperador = parseInt(req.params.id, 10);

  if (!nombre || !usuario || !rol) {
    return res.status(400).json({ error: "nombre, usuario y rol son requeridos" });
  }
  if (!NOMBRE_PERSONA_REGEX.test(nombre)) {
    return res.status(400).json({ error: "El nombre completo solo puede contener letras y espacios" });
  }
  if (!USUARIO_REGEX.test(usuario)) {
    return res.status(400).json({ error: "El usuario solo puede contener letras, números, '_' y '.', sin espacios" });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `rol debe ser uno de: ${ROLES_VALIDOS.join(", ")}` });
  }

  let result;
  try {
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
  } catch (err) {
    // PUNTO (agregado): mismo caso que en el POST, pero al editar
    // (por ejemplo si le cambian el usuario a uno que ya usa otro operador).
    if (err.code === "23505") {
      return res.status(400).json({ error: "Ya existe un operador con ese nombre de usuario" });
    }
    throw err;
  }

  const operador = result.rows[0];
  if (!operador) {
    return res.status(404).json({ error: "Operador no encontrado o inactivo" });
  }

  // Replicidad: la edición también se propaga a repl_operadores
  const replicas = await sincronizarOperador(operador);

  // Auditoría: queda registro de quién editó a este operador.
  await registrarAuditoria(req.operador.id_operador, "EDITAR_OPERADOR", "Operadores", operador.id_operador, `Operador '${operador.usuario}' editado (rol '${operador.rol}')`);

  res.json({ ...operador, replicas });
});

// DELETE en cascada: esto es lo que tu profe quiere ver funcionando
// ==============================
// DELETE /OPERADORES/:ID (DAR DE BAJA UN OPERADOR)
// ==============================
// Delega toda la baja en cadena (Postgres + Oracle + Cassandra +
// Mongo) a cascadeService.eliminarOperadorEnCascada.
router.delete("/operadores/:id", requireRole("administrador"), async (req, res) => {
  const idOperador = parseInt(req.params.id, 10);

  // No permitir que un administrador se elimine a sí mismo (req.operador
  // viene del JWT, ver authMiddleware.js — ahí sabemos quién está logueado).
  if (idOperador === req.operador.id_operador) {
    return res.status(400).json({ error: "No puedes eliminar tu propio usuario mientras tienes la sesión iniciada" });
  }

  const resultado = await eliminarOperadorEnCascada(idOperador);

  // Auditoría: queda registro de quién dio de baja a este operador.
  await registrarAuditoria(req.operador.id_operador, "ELIMINAR_OPERADOR", "Operadores", idOperador, "Operador desactivado en cascada");

  res.json({
    mensaje: `Operador ${idOperador} desactivado en cascada en las 4 bases de datos`,
    detalle: resultado
  });
});

// ==============================
// PUT /OPERADORES/:ID/ACTIVAR (REACTIVAR UN OPERADOR DESACTIVADO)
// ==============================
// Solo Administrador. Vuelve a poner activo = TRUE (sin tocar nombre,
// usuario, rol ni contraseña) y propaga el cambio a las réplicas.
router.put("/operadores/:id/activar", requireRole("administrador"), async (req, res) => {
  const idOperador = parseInt(req.params.id, 10);
  const result = await pgPool.query(
    `UPDATE Operadores SET activo = TRUE WHERE id_operador = $1 RETURNING id_operador, nombre, usuario, rol, activo`,
    [idOperador]
  );
  const operador = result.rows[0];
  if (!operador) {
    return res.status(404).json({ error: "Operador no encontrado" });
  }

  const replicas = await sincronizarOperador(operador);

  await registrarAuditoria(req.operador.id_operador, "ACTIVAR_OPERADOR", "Operadores", operador.id_operador, `Operador '${operador.usuario}' reactivado`);

  res.json({ ...operador, replicas });
});

// ---------- RECURSOS ----------

// ==============================
// GET /RECURSOS (LISTAR RECURSOS, ACTIVOS O TODOS)
// ==============================
// PUNTO (agregado): mismo criterio que en /operadores: por defecto
// solo activos, y con ?incluirInactivos=true trae también los dados
// de baja, con los activos siempre primero.
router.get("/recursos", async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true" || req.query.incluirInactivos === "1";
  const result = incluirInactivos
    ? await pgPool.query(`SELECT * FROM Recursos ORDER BY activo DESC, id_recurso`)
    : await pgPool.query(`SELECT * FROM Recursos WHERE activo = TRUE ORDER BY id_recurso`);
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
// ==============================
// GET /RECURSOS/DESPACHO/:TIPOEMERGENCIA (RECURSOS ORDENADOS PARA DESPACHAR)
// ==============================
router.get("/recursos/despacho/:tipoEmergencia", async (req, res) => {
  const { tipoEmergencia } = req.params;
  const result = await pgPool.query(
    `SELECT * FROM Recursos WHERE activo = TRUE AND estado = 'disponible' ORDER BY id_recurso`
  );
  const ordenados = ordenarRecursosPorPrioridad(result.rows, tipoEmergencia);
  res.json(ordenados);
});

// ==============================
// POST /RECURSOS (CREAR UN RECURSO NUEVO)
// ==============================
// Solo Administrador. Exige tipo y placa válidos, avisa si la placa
// ya está registrada (placa es UNIQUE), y propaga la copia a
// repl_recursos en Oracle y Cassandra.
router.post("/recursos", requireRole("administrador"), async (req, res) => {
  const { tipo, placa, estado } = req.body;
  // PUNTO (agregado): antes se podía mandar el formulario sin tipo/placa
  // y la única barrera era el CHECK de la base de datos (un error 500 feo).
  if (!tipo || !placa || !placa.trim()) {
    return res.status(400).json({ error: "tipo y placa son requeridos" });
  }
  if (!PLACA_REGEX.test(placa.trim())) {
    return res.status(400).json({ error: "La placa debe tener el formato AAA-000 (3 letras, guión, 3 números)" });
  }
  if (!TIPOS_RECURSO_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_RECURSO_VALIDOS.join(", ")}` });
  }

  let result;
  try {
    result = await pgPool.query(
      `INSERT INTO Recursos (tipo, placa, estado) VALUES ($1,$2,$3) RETURNING *`,
      [tipo, placa.trim().toUpperCase(), estado || "disponible"]
    );
  } catch (err) {
    // PUNTO (agregado): compara contra lo que ya existe en la BD
    // (placa es UNIQUE) y devuelve un mensaje claro para el toast.
    if (err.code === "23505") {
      return res.status(400).json({ error: "Ya existe un recurso con esa placa" });
    }
    throw err;
  }
  const recurso = result.rows[0];

  // Replicidad: apenas nace el Recurso (dueño: Postgres), se propaga
  // su tabla espejo repl_recursos a Oracle y Cassandra.
  const replicas = await sincronizarRecurso(recurso);

  // Auditoría: queda registro de quién creó este recurso.
  await registrarAuditoria(req.operador.id_operador, "CREAR_RECURSO", "Recursos", recurso.id_recurso, `Recurso '${recurso.placa}' (${recurso.tipo}) creado`);

  res.status(201).json({ ...recurso, replicas });
});

// PUT editar un recurso completo (tipo, placa, estado). Pensado para el
// panel de edición del Administrador (distinto del PUT /estado, que usa
// el flujo de despacho para solo cambiar el estado al asignar/liberar).
// ==============================
// PUT /RECURSOS/:ID (EDITAR UN RECURSO)
// ==============================
router.put("/recursos/:id", requireRole("administrador"), async (req, res) => {
  const { tipo, placa, estado } = req.body;
  if (!tipo || !placa || !placa.trim()) {
    return res.status(400).json({ error: "tipo y placa son requeridos" });
  }
  if (!PLACA_REGEX.test(placa.trim())) {
    return res.status(400).json({ error: "La placa debe tener el formato AAA-000 (3 letras, guión, 3 números)" });
  }
  if (!TIPOS_RECURSO_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_RECURSO_VALIDOS.join(", ")}` });
  }
  if (estado && !ESTADOS_RECURSO_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS_RECURSO_VALIDOS.join(", ")}` });
  }

  let result;
  try {
    result = await pgPool.query(
      `UPDATE Recursos SET tipo = $1, placa = $2, estado = COALESCE($3, estado)
       WHERE id_recurso = $4 AND activo = TRUE RETURNING *`,
      [tipo, placa.trim().toUpperCase(), estado || null, req.params.id]
    );
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Ya existe un recurso con esa placa" });
    }
    throw err;
  }
  const recurso = result.rows[0];
  if (!recurso) {
    return res.status(404).json({ error: "Recurso no encontrado o inactivo" });
  }

  const replicas = await sincronizarRecurso(recurso);

  // Auditoría: queda registro de quién editó este recurso.
  await registrarAuditoria(req.operador.id_operador, "EDITAR_RECURSO", "Recursos", recurso.id_recurso, `Recurso '${recurso.placa}' editado (estado '${recurso.estado}')`);

  res.json({ ...recurso, replicas });
});

// ==============================
// PUT /RECURSOS/:ID/ESTADO (CAMBIAR SOLO EL ESTADO DE UN RECURSO)
// ==============================
// Se usa, por ejemplo, cuando un recurso vuelve de mantenimiento.
// No admite un texto libre: el estado debe ser uno de los 4 válidos.
router.put("/recursos/:id/estado", requireRole("operador", "administrador"), async (req, res) => {
  const { estado } = req.body;
  // PUNTO (agregado): antes se podía mandar vacío o cualquier texto,
  // y si el recurso no existía igual respondía 200 con un objeto vacío.
  if (!estado || !ESTADOS_RECURSO_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS_RECURSO_VALIDOS.join(", ")}` });
  }
  const result = await pgPool.query(
    `UPDATE Recursos SET estado = $1 WHERE id_recurso = $2 RETURNING *`,
    [estado, req.params.id]
  );
  const recurso = result.rows[0];
  if (!recurso) {
    return res.status(404).json({ error: "Recurso no encontrado" });
  }

  // El estado ("disponible","ocupado", etc.) es justo el campo que
  // viven las tablas repl_recursos, así que cada cambio de estado
  // también debe re-sincronizarse (no solo la creación).
  const replicas = await sincronizarRecurso(recurso);

  res.json({ ...recurso, replicas });
});

// ==============================
// DELETE /RECURSOS/:ID (DAR DE BAJA UN RECURSO)
// ==============================
router.delete("/recursos/:id", requireRole("administrador"), async (req, res) => {
  // NOTA: al desactivar un recurso también se actualiza su estado a
  // 'fuera_de_servicio' (es el mismo estado que se puede elegir a
  // mano en el panel de edición), para que quede reflejado tanto en
  // el flag "activo" como en el campo "estado".
  const result = await pgPool.query(
    `UPDATE Recursos SET activo = FALSE, estado = 'fuera_de_servicio' WHERE id_recurso = $1 RETURNING *`,
    [req.params.id]
  );
  const recurso = result.rows[0];

  // Replicidad: el soft delete también se propaga a las réplicas
  // (reusa la misma función de upsert, pasando activo = false).
  const replicas = recurso ? await sincronizarRecurso(recurso) : null;

  // Auditoría: queda registro de quién dio de baja este recurso.
  if (recurso) {
    await registrarAuditoria(req.operador.id_operador, "ELIMINAR_RECURSO", "Recursos", recurso.id_recurso, `Recurso '${recurso.placa}' desactivado`);
  }

  res.json({ mensaje: "Recurso desactivado", replicas });
});

// ==============================
// PUT /RECURSOS/:ID/ACTIVAR (REACTIVAR UN RECURSO DADO DE BAJA)
// ==============================
// Solo Administrador. Vuelve a poner activo = TRUE y, como pidió el
// negocio, el recurso reaparece con estado 'disponible' (ya no tiene
// sentido que vuelva "ocupado" u otro estado viejo de antes de la baja).
router.put("/recursos/:id/activar", requireRole("administrador"), async (req, res) => {
  const result = await pgPool.query(
    `UPDATE Recursos SET activo = TRUE, estado = 'disponible' WHERE id_recurso = $1 RETURNING *`,
    [req.params.id]
  );
  const recurso = result.rows[0];
  if (!recurso) {
    return res.status(404).json({ error: "Recurso no encontrado" });
  }

  const replicas = await sincronizarRecurso(recurso);

  await registrarAuditoria(req.operador.id_operador, "ACTIVAR_RECURSO", "Recursos", recurso.id_recurso, `Recurso '${recurso.placa}' reactivado`);

  res.json({ ...recurso, replicas });
});

module.exports = router;
