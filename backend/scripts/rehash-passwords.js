/**
 * Genera hashes bcrypt reales para los operadores del seed y
 * los actualiza en PostgreSQL. Corre esto una vez después de
 * aplicar seed.sql, porque no se puede escribir un hash bcrypt
 * válido directamente en un archivo .sql a mano.
 *
 * Uso: node scripts/rehash-passwords.js
 *
 * Contraseña asignada a TODOS los operadores de prueba: "sge2026"
 * (cámbiala en producción, esto es solo para que puedas hacer
 * login en el demo)
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const pgPool = require("../config/postgres");

const PASSWORD_DEMO = "sge2026";

async function run() {
  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const result = await pgPool.query(
    `UPDATE Operadores SET contrasena_hash = $1 WHERE activo = TRUE RETURNING usuario`,
    [hash]
  );
  console.log(`Contraseñas actualizadas para ${result.rows.length} operadores.`);
  console.log(`Usuarios de prueba:`, result.rows.map(r => r.usuario).join(", "));
  console.log(`Contraseña para todos: "${PASSWORD_DEMO}"`);
  await pgPool.end();
}

run().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
