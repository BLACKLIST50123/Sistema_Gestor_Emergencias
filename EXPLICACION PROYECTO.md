# Explicacion del flujo Sistema Gestor de Emergencias (SGE)


## 1. La Analogia de la Vida Real: "El Restaurante"

Imaginen que el SGE es un restaurante grande con una cocina especializada.

| Restaurante | Proyecto | Rol |
|---|---|---|
| El salon, las mesas, la carta, la decoracion | `frontend/` (HTML/CSS/JS) | Lo unico que el cliente (el operador que usa el sistema) ve y toca. No cocina nada, solo pide y muestra lo que llega. |

| El jefe de cocina | `backend/` (Node/Express) | Recibe el pedido del mesero, decide a que estacion de la cocina mandarlo, y es el unico que puede entrar a las despensas. Nadie del salon entra a la cocina directamente. |

| Las 4 despensas en oficinas separadas | Las 4 bases de datos | Cada una guarda un tipo de cosa distinta, con su propio candado y su propio orden interno. |

Por que 4 archivadores y no uno solo:

- Archivador de Recursos Humanos (PostgreSQL): guarda quien trabaja ahi (Operadores) y el inventario de vehiculos (ambulancias, patrullas). Es un archivador muy estricto: no deja anotar un empleado sin sus datos completos, ni asignar un vehiculo a alguien que no existe en el registro.
- Archivador de Convenios Institucionales (Oracle): guarda los hospitales y comisarias con los que el sistema tiene convenio, y cuanta "capacidad" les queda (camas, calabozos). Es el archivador de la oficina legal/administrativa: tiene procedimientos formales con candados especiales para que dos personas no reserven la ultima cama al mismo tiempo.
- Pizarra de emergencias urgentes (Cassandra): aqui no se archiva con calma, es la pizarra donde entran las alertas constantemente, de muchos operadores a la vez, y hay que anotarlos rapidisimo sin trabarse. Esta organizada de una forma particular: hay una copia de la pizarra "ordenada por estado" y otra copia "ordenada por mesero", porque asi se busca mas rapido segun lo que se necesite ver.
- Evidencias del evento (MongoDB): cuando se cierra un caso, se guardan fotos o videos de como quedo. No todos los casos traen la misma cantidad de fotos ni el mismo tipo de archivo, asi que este album es flexible: no exige que todas las paginas tengan el mismo formato.

La regla de oro del restaurante: el cliente (frontend) nunca entra a ninguna despensa directo. Todo pasa por el jefe de cocina (backend), siempre.

---

## 2. La Estructura de Carpetas (y el orden en que se usa cada una)

Antes de ver el flujo de una peticion, conviene ubicar donde vive cada cosa y en que orden entra en juego cuando uno prende el sistema desde cero.

```
Sistema Gestor Emergencias/
|
|-- docker-compose.yml     PASO 1: enciende las 4 bases de datos (Postgres,
|                           Oracle, Cassandra, MongoDB), cada una en su propio
|                           "contenedor" (una especie de caja aislada donde
|                           corre ese programa sin mezclarse con los demas).
|
|-- init-db.sh             PASO 2: script (una lista de comandos automaticos)
|                           que le mete las tablas y los datos de prueba a
|                           Cassandra y Mongo, porque esas dos no se llenan
|                           solas al prender el contenedor (Postgres y Oracle
|                           si se llenan solas).
|
|-- db/                    Aqui NO hay codigo del sistema, son los "planos"
|   |                      de cada base de datos: que tablas tiene, que
|   |                      columnas, y datos de ejemplo para probar.
|   |-- postgres/           - plano de Usuarios y Recursos
|   |-- oracle/             - plano de Instituciones y Sedes
|   |-- cassandra/          - plano de Alertas
|   |-- mongodb/            - plano de Evidencias
|
|-- backend/                PASO 3: aqui vive el "jefe de cocina" (el servidor).
|   |-- server.js           - El archivo que se ejecuta primero al hacer
|   |                         "npm start". Conecta las bases de datos y deja
|   |                         el servidor escuchando peticiones en un puerto
|   |                         (una especie de "canal" numerado, aqui el 4000).
|   |-- config/             - Un archivo por cada base de datos: abre la
|   |                         conexion a esa base y la deja lista para que el
|   |                         resto del backend la use.
|   |-- routes/             - Un archivo por cada modulo del sistema (alertas,
|   |                         usuarios, instituciones, evidencias). Aqui se
|   |                         definen las "direcciones" (API, lo explicamos
|   |                         abajo) a las que el frontend puede pedir cosas.
|   |-- services/           - Logica que varias rutas comparten: verificar el
|   |                         login, sincronizar datos entre bases, borrar en
|   |                        cascada, calcular prioridades en el mapa.
|   |-- uploads/            - Carpeta donde se guardan fisicamente las fotos y
|                             videos que suben los operadores.
|
|-- frontend/                PASO 4: lo que ve el operador en el navegador.
    |-- index.html           - la estructura de la pagina (que botones, que
    |                          formularios existen)
    |-- app.js               - toda la logica: que pasa cuando haces clic en
    |                          algo, como se piden datos al backend
    |-- styles.css           - los colores, tamanos, como se ve todo
```

