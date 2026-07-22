// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo abre la conexión con MongoDB, la base de datos donde
// se guardan las Evidencias (fotos/videos de los casos cerrados) y,
// ahora también, las tablas espejo repl_*. Otros archivos del
// backend NUNCA se conectan a Mongo por su cuenta: llaman a
// connectMongo() una sola vez al arrancar el servidor (esto pasa en
// server.js) y después usan getMongoDb() para pedir esa misma
// conexión ya lista.

const { MongoClient } = require("mongodb");
require("dotenv").config();

let client;
let db;

// ==============================
// CONNECTMONGO (ABRE LA CONEXIÓN UNA SOLA VEZ)
// ==============================
// Se llama al arrancar el servidor (server.js). Si ya existe una
// conexión abierta la reutiliza en vez de abrir otra; si no,
// se conecta a la URL de Mongo definida en el .env y guarda tanto
// el cliente como la base de datos en memoria para el resto del
// backend.
async function connectMongo() {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
  await client.connect();
  db = client.db(process.env.MONGO_DATABASE || "sge_evidencias");
  console.log("[MongoDB] Conectado a", process.env.MONGO_DATABASE);
  return db;
}

// ==============================
// GETMONGODB (PARA USAR LA CONEXIÓN YA ABIERTA)
// ==============================
// La usan las rutas y servicios (evidencias.js, syncService.js, etc.)
// para obtener la base de datos sin tener que abrir una conexión
// nueva cada vez. Si todavía no se llamó a connectMongo() primero,
// avisa con un error claro en vez de fallar en silencio.
function getMongoDb() {
  if (!db) throw new Error("MongoDB no ha sido inicializado. Llama connectMongo() primero.");
  return db;
}

module.exports = { connectMongo, getMongoDb };
