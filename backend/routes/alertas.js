// =========================================================
// QUÉ HACE ESTE ARCHIVO
// =========================================================
// Aquí viven todas las rutas relacionadas a las Alertas (las
// emergencias que aparecen como pines en el mapa): crearlas, verlas,
// cambiarles el estado, asignarles un recurso (ambulancia/patrulla/
// bomberos), armar el "historial emergencias" de un caso (juntando datos de
// las 4 bases de datos) y eliminarlas del historial. Las alertas en
// sí viven guardadas en Cassandra.

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const cassandraClient = require("../config/cassandra");
const pgPool = require("../config/postgres");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const { sincronizarRecurso } = require("../services/syncService");
const { eliminarAlertaEnCascada } = require("../services/cascadeService");
const { registrarAuditoria } = require("../services/auditService");

const router = express.Router();
router.use(verificarToken);

// ==============================
// GET /ALERTAS (LISTAR TODAS LAS ALERTAS PARA EL MAPA)
// ==============================
// Trae absolutamente todas las alertas guardadas en Cassandra, para
// que el frontend pinte los pines en el mapa principal.
router.get("/alertas", async (req, res) => {
  const result = await cassandraClient.execute(
    `SELECT * FROM Alertas`,
    [],
    { prepare: true }
  );
  res.json(result.rows);
});

// ==============================
// GET /ALERTAS/ESTADO/:ESTADO (LISTAR ALERTAS POR ESTADO)
// ==============================
// Trae solo las alertas que están en un estado puntual (por ejemplo
// "pendiente" o "cerrada"). Se usa en el dashboard y en el módulo de
// Evidencias (que solo muestra las alertas ya cerradas).
router.get("/alertas/estado/:estado", async (req, res) => {
  const result = await cassandraClient.execute(
    `SELECT * FROM Alertas_Por_Estado WHERE estado = ?`,
    [req.params.estado],
    { prepare: true }
  );
  res.json(result.rows);
});

// PUNTO (agregado): valores permitidos, deben coincidir siempre con
// las opciones del <select> en el frontend (index.html) y con lo que
// espera geoService.js para ordenar la prioridad de despacho.
const TIPOS_ALERTA_VALIDOS = ["medica", "seguridad", "incendio", "accidente"];
const ESTADOS_ALERTA_VALIDOS = ["pendiente", "en_atencion", "cerrada"];

// ==============================
// POST /ALERTAS (CREAR UNA NUEVA EMERGENCIA)
// ==============================
// Esto es lo que dispara el pin en el mapa: valida que venga un tipo
// válido, una descripción y la ubicación, y guarda la alerta en las
// 3 tablas de Cassandra al mismo tiempo (con un "batch", para que
// las 3 queden siempre en el mismo estado).
router.post("/alertas", requireRole("operador", "administrador"), async (req, res) => {
  const { tipo, descripcion, latitud, longitud, direccion_referencial, id_recurso_asignado } = req.body;
  const id_alerta = uuidv4();
  const ahora = new Date();
  const id_operador_reporta = req.operador.id_operador;

  // PUNTO (agregado): sin esto, se podía crear una alerta sin tipo
  // válido o sin descripción, y quedaba "invisible" para el flujo de
  // prioridad de despacho (geoService.js) porque no calzaba con
  // ningún tipo conocido.
  if (!tipo || !TIPOS_ALERTA_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `El tipo de alerta es obligatorio y debe ser uno de: ${TIPOS_ALERTA_VALIDOS.join(", ")}` });
  }
  if (!descripcion || !descripcion.trim()) {
    return res.status(400).json({ error: "La descripción de la alerta es obligatoria" });
  }
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

  // Auditoría: queda registro de quién reportó esta emergencia.
  await registrarAuditoria(id_operador_reporta, "CREAR_ALERTA", "Alertas", id_alerta, `Alerta de tipo '${tipo}' creada`);

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
// ==============================
// PUT /ALERTAS/:ID/ASIGNAR-RECURSO (MANDAR UNA AMBULANCIA/PATRULLA/BOMBEROS)
// ==============================
// El operador elige qué recurso atiende la emergencia. Esta ruta
// marca ese recurso como "ocupado" en PostgreSQL, propaga ese cambio
// a las réplicas, y deja la alerta en Cassandra como "en_atencion"
// con el recurso (y la sede sugerida, si se eligió) ya vinculados.
router.put("/alertas/:id/asignar-recurso", requireRole("operador", "administrador"), async (req, res) => {
  const id_alerta = req.params.id;
  const { id_recurso, id_sede_derivacion } = req.body;

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

  // 2) Vincular el recurso (y, si se eligió, la sede de derivación sugerida
  //    por cercanía) a la alerta, y pasarla a 'en_atencion' (Cassandra)
  await cassandraClient.execute(
    `UPDATE Alertas SET id_recurso_asignado = ?, id_sede_derivacion = ?, estado = ?, fecha_actualizacion = ? WHERE id_alerta = ?`,
    [id_recurso, id_sede_derivacion ? parseInt(id_sede_derivacion, 10) : null, "en_atencion", new Date(), id_alerta],
    { prepare: true }
  );

  res.json({
    mensaje: `Recurso ${id_recurso} asignado a la alerta y marcado como 'En Emergencia'`,
    recurso,
    replicas
  });
});

