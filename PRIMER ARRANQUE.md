##### SGE — Sistema de Gestión de Emergencias ######
INDICE:
Fase 1: Primer Arranque e Inicialización
- Abrir Docker Desktop
- Levantar las 4 bases de datos (docker compose up -d)
- Cargar esquemas y datos en Cassandra y MongoDB
- Detener conflictos con servicios nativos de Windows (services.msc)
- Configuración de Conexiones en DataGrip (Postgres, Oracle, Cassandra, MongoDB)
- Cargar Schemas y Seeds manuales para Postgres y Oracle
- Levantar el Backend (npm install y npm start)
- Levantar el Frontend (npx serve .) y Credenciales de prueba

## 1. Abrir el docker desktop para que corra el motor de docker en segundo plano

## 2. Levantar las 4 bases de datos
LEVANTA LA TERMINAL DESDE ACA EL VISUAL MIRA QUE ESTE UBICADA EN LA CARPETA DEL PROYECTO PARA EMPEZAR CON LOS COMANDOS DE ARRANQUE SINO ABRE NUEVAMENTE EL PROYECTO PERO SELECCIONANDO LA CARPETA RAIZ DEL PROYECT
algo asi:
PS D:\PROYECTOS\PAGINAS WEB\Sistema Gestor Emergencias>  pero importante que sea la carpeta del proyecto  

Como ya instalaste docker levantamos las 4 bases de datos con este comando.
```bash
docker compose up -d
```
Espera unos 30 - 90 segundos (Oracle es el más lento en arrancar). 
Luego ejecuta este comndo para ver su estado cuando veas 
#########################
DATABASE IS READY TO USE!
#########################
```bash
docker logs sge_oracle
```
## 3. Espera que cargue bien y luego cargar los esquemas y datos de Cassandra y Mongo
Espera 30–90 segundos (Oracle es el más lento en arrancar). 
Luego ejecuta estos comandos espera que cargue uno por uno.

```bash
PARA_CARGAR_LAS_TABLAS_Y_DATOS_DE_CASSANDRA
cmd /c "docker exec -i sge_cassandra cqlsh < db/cassandra/schema.cql"
cmd /c "docker exec -i sge_cassandra cqlsh < db/cassandra/seed.cql"

PARA_CARGAR_LAS_TABLAS_Y_DATOS_DE_MONGODB
cmd /c "docker exec -i sge_mongodb mongosh < db/mongodb/schema-validation.js"
cmd /c "docker exec -i sge_mongodb mongosh < db/mongodb/seed.js"
```

## 4. Este paso es por si Instalaste antes Postgres, Oracle, Mongo o Cassandra. De ya tener una bd instalada haz esto:
1. Haz esta combinacion de teclas (windows + r). Esto abrira el panel ejecutar
2. escribe "services.msc" y dale enter. Esto abrira un panel "Servicios", en toda esa lista busca los       
   procesos que digan Postgres o Oracle o Mongo o Cassandra el que tengas instalado y dale 
   click derecho y a "Detener", y el tipo de Inicializacion dale Manual o Desactivar. (que no este automatico)
   Al detener todos los servicios de la BD que tenias descargado puedes cerrar la ventana.
3. Cierra la terminal y abre otra por si acaso para los proximos comandos.

# 5. Ingresa a DataGrip y Crea un proyecto llamado "Sistema Gestor Emergencias" y pon los credenciales por BD: Postgres y Oracle se pone credenciales, Mongo y Cassandra pon la opcion sin autenticacion o "No Auth" porque no tiene
En DataGrip: + → New Data Source → busca en la lista PostgreSQL para empezar, al pasar el curosr encima apareceran 3 opciones más, agarra el primero que salga postgres noma lo mismo con oracle y las demas.
Te saldra un panel para llenar los datos de conexion llena lo siguiente por cada BD.

ESTOS SON LOS CREDENCIALES PARA CADA BASE DE DATOS
# POSTGRES
Host: localhost | Port: 5432 | Database: sge_usuarios_recursos | User: postgres | Pass: postgres
Dale a "Test Connection" y saldra para descargar los drivers, dale al boton de descarga (puede ser azul).
Espera que descargue arriba en Driver: sale el driver, pon nuevamente la contraseña si es que se borra y dale
nuevamente a "Test Connection" y si sale correcto dale recien a OK

# ORACLE
Host: localhost | Port: 1521 | Service name: FREEPDB1 | User: sge_user | Pass: oracle
Cambia el tipo de conexion a Service Name el campo es "Connection Type:  Service Name, por defecto sale SID"
Luego pon los datos en sus campos testea la conexion, descarga el driver y testea denuevo para el OK

# CASSANDRA
Host: localhost | Port: 9042 | Keyspace: sge_alertas | Datacenter: datacenter1 | Sin autenticación
Cambia el campo "Authenticaction" para que quede seleccionado "No Auth", llena los datos, testea descarga driver y testea para el OK.

# MONGODB
Host: localhost | Port: 27017 | Database: sge_evidencias | Sin autenticación
Lo mismo que en cassandra 

## 6. YA SE DEBERIA DE LLENAR SOLO PERO SI NO:
# Llenar datos en Postgres y Oracle con los archivos de sus carpetas "schema" y "seed"
Como no se llena automaticamente como cassandra y mongo lo tienes que crear manualmente.
Click Derecho sobre la bd Postgres o Oracle -> new y dale a New Query Console para los comandos.

Para eso copia todo el contenido del archivo Schema o Seed de la bd en la que vas a crear.
pegas todo a la consola de la BD y corre seleccionando todo (ctrl + A).
Esperas que cargue y repites lo mismo con cada archivo en su BD correspondiente.
Puedes comprobar que se creo con consultas basicas SELECT o revisando el contenido de cada BD en el lado IZQUIERDO.

## 7. Levantamos el Backend.

===========================================================================================================
ELIMINA LA CARPETA LLAMADA "node_modules" EN CASO EXISTA, ESTA EN LA CARPETA "backend" SI NO EXISTE SIGUE
===========================================================================================================

Una vez que llenas todos los datos levantamos la API para que funcione la pagina web
```bash
cmd
cd backend
npm install   # Instala las dependencias de Node.js
npm start     # Levanta la Api, para cerrar o detener pon ctrl + C en la terminal
```
El backend corre en `http://localhost:4000`. Prueba que esté vivo:
Importante no cierres la terminal

## 6. Levantamos el Frontend Abre una nueva terminal sin cerrar la anterior
Una vez que corra la Api abre una nueva terminal para levantar el Frontend
```bash
cmd
cd frontend
npx serve . # Levanta la pagina web, para cerrar o detener pon ctrl + C en la terminal
```
Entra a `http://localhost:5500` (o el puerto que te indique) e inicia
sesión con algun usuario de abajo para probar.
# Los usuarios los vez en Postgres puedes probar estos
Usuario: mfernandez | Contraseña: 50123  | Rol: administrador
Usuario: cramirez   | Contraseña: 50123  | Rol: operador,
Usuario: atorres    | Contraseña: 50123  | Rol: operador
Usuario: jmedina    | Contraseña: 50123  | Rol: operador 
Usuario: projas     | Contraseña: 50123  | Rol: operador

## ################################################## ##
## PARA CERRAR VE AL ARCHIVO "CERRAR Y CONTINUAR.md"  ##
## ################################################## ##