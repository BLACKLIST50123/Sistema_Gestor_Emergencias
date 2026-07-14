const cassandra = require("cassandra-driver");
require("dotenv").config();

const cassandraClient = new cassandra.Client({
  contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || "127.0.0.1").split(","),
  localDataCenter: process.env.CASSANDRA_LOCAL_DC || "datacenter1",
  keyspace: process.env.CASSANDRA_KEYSPACE || "sge_alertas"
});

module.exports = cassandraClient;
