const { Pool } = require("pg");
require("dotenv").config();

const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

pgPool.on("error", (err) => {
  console.error("[PostgreSQL] Error inesperado en el pool:", err);
});

module.exports = pgPool;
