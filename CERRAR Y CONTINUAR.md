## CERRAR Y CONTINUAR ##
INDICE:
Cierre Correcto de la Sesión de Trabajo
1. Detener Backend y Frontend (Ctrl + C)
2. Bajar contenedores conservando volúmenes (docker compose down)
3. Cerrar DataGrip

Abrir y Continuar al Día Siguiente
1. Levantar contenedores existentes (docker compose up -d)
2. Refrescar DataGrip
3. Reiniciar la API Backend
4. Levantar la página Web Frontend


LEVANTA LA TERMINAL UBICADA EN LA CARPETA DEL PROYECTO PARA EMPEZAR CON LOS COMANDOS DE ARRANQUE
## 1. Cerrar Backend y Frontend.
Abre sus consolas y dales "ctrl + c" para detenerlas.

## 2. Detener los contenedores de docker sin eliminar la info
```bash
docker compose down
```
Esto para los 4 contenedores pero conserva los volúmenes (pg_data, ora_data, cas_data, mongo_data) intactos. Mañana vuelves con docker compose up -d y todo tu progreso sigue ahí, sin necesitar init-db.sh de nuevo.

## 3. Cerrar el DataGrip nomrmal con la X ##

=============================================================================================================
=============================================================================================================

## PARA ABRIR Y CONTINUAR ##

# 1. Levanta los contenedores (los volúmenes ya tienen tus datos)
```bash
docker compose up -d
```
# espera unos 30 segundos o 1 minuto para que Oracle este listo 

# 2. Abrir DataGrip y dale a refresar a cada BD, ya no estableces nueva conexion porque ya esta solo espera que abra bien.

# 3. Iniciar la API
```bash
cmd
cd backend
npm start
```
`http://localhost:4000`

# 4. Levantar la pagina web

```bash
cmd
cd frontend
npx serve .
```
`http://localhost:5500`