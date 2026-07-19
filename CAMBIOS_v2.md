# Cambios aplicados (v2)

## 1. Roles: de 3 a 2
- **operador**: sus módulos operativos (Alertas, Despacho, Evidencias) + ahora también
  Panel Supervisor e Historial 360° en modo **solo lectura** (el rol "supervisor" desapareció,
  sus funciones pasaron a "operador").
- **administrador**: todo lo anterior + CRUD completo (crear/editar/eliminar) de Usuarios,
  Recursos, Instituciones, Sedes y capacidad, y botón "Eliminar" en el Historial.
- `db/postgres/schema.sql` ahora valida `rol IN ('operador','administrador')`.
- Si ya tenías datos cargados en Docker, corre los 3 scripts en `db/*/migration_v2.sql`
  (instrucciones dentro de cada archivo) — no necesitas re-crear los contenedores.

## 2. CRUD nuevo para el Administrador (con panel de edición pequeño, igual estética)
Cada tabla ahora tiene columna de acciones (editar ✎ / eliminar ✕). "Editar" abre un panel
modal chico reutilizable (`#modalEditar` en index.html) con los campos precargados y botón
Cancelar que no aplica ningún cambio.

| Módulo | Backend nuevo | Frontend |
|---|---|---|
| Usuarios (Operadores) | `PUT /api/operadores/:id` | Editar/Eliminar en "Usuarios y recursos" |
| Recursos | `PUT /api/recursos/:id` (edición completa, separado del `/estado` que usa Despacho) | Editar/Eliminar |
| Instituciones | `PUT /api/instituciones/:id` | Editar/Eliminar (ya existía) |
| Sedes y capacidad | `POST/PUT/DELETE /api/sedes/:id` | **Nuevo formulario de alta** + Editar/Eliminar (antes no existía forma de crear sedes desde el frontend) |
| Historial 360° | `DELETE /api/alertas/:id` (solo admin) | Botón "Eliminar" en la lista y en el modal del caso; el Operador solo ve, no tiene el botón |

## 3. Replicidad (tablas espejo)
Se agregaron 2 tablas espejo nuevas siguiendo el mismo patrón que ya usaban Instituciones/Recursos:

- **repl_operadores** (dueño real: PostgreSQL) → se replica a Oracle y Cassandra.
- **repl_sedes** (dueño real: Oracle) → se replica a PostgreSQL y Cassandra.

Toda acción CRUD (crear, editar, eliminar/desactivar) sobre Usuarios, Recursos, Instituciones
o Sedes dispara automáticamente `sincronizar*()` (`backend/services/syncService.js`) **después**
de aplicar el cambio en la base dueña, igual que ya hacía el sistema con Instituciones/Recursos.
También se sincroniza `repl_sedes` cuando se descuenta una cama/calabozo (`sp_derivar_paciente` /
`sp_derivar_detenido`), para que las réplicas no queden con el número de camas desactualizado.

La eliminación de una emergencia del Historial (`eliminarAlertaEnCascada` en
`cascadeService.js`) borra la fila en las 3 tablas de Cassandra y desactiva (soft delete) sus
evidencias en MongoDB — Alertas no tiene tablas repl_* en otros motores, así que no aplica ahí.

## 4. Frontend reconectado al backend real
- `index.html` ahora carga **`app.js`** (antes cargaba `app-local.js`, la versión mock con
  localStorage que usabas para probar la UI sola). `app-local.js` lo dejé intacto por si
  lo sigues usando para pruebas rápidas sin backend — solo tendrías que volver a poner
  `<script src="app-local.js"></script>` en el index si quieres ese modo.
- `app.js` fue reescrito para calzar con el `index.html` actual (mapa, KPIs, despacho en
  split-screen, panel supervisor, historial con tabs) hablando con tu backend real en
  `http://localhost:4000/api` — antes estaba desactualizado respecto al HTML.
- Se agregó un helper `normalizarClaves()` porque Oracle devuelve las columnas en MAYÚSCULAS
  (`ID_INSTITUCION`, `NOMBRE`...) y el resto de la app usa minúsculas.

## Pendiente / fuera de alcance (avísame si lo quieres)
- El selector "Sede de Derivación" del panel de Despacho está en la UI pero el backend no
  tiene un endpoint que efectivamente guarde `id_sede_derivacion` en la alerta (esto ya venía
  así desde antes, no lo agregué ni lo quité). Si quieres que el despacho realmente derive a
  una sede (y descuente camas), lo puedo conectar.
