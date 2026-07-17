/**
 * =========================================================
 * SERVICIO DE REPLICIDAD (TABLAS ESPEJO / DESNORMALIZACIÓN CONTROLADA)
 * =========================================================
 *
 * Complementa a cascadeService.js. Mientras cascadeService.js se
 * encarga de PROPAGAR ELIMINACIONES entre las 4 bases de datos,
 * este archivo se encarga de PROPAGAR COPIAS ("espejo") de los
 * datos clave de un dominio hacia los otros motores, para evitar
 * consultas cruzadas pesadas (ej. Cassandra o Oracle teniendo que
 * hacer una llamada síncrona a Postgres solo para mostrar un nombre).
 *
 * Reglas del patrón:
 * 1. Cada dato tiene UN SOLO dueño real (ej. Instituciones -> Oracle,
 *    Recursos -> PostgreSQL). Las tablas repl_* NUNCA generan su
 *    propio ID: siempre usan el ID que les pasa la BD dueña.
 * 2. Las tablas repl_* son de solo lectura desde el punto de vista
 *    del resto del sistema: solo este servicio escribe en ellas.
 * 3. Se sincroniza en el mismo request (síncrono, "best effort"):
 *    si una réplica falla, la operación en la BD dueña NO se revierte
 *    (evitamos un 2PC real, que está fuera del alcance de un
 *    proyecto académico); el error queda registrado en `errores`
 *    y se puede reintentar manualmente o con un job aparte.
 * 4. activo=false representa un soft delete que también se
 *    "espeja": por eso no existen funciones separadas de
 *    eliminarInstitucionReplica/eliminarRecursoReplica, se reusa
 *    la misma función de upsert pasando activo=false.
 */

const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");

// ---------------------------------------------------------------
// INSTITUCIONES (dueño real: Oracle) -> repl_instituciones en
// PostgreSQL y Cassandra
// ---------------------------------------------------------------

async function upsertInstitucionEnPostgres({ id_institucion, nombre, activo }) {
  await pgPool.query(
    `INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id_institucion)
     DO UPDATE SET nombre = EXCLUDED.nombre,
                    activo = EXCLUDED.activo,
                    fecha_sincronizacion = NOW()`,
    [id_institucion, nombre, activo !== undefined ? activo : true]
  );
}

async function upsertInstitucionEnCassandra({ id_institucion, nombre, activo }) {
  // En Cassandra un INSERT con la misma partition key SOBREESCRIBE
  // la fila anterior, así que sirve como upsert sin necesidad de
  // "ON CONFLICT" ni "MERGE".
  await cassandraClient.execute(
    `INSERT INTO repl_instituciones (id_institucion, nombre, activo, fecha_sincronizacion)
     VALUES (?, ?, ?, ?)`,
    [id_institucion, nombre, activo !== undefined ? activo : true, new Date()],
    { prepare: true }
  );
}

/**
 * Sincroniza (crea/actualiza/desactiva) la tabla espejo repl_instituciones
 * en PostgreSQL y Cassandra a partir del registro maestro en Oracle.
 *
 * @param {{id_institucion:number, nombre:string, activo?:boolean}} institucion
 * @returns {Promise<{postgres:boolean, cassandra:boolean, errores:string[]}>}
 */
async function sincronizarInstitucion(institucion) {
  const resultado = { postgres: false, cassandra: false, errores: [] };

  try {
    await upsertInstitucionEnPostgres(institucion);
    resultado.postgres = true;
  } catch (err) {
    resultado.errores.push(`Postgres (repl_instituciones): ${err.message}`);
  }

  try {
    await upsertInstitucionEnCassandra(institucion);
    resultado.cassandra = true;
  } catch (err) {
    resultado.errores.push(`Cassandra (repl_instituciones): ${err.message}`);
  }

  if (resultado.errores.length) {
    console.error("[syncService] sincronizarInstitucion con errores:", resultado.errores);
  }

  return resultado;
}

// ---------------------------------------------------------------
// RECURSOS (dueño real: PostgreSQL) -> repl_recursos en
// Oracle y Cassandra
// ---------------------------------------------------------------

async function upsertRecursoEnOracle({ id_recurso, nombre, estado, activo }) {
  const oracledb = require("oracledb");
  const { getOracleConnection } = require("../config/oracle");
  const conn = await getOracleConnection();
  try {
    await conn.execute(
      `MERGE INTO repl_recursos r
       USING (SELECT :id_recurso AS id_recurso FROM dual) src
       ON (r.id_recurso = src.id_recurso)
       WHEN MATCHED THEN UPDATE SET
            nombre = :nombre,
            estado = :estado,
            activo = :activo,
            fecha_sincronizacion = SYSDATE
       WHEN NOT MATCHED THEN INSERT (id_recurso, nombre, estado, activo, fecha_sincronizacion)
            VALUES (:id_recurso, :nombre, :estado, :activo, SYSDATE)`,
      {
        id_recurso,
        nombre,
        estado,
        activo: activo === false ? 0 : 1
      }
    );
  } finally {
    await conn.close();
  }
}

async function upsertRecursoEnCassandra({ id_recurso, nombre, estado, activo }) {
  await cassandraClient.execute(
    `INSERT INTO repl_recursos (id_recurso, nombre, estado, activo, fecha_sincronizacion)
     VALUES (?, ?, ?, ?, ?)`,
    [id_recurso, nombre, estado, activo !== undefined ? activo : true, new Date()],
    { prepare: true }
  );
}

/**
 * Sincroniza (crea/actualiza/desactiva) la tabla espejo repl_recursos
 * en Oracle y Cassandra a partir del registro maestro en PostgreSQL.
 *
 * Recibe directamente una fila de la tabla Recursos de Postgres
 * (tal como la devuelve `RETURNING *`) y arma "nombre" concatenando
 * tipo + placa, ya que Postgres no tiene una columna "nombre" propia.
 *
 * @param {{id_recurso:number, tipo:string, placa:string, estado:string, activo?:boolean}} recurso
 * @returns {Promise<{oracle:boolean, cassandra:boolean, errores:string[]}>}
 */
async function sincronizarRecurso(recurso) {
  const payload = {
    id_recurso: recurso.id_recurso,
    nombre: `${recurso.tipo} - ${recurso.placa}`,
    estado: recurso.estado,
    activo: recurso.activo
  };

  const resultado = { oracle: false, cassandra: false, errores: [] };

  try {
    await upsertRecursoEnOracle(payload);
    resultado.oracle = true;
  } catch (err) {
    resultado.errores.push(`Oracle (repl_recursos): ${err.message}`);
  }

  try {
    await upsertRecursoEnCassandra(payload);
    resultado.cassandra = true;
  } catch (err) {
    resultado.errores.push(`Cassandra (repl_recursos): ${err.message}`);
  }

  if (resultado.errores.length) {
    console.error("[syncService] sincronizarRecurso con errores:", resultado.errores);
  }

  return resultado;
}

module.exports = {
  sincronizarInstitucion,
  sincronizarRecurso
};
