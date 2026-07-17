## PARA CERRR DOCKER ##
## 1. Apagar docker y parar los contenedores sin eliminar la info
 
```bash
docker compose down
```
Esto para los 4 contenedores pero conserva los volúmenes (pg_data, ora_data, cas_data, mongo_data) intactos. Mañana vuelves con docker compose up -d y todo tu progreso sigue ahí, sin necesitar init-db.sh de nuevo.

## 2. Cerrar el DataGrip nomrmal con la X ##




## PARA ABRIR Y CONTINUAR ##
# 1. Levanta los contenedores (los volúmenes ya tienen tus datos)
```bash
docker compose up -d
```
# espera unos 30 segundos o 1 minuto para que Oracle este listo (docker logs sge_oracle -f)
# 2. Abrir DataGrip para y refresar

# 3. Iniciar la API
```bash
cd backend
npm start
```
`http://localhost:4000`

# 4. Levantar la pagina web

```bash
cd frontend
npx serve .
```
`http://localhost:5500`