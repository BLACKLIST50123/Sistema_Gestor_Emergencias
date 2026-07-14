/**
 * =========================================================
 * SERVICIO DE CASCADA MANUAL ENTRE LAS 4 BASES DE DATOS
 * =========================================================
 *
 * Este es el corazón de lo que pide tu profesor: como Postgres,
 * Oracle, Cassandra y MongoDB son motores independientes, no existe
 * un FOREIGN KEY ... ON DELETE CASCADE nativo entre ellos.
 *
 * La solución es un patrón "Saga": el backend actúa como
 * orquestador y ejecuta manualmente, en orden, la eliminación
 * (o mejor, la desactivación lógica) en cada base de datos.
 *
 * Estrategia usada: SOFT DELETE en todas partes.
 * - Es más seguro para un sistema de emergencias (nunca pierdes
 *   el rastro legal de quién hizo qué).
 * - Evita el problema de "eliminé en Postgres pero Mongo ya no
 *   sabe a quién pertenecía esa evidencia".
 *
 * Si tu profesor exige DELETE físico, cambia los UPDATE por
 * DELETE en cada bloque (están marcados con comentarios).
 */

const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");
const { getMongoDb } = require("../config/mongodb");

/**
 * Elimina (lógicamente) un Operador y todo lo que depende de él
 * en las 4 bases de datos.
 */
async function eliminarOperadorEnCascada(idOperador) {
  const resultado = {
    postgres: null,
    cassandra: null,
    mongodb: null,
    errores: []
  };

  // 1) PostgreSQL: desactivar el operador
  try {
    const r = await pgPool.query(
      `UPDATE Operadores SET activo = FALSE, fecha_baja = NOW() WHERE id_operador = $1 RETURNING *`,
      [idOperador]
    );
    // DELETE físico alternativo:
    // await pgPool.query(`DELETE FROM Operadores WHERE id_operador = $1`, [idOperador]);
    resultado.postgres = r.rows[0] || null;

    // También liberamos recursos que tenía asignados
    await pgPool.query(
      `UPDATE Recursos SET id_operador_asignado = NULL WHERE id_operador_asignado = $1`,
      [idOperador]
    );
  } catch (err) {
    resultado.errores.push(`PostgreSQL: ${err.message}`);
  }

  // 2) Cassandra: marcar como 'operador_eliminado' las alertas que reportó
  //    (Cassandra no permite UPDATE de columnas de clustering key
  //    fácilmente, así que aquí sí toca leer + reinsertar)
  try {
    const query = `SELECT id_alerta, fecha_creacion, tipo, estado
                    FROM Alertas_Por_Operador WHERE id_operador_reporta = ?`;
    const result = await cassandraClient.execute(query, [idOperador], { prepare: true });

    for (const row of result.rows) {
      await cassandraClient.execute(
        `UPDATE Alertas SET estado = ? WHERE id_alerta = ?`,
        ["operador_eliminado", row.id_alerta],
        { prepare: true }
      );
    }
    resultado.cassandra = { alertasActualizadas: result.rows.length };
  } catch (err) {
    resultado.errores.push(`Cassandra: ${err.message}`);
  }

  // 3) MongoDB: desactivar (soft delete) las evidencias cerradas por ese operador
  try {
    const db = getMongoDb();
    const r = await db.collection("evidencias").updateMany(
      { id_operador: idOperador },
      { $set: { activo: false, fecha_baja: new Date() } }
    );
    // DELETE físico alternativo:
    // const r = await db.collection("evidencias").deleteMany({ id_operador: idOperador });
    resultado.mongodb = { evidenciasAfectadas: r.modifiedCount };
  } catch (err) {
    resultado.errores.push(`MongoDB: ${err.message}`);
  }

  return resultado;
}

/**
 * Elimina (lógicamente) una Institución y sus Sedes asociadas.
 * Además marca en Cassandra las alertas que apuntaban a esa sede
 * para que el frontend sepa que ya no es una derivación válida.
 */
async function eliminarInstitucionEnCascada(idInstitucion) {
  const { getOracleConnection } = require("../config/oracle");
  const resultado = { oracle: null, cassandra: null, errores: [] };

  let conn;
  try {
    conn = await getOracleConnection();

    // Traemos las sedes antes de desactivarlas, para saber qué alertas tocar
    const sedes = await conn.execute(
      `SELECT id_sede FROM Sedes_Capacidad WHERE id_institucion = :id`,
      [idInstitucion]
    );

    await conn.execute(
      `UPDATE Sedes_Capacidad SET activo = 0 WHERE id_institucion = :id`,
      [idInstitucion]
    );
    await conn.execute(
      `UPDATE Instituciones SET activo = 0 WHERE id_institucion = :id`,
      [idInstitucion]
    );
    // DELETE físico alternativo (requiere borrar primero sedes por FK):
    // await conn.execute(`DELETE FROM Sedes_Capacidad WHERE id_institucion = :id`, [idInstitucion]);
    // await conn.execute(`DELETE FROM Instituciones WHERE id_institucion = :id`, [idInstitucion]);

    resultado.oracle = { sedesDesactivadas: sedes.rows.length };

    // Cassandra: marcar alertas que tenían esa sede como destino de derivación
    for (const sede of sedes.rows) {
      const query = `SELECT id_alerta FROM Alertas WHERE id_sede_derivacion = ? ALLOW FILTERING`;
      const result = await cassandraClient.execute(query, [sede.ID_SEDE], { prepare: true });
      for (const row of result.rows) {
        await cassandraClient.execute(
          `UPDATE Alertas SET id_sede_derivacion = null WHERE id_alerta = ?`,
          [row.id_alerta],
          { prepare: true }
        );
      }
    }
    resultado.cassandra = "Alertas actualizadas (derivación removida)";
  } catch (err) {
    resultado.errores.push(err.message);
  } finally {
    if (conn) await conn.close();
  }

  return resultado;
}

module.exports = { eliminarOperadorEnCascada, eliminarInstitucionEnCascada };
