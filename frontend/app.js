// =========================================================
// SGE — App frontend
// Conecta con el backend en API_BASE (ajusta si es necesario)
// =========================================================

const API_BASE = "http://localhost:4000/api";

let TOKEN = localStorage.getItem("sge_token") || null;
let OPERADOR = JSON.parse(localStorage.getItem("sge_operador") || "null");
let mapa, marcadorTemporal;
const marcadoresAlertas = {};
let recursosDisponibles = []; // caché simple para armar los <select> de despacho

// ---------- Helper de fetch autenticado ----------
async function api(path, options = {}) {
  const esFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      // Si el body es FormData (subida de archivos), NO seteamos
      // Content-Type: el navegador lo arma solo con el boundary correcto.
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
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

async function entrarAApp() {
  document.getElementById("pantallaLogin").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userName").textContent = OPERADOR.nombre;
  document.getElementById("userRole").textContent = OPERADOR.rol;
  document.getElementById("userAvatar").textContent = OPERADOR.nombre.split(" ").map(w => w[0]).slice(0,2).join("");
  aplicarPermisosPorRol(OPERADOR.rol);
  initMapa();
  await cargarRecursos();
  cargarAlertas();
  cargarOperadores();
  cargarInstituciones();
  cargarSedes();
  cargarEvidencias();
  cargarHistorial();
}

// -----------------------------------------------------------
// PUNTO 2: RBAC BÁSICO EN EL FRONTEND
// -----------------------------------------------------------
// Lee el rol guardado en localStorage (sge_operador.rol) y, con CSS/JS
// simple, oculta los botones de navegación y las secciones que ese
// rol no puede usar. Esto es solo una capa de USABILIDAD: la
// seguridad real la hace el backend con requireRole() en cada ruta.
function aplicarPermisosPorRol(rol) {
  // Nav: cada botón declara qué roles pueden verlo en data-roles="a,b"
  document.querySelectorAll(".nav-item[data-roles]").forEach(btn => {
    const rolesPermitidos = btn.dataset.roles.split(",");
    btn.classList.toggle("hidden", !rolesPermitidos.includes(rol));
  });

  // Vistas: mismo criterio, por si alguna quedara visible sin su botón de nav
  document.querySelectorAll(".view[data-roles]").forEach(seccion => {
    const rolesPermitidos = seccion.dataset.roles.split(",");
    if (!rolesPermitidos.includes(rol)) seccion.classList.remove("active");
  });

  // El Supervisor es de SOLO LECTURA: no ve formularios de escritura,
  // solo el Historial de emergencias cerradas.
  if (rol === "supervisor") {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const navHistorial = document.querySelector('.nav-item[data-view="historial"]');
    if (navHistorial) navHistorial.classList.add("active");
    document.getElementById("view-historial").classList.add("active");
    document.getElementById("viewTitle").textContent = "Historial 360°";
  }
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

    const puedeDespachar = OPERADOR && (OPERADOR.rol === "operador" || OPERADOR.rol === "administrador");

    alertas.forEach(a => {
      pintarAlertaEnMapa(a);
      const li = document.createElement("li");
      li.className = "alerta-item";

      // Opciones de recursos disponibles para el <select> de asignación
      const opcionesRecursos = recursosDisponibles
        .map(r => `<option value="${r.id_recurso}">${r.tipo} — ${r.placa}</option>`)
        .join("");

      li.innerHTML = `
        <div class="alerta-item-top">
          <span class="alerta-tipo">${a.tipo}</span>
          <span class="alerta-estado estado-${a.estado}">${a.estado.replace("_"," ")}</span>
        </div>
        <span class="alerta-desc">${a.descripcion}</span>
        <span class="alerta-meta">${a.direccion_referencial || ""}</span>
        <div class="alerta-item-acciones">
          ${puedeDespachar && a.estado === "pendiente" ? `
            <select id="selRecurso-${a.id_alerta}">
              <option value="">Recurso disponible…</option>
              ${opcionesRecursos}
            </select>
            <button class="btn-mini btn-mini-primary" onclick="asignarRecurso('${a.id_alerta}')">Asignar</button>
          ` : ""}
          ${puedeDespachar && a.estado === "en_atencion" ? `
            <button class="btn-mini btn-mini-close" onclick="cerrarCaso('${a.id_alerta}')">Cerrar caso</button>
          ` : ""}
          <button class="btn-mini" onclick="verHistorial('${a.id_alerta}')">Historial 360°</button>
        </div>
      `;
      lista.appendChild(li);
    });
  } catch (err) {
    console.warn("No se pudieron cargar alertas (¿backend/Cassandra activos?):", err.message);
  }
}

