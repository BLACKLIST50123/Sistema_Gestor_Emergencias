const express = require("express");
const { getOracleConnection } = require("../config/oracle");
const { verificarToken, requireRole } = require("../services/authMiddleware");
const { eliminarInstitucionEnCascada } = require("../services/cascadeService");
const { sincronizarInstitucion, sincronizarSede } = require("../services/syncService");
const { ordenarSedesPorRamaYCercania, capacidadVisible } = require("../services/geoService");

const router = express.Router();
router.use(verificarToken);

router.get("/instituciones", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `SELECT * FROM Instituciones WHERE activo = TRUE ORDER BY id_institucion`
    );
    res.json(result.rows);
  } finally {
    await conn.close();
  }
});

router.post("/instituciones", requireRole("administrador"), async (req, res) => {
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

// PUT editar una institución existente (nombre, tipo). Solo Administrador.
router.put("/instituciones/:id", requireRole("administrador"), async (req, res) => {
  const { nombre, tipo } = req.body;
  const idInstitucion = parseInt(req.params.id, 10);
  if (!nombre || !tipo) {
    return res.status(400).json({ error: "nombre y tipo son requeridos" });
  }
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `UPDATE Instituciones SET nombre = :nombre, tipo = :tipo WHERE id_institucion = :id AND activo = TRUE`,
      { nombre, tipo, id: idInstitucion },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Institución no encontrada o inactiva" });
    }

    // Replicidad: la edición también se propaga a repl_instituciones
    const replicas = await sincronizarInstitucion({ id_institucion: idInstitucion, nombre, activo: true });

    res.json({ id_institucion: idInstitucion, nombre, tipo, replicas });
  } finally {
    await conn.close();
  }
});

router.delete("/instituciones/:id", requireRole("administrador"), async (req, res) => {
  const resultado = await eliminarInstitucionEnCascada(parseInt(req.params.id, 10));
  res.json({ mensaje: "Institución desactivada en cascada", detalle: resultado });
});

// ---------- SEDES / CAPACIDAD ----------

router.get("/sedes", async (req, res) => {
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `SELECT s.*, i.nombre AS nombre_institucion, i.tipo AS tipo_institucion
       FROM Sedes_Capacidad s
       JOIN Instituciones i ON i.id_institucion = s.id_institucion
       WHERE s.activo = TRUE
       ORDER BY s.id_sede`
    );
    res.json(result.rows);
  } finally {
    await conn.close();
  }
});

// -----------------------------------------------------------
// PUNTO 1: Derivación por Cercanía (Haversine) y Capacidad
// -----------------------------------------------------------
// Dado el tipo de emergencia y las coordenadas de la alerta, devuelve
// TODAS las sedes activas con su distancia en KM (Haversine, calculada
// en memoria — nunca se guarda en la BD) y ordenadas: primero la rama
// institucional afín al tipo de emergencia (más cercanas primero),
// luego el resto de sedes también por cercanía.
//   medica     -> Instituciones Médicas (Hospital) primero
//   incendio   -> Compañías de Bomberos primero
//   seguridad  -> Comisarías primero
//   accidente  -> Hospitales primero
router.get("/sedes/derivacion", async (req, res) => {
  const { tipo, lat, lng } = req.query;
  const latOrigen = parseFloat(lat);
  const lngOrigen = parseFloat(lng);

  if (Number.isNaN(latOrigen) || Number.isNaN(lngOrigen)) {
    return res.status(400).json({ error: "lat y lng son requeridos y deben ser numéricos" });
  }

  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `SELECT s.*, i.nombre AS nombre_institucion, i.tipo AS tipo_institucion
       FROM Sedes_Capacidad s
       JOIN Instituciones i ON i.id_institucion = s.id_institucion
       WHERE s.activo = TRUE`
    );

    // Oracle devuelve columnas en MAYÚSCULAS; normalizamos a minúsculas
    // para que geoService.js (agnóstico de motor) trabaje siempre igual.
    const sedes = result.rows.map((row) => {
      const out = {};
      Object.keys(row).forEach((k) => { out[k.toLowerCase()] = row[k]; });
      return out;
    });

    const ordenadas = ordenarSedesPorRamaYCercania(sedes, tipo, latOrigen, lngOrigen);

    // PUNTO 1: capacidad visible según el tipo de la institución dueña
    // de la sede (camas si es Hospital, calabozos si es Comisaría, nada
    // si es Bomberos).
    const conCapacidad = ordenadas.map((s) => ({
      ...s,
      capacidad: capacidadVisible(s.tipo_institucion, s)
    }));

    res.json(conCapacidad);
  } finally {
    await conn.close();
  }
});

router.post("/sedes", requireRole("administrador"), async (req, res) => {
  const { id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud } = req.body;

  // PUNTO 1 (agregado): la ubicación (latitud/longitud) es obligatoria
  // al crear una sede, no solo la dirección en texto. Se valida también
  // aquí en el backend porque el frontend puede ser evadido.
  if (!id_institucion || !direccion) {
    return res.status(400).json({ error: "id_institucion y direccion son requeridos" });
  }
  if (
    latitud === undefined || latitud === null || latitud === "" ||
    longitud === undefined || longitud === null || longitud === "" ||
    Number.isNaN(parseFloat(latitud)) || Number.isNaN(parseFloat(longitud))
  ) {
    return res.status(400).json({ error: "Debes seleccionar la ubicación (latitud y longitud) de la sede en el mapa" });
  }

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
    const id_sede = result.outBinds.id[0];

    // Replicidad: apenas nace la Sede (dueña: Oracle), se propaga
    // su tabla espejo repl_sedes a Postgres y Cassandra.
    const replicas = await sincronizarSede({
      id_sede, id_institucion, direccion,
      camas_disponibles: camas_disponibles || 0,
      calabozos_disponibles: calabozos_disponibles || 0,
      activo: true
    });

    res.status(201).json({ id_sede, replicas });
  } finally {
    await conn.close();
  }
});

