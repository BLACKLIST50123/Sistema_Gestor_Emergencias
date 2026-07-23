// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Antes, la tabla Auditoria_Acciones (PostgreSQL) solo se llenaba
// en el LOGIN (routes/auth.js). Este archivo junta en una sola
// función reutilizable el mismo INSERT que ya usaba el login, para
// poder llamarlo también desde el resto de rutas (Operadores,
// Recursos, Instituciones, Sedes, Alertas, Evidencias) cada vez que
// se crea, edita o elimina algo.
//
// Es "best effort": la auditoría es un plus, NUNCA debe tumbar la
// acción real del usuario. Por eso el INSERT va en su propio
// try/catch y, si falla, solo se avisa por consola (no se corta la
// respuesta al frontend).

const pgPool = require("../config/postgres");

/**
 * Guarda una fila en Auditoria_Acciones.
 * @param {number|null} id_operador - quién hizo la acción (req.operador.id_operador)
 * @param {string} accion - 'LOGIN', 'CREAR_OPERADOR', 'EDITAR_RECURSO', 'ELIMINAR_SEDE', etc.
 * @param {string} [entidad_afectada] - 'Operadores','Recursos','Instituciones','Sedes','Alertas','Evidencias'
 * @param {string|number} [id_entidad_afectada] - el id del registro afectado
 * @param {string} [detalle] - texto libre corto describiendo la acción
 */
async function registrarAuditoria(id_operador, accion, entidad_afectada, id_entidad_afectada, detalle) {
  try {
    await pgPool.query(
      `INSERT INTO Auditoria_Acciones (id_operador, accion, entidad_afectada, id_entidad_afectada, detalle)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id_operador || null,
        accion,
        entidad_afectada || null,
        id_entidad_afectada !== undefined && id_entidad_afectada !== null ? String(id_entidad_afectada) : null,
        detalle || null
      ]
    );
  } catch (err) {
    // No se relanza el error: la auditoría no debe romper la acción principal.
    console.warn("[auditService] No se pudo registrar la auditoría:", err.message);
  }
}

module.exports = { registrarAuditoria };
