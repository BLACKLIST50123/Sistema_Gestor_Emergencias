// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo abre la conexión con Cassandra, la base de datos
// donde vivimos guardando las Alertas en tiempo real. Cualquier
// otro archivo del backend que necesite leer o escribir alertas
// (por ejemplo backend/routes/alertas.js) importa lo que devuelve
// este archivo en vez de conectarse por su cuenta, así solo hay
// UNA conexión compartida para todo el sistema.

const cassandra = require("cassandra-driver");
require("dotenv").config();

// ==============================
// CLIENTE DE CASSANDRA (conexión compartida)
// ==============================
// Arma el cliente usando las variables del archivo .env (o valores
// por defecto si no están definidas): a qué IP conectarse, en qué
// datacenter y en qué keyspace (algo así como el "nombre de base
// de datos" en Cassandra) trabajar.
const cassandraClient = new cassandra.Client({
  contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || "127.0.0.1").split(","),
  localDataCenter: process.env.CASSANDRA_LOCAL_DC || "datacenter1",
  keyspace: process.env.CASSANDRA_KEYSPACE || "sge_alertas"
});

module.exports = cassandraClient;
