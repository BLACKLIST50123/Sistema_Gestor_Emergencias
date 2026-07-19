# Cambios aplicados (v3)

Resumen de las 6 actualizaciones pedidas, con los archivos que tocó cada una.

## 1. Lógica de Despacho, Derivación por Cercanía (Haversine) y Capacidad

- **Nuevo:** `backend/services/geoService.js` — Fórmula de Haversine
  (`distanciaHaversineKm`), prioridad de recursos por tipo de emergencia
  (`ordenarRecursosPorPrioridad`) y orden de sedes por rama afín +
  cercanía (`ordenarSedesPorRamaYCercania`) + capacidad visible según
  tipo de institución (`capacidadVisible`). La distancia **nunca se
  guarda en la BD**: se calcula en memoria en cada request.
- **Nuevo endpoint:** `GET /api/recursos/despacho/:tipoEmergencia`
  (`backend/routes/recursos.js`) — recursos disponibles ordenados según
  la prioridad pedida (médica: ambulancia→bomberos→patrulla, etc.)
- **Nuevo endpoint:** `GET /api/sedes/derivacion?tipo=&lat=&lng=`
  (`backend/routes/instituciones.js`) — sedes activas con
  `distancia_km` (Haversine) y `capacidad` ({etiqueta, valor}),
  ordenadas por rama institucional afín + cercanía.
- `GET /api/sedes` ahora hace `JOIN` con `Instituciones` para incluir
  `nombre_institucion` y `tipo_institucion` en cada fila.
- **Frontend:** `mostrarDetalleDespacho()` en `frontend/app.js` ahora
  llama a ambos endpoints y pinta 2 listas ordenadas (con rango #1,
  #2, #3...), la sede muestra distancia en KM y la capacidad
  correspondiente (camas/calabozos/nada).

## 2. Mapa de Alertas en Tiempo Real y Leyenda

- `frontend/app.js`: nueva función `renderizarMarcadoresSedes()` pinta
  las Sedes con colores FIJOS (Hospital=blanco, Comisaría=azul,
  Bomberos=rojo), separados de los marcadores de Alertas (que ya
  tenían colores por tipo, ahora reasignados a una paleta
  completamente distinta a la de las Sedes: médica=ámbar,
  incendio=naranja, seguridad=violeta, accidente=turquesa).
- `frontend/index.html`: nuevo componente `.mapa-leyenda` al final del
  módulo de Alertas, con 2 grupos (Sedes / Alertas) y su significado.
- Estilos nuevos en `frontend/styles.css` (`.mapa-leyenda`,
  `.leyenda-*`).

## 3. Gestión Institucional: Validación y Tabla de Sedes

- `frontend/app.js`: `aplicarValidacionCapacidadSede()` habilita/
  deshabilita `sedeCamas`/`sedeCalabozos` según el tipo de la
  institución seleccionada (Hospital→camas, Comisaría→calabozos,
  Bomberos→ninguno). Se dispara al cambiar el `<select>` y al recargar
  instituciones.
- `frontend/index.html`: nueva tabla `#tablaRelacionInstitucional`
  (N° | Institución | Tipo | Dirección | Camas | Calabozos), poblada
  por `renderizarTablaRelacionInstitucional()`.

## 4. Reactividad — botones "Actualizar"

- Se evaluaron 3 opciones (botón manual, WebSockets/SSE, polling
  corto) y se implementó una combinación pragmática para este stack
  (Express + frontend estático sin build): **polling corto (9s)** de
  Alertas/Despacho mientras esa vista está activa y la pestaña es
  visible, **más** un botón "Actualizar" en cada módulo
  (Mapa, Despacho, Operadores, Recursos, Instituciones, Sedes,
  Evidencias, Historial) que dispara el refresco inmediato con
  feedback visual (ícono girando).
- `frontend/app.js`: sección "REACTIVIDAD" al final del archivo
  (`iniciarPolling`, `detenerPolling`, `conSpinner`, listeners de los
  8 botones `.btn-refresh`).
- No se agregaron dependencias nuevas al backend; si más adelante se
  quiere pasar a WebSockets reales, `socket.io` es el candidato natural
  (emitir un evento en cada `POST/PUT /alertas`).

## 5. Estandarización del Campo ACTIVO a Booleanos

- PostgreSQL, Cassandra y MongoDB **ya** usaban `BOOLEAN` nativo desde
  el inicio del proyecto. El único motor pendiente era **Oracle**
  (`NUMBER(1)` con 1/0), porque Oracle no soportó `BOOLEAN` en columnas
  de tabla SQL hasta la versión **23ai**.
- `docker-compose.yml`: imagen de Oracle actualizada de
  `gvenzl/oracle-xe:21-slim` a `gvenzl/oracle-free:23-slim-faststart`
  (23ai, con soporte nativo de `BOOLEAN`). El PDB pasa a llamarse
  `FREEPDB1` (se actualizó en `backend/.env`, `.env.example` y
  `README.md`).
- `db/oracle/schema.sql`: `Instituciones.activo`,
  `Sedes_Capacidad.activo`, `repl_recursos.activo` y
  `repl_operadores.activo` pasan de `NUMBER(1) DEFAULT 1` a
  `BOOLEAN DEFAULT TRUE`.
- **Nuevo:** `db/oracle/migration_v3_boolean.sql` — migración para
  bases ya existentes (agrega columna BOOLEAN, copia datos
  traduciendo 1/0→TRUE/FALSE, elimina la columna vieja y renombra).
- Backend: todas las queries Oracle que comparaban `activo = 1` /
  `activo = 0` ahora usan `activo = TRUE` / `activo = FALSE`
  (`backend/routes/instituciones.js`, `backend/services/cascadeService.js`).
  `backend/services/syncService.js` ahora bindea booleanos JS nativos
  (`true`/`false`) en vez de `1`/`0` al escribir en `repl_recursos` y
  `repl_operadores`.

## 6. Modal de Geolocalización para el Registro de Sedes

- `frontend/index.html`: el formulario de alta de Sede ya no tiene
  inputs de texto para Latitud/Longitud. En su lugar hay un mensaje
  guía (`Presione "Agregar" para seleccionar la ubicación de la
  SEDE`), un botón "Agregar" y 2 inputs ocultos que se completan solo
  desde el modal.
- Nuevo modal `#modalGeo` (misma estética del resto de la app) con un
  mapa Leaflet embebido: un clic captura lat/lng, las muestra en
  campos de solo lectura y habilita "Confirmar ubicación", que guarda
  las coordenadas en el formulario y cierra el panel.
- `frontend/app.js`: `abrirModalGeo()`, `cerrarModalGeo()` y el
  listener de `#btnConfirmarGeo` implementan el flujo completo.
- `frontend/styles.css`: `.modal-geo`, `.geo-picker-*`.

## Notas para levantar la v3

Si ya tenías el proyecto corriendo con la imagen vieja de Oracle
(21-slim), necesitas recrear el contenedor porque 23ai es una versión
mayor distinta (no es un `ALTER` in-place de la imagen):

```bash
docker compose down
docker volume rm sge_ora_data   # o el nombre real del volumen, ver `docker volume ls`
docker compose up -d
```

Si prefieres conservar tus datos existentes en 21-slim, corre
`db/oracle/migration_v3_boolean.sql` únicamente después de migrar tú
mismo el motor a 23ai por otros medios (export/import, Data Pump, etc.)
— la migración en este repo asume que el servidor Oracle ya soporta
`BOOLEAN` nativo.