// ==============================
// PUT /ALERTAS/:ID/ESTADO (CAMBIAR EL ESTADO DE UNA EMERGENCIA)
// ==============================
// Mueve una alerta entre pendiente -> en_atencion -> cerrada.
// Como en Cassandra el estado es parte de la "llave" de la tabla
// Alertas_Por_Estado, hay que borrar la fila del estado viejo e
// insertar una nueva en el estado nuevo (no se puede simplemente
// "actualizar" esa columna ahí). Si la alerta se cierra y tenía un
// recurso asignado, ese recurso se libera automáticamente.
router.put("/alertas/:id/estado", requireRole("operador", "administrador"), async (req, res) => {
  const { estado } = req.body;
  const id_alerta = req.params.id;
  const ahora = new Date();

  // PUNTO (agregado): sin esto, se podía mandar cualquier texto como
  // estado y quedaba una fila "huérfana" en Alertas_Por_Estado que
  // nunca aparece en ninguna pestaña del frontend (ni pendientes, ni
  // en atención, ni cerradas).
  if (!estado || !ESTADOS_ALERTA_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `El estado es obligatorio y debe ser uno de: ${ESTADOS_ALERTA_VALIDOS.join(", ")}` });
  }

  // 1) Obtener los datos actuales de la alerta ANTES de actualizarla
  const alertaResult = await cassandraClient.execute(
    `SELECT * FROM Alertas WHERE id_alerta = ?`,
    [id_alerta],
    { prepare: true }
  );
  
  const alerta = alertaResult.rows[0];
  if (!alerta) {
    return res.status(404).json({ error: "Alerta no encontrada" });
  }

  const estadoAnterior = alerta.estado;

  // 2) Armar el Batch para actualizar Cassandra correctamente en sus 3 tablas
  const batch = [
    {
      query: `UPDATE Alertas SET estado = ?, fecha_actualizacion = ? WHERE id_alerta = ?`,
      params: [estado, ahora, id_alerta]
    },
    // Insertamos la alerta en su "nuevo" estado para que aparezca en la lista
    {
      query: `INSERT INTO Alertas_Por_Estado (estado, fecha_creacion, id_alerta, tipo, latitud, longitud, descripcion) VALUES (?,?,?,?,?,?,?)`,
      params: [estado, alerta.fecha_creacion, id_alerta, alerta.tipo, alerta.latitud, alerta.longitud, alerta.descripcion]
    },
    // Borramos la alerta de su "viejo" estado para que no quede duplicada
    {
      query: `DELETE FROM Alertas_Por_Estado WHERE estado = ? AND fecha_creacion = ? AND id_alerta = ?`,
      params: [estadoAnterior, alerta.fecha_creacion, id_alerta]
    },
    // Actualizamos también la tabla por operador
    {
      query: `INSERT INTO Alertas_Por_Operador (id_operador_reporta, fecha_creacion, id_alerta, tipo, estado) VALUES (?,?,?,?,?)`,
      params: [alerta.id_operador_reporta, alerta.fecha_creacion, id_alerta, alerta.tipo, estado]
    }
  ];

  await cassandraClient.batch(batch, { prepare: true });

  // 3) Lógica para liberar el recurso en Postgres (se mantiene igual)
  let recursoLiberado = null;

  if (estado === "cerrada") {
    const idRecursoAsignado = alerta.id_recurso_asignado;

    if (idRecursoAsignado) {
      const recursoResult = await pgPool.query(
        `UPDATE Recursos SET estado = 'disponible' WHERE id_recurso = $1 RETURNING *`,
        [idRecursoAsignado]
      );
      recursoLiberado = recursoResult.rows[0] || null;
      if (recursoLiberado) {
        const { sincronizarRecurso } = require("../services/syncService");
        await sincronizarRecurso(recursoLiberado);
      }
    }
  }

  // Auditoría: queda registro de quién cambió el estado (y si cerró el caso).
  const accionAuditoria = estado === "cerrada" ? "CERRAR_CASO" : "CAMBIAR_ESTADO_ALERTA";
  await registrarAuditoria(req.operador.id_operador, accionAuditoria, "Alertas", id_alerta, `Estado cambiado de '${estadoAnterior}' a '${estado}'`);

  res.json({
    mensaje: "Estado actualizado y replicado en Cassandra",
    id_alerta,
    estado,
    recursoLiberado,
    habilitarEvidencias: estado === "cerrada"
  });
});

// -----------------------------------------------------------
// PUNTO 4: HISTORIAL EMERGENCIAS
// -----------------------------------------------------------
// Junta en una sola respuesta lo que está repartido en las 4 BD:
//   - Cassandra: los datos de la alerta en sí
//   - PostgreSQL: el recurso que atendió (si hubo uno asignado)
//   - Oracle: la sede/institución de derivación (si hubo una)
//   - MongoDB: las evidencias (fotos/videos) subidas al cerrar el caso
// ==============================
// GET /HISTORIAL/:ID_ALERTA (VER TODO SOBRE UNA EMERGENCIA)
// ==============================
// Arma en un solo JSON toda la "ficha" de un caso, yendo a buscar un
// pedacito a cada una de las 4 bases de datos. Así el frontend
// pinta la pantalla del Historial 360° con una sola llamada, sin
// tener que hacer 4 peticiones por separado.
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

// -----------------------------------------------------------
// DELETE de una emergencia del Historial 360° — SOLO Administrador.
// El Operador puede VER el historial pero no eliminar (regla de
// negocio pedida: "el operador solo ver no eliminar"). Se apoya en
// cascadeService.eliminarAlertaEnCascada, que borra la fila en las
// 3 tablas de Cassandra y desactiva (soft delete) las evidencias
// asociadas en MongoDB.
// -----------------------------------------------------------
// ==============================
// DELETE /ALERTAS/:ID (BORRAR UNA EMERGENCIA DEL HISTORIAL)
// ==============================
// Solo el Administrador puede usar esto. Delega todo el trabajo
// pesado (borrar de las 3 tablas de Cassandra y desactivar sus
// evidencias en Mongo) a cascadeService.eliminarAlertaEnCascada.
router.delete("/alertas/:id", requireRole("administrador"), async (req, res) => {
  const idAlerta = req.params.id;
  const resultado = await eliminarAlertaEnCascada(idAlerta);
  if (resultado.errores.length && !resultado.cassandra) {
    return res.status(404).json({ error: "No se pudo eliminar la alerta", detalle: resultado });
  }

  // Auditoría: queda registro de quién eliminó esta emergencia del historial.
  await registrarAuditoria(req.operador.id_operador, "ELIMINAR_ALERTA", "Alertas", idAlerta, "Emergencia eliminada del historial (y sus evidencias desactivadas)");

  res.json({ mensaje: "Emergencia eliminada del historial", detalle: resultado });
});

module.exports = router;