// -----------------------------------------------------------
// PUNTO 4: MATCH — asignar un recurso disponible a una alerta.
// El backend, en el mismo request, cambia el recurso a 'ocupado'
// ("En Emergencia") y pasa la alerta a 'en_atencion'.
// -----------------------------------------------------------
async function asignarRecurso(idAlerta) {
  const select = document.getElementById(`selRecurso-${idAlerta}`);
  const idRecurso = select ? select.value : "";
  if (!idRecurso) {
    alert("Selecciona un recurso disponible para asignar.");
    return;
  }
  try {
    await api(`/alertas/${idAlerta}/asignar-recurso`, {
      method: "PUT",
      body: JSON.stringify({ id_recurso: idRecurso })
    });
    cargarAlertas();
    cargarRecursos();
  } catch (err) {
    alert("Error al asignar el recurso: " + err.message);
  }
}

// -----------------------------------------------------------
// PUNTO 4: CIERRE — libera el recurso ('disponible') y habilita
// la carga de evidencias para ese caso.
// -----------------------------------------------------------
async function cerrarCaso(idAlerta) {
  if (!confirm("Esto cerrará la alerta y liberará el recurso asignado. ¿Continuar?")) return;
  try {
    await api(`/alertas/${idAlerta}/estado`, {
      method: "PUT",
      body: JSON.stringify({ estado: "cerrada" })
    });
    cargarAlertas();
    cargarRecursos();
    cargarEvidencias();
    alert("Caso cerrado. Ya puedes subir la evidencia desde 'Evidencias multimedia'.");
  } catch (err) {
    alert("Error al cerrar el caso: " + err.message);
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
    recursosDisponibles = recs.filter(r => r.estado === "disponible");

    const tbody = document.querySelector("#tablaRecursos tbody");
    tbody.innerHTML = "";
    recs.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id_recurso}</td><td>${r.tipo}</td><td>${r.placa}</td>
        <td><span class="estado-tag estado-${r.estado}">${r.estado === "ocupado" ? "En Emergencia" : r.estado}</span></td>
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
  const inputArchivo = document.getElementById("evArchivo");

  // FormData en vez de JSON: así viaja el archivo real (input type="file")
  // junto con los campos de texto, y multer lo recibe en el backend.
  const formData = new FormData();
  formData.append("id_alerta", document.getElementById("evAlerta").value);
  formData.append("descripcion", document.getElementById("evDescripcion").value);
  if (inputArchivo.files[0]) {
    formData.append("archivo", inputArchivo.files[0]);
  }

  try {
    await api("/evidencias", { method: "POST", body: formData });
    document.getElementById("formEvidencia").reset();
    cargarEvidencias();
  } catch (err) { alert(err.message); }
});

async function cargarEvidencias() {
  // Llenar el select con alertas cerradas (según el flujo: primero se
  // cierra el caso, luego se habilita subir su evidencia)
  try {
    const cerradas = await api("/alertas/estado/cerrada");
    const select = document.getElementById("evAlerta");
    select.innerHTML = cerradas.map(a =>
      `<option value="${a.id_alerta}">${a.tipo} — ${(a.descripcion || "").slice(0, 40)}</option>`
    ).join("");

    const cont = document.getElementById("listaEvidencias");
    if (cerradas.length === 0) {
      cont.innerHTML = `<p style="color:#576375;font-size:13px;grid-column:1/-1">
        Aún no hay casos cerrados. Cierra una alerta desde "Alertas en tiempo real" para poder subir su evidencia.</p>`;
      return;
    }

    // Traemos las evidencias de cada alerta cerrada (consulta simple,
    // suficiente para un proyecto académico)
    const todas = [];
    for (const a of cerradas) {
      const evs = await api(`/evidencias/alerta/${a.id_alerta}`);
      todas.push(...evs);
    }

    cont.innerHTML = todas.length === 0
      ? `<p style="color:#576375;font-size:13px;grid-column:1/-1">Ningún caso cerrado tiene evidencia todavía.</p>`
      : todas.map(ev => `
        <div class="evidencia-card">
          <div class="evidencia-id">#${ev.id_evidencia.slice(0, 8)}</div>
          <p class="evidencia-desc">${ev.descripcion}</p>
          <div class="evidencia-archivos">
            ${(ev.archivos_multimedia || []).map(a => `
              <a class="archivo-chip" href="${API_BASE.replace("/api","")}${a.ruta_archivo}" target="_blank">
                ${a.tipo === "video" ? "🎬" : "🖼️"} ${a.nombre_archivo}
              </a>
            `).join("")}
          </div>
        </div>
      `).join("");
  } catch (err) { console.warn(err.message); }
}

