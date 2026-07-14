const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pgPool = require("../config/postgres");

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { usuario, contrasena } = req.body;
  if (!usuario || !contrasena) {
    return res.status(400).json({ error: "usuario y contrasena son requeridos" });
  }

  try {
    const result = await pgPool.query(
      `SELECT id_operador, nombre, usuario, contrasena_hash, rol
       FROM Operadores WHERE usuario = $1 AND activo = TRUE`,
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const operador = result.rows[0];
    const passwordOk = await bcrypt.compare(contrasena, operador.contrasena_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id_operador: operador.id_operador, usuario: operador.usuario, rol: operador.rol },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Registrar auditoría de login (clave para tu profe: "quién hace cada acción")
    await pgPool.query(
      `INSERT INTO Auditoria_Acciones (id_operador, accion, detalle) VALUES ($1, 'LOGIN', 'Inicio de sesión exitoso')`,
      [operador.id_operador]
    );

    res.json({
      token,
      operador: { id: operador.id_operador, nombre: operador.nombre, usuario: operador.usuario, rol: operador.rol }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno al iniciar sesión" });
  }
});

module.exports = router;
