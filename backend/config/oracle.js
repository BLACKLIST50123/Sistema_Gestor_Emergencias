const oracledb = require("oracledb");
require("dotenv").config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

let pool;

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

async function getOracleConnection() {
  if (!pool) await initOraclePool();
  return pool.getConnection();
}

module.exports = { initOraclePool, getOracleConnection };
