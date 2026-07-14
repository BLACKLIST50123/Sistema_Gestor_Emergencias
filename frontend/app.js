// =========================================================
// SGE — App frontend
// Conecta con el backend en API_BASE (ajusta si es necesario)
// =========================================================

const API_BASE = "http://localhost:4000/api";

let TOKEN = localStorage.getItem("sge_token") || null;
let OPERADOR = JSON.parse(localStorage.getItem("sge_operador") || "null");
let mapa, marcadorTemporal;
const marcadoresAlertas = {};

// ---------- Helper de fetch autenticado ----------
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Error en la solicitud");
  }
  return res.json();
}

// ---------- LOGIN ----------
document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("loginUsuario").value.trim();
  const contrasena = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    const data = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, contrasena })
    }).then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.error); });
      return r.json();
    });

    TOKEN = data.token;
    OPERADOR = data.operador;
    localStorage.setItem("sge_token", TOKEN);
    localStorage.setItem("sge_operador", JSON.stringify(OPERADOR));
    entrarAApp();
  } catch (err) {
    errorEl.textContent = err.message.includes("fetch")
      ? "No se pudo conectar al backend (¿está corriendo en localhost:4000?)"
      : err.message;
  }
});

document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("sge_token");
  localStorage.removeItem("sge_operador");
  TOKEN = null;
  OPERADOR = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("pantallaLogin").classList.remove("hidden");
});

function entrarAApp() {
  document.getElementById("pantallaLogin").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userName").textContent = OPERADOR.nombre;
  document.getElementById("userRole").textContent = OPERADOR.rol;
  document.getElementById("userAvatar").textContent = OPERADOR.nombre.split(" ").map(w => w[0]).slice(0,2).join("");
  initMapa();
  cargarAlertas();
  cargarOperadores();
  cargarRecursos();
  cargarInstituciones();
  cargarSedes();
  cargarEvidencias();
}

if (TOKEN && OPERADOR) entrarAApp();

// ---------- NAVEGACIÓN ----------
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.getElementById(`view-${view}`).classList.add("active");
    document.getElementById("viewTitle").textContent = btn.querySelector("span").textContent;
    if (view === "alertas" && mapa) setTimeout(() => mapa.invalidateSize(), 50);
  });
});

// ---------- MÓDULO: ALERTAS + MAPA (Cassandra) ----------

function initMapa() {
  mapa = L.map("mapaAlertas", { zoomControl: true }).setView([-9.5277, -77.5285], 14); // Huaraz, Ancash

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }).addTo(mapa);

  // Clic en el mapa = capturar coordenadas para la nueva alerta
  mapa.on("click", (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById("alertaLat").value = lat.toFixed(6);
    document.getElementById("alertaLng").value = lng.toFixed(6);

    if (marcadorTemporal) mapa.removeLayer(marcadorTemporal);
    marcadorTemporal = L.circleMarker([lat, lng], {
      radius: 9, color: "#FF5A3C", fillColor: "#FF5A3C", fillOpacity: 0.5, weight: 2
    }).addTo(mapa).bindPopup("Ubicación seleccionada").openPopup();
  });
}

const iconoPorTipo = {
  medica: "#4C8DFF",
  seguridad: "#7C5CFF",
  incendio: "#FF5A3C",
  accidente: "#FF8A3D"
};

function pintarAlertaEnMapa(alerta) {
  const color = iconoPorTipo[alerta.tipo] || "#FF5A3C";
  const marker = L.circleMarker([alerta.latitud, alerta.longitud], {
    radius: 8, color, fillColor: color, fillOpacity: 0.65, weight: 2
  }).addTo(mapa);

  marker.bindPopup(`
    <strong style="text-transform:capitalize">${alerta.tipo}</strong><br>
    ${alerta.descripcion}<br>
    <span style="color:#8493A6;font-size:11px">${alerta.direccion_referencial || "Sin referencia"}</span><br>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#576375">
      ${Number(alerta.latitud).toFixed(5)}, ${Number(alerta.longitud).toFixed(5)}
    </span>
  `);

  marcadoresAlertas[alerta.id_alerta] = marker;
}

