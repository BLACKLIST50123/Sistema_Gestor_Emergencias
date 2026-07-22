/**
 * =========================================================
 * QUÉ HACE ESTE ARCHIVO (en simple)
 * =========================================================
 * Como el proyecto usa 4 bases de datos distintas y cada una es
 * "dueña" de un tipo de dato (por ejemplo, Oracle es dueña de las
 * Instituciones), este archivo se encarga de mandarle una COPIA de
 * esos datos a las otras 3 bases cada vez que algo se crea, edita o
 * se da de baja. Así, cualquier base puede mostrar "Hospital
 * Regional" sin tener que ir a preguntarle a Oracle cada vez. Estas
 * copias se llaman tablas repl_ (de "réplica").
 *
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
 *    el error queda registrado en `errores`
 *    y se puede reintentar manualmente o con un job aparte.
 * 4. activo=false representa un soft delete que también se
 *    "espeja": por eso no existen funciones separadas de
 *    eliminarInstitucionReplica/eliminarRecursoReplica, se reusa
 *    la misma función de upsert pasando activo=false.
 * 5. MongoDB (dueño real de Evidencias) también recibe su propia
 *    copia de cada tabla repl_* (repl_instituciones, repl_recursos,
 *    repl_operadores, repl_sedes), igual que Postgres/Oracle/Cassandra.
 *    Se guardan como colecciones normales (no requieren "schema"
 *    previo) usando upsert por el id de la BD dueña como clave.
 */

const pgPool = require("../config/postgres");
const cassandraClient = require("../config/cassandra");
const { getMongoDb } = require("../config/mongodb");

// ==============================
// UPSERT REPL EN MONGO (GUARDAR/ACTUALIZAR UNA COPIA EN MONGO)
// ==============================
// Función genérica que usan las 4 sincronizaciones de abajo para
// guardar su copia en Mongo. Si el registro (buscado por su id) ya
// existe lo actualiza, y si no existe lo crea — todo en un solo paso.
async function upsertReplEnMongo(coleccion, idField, datos) {
  const db = getMongoDb();
  await db.collection(coleccion).updateOne(
    { [idField]: datos[idField] },
    { $set: { ...datos, fecha_sincronizacion: new Date() } },
    { upsert: true }
  );
}

// ---------------------------------------------------------------
// INSTITUCIONES (dueño real: Oracle) -> repl_instituciones en
// PostgreSQL y Cassandra
// ---------------------------------------------------------------

// ==============================
// UPSERT INSTITUCIÓN EN POSTGRES (COPIAR UNA INSTITUCIÓN A POSTGRES)
// ==============================
// Guarda o actualiza la copia de una Institución en la tabla
// repl_instituciones de PostgreSQL.
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

// ==============================
// UPSERT INSTITUCIÓN EN CASSANDRA (COPIAR UNA INSTITUCIÓN A CASSANDRA)
// ==============================
// Igual que la de arriba, pero para Cassandra. En Cassandra un
// INSERT con la misma partition key SOBREESCRIBE la fila anterior,
// así que sirve como upsert sin necesidad de "ON CONFLICT" ni "MERGE".
async function upsertInstitucionEnCassandra({ id_institucion, nombre, activo }) {
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
// ==============================
// SINCRONIZAR INSTITUCIÓN (FUNCIÓN PRINCIPAL: PROPAGA UNA INSTITUCIÓN)
// ==============================
// Esta es la que llaman las rutas (instituciones.js, cascadeService.js)
// cada vez que se crea, edita o desactiva una Institución. Manda la
// copia a Postgres, Cassandra y Mongo, y devuelve un resumen de a
// cuáles les llegó bien y a cuáles no.
async function sincronizarInstitucion(institucion) {
  const resultado = { postgres: false, cassandra: false, mongodb: false, errores: [] };

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

  try {
    await upsertReplEnMongo("repl_instituciones", "id_institucion", {
      id_institucion: institucion.id_institucion,
      nombre: institucion.nombre,
      activo: institucion.activo !== undefined ? institucion.activo : true
    });
    resultado.mongodb = true;
  } catch (err) {
    resultado.errores.push(`MongoDB (repl_instituciones): ${err.message}`);
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

// ==============================
// UPSERT RECURSO EN ORACLE (COPIAR UN RECURSO A ORACLE)
// ==============================
// Usa un MERGE (el "upsert" de Oracle): si el recurso ya existe en
// repl_recursos lo actualiza, si no, lo inserta.
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
        activo: activo !== false
      }
    );
  } finally {
    await conn.close();
  }
}

// ==============================
// UPSERT RECURSO EN CASSANDRA (COPIAR UN RECURSO A CASSANDRA)
// ==============================
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
// ==============================
// SINCRONIZAR RECURSO (FUNCIÓN PRINCIPAL: PROPAGA UN RECURSO)
// ==============================
// La llaman las rutas de recursos.js y alertas.js cada vez que un
// recurso se crea, cambia de estado (disponible/ocupado/etc.), se
// edita o se da de baja. Reparte la copia a Oracle, Cassandra y
// Mongo, y devuelve el resumen de qué salió bien.
async function sincronizarRecurso(recurso) {
  const payload = {
    id_recurso: recurso.id_recurso,
    nombre: `${recurso.tipo} - ${recurso.placa}`,
    estado: recurso.estado,
    activo: recurso.activo
  };

  const resultado = { oracle: false, cassandra: false, mongodb: false, errores: [] };

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

  try {
    await upsertReplEnMongo("repl_recursos", "id_recurso", {
      id_recurso: payload.id_recurso,
      nombre: payload.nombre,
      estado: payload.estado,
      activo: payload.activo !== undefined ? payload.activo : true
    });
    resultado.mongodb = true;
  } catch (err) {
    resultado.errores.push(`MongoDB (repl_recursos): ${err.message}`);
  }

  if (resultado.errores.length) {
    console.error("[syncService] sincronizarRecurso con errores:", resultado.errores);
  }

  return resultado;
}

// ---------------------------------------------------------------
// OPERADORES / USUARIOS (dueño real: PostgreSQL) -> repl_operadores
// en Oracle y Cassandra
// ---------------------------------------------------------------
// Mismo patrón que Recursos: Postgres es dueño de Operadores, así
// que cada alta/edición/baja de un Operador (usuario del sistema)
// se espeja en Oracle y Cassandra para que ningún otro motor tenga
// que hacer una consulta cruzada a Postgres solo para mostrar
// "quién" hizo tal acción.

// ==============================
// UPSERT OPERADOR EN ORACLE (COPIAR UN OPERADOR A ORACLE)
// ==============================
async function upsertOperadorEnOracle({ id_operador, nombre, usuario, rol, activo }) {
  const oracledb = require("oracledb");
  const { getOracleConnection } = require("../config/oracle");
  const conn = await getOracleConnection();
  try {
    await conn.execute(
      `MERGE INTO repl_operadores r
       USING (SELECT :id_operador AS id_operador FROM dual) src
       ON (r.id_operador = src.id_operador)
       WHEN MATCHED THEN UPDATE SET
            nombre = :nombre,
            usuario = :usuario,
            rol = :rol,
            activo = :activo,
            fecha_sincronizacion = SYSDATE
       WHEN NOT MATCHED THEN INSERT (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion)
            VALUES (:id_operador, :nombre, :usuario, :rol, :activo, SYSDATE)`,
      {
        id_operador,
        nombre,
        usuario,
        rol,
        activo: activo !== false
      }
    );
  } finally {
    await conn.close();
  }
}

