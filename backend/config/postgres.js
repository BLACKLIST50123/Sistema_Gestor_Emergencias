// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo abre la conexión con PostgreSQL, la base de datos
// donde viven los Operadores (usuarios del sistema) y los Recursos
// (ambulancias, patrullas, bomberos). Igual que con Oracle, se arma
// una bolsa de conexiones ("pool") una sola vez, y el resto del
// backend (recursos.js, auth.js, alertas.js, syncService.js, etc.)
// la importa y la usa directamente con pgPool.query(...).

const { Pool } = require("pg");
require("dotenv").config();

// ==============================
// PGPOOL (BOLSA DE CONEXIONES A POSTGRESQL)
// ==============================
// Arma el pool con los datos de conexión del archivo .env (host,
// puerto, nombre de base de datos, usuario y contraseña).
const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

// Si una conexión del pool se cae sola (por ejemplo, Postgres se
// reinicia), esto evita que el proceso de Node se caiga entero: solo
// se deja un mensaje en consola para poder revisarlo.
pgPool.on("error", (err) => {
  console.error("[PostgreSQL] Error inesperado en el pool:", err);
});

module.exports = pgPool;
