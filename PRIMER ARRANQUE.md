# SGE — Sistema de Gestión de Emergencias
LEVANTA LA TERMINAL UBICADA EN LA CARPETA DEL PROYECTO PARA EMPEZAR CON LOS COMANDOS DE ARRANQUE

## 1. Levantar las 4 bases de datos
Como ya instalaste docker levantamos las 4 bases de datos con este comando.
```bash
docker compose up -d
```
## 2. Espera que cargue bien y luego cargar los esquemas y datos de Cassandra y Mongo
Espera 30–90 segundos (Oracle es el más lento en arrancar). 
```bash
chmod +x init-db.sh
./init-db.sh
```
Esto te deja:
- PostgreSQL en `localhost:5432` (BD `sge_usuarios_recursos`)
- Oracle en `localhost:1521` (servicio `FREEPDB1`, usuario `sge_user`)
- Cassandra en `localhost:9042` (keyspace `sge_alertas`)
- MongoDB en `localhost:27017` (BD `sge_evidencias`)

# 3. Ingresa a DataGrip y Crea un proyecto y pon los credenciales por BD: Postgres y Oracle se pone credenciales, Mongo y Cassandra pon la opcion sin autenticacion o "No Auth" porque no tiene
En DataGrip: + → Data Source → PostgreSQL

# POSTGRES
Host: localhost | Port: 5432 | DB: sge_usuarios_recursos | User: postgres | Pass: postgres

# ORACLE
Host: localhost | Port: 1521 | Service name: FREEPDB1 | User: sge_user | Pass: oracle

# CASSANDRA
Host: localhost | Port: 9042 | Keyspace: sge_alertas | Datacenter: datacenter1 | Sin autenticación

# MONGODB
Host: localhost | Port: 27017 | DB: sge_evidencias | Sin autenticación

## Si Postgres y Oracle no se llenan, tienes que copiar los comandos de los archivos "schema" y "seed" de estas bases de datos (carpeta |db/postgres/schema.sql (tablas) seed (registros)).

## 3. Levantamos el Backend.
Una vez que llenas todos los datos levantamos la API para que funcione la pagina web
```bash
cd backend
npm start     # Levanta la Api, para cerrar o detener pon ctrl + C en la terminal
```
Este comando "npm install" # Instala las dependencias de Node.js pero como ya esta descargado no se pone, salvo que haya un error que obligue borrar lo descargado de Node y se requiera volver a instalar se pone eso antes de iniciar.
El backend corre en `http://localhost:4000`. Prueba que esté vivo:

## 3. Levantamos el Frontend
```bash
cd frontend
npx serve . # Levanta la pagina web
```
Entra a `http://localhost:5500` (o el puerto que te indique) e inicia
sesión con un usuario del seed.
# Los usuarios los vez en Postgres puedes probar estos
Usuario: mfernandez | Contraseña: 50123  | Rol: administrador
Usuario: cramirez   | Contraseña: 50123  | Rol: operador,
Usuario: atorres    | Contraseña: 50123  | Rol: operador
Usuario: jmedina    | Contraseña: 50123  | Rol: operador 
Usuario: projas     | Contraseña: 50123  | Rol: operador