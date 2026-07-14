const { MongoClient } = require("mongodb");
require("dotenv").config();

let client;
let db;

async function connectMongo() {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
  await client.connect();
  db = client.db(process.env.MONGO_DATABASE || "sge_evidencias");
  console.log("[MongoDB] Conectado a", process.env.MONGO_DATABASE);
  return db;
}

function getMongoDb() {
  if (!db) throw new Error("MongoDB no ha sido inicializado. Llama connectMongo() primero.");
  return db;
}

module.exports = { connectMongo, getMongoDb };