Orden real de arranque cuando alguien quiere correr el proyecto de cero:

1. Se prenden las 4 bases de datos con `docker-compose.yml`.
2. Se les mete el contenido (a Cassandra y Mongo; Postgres y Oracle ya vienen listas).
    con: 
    `PARA_CARGAR_LAS_TABLAS_Y_DATOS_DE_CASSANDRA`
    - cmd /c "docker exec -i sge_cassandra cqlsh < db/cassandra/schema.cql" `
    - cmd /c "docker exec -i sge_cassandra cqlsh < db/cassandra/seed.cql" `

    `PARA_CARGAR_LAS_TABLAS_Y_DATOS_DE_MONGODB`
    - cmd /c "docker exec -i sge_mongodb mongosh < db/mongodb/schema-validation.js"`
    - cmd /c "docker exec -i sge_mongodb mongosh < db/mongodb/seed.js"` 

3. Se prende el backend (`server.js`), que se conecta a esas 4 bases ya prendidas.
4. Se abre el frontend en el navegador, que a partir de ahi le habla al backend.

---

## 3. Por que usamos 4 Bases de Datos

La pregunta clave es: por que no usar una sola base de datos para todo. Aqui la razon, motor por motor:

### PostgreSQL, para Usuarios y Recursos
- Es una base "relacional" (organiza todo en tablas conectadas entre si por reglas estrictas) con integridad referencial estricta: no permite crear un Recurso "asignado" a un Operador que no existe, ni un login sin usuario real.
- Los logins y las asignaciones de recursos son operaciones "transaccionales": o se hacen completas, o no se hacen (no puede quedar a medias, por ejemplo un vehiculo asignado a un operador que quedo a mitad de crearse).
- En una frase: Postgres da candados de integridad automaticos para datos donde un error significa un operador fantasma manejando una ambulancia.

### Oracle, para Gestion Institucional
- Maneja logica de negocio compleja con procedimientos que necesitan "bloqueo de fila": cuando se deriva un paciente a un hospital, hay que descontar una cama disponible sin que dos operadores la descuenten al mismo tiempo por error (eso se llama bloqueo de fila: mientras un proceso esta modificando esa fila de datos, otro tiene que esperar su turno).
- En una frase: Oracle da control fino de esa concurrencia (varias personas usando lo mismo al mismo tiempo) para un recurso fisico limitado y compartido, como camas y calabozos.

### Cassandra, para Alertas en Tiempo Real
- Esta pensada para alto volumen de escrituras concurrentes (muchas alertas entrando a la vez) y para un modelado "query-first": en vez de una sola tabla y tener que cruzar informacion de varias tablas cada vez que se consulta (lo que se llama un JOIN, y es costoso en tiempo), se crea una tabla por cada forma en la que se va a consultar despues (una para buscar por estado, otra para buscar por operador), sacrificando un poco de espacio en disco para ganar velocidad de lectura.
- En una frase: Cassandra prioriza velocidad de escritura y lectura masiva sobre integridad estricta, perfecto para algo que llega constante y en caliente, como una alerta de emergencia.