// ==============================
// UPSERT OPERADOR EN CASSANDRA (COPIAR UN OPERADOR A CASSANDRA)
// ==============================
async function upsertOperadorEnCassandra({ id_operador, nombre, usuario, rol, activo }) {
  await cassandraClient.execute(
    `INSERT INTO repl_operadores (id_operador, nombre, usuario, rol, activo, fecha_sincronizacion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id_operador, nombre, usuario, rol, activo !== undefined ? activo : true, new Date()],
    { prepare: true }
  );
}

/**
 * Sincroniza (crea/actualiza/desactiva) la tabla espejo repl_operadores
 * en Oracle y Cassandra a partir del registro maestro en PostgreSQL.
 *
 * @param {{id_operador:number, nombre:string, usuario:string, rol:string, activo?:boolean}} operador
 * @returns {Promise<{oracle:boolean, cassandra:boolean, errores:string[]}>}
 */
// ==============================
// SINCRONIZAR OPERADOR (FUNCIÓN PRINCIPAL: PROPAGA UN OPERADOR)
// ==============================
// La llaman las rutas de recursos.js (alta/edición/baja de
// operadores) para que Oracle, Cassandra y Mongo tengan siempre el
// nombre/usuario/rol actualizado de cada operador, sin exponer
// nunca la contraseña en esas copias.
async function sincronizarOperador(operador) {
  const payload = {
    id_operador: operador.id_operador,
    nombre: operador.nombre,
    usuario: operador.usuario,
    rol: operador.rol,
    activo: operador.activo
  };

  const resultado = { oracle: false, cassandra: false, mongodb: false, errores: [] };

  try {
    await upsertOperadorEnOracle(payload);
    resultado.oracle = true;
  } catch (err) {
    resultado.errores.push(`Oracle (repl_operadores): ${err.message}`);
  }

  try {
    await upsertOperadorEnCassandra(payload);
    resultado.cassandra = true;
  } catch (err) {
    resultado.errores.push(`Cassandra (repl_operadores): ${err.message}`);
  }

  try {
    await upsertReplEnMongo("repl_operadores", "id_operador", {
      id_operador: payload.id_operador,
      nombre: payload.nombre,
      usuario: payload.usuario,
      rol: payload.rol,
      activo: payload.activo !== undefined ? payload.activo : true
    });
    resultado.mongodb = true;
  } catch (err) {
    resultado.errores.push(`MongoDB (repl_operadores): ${err.message}`);
  }

  if (resultado.errores.length) {
    console.error("[syncService] sincronizarOperador con errores:", resultado.errores);
  }

  return resultado;
}

// ---------------------------------------------------------------
// SEDES Y CAPACIDAD (dueño real: Oracle) -> repl_sedes en
// PostgreSQL y Cassandra
// ---------------------------------------------------------------

// ==============================
// UPSERT SEDE EN POSTGRES (COPIAR UNA SEDE A POSTGRES)
// ==============================
async function upsertSedeEnPostgres({ id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo }) {
  await pgPool.query(
    `INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id_sede)
     DO UPDATE SET id_institucion = EXCLUDED.id_institucion,
                    direccion = EXCLUDED.direccion,
                    camas_disponibles = EXCLUDED.camas_disponibles,
                    calabozos_disponibles = EXCLUDED.calabozos_disponibles,
                    activo = EXCLUDED.activo,
                    fecha_sincronizacion = NOW()`,
    [id_sede, id_institucion, direccion, camas_disponibles || 0, calabozos_disponibles || 0, activo !== undefined ? activo : true]
  );
}

// ==============================
// UPSERT SEDE EN CASSANDRA (COPIAR UNA SEDE A CASSANDRA)
// ==============================
async function upsertSedeEnCassandra({ id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo }) {
  await cassandraClient.execute(
    `INSERT INTO repl_sedes (id_sede, id_institucion, direccion, camas_disponibles, calabozos_disponibles, activo, fecha_sincronizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id_sede, id_institucion, direccion, camas_disponibles || 0, calabozos_disponibles || 0, activo !== undefined ? activo : true, new Date()],
    { prepare: true }
  );
}

/**
 * Sincroniza (crea/actualiza/desactiva) la tabla espejo repl_sedes
 * en PostgreSQL y Cassandra a partir del registro maestro en Oracle.
 *
 * @param {{id_sede:number, id_institucion:number, direccion:string, camas_disponibles?:number, calabozos_disponibles?:number, activo?:boolean}} sede
 * @returns {Promise<{postgres:boolean, cassandra:boolean, errores:string[]}>}
 */
// ==============================
// SINCRONIZAR SEDE (FUNCIÓN PRINCIPAL: PROPAGA UNA SEDE)
// ==============================
// La llaman las rutas de instituciones.js cada vez que una Sede se
// crea, se edita (incluyendo el mapa de ubicación) o se da de baja.
// Reparte la copia a Postgres, Cassandra y Mongo.
async function sincronizarSede(sede) {
  const resultado = { postgres: false, cassandra: false, mongodb: false, errores: [] };

  try {
    await upsertSedeEnPostgres(sede);
    resultado.postgres = true;
  } catch (err) {
    resultado.errores.push(`Postgres (repl_sedes): ${err.message}`);
  }

  try {
    await upsertSedeEnCassandra(sede);
    resultado.cassandra = true;
  } catch (err) {
    resultado.errores.push(`Cassandra (repl_sedes): ${err.message}`);
  }

  try {
    await upsertReplEnMongo("repl_sedes", "id_sede", {
      id_sede: sede.id_sede,
      id_institucion: sede.id_institucion,
      direccion: sede.direccion,
      camas_disponibles: sede.camas_disponibles || 0,
      calabozos_disponibles: sede.calabozos_disponibles || 0,
      activo: sede.activo !== undefined ? sede.activo : true
    });
    resultado.mongodb = true;
  } catch (err) {
    resultado.errores.push(`MongoDB (repl_sedes): ${err.message}`);
  }

  if (resultado.errores.length) {
    console.error("[syncService] sincronizarSede con errores:", resultado.errores);
  }

  return resultado;
}

module.exports = {
  sincronizarInstitucion,
  sincronizarRecurso,
  sincronizarOperador,
  sincronizarSede
};
