// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo es el "guardia de seguridad" del backend. Antes de
// que cualquier ruta (alertas, recursos, instituciones, evidencias)
// haga algo, pasa primero por aquí para comprobar dos cosas:
// 1) ¿La persona inició sesión? (tiene un token válido)
// 2) ¿Su rol tiene permiso para hacer justo esa acción?
// Si cualquiera de las dos falla, la petición se corta acá mismo y
// nunca llega a tocar ninguna base de datos.

const jwt = require("jsonwebtoken");

// ==============================
// VERIFICAR TOKEN (¿INICIÓ SESIÓN?)
// ==============================
// Revisa que la petición traiga el token que se entrega al hacer
// login (routes/auth.js) en el header "Authorization: Bearer ...".
// Si no viene, o si viene pero es inválido/vencido, corta la
// petición con un error 401. Si es válido, guarda los datos del
// operador (id, usuario, rol) en req.operador para que las
// siguientes funciones de la ruta ya sepan quién está pidiendo esto.
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
// ==============================
// REQUIREROLE (¿SU ROL PUEDE HACER ESTO?)
// ==============================
// Se usa como candado extra en cada ruta que lo necesite, pasándole
// qué roles están permitidos (por ejemplo, solo "administrador"
// puede borrar cosas). Si el rol del operador logueado no está en
// esa lista, corta con un error 403 ("no tienes permiso").
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
