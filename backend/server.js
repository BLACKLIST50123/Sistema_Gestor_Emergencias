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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", modulos: ["postgres", "oracle", "cassandra", "mongodb"] });
});

const PORT = process.env.PORT || 4000;

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