// PUT editar una sede existente. Solo Administrador.
router.put("/sedes/:id", requireRole("administrador"), async (req, res) => {
  const { id_institucion, direccion, camas_disponibles, calabozos_disponibles, latitud, longitud } = req.body;
  const idSede = parseInt(req.params.id, 10);
  if (!id_institucion || !direccion) {
    return res.status(400).json({ error: "id_institucion y direccion son requeridos" });
  }
  const conn = await getOracleConnection();
  try {
    const result = await conn.execute(
      `UPDATE Sedes_Capacidad
       SET id_institucion = :id_institucion, direccion = :direccion,
           camas_disponibles = :camas, calabozos_disponibles = :calabozos,
           latitud = :lat, longitud = :lng
       WHERE id_sede = :id AND activo = TRUE`,
      {
        id_institucion, direccion,
        camas: camas_disponibles || 0,
        calabozos: calabozos_disponibles || 0,
        lat: latitud || null, lng: longitud || null,
        id: idSede
      },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Sede no encontrada o inactiva" });
    }

    // Replicidad: la edición también se propaga a repl_sedes
    const replicas = await sincronizarSede({
      id_sede: idSede, id_institucion, direccion,
      camas_disponibles: camas_disponibles || 0,
      calabozos_disponibles: calabozos_disponibles || 0,
      activo: true
    });

    res.json({ id_sede: idSede, replicas });
  } finally {
    await conn.close();
  }
});

// DELETE (soft) una sede. Solo Administrador.
router.delete("/sedes/:id", requireRole("administrador"), async (req, res) => {
  const idSede = parseInt(req.params.id, 10);
  const conn = await getOracleConnection();
  try {
    const actual = await conn.execute(
      `SELECT id_institucion, direccion, camas_disponibles, calabozos_disponibles
       FROM Sedes_Capacidad WHERE id_sede = :id`,
      [idSede]
    );
    const sede = actual.rows[0];
    if (!sede) {
      return res.status(404).json({ error: "Sede no encontrada" });
    }

    await conn.execute(
      `UPDATE Sedes_Capacidad SET activo = FALSE WHERE id_sede = :id`,
      [idSede],
      { autoCommit: true }
    );

    // Replicidad: el soft delete también se propaga a repl_sedes
    const replicas = await sincronizarSede({
      id_sede: idSede,
      id_institucion: sede.ID_INSTITUCION,
      direccion: sede.DIRECCION,
      camas_disponibles: sede.CAMAS_DISPONIBLES,
      calabozos_disponibles: sede.CALABOZOS_DISPONIBLES,
      activo: false
    });

    res.json({ mensaje: "Sede desactivada", replicas });
  } finally {
    await conn.close();
  }
});

// Derivar paciente: usa el procedimiento sp_derivar_paciente (resta 1 cama)
router.post("/sedes/:id/derivar-paciente", requireRole("operador", "administrador"), async (req, res) => {
  const idSede = parseInt(req.params.id, 10);
  const conn = await getOracleConnection();
  try {
    await conn.execute(`BEGIN sp_derivar_paciente(:id_sede); END;`, [idSede]);

    // Replicidad: el procedimiento cambia camas_disponibles directo en
    // Oracle, así que releemos la fila y propagamos el nuevo valor a
    // repl_sedes (Postgres/Cassandra) para que no queden desactualizadas.
    const actual = await conn.execute(
      `SELECT id_institucion, direccion, camas_disponibles, calabozos_disponibles FROM Sedes_Capacidad WHERE id_sede = :id`,
      [idSede]
    );
    const sede = actual.rows[0];
    const replicas = sede ? await sincronizarSede({
      id_sede: idSede, id_institucion: sede.ID_INSTITUCION, direccion: sede.DIRECCION,
      camas_disponibles: sede.CAMAS_DISPONIBLES, calabozos_disponibles: sede.CALABOZOS_DISPONIBLES, activo: true
    }) : null;

    res.json({ mensaje: "Cama descontada correctamente", replicas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await conn.close();
  }
});

router.post("/sedes/:id/derivar-detenido", requireRole("operador", "administrador"), async (req, res) => {
  const idSede = parseInt(req.params.id, 10);
  const conn = await getOracleConnection();
  try {
    await conn.execute(`BEGIN sp_derivar_detenido(:id_sede); END;`, [idSede]);

    // Replicidad: mismo caso que arriba, para calabozos_disponibles.
    const actual = await conn.execute(
      `SELECT id_institucion, direccion, camas_disponibles, calabozos_disponibles FROM Sedes_Capacidad WHERE id_sede = :id`,
      [idSede]
    );
    const sede = actual.rows[0];
    const replicas = sede ? await sincronizarSede({
      id_sede: idSede, id_institucion: sede.ID_INSTITUCION, direccion: sede.DIRECCION,
      camas_disponibles: sede.CAMAS_DISPONIBLES, calabozos_disponibles: sede.CALABOZOS_DISPONIBLES, activo: true
    }) : null;

    res.json({ mensaje: "Calabozo descontado correctamente", replicas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await conn.close();
  }
});

module.exports = router;
