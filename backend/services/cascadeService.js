/**
 * =========================================================
 * QUÉ HACE ESTE ARCHIVO (en simple)
 * =========================================================
 * Cuando se da de baja un Operador, una Institución o se elimina una
 * Alerta del historial, no basta con borrarlo en UNA base de datos:
 * hay que avisarle a las otras 3 también (porque cada una guarda su
 * propio pedacito de información relacionada). Este archivo es el
 * que se encarga de hacer esa "baja en cadena" a mano, base por
 * base, y de anotar en un resumen qué salió bien y qué falló en
 * cada una.
 *
 * =========================================================
 * SERVICIO DE CASCADA MANUAL ENTRE LAS 4 BASES DE DATOS
 * =========================================================
 *
 * Como Postgres,
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
 * Para el DELETE físico, cambia los UPDATE por
 * DELETE en cada bloque (están marcados con comentarios).
 */

const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");
const { getMongoDb } = require("../config/mongodb");

/**
 * Elimina (lógicamente) un Operador y todo lo que depende de él
 * en las 4 bases de datos.
 */
// ==============================
// ELIMINAR OPERADOR EN CASCADA (BAJA DE UN OPERADOR EN LAS 4 BD)
// ==============================
// Desactiva al operador en PostgreSQL (su dueño), libera los
// recursos que tenía asignados, marca en Cassandra las alertas que
// había reportado, desactiva sus evidencias en MongoDB, y además
// propaga la baja a la tabla espejo repl_operadores. Cada paso va
// en su propio try/catch para que, si uno falla, los demás igual
// se intenten (no se detiene todo por un solo error).
async function eliminarOperadorEnCascada(idOperador) {
  const { sincronizarOperador } = require("./syncService");
  const resultado = {
    postgres: null,
    cassandra: null,
    mongodb: null,
    replicas: null,
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

    // Replicidad: la baja también se propaga a repl_operadores (Oracle/Cassandra)
    if (resultado.postgres) {
      resultado.replicas = await sincronizarOperador({
        id_operador: resultado.postgres.id_operador,
        nombre: resultado.postgres.nombre,
        usuario: resultado.postgres.usuario,
        rol: resultado.postgres.rol,
        activo: false
      });
    }
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
// ==============================
// ELIMINAR INSTITUCIÓN EN CASCADA (BAJA DE UNA INSTITUCIÓN Y SUS SEDES)
// ==============================
// Desactiva en Oracle (dueño) tanto la institución como todas sus
// sedes, quita esa sede como destino de derivación en las alertas de
// Cassandra que la tenían asignada, y propaga la baja a las tablas
// espejo repl_instituciones y repl_sedes.
async function eliminarInstitucionEnCascada(idInstitucion) {
  const { getOracleConnection } = require("../config/oracle");
  const { sincronizarInstitucion, sincronizarSede } = require("./syncService");
  const resultado = { oracle: null, cassandra: null, replicas: null, replicasSedes: [], errores: [] };

  let conn;
  try {
    conn = await getOracleConnection();

    // Necesitamos el nombre ANTES de desactivar, porque las tablas
    // repl_instituciones (Postgres/Cassandra) también deben quedar
    // reflejadas con activo = false (replicidad: la desactivación
    // también se propaga, no solo la creación/actualización)
    const institucionActual = await conn.execute(
      `SELECT nombre FROM Instituciones WHERE id_institucion = :id`,
      [idInstitucion]
    );
    const nombreInstitucion = institucionActual.rows[0]?.NOMBRE;

    // Traemos las sedes ANTES de desactivarlas: necesitamos sus datos
    // completos (no solo el id) para poder espejar el soft delete en
    // repl_sedes (Postgres/Cassandra), igual que se hace con la institución.
    const sedes = await conn.execute(
      `SELECT id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles FROM Sedes_Capacidad WHERE id_institucion = :id`,
      [idInstitucion]
    );

    await conn.execute(
      `UPDATE Sedes_Capacidad SET activo = FALSE WHERE id_institucion = :id`,
      [idInstitucion]
    );
    await conn.execute(
      `UPDATE Instituciones SET activo = FALSE WHERE id_institucion = :id`,
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

      // Replicidad: propagamos el soft delete de esta sede a repl_sedes
      const replicaSede = await sincronizarSede({
        id_sede: sede.ID_SEDE,
        id_institucion: sede.ID_INSTITUCION,
        direccion: sede.DIRECCION,
        camas_disponibles: sede.CAMAS_DISPONIBLES,
        calabozos_disponibles: sede.CALABOZOS_DISPONIBLES,
        activo: false
      });
      resultado.replicasSedes.push({ id_sede: sede.ID_SEDE, ...replicaSede });
    }
    resultado.cassandra = "Alertas actualizadas (derivación removida)";

    // Replicidad: propagamos el soft delete a repl_instituciones
    if (nombreInstitucion) {
      resultado.replicas = await sincronizarInstitucion({
        id_institucion: idInstitucion,
        nombre: nombreInstitucion,
        activo: false
      });
    }
  } catch (err) {
    resultado.errores.push(err.message);
  } finally {
    if (conn) await conn.close();
  }

  return resultado;
}

/**
 * Elimina una Alerta (emergencia) del Historial Emergencias.
 *
 * Solo tiene sentido para casos ya CERRADOS (el frontend solo ofrece
 * este botón al Administrador dentro de la vista de Historial). Como
 * Alertas vive en Cassandra y no tiene tablas repl_* en otros motores
 * (nadie más "posee" una copia de la alerta en sí, solo referencias
 * lógicas por id), la cascada aquí es:
 *   1) Cassandra: borrar la fila de las 3 tablas de consulta
 *      (Alertas, Alertas_Por_Estado, Alertas_Por_Operador) — hay que
 *      leer primero la fila porque las 2 últimas usan más columnas
 *      en su clustering key / partition key.
 *   2) MongoDB: desactivar (soft delete) las evidencias asociadas a
 *      esa alerta, para no dejar evidencia "huérfana" apuntando a un
 *      caso que ya no existe en el Historial.
 */
// ==============================
// ELIMINAR EMERGENCIAS EN CASCADA (BORRAR UNA EMERGENCIA DEL HISTORIAL)
// ==============================
// Borra de verdad (no soft delete) la alerta de las 3 tablas de
// Cassandra donde vive duplicada, y desactiva las evidencias de esa
// alerta en MongoDB para que no queden huérfanas. Solo lo puede
// pedir un Administrador (ver backend/routes/alertas.js).
async function eliminarAlertaEnCascada(idAlerta) {
  const resultado = { cassandra: null, mongodb: null, errores: [] };

  try {
    const alertaResult = await cassandraClient.execute(
      `SELECT * FROM Alertas WHERE id_alerta = ?`,
      [idAlerta],
      { prepare: true }
    );
    const alerta = alertaResult.rows[0];

    if (!alerta) {
      resultado.errores.push("La alerta no existe o ya fue eliminada");
      return resultado;
    }

    const batch = [
      { query: `DELETE FROM Alertas WHERE id_alerta = ?`, params: [idAlerta] },
      {
        query: `DELETE FROM Alertas_Por_Estado WHERE estado = ? AND fecha_creacion = ? AND id_alerta = ?`,
        params: [alerta.estado, alerta.fecha_creacion, idAlerta]
      },
      {
        query: `DELETE FROM Alertas_Por_Operador WHERE id_operador_reporta = ? AND fecha_creacion = ? AND id_alerta = ?`,
        params: [alerta.id_operador_reporta, alerta.fecha_creacion, idAlerta]
      }
    ];
    await cassandraClient.batch(batch, { prepare: true });
    resultado.cassandra = { eliminada: true };

    const db = getMongoDb();
    const r = await db.collection("evidencias").updateMany(
      { id_alerta: idAlerta },
      { $set: { activo: false, fecha_baja: new Date() } }
    );
    resultado.mongodb = { evidenciasAfectadas: r.modifiedCount };
  } catch (err) {
    resultado.errores.push(err.message);
  }

  return resultado;
}

module.exports = { eliminarOperadorEnCascada, eliminarInstitucionEnCascada, eliminarAlertaEnCascada };
