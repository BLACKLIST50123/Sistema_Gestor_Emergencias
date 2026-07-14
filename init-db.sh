#!/bin/bash
# =========================================================
# Inicializa Cassandra y MongoDB con schema + datos de ejemplo.
# PostgreSQL y Oracle ya se auto-inicializan vía docker-compose
# (carpeta /docker-entrypoint-initdb.d).
#
# Uso:
#   1. docker compose up -d
#   2. Espera ~30-60s a que los contenedores estén listos
#   3. ./init-db.sh
# =========================================================

set -e

echo "Esperando a que Cassandra esté lista..."
until docker exec sge_cassandra cqlsh -e "describe cluster" > /dev/null 2>&1; do
  sleep 3
  echo "  ...esperando Cassandra"
done

echo "Aplicando schema.cql en Cassandra..."
docker exec -i sge_cassandra cqlsh < db/cassandra/schema.cql

echo "Aplicando seed.cql en Cassandra..."
docker exec -i sge_cassandra cqlsh < db/cassandra/seed.cql

echo "Esperando a que MongoDB esté lista..."
until docker exec sge_mongodb mongosh --eval "db.runCommand({ping:1})" > /dev/null 2>&1; do
  sleep 3
  echo "  ...esperando MongoDB"
done

echo "Aplicando schema-validation.js en MongoDB..."
docker exec -i sge_mongodb mongosh < db/mongodb/schema-validation.js

echo "Aplicando seed.js en MongoDB..."
docker exec -i sge_mongodb mongosh < db/mongodb/seed.js

echo ""
echo "Listo. Las 4 bases de datos están inicializadas:"
echo "  - PostgreSQL  -> localhost:5432 (sge_usuarios_recursos)"
echo "  - Oracle      -> localhost:1521 (XEPDB1, usuario sge_user)"
echo "  - Cassandra   -> localhost:9042 (keyspace sge_alertas)"
echo "  - MongoDB     -> localhost:27017 (sge_evidencias)"
echo ""
echo "IMPORTANTE: las contraseñas del seed de PostgreSQL están con"
echo "hash placeholder. Corre 'node backend/scripts/rehash-passwords.js'"
echo "para generar hashes reales de bcrypt antes de hacer login."