// ---------- MÓDULO: HISTORIAL 360° ----------
// Junta Cassandra (alerta) + Postgres/Oracle (recurso/institución) +
// Mongo (evidencias) en un solo modal, vía GET /api/historial/:id_alerta

async function cargarHistorial() {
  try {
    const cerradas = await api("/alertas/estado/cerrada");
    const lista = document.getElementById("listaHistorial");
    document.getElementById("countHistorial").textContent = cerradas.length;
    lista.innerHTML = cerradas.length === 0
      ? `<p style="color:#576375;font-size:13px">Todavía no hay emergencias cerradas.</p>`
      : cerradas.map(a => `
        <li class="alerta-item">
          <div class="alerta-item-top">
            <span class="alerta-tipo">${a.tipo}</span>
            <span class="alerta-estado estado-cerrada">cerrada</span>
          </div>
          <span class="alerta-desc">${a.descripcion}</span>
          <div class="alerta-item-acciones">
            <button class="btn-mini btn-mini-primary" onclick="verHistorial('${a.id_alerta}')">Ver Historial 360°</button>
          </div>
        </li>
      `).join("");
  } catch (err) { console.warn(err.message); }
}

async function verHistorial(idAlerta) {
  const modal = document.getElementById("modalHistorial");
  const contenido = document.getElementById("modalHistorialContenido");
  contenido.innerHTML = `<p style="color:var(--text-dim);font-size:13px">Cargando historial...</p>`;
  modal.classList.remove("hidden");

  try {
    const h = await api(`/historial/${idAlerta}`);
    const alerta = h.alerta || {};
    const recurso = h.recurso;
    const institucion = h.institucion;
    const sede = h.sede;
    const evidencias = h.evidencias || [];

    contenido.innerHTML = `
      <div class="modal-seccion">
        <h4>Alerta (Cassandra)</h4>
        <p><strong>${alerta.tipo || "-"}</strong> — ${alerta.descripcion || "-"}</p>
        <p style="color:var(--text-dim);margin-top:4px">${alerta.direccion_referencial || "Sin referencia"}</p>
      </div>

      <div class="modal-seccion">
        <h4>Recurso que atendió (PostgreSQL)</h4>
        ${recurso
          ? `<p>${recurso.tipo} — Placa ${recurso.placa}</p>`
          : `<p style="color:var(--text-faint)">No se asignó ningún recurso a esta alerta.</p>`}
      </div>

      <div class="modal-seccion">
        <h4>Institución / sede de derivación (Oracle)</h4>
        ${institucion
          ? `<p>${institucion.NOMBRE || institucion.nombre} ${sede ? `— ${sede.DIRECCION || sede.direccion}` : ""}</p>`
          : `<p style="color:var(--text-faint)">No hubo derivación a ninguna institución.</p>`}
      </div>

      <div class="modal-seccion">
        <h4>Evidencias multimedia (MongoDB)</h4>
        ${evidencias.length === 0
          ? `<p style="color:var(--text-faint)">Sin evidencias registradas todavía.</p>`
          : evidencias.map(ev => `
              <p>${ev.descripcion}</p>
              <div class="modal-media">
                ${(ev.archivos_multimedia || []).map(a => a.tipo === "video"
                  ? `<video src="${API_BASE.replace("/api","")}${a.ruta_archivo}" controls></video>`
                  : `<img src="${API_BASE.replace("/api","")}${a.ruta_archivo}" alt="${a.nombre_archivo}">`
                ).join("")}
              </div>
            `).join("")}
      </div>
    `;
  } catch (err) {
    contenido.innerHTML = `<p style="color:var(--accent)">Error al cargar el historial: ${err.message}</p>`;
  }
}

document.getElementById("btnCerrarModal").addEventListener("click", () => {
  document.getElementById("modalHistorial").classList.add("hidden");
});
document.getElementById("modalHistorial").addEventListener("click", (e) => {
  if (e.target.id === "modalHistorial") e.target.classList.add("hidden");
});