document.getElementById("formAlerta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lat = document.getElementById("alertaLat").value;
  const lng = document.getElementById("alertaLng").value;
  if (!lat || !lng) {
    alert("Haz clic en el mapa para marcar la ubicación de la alerta.");
    return;
  }

  try {
    const nueva = await api("/alertas", {
      method: "POST",
      body: JSON.stringify({
        tipo: document.getElementById("alertaTipo").value,
        descripcion: document.getElementById("alertaDescripcion").value,
        latitud: parseFloat(lat),
        longitud: parseFloat(lng),
        direccion_referencial: document.getElementById("alertaDireccion").value
      })
    });
    pintarAlertaEnMapa(nueva);
    document.getElementById("formAlerta").reset();
    if (marcadorTemporal) { mapa.removeLayer(marcadorTemporal); marcadorTemporal = null; }
    cargarAlertas();
  } catch (err) {
    alert("Error al registrar la alerta: " + err.message);
  }
});

async function cargarAlertas() {
  try {
    const alertas = await api("/alertas");
    const lista = document.getElementById("listaAlertas");
    lista.innerHTML = "";
    document.getElementById("countAlertas").textContent = alertas.length;

    alertas.forEach(a => {
      pintarAlertaEnMapa(a);
      const li = document.createElement("li");
      li.className = "alerta-item";
      li.innerHTML = `
        <div class="alerta-item-top">
          <span class="alerta-tipo">${a.tipo}</span>
          <span class="alerta-estado estado-${a.estado}">${a.estado.replace("_"," ")}</span>
        </div>
        <span class="alerta-desc">${a.descripcion}</span>
        <span class="alerta-meta">${a.direccion_referencial || ""}</span>
      `;
      lista.appendChild(li);
    });
  } catch (err) {
    console.warn("No se pudieron cargar alertas (¿backend/Cassandra activos?):", err.message);
  }
}

// ---------- MÓDULO: USUARIOS Y RECURSOS (PostgreSQL) ----------

document.getElementById("formOperador").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/operadores", {
      method: "POST",
      body: JSON.stringify({
        nombre: document.getElementById("opNombre").value,
        usuario: document.getElementById("opUsuario").value,
        contrasena: document.getElementById("opPassword").value,
        rol: document.getElementById("opRol").value
      })
    });
    document.getElementById("formOperador").reset();
    cargarOperadores();
  } catch (err) { alert(err.message); }
});

async function cargarOperadores() {
  try {
    const ops = await api("/operadores");
    const tbody = document.querySelector("#tablaOperadores tbody");
    tbody.innerHTML = "";
    ops.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.id_operador}</td><td>${o.nombre}</td><td>${o.usuario}</td><td>${o.rol}</td>
        <td><button class="btn-icon" onclick="eliminarOperador(${o.id_operador})">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

async function eliminarOperador(id) {
  if (!confirm("Esto desactivará al operador en las 4 bases de datos (cascada). ¿Continuar?")) return;
  try {
    const r = await api(`/operadores/${id}`, { method: "DELETE" });
    console.log("Cascada ejecutada:", r.detalle);
    cargarOperadores();
  } catch (err) { alert(err.message); }
}

document.getElementById("formRecurso").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/recursos", {
      method: "POST",
      body: JSON.stringify({
        tipo: document.getElementById("recTipo").value,
        placa: document.getElementById("recPlaca").value
      })
    });
    document.getElementById("formRecurso").reset();
    cargarRecursos();
  } catch (err) { alert(err.message); }
});

