// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este es el archivo que ARRANCA todo el backend. Cuando corres
// "npm start" en la carpeta backend/, es este archivo el que se
// ejecuta primero. Se encarga de: conectar las 4 bases de datos,
// registrar todas las rutas (los "/api/..." que usa el frontend) y
// finalmente dejar el servidor escuchando peticiones en un puerto
// (por defecto el 4000). Si algo de esto falla, el programa se
// detiene y avisa el error en la consola.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const { connectMongo } = require("./config/mongodb");
const { initOraclePool } = require("./config/oracle");

const authRoutes = require("./routes/auth");
const recursosRoutes = require("./routes/recursos");
const institucionesRoutes = require("./routes/instituciones");
const alertasRoutes = require("./routes/alertas");
const evidenciasRoutes = require("./routes/evidencias");

const app = express();
app.use(cors());
app.use(express.json());

// Carpeta pública donde multer guarda las evidencias (fotos/videos).
// MongoDB solo guarda la ruta "/uploads/archivo.jpg"; el archivo real
// vive aquí en disco, y este middleware lo sirve al frontend.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api", recursosRoutes);        // /api/operadores, /api/recursos
app.use("/api", institucionesRoutes);   // /api/instituciones, /api/sedes
app.use("/api", alertasRoutes);         // /api/alertas
app.use("/api", evidenciasRoutes);      // /api/evidencias

// ==============================
// GET /API/HEALTH (COMPROBAR QUE EL BACKEND ESTÁ VIVO)
// ==============================
// Una ruta simple sin lógica de negocio, solo para chequear rápido
// (desde el navegador o con curl) que el servidor está arriba y
// responde, sin tener que iniciar sesión ni nada más.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", modulos: ["postgres", "oracle", "cassandra", "mongodb"] });
});

const PORT = process.env.PORT || 4000;

// ==============================
// START (SECUENCIA DE ARRANQUE DEL SERVIDOR)
// ==============================
// Orden de arranque: primero se conecta a MongoDB (siempre), después
// a Oracle (solo si hay datos de conexión configurados en el .env,
// para no romper el arranque en máquinas donde Oracle todavía no
// está listo), y recién al final se abre el puerto para empezar a
// recibir peticiones del frontend. Si cualquier paso falla, se
// imprime el error y se cierra el proceso en vez de dejarlo a medias.
async function start() {
  try {
    await connectMongo();
    // Oracle solo se conecta si está configurado; si no, se omite para no romper el arranque
    if (process.env.ORACLE_CONNECT_STRING) {
      await initOraclePool();
    }
    app.listen(PORT, () => {
      console.log(`SGE backend corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Error al iniciar el servidor:", err);
    process.exit(1);
  }
}

start();
