const jwt = require("jsonwebtoken");

function verificarToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.operador = payload; // { id_operador, usuario, rol }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * RBAC BÁSICO
 * -----------
 * Middleware "de fábrica": recibe la lista de roles permitidos para
 * una ruta y devuelve un middleware de Express que la valida.
 *
 * Uso: router.post("/recursos", requireRole("administrador"), ...)
 *
 * Los 2 roles del sistema (ver Operadores.rol en PostgreSQL):
 *   - operador       -> registra alertas, asigna recursos, sube evidencias,
 *                        y además tiene acceso de SOLO LECTURA al Panel
 *                        Supervisor y al Historial 360° (funciones que
 *                        antes tenía un rol "supervisor" aparte, ya
 *                        eliminado: ahora están incluidas en "operador").
 *   - administrador  -> todo lo del operador, más el CRUD completo
 *                        (crear/editar/eliminar) de usuarios, recursos,
 *                        instituciones, sedes y capacidad, y el botón
 *                        de eliminar en el Historial 360°.
 *
 * Debe usarse SIEMPRE después de verificarToken, porque depende de
 * req.operador.rol (que verificarToken saca del JWT).
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.operador || !rolesPermitidos.includes(req.operador.rol)) {
      return res.status(403).json({
        error: `Acción no permitida para el rol '${req.operador ? req.operador.rol : "desconocido"}'`
      });
    }
    next();
  };
}

module.exports = { verificarToken, requireRole };