async function cargarRecursos() {
  try {
    const recs = await api("/recursos");
    const tbody = document.querySelector("#tablaRecursos tbody");
    tbody.innerHTML = "";
    recs.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id_recurso}</td><td>${r.tipo}</td><td>${r.placa}</td>
        <td><span class="estado-tag estado-${r.estado}">${r.estado}</span></td>
        <td><button class="btn-icon" onclick="eliminarRecurso(${r.id_recurso})">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

async function eliminarRecurso(id) {
  try { await api(`/recursos/${id}`, { method: "DELETE" }); cargarRecursos(); }
  catch (err) { alert(err.message); }
}

// ---------- MÓDULO: GESTIÓN INSTITUCIONAL (Oracle) ----------

document.getElementById("formInstitucion").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/instituciones", {
      method: "POST",
      body: JSON.stringify({
        nombre: document.getElementById("instNombre").value,
        tipo: document.getElementById("instTipo").value
      })
    });
    document.getElementById("formInstitucion").reset();
    cargarInstituciones();
  } catch (err) { alert(err.message); }
});

async function cargarInstituciones() {
  try {
    const insts = await api("/instituciones");
    const tbody = document.querySelector("#tablaInstituciones tbody");
    tbody.innerHTML = "";
    insts.forEach(i => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i.ID_INSTITUCION ?? i.id_institucion}</td>
        <td>${i.NOMBRE ?? i.nombre}</td>
        <td>${i.TIPO ?? i.tipo}</td>
        <td><button class="btn-icon" onclick="eliminarInstitucion(${i.ID_INSTITUCION ?? i.id_institucion})">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

async function eliminarInstitucion(id) {
  if (!confirm("Esto desactivará la institución y sus sedes en cascada. ¿Continuar?")) return;
  try { await api(`/instituciones/${id}`, { method: "DELETE" }); cargarInstituciones(); cargarSedes(); }
  catch (err) { alert(err.message); }
}

async function cargarSedes() {
  try {
    const sedes = await api("/sedes");
    const tbody = document.querySelector("#tablaSedes tbody");
    tbody.innerHTML = "";
    sedes.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.ID_SEDE ?? s.id_sede}</td>
        <td>${s.DIRECCION ?? s.direccion}</td>
        <td>${s.CAMAS_DISPONIBLES ?? s.camas_disponibles}</td>
        <td>${s.CALABOZOS_DISPONIBLES ?? s.calabozos_disponibles}</td>
        <td></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

// ---------- MÓDULO: EVIDENCIAS MULTIMEDIA (MongoDB) ----------

document.getElementById("formEvidencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const archivosTexto = document.getElementById("evArchivos").value;
  const archivos = archivosTexto.split(",").map(s => s.trim()).filter(Boolean).map(nombre => ({
    tipo: nombre.match(/\.(mp4|mov|avi)$/i) ? "video" : "foto",
    url: `https://storage.sge.local/evidencias/${nombre}`,
    nombre_archivo: nombre
  }));

  try {
    await api("/evidencias", {
      method: "POST",
      body: JSON.stringify({
        id_alerta: document.getElementById("evAlerta").value,
        descripcion: document.getElementById("evDescripcion").value,
        archivos_multimedia: archivos
      })
    });
    document.getElementById("formEvidencia").reset();
    cargarEvidencias();
  } catch (err) { alert(err.message); }
});

async function cargarEvidencias() {
  // Llenar el select con alertas disponibles
  try {
    const alertas = await api("/alertas");
    const select = document.getElementById("evAlerta");
    select.innerHTML = alertas.map(a =>
      `<option value="${a.id_alerta}">${a.tipo} — ${a.descripcion.slice(0, 40)}...</option>`
    ).join("");
  } catch (err) { console.warn(err.message); }

  // Nota: no hay endpoint de "listar todas", por diseño (Mongo se consulta por alerta).
  // Aquí mostramos un placeholder informativo.
  const cont = document.getElementById("listaEvidencias");
  cont.innerHTML = `<p style="color:#576375;font-size:13px;grid-column:1/-1">
    Selecciona una alerta arriba y guarda una evidencia para verla aquí, o consulta
    <code style="font-family:'IBM Plex Mono',monospace;background:#0B0F14;padding:2px 6px;border-radius:4px">
    GET /api/evidencias/alerta/:idAlerta</code>
  </p>`;
}
