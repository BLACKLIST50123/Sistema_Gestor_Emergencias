# SGE — Sistema de Gestión de Emergencias

Proyecto académico: consola de despacho de emergencias con 4 módulos
(Usuarios y Recursos, Gestión Institucional, Evidencias Multimedia,
Alertas en Tiempo Real con mapa interactivo) y **4 bases de datos
distintas que se comunican entre sí** (PostgreSQL, Oracle, Cassandra,
MongoDB), orquestadas desde un backend Node/Express.

```
sge/
├── db/
│   ├── postgres/    schema.sql, seed.sql       (Usuarios y Recursos)
│   ├── oracle/      schema.sql, seed.sql       (Gestión Institucional)
│   ├── cassandra/   schema.cql, seed.cql       (Alertas en Tiempo Real)
│   └── mongodb/     schema-validation.js, seed.js (Evidencias Multimedia)
├── backend/         API Node/Express que conecta las 4 BD
├── frontend/        HTML/CSS/JS + mapa Leaflet
├── docker-compose.yml
└── init-db.sh
```

## 1. Levantar las 4 bases de datos

Necesitas [Docker](https://www.docker.com/) instalado. Desde la raíz del proyecto:

```bash
docker compose up -d
```

Espera 30–90 segundos (Oracle es el más lento en arrancar). Luego aplica
los schemas de Cassandra y MongoDB (Postgres y Oracle ya se auto-inicializan):

```bash
chmod +x init-db.sh
./init-db.sh
```

Esto te deja:
- PostgreSQL en `localhost:5432` (BD `sge_usuarios_recursos`)
- Oracle en `localhost:1521` (servicio `FREEPDB1`, usuario `sge_user`)
- Cassandra en `localhost:9042` (keyspace `sge_alertas`)
- MongoDB en `localhost:27017` (BD `sge_evidencias`)

**Nota sobre Oracle:** si tu equipo tiene poca RAM, comenta el servicio
`oracle` en `docker-compose.yml` y usa una instancia externa (Oracle
Cloud Free Tier funciona bien) — solo actualiza `ORACLE_CONNECT_STRING`
en el `.env` del backend.

## 2. Backend

```bash
cd backend
cp .env.example .env      # y ajusta credenciales si las cambiaste
npm install
node scripts/rehash-passwords.js   # genera contraseñas bcrypt reales para el seed
npm start
```

El backend corre en `http://localhost:4000`. Prueba que esté vivo:

```bash
curl http://localhost:4000/api/health
```

Usuarios de prueba (después de correr `rehash-passwords.js`):
cualquiera de `mfernandez`, `cramirez`, `atorres`, `jmedina`, `projas`
con contraseña **`sge2026`**.

## 3. Frontend

El frontend es estático (sin build). Solo ábrelo con un servidor local
para evitar problemas de CORS con `file://`:

```bash
cd frontend
npx serve .
# o: python3 -m http.server 5500
```

Entra a `http://localhost:5500` (o el puerto que te indique) e inicia
sesión con un usuario del seed.

## Arquitectura de datos: por qué 4 motores distintos

| Módulo | Motor | Por qué este motor |
|---|---|---|
| Usuarios y Recursos | PostgreSQL | Datos relacionales, transaccionales, con integridad referencial estricta (login, asignación de recursos) |
| Gestión Institucional | Oracle | Datos institucionales con lógica de negocio compleja (procedimientos almacenados para descontar camas/calabozos con bloqueo de fila) |
| Alertas en Tiempo Real | Cassandra | Alto volumen de escrituras concurrentes, modelado "query-first" (una tabla por cada forma de consulta) |
| Evidencias Multimedia | MongoDB | Documentos con estructura flexible (arrays de archivos multimedia de tamaño variable) |

## El problema de la cascada entre bases de datos

Como son 4 motores independientes, **no existe un `FOREIGN KEY ... ON
DELETE CASCADE` nativo entre ellos**. La solución implementada es un
patrón **Saga simplificado**: el backend orquesta manualmente la
eliminación en cada base de datos, en `backend/services/cascadeService.js`.

Se usa **soft delete** (columna `activo`/`estado`) en vez de `DELETE`
físico, porque:
1. Es más realista para un sistema de emergencias (nunca pierdes el
   rastro legal de auditoría — quién hizo qué, cuándo).
2. Evita el problema de "referencias huérfanas": si borras físicamente
   un Operador, las Evidencias en MongoDB que lo referencian quedan
   con un `id_operador` que ya no existe en ningún lado.

Ejemplo real: al eliminar un Operador desde el frontend
(`DELETE /api/operadores/:id`), el backend:
1. Marca `activo = FALSE` en PostgreSQL (Operadores) y libera sus Recursos asignados
2. Recorre sus Alertas en Cassandra y las marca como `operador_eliminado`
3. Marca `activo = FALSE` en las Evidencias de MongoDB asociadas a ese operador

Si tu profesor exige `DELETE` físico en vez de lógico, cada bloque en
`cascadeService.js` tiene comentado el `DELETE` equivalente — es un
cambio de una línea por bloque.

## El mapa interactivo de alertas

Usa **Leaflet + OpenStreetMap/CARTO** (gratis, sin API key). Flujo:

1. El operador hace clic en el mapa → se capturan `lat`/`lng`
2. Al enviar el formulario de "Nueva alerta", esas coordenadas se
   guardan en Cassandra (`INSERT` en 3 tablas: `Alertas`,
   `Alertas_Por_Estado`, `Alertas_Por_Operador` — ver
   `backend/routes/alertas.js`)
3. El pin se pinta en el mapa inmediatamente con el color según tipo
   de alerta (médica, seguridad, incendio, accidente)
4. Al recargar, todas las alertas activas se vuelven a pintar leyendo
   de Cassandra

## Próximos pasos sugeridos

- Agregar WebSockets (Socket.io) para que las alertas nuevas aparezcan
  en tiempo real en TODOS los operadores conectados, no solo al recargar
- Subida real de archivos a S3/Cloudinary en vez de nombres simulados
  en el módulo de Evidencias
- Rol-based access control más granular (ej. solo supervisores pueden
  eliminar operadores)
