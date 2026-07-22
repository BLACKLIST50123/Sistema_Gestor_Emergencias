// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo abre la conexión con Oracle, la base de datos donde
// viven las Instituciones y las Sedes/Capacidad. En vez de abrir una
// conexión nueva cada vez que alguien pide un dato (eso sería lento),
// se arma un "pool" (una bolsa de conexiones ya listas para usar) una
// sola vez al arrancar el servidor, y cada ruta que necesita hablar
// con Oracle (por ejemplo backend/routes/instituciones.js) saca una
// conexión prestada de esa bolsa con getOracleConnection().

const oracledb = require("oracledb");
require("dotenv").config();

// Hace que cada fila que devuelve Oracle venga como un objeto
// { columna: valor } en vez de un array posicional, y que cada
// INSERT/UPDATE/DELETE se guarde solo (sin tener que escribir
// "commit" a mano en cada ruta).
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

let pool;

// ==============================
// INITORACLEPOOL (CREA LA BOLSA DE CONEXIONES)
// ==============================
// Se llama una sola vez al arrancar el servidor (server.js), y solo
// si hay datos de conexión a Oracle configurados en el .env. Si el
// pool ya existía, lo reutiliza en vez de crear uno nuevo.
async function initOraclePool() {
  if (pool) return pool;
  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 2,
    poolMax: 10
  });
  console.log("[Oracle] Pool de conexiones inicializado");
  return pool;
}

// ==============================
// GETORACLECONNECTION (PRESTA UNA CONEXIÓN DE LA BOLSA)
// ==============================
// La usan las rutas (instituciones.js, alertas.js en el historial
// 360°) cada vez que necesitan consultar Oracle. Importante: quien
// pide la conexión con esta función es responsable de cerrarla
// después con conn.close(), para devolverla a la bolsa.
async function getOracleConnection() {
  if (!pool) await initOraclePool();
  return pool.getConnection();
}

module.exports = { initOraclePool, getOracleConnection };