### MongoDB, para Evidencias Multimedia
- Guarda "documentos" (como fichas individuales, cada una con su propia forma) con estructura flexible: una evidencia puede tener una foto, o cinco fotos y dos videos, y eso en una tabla relacional tradicional obligaria a dejar columnas vacias o crear tablas extra solo para eso.
- En una frase: Mongo permite que cada evidencia tenga la forma que necesite, sin forzar una estructura rigida de columnas fijas iguales para todos los casos.

### La respuesta corta si el profesor pregunta por que no usar solo una base de datos

"Porque cada modulo tiene una necesidad distinta: integridad estricta (Postgres), concurrencia controlada sobre un recurso limitado (Oracle), volumen y velocidad de escritura (Cassandra), y flexibilidad de estructura (Mongo). Usar un solo motor para las 4 cosas obligaria a forzar todas esas necesidades dentro de un molde que no es el ideal para todas a la vez. Es el mismo principio de usar la herramienta correcta para cada trabajo, aplicado a bases de datos."

---

## 4. El Camino de una Peticion, paso a paso
El Camino de una Petición (Ejemplo: Crear Alerta y Subir Foto)
Vamos a ver qué pasa desde que haces clic hasta que se guarda todo.

1. El Operador hace clic en el mapa
El mapa (usando Leaflet) saca las coordenadas exactas de donde hiciste clic: la Latitud (Norte/Sur) y Longitud (Este/Oeste). Así ya no hay que escribir la dirección a mano.

2. El Frontend (app.js) hace el pedido
El mesero del restaurante (app.js) usa una herramienta de JavaScript llamada fetch() para enviar un mensaje al servidor (Backend) por debajo de la mesa, sin recargar la página.

El mensaje va hacia una API/Ruta, que es simplemente la dirección a la que le pides las cosas (ej. /api/alertas).

Con los datos (coordenadas, descripción), viaja un Token JWT. Piensa en el JWT como una pulsera de discoteca que el sistema te dio al iniciar sesión. Adentro dice quién eres y qué puesto tienes, así el servidor no tiene que preguntarle a la base de datos a cada rato.

3. El Portero (Middleware de Seguridad)
Antes de que el servidor guarde algo, un programa de seguridad (authMiddleware.js) te para en la puerta:

Revisa tu "pulsera" JWT para ver si no está vencida.

Revisa si tienes permiso para hacer eso (si eres operador o admin).

Si algo falla, te rechaza y nada se guarda.

4. Guardando la Alerta en Cassandra
Pasaste al portero. Tu pedido llega a routes/alertas.js. Aquí, los datos se guardan en Cassandra, que es nuestra base de datos rápida. (Dato curioso: se guarda en 3 tablas distintas a la vez para que luego sea rapidísimo buscarla por estado o por operador). El pin ya aparece en el mapa.

5. Subiendo la Foto de Evidencia (¡El truco está aquí!)
El operador decide cerrar el caso y sube una foto. app.js usa otro fetch() especial (llamado FormData) porque ahora llevamos un archivo pesado.

¿Dónde va la foto? Una herramienta llamada multer recibe la foto física (los píxeles) y la guarda en el disco duro del servidor (en una carpeta llamada uploads/).

¿Qué hace MongoDB entonces? evidencias.js va a MongoDB y guarda una nota de texto que dice: "Esta evidencia es de tal alerta y la foto está en la carpeta /uploads/foto.jpg".

Resumen: La foto pesada va al disco duro, Mongo solo guarda el caminito (la ruta) hacia ella.

6. El Toque Final (Congelando Datos)
Justo antes de guardar en Mongo, el sistema le pregunta rápido a Postgres ("¿Quién subió esto?") y a Cassandra ("¿Dónde fue?"). Guarda esas respuestas dentro de Mongo. Así, cuando mañana quieras ver la evidencia, solo le preguntas a Mongo y no tienes que despertar a las otras bases de datos.

## 5. Las capacidades del Backend: Sincronizacion y Cascada

### El problema de fondo

Como tenemos 4 motores de base de datos independientes, no existe algo llamado "Foreign Key" (una regla automatica que conecta una tabla con otra y hace que, si se borra algo en una, se borre o actualice automaticamente en la otra) que funcione entre bases de datos distintas. Las Foreign Keys solo funcionan dentro de la misma base de datos. Como aqui hay 4 bases separadas, no hay ninguna conexion automatica entre ellas: el backend tiene que hacer ese trabajo a mano, como un arbitro.

### `syncService.js`, el fotocopiador

- Cada dato tiene un solo dueño real (por ejemplo, las Instituciones viven de verdad en Oracle).
- Cada vez que se crea, edita o desactiva algo en la base dueña, `syncService.js` fotocopia una version resumida de ese dato hacia las otras 3 bases (esas copias se llaman tablas `repl_`, de "replica").
- Para que sirve esto: para que, por ejemplo, Cassandra pueda mostrar el nombre de un hospital en el mapa sin tener que "llamar por telefono" a Oracle cada vez que alguien lo abre.
- Analogia: es como si la oficina legal (Oracle) mandara una fotocopia del contrato firmado a las otras 3 oficinas, para que cada una tenga la informacion a mano sin tener que llamar cada vez que la necesita.

### `cascadeService.js`, el arbitro del borrado

- Cuando se da de baja algo (por ejemplo, un Operador), no basta con borrarlo en Postgres, hay que avisarle a las otras 3 bases que dependian de el.
- Se usa "soft delete" (en vez de borrar la fila de verdad, se marca una columna `activo` como `FALSE`), porque:
  1. Nunca se pierde el rastro de auditoria (quien hizo que, y cuando).
  2. Se evitan las "referencias huerfanas": que una Evidencia en Mongo quede apuntando a un `id_operador` que ya no existe en ningun lado.
- Cada paso de la cascada esta protegido por separado, asi que si un paso falla, los demas igual se intentan (no se detiene todo el proceso por un solo error).
- Analogia: cuando un empleado renuncia, no basta con tacharlo de la lista de Recursos Humanos, hay que avisarle tambien a seguridad (para quitarle el acceso), al almacen (para liberar la herramienta que tenia asignada), y al archivo de eventos pasados (para marcar que ese empleado ya no trabaja ahi, sin borrar la historia de lo que hizo).

---



## 6. Mini-Balotario: Preguntas Posibles

# Por que no usaron una sola base de datos para todo el sistema?

"Porque cada modulo tiene una necesidad tecnica distinta: Postgres da integridad estricta para usuarios y recursos; Oracle da control de concurrencia para un recurso fisico limitado como camas y calabozos; Cassandra prioriza volumen y velocidad de escritura para alertas que llegan constantemente; y Mongo da flexibilidad de estructura para evidencias que varian en cantidad y tipo de archivo. Usar un solo motor obligaria a forzar esas 4 necesidades distintas en un molde que no es ideal para todas."

# Si no hay Foreign Keys entre las bases de datos, como garantizan que no queden datos huerfanos?

"Con un patron de orquestacion manual en `cascadeService.js`: el backend ejecuta la eliminacion en cada base de datos por separado, en orden. Ademas usamos soft delete (marcar `activo = FALSE`) en vez de borrado fisico, asi nunca perdemos el rastro de auditoria y evitamos que, por ejemplo, una Evidencia en Mongo quede apuntando a un operador que ya no existe en ninguna base."

# Donde se guardan realmente las fotos y videos que suben los operadores, en MongoDB?

"No. El archivo fisico (la foto, el video) se guarda en el disco del servidor, en la carpeta `backend/uploads/`, usando una libreria llamada multer. MongoDB nunca guarda el archivo en si, solo guarda la ruta publica donde quedo ese archivo (por ejemplo `/uploads/nombre-unico.jpg`), junto con la descripcion, quien lo subio y a que alerta pertenece. El backend expone esa carpeta de forma publica para que el frontend pueda mostrar la imagen usando esa ruta."

# Que pasa si una de las 4 bases de datos se cae, se cae todo el sistema?

"Depende del modulo: si se cae la base dueña de ese dato, esa parte especifica del sistema no funciona, por ejemplo sin Postgres no hay login. Pero las operaciones de sincronizacion y de cascada estan hechas con manejo de errores independiente por cada base: si una replica falla, las demas igual se intentan y el error queda registrado, no se cae todo el proceso por una sola base caida."
