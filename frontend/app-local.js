// =========================================================
// SGE — APP LOCAL (MOCK DE BACKEND Y BASES DE DATOS)
// Úsalo para diseñar y probar flujos sin levantar Docker
// =========================================================

// --- 1. SIMULACIÓN DE BASES DE DATOS (LocalStorage) ---
function initMockDB() {
  const seed = {
    operadores: [
      { id_operador: 1, nombre: "Admin Local", usuario: "admin", rol: "administrador" },
      { id_operador: 2, nombre: "Operador Prueba", usuario: "operador", rol: "operador" }
    ],
    recursos: [
      { id_recurso: 1, tipo: "Ambulancia", placa: "AMB-001", estado: "disponible" },
      { id_recurso: 2, tipo: "Patrulla", placa: "POL-123", estado: "disponible" },
      { id_recurso: 3, tipo: "Bomberos", placa: "BOM-999", estado: "ocupado" }
    ],
    instituciones: [
      { id_institucion: 1, nombre: "Hospital Regional", tipo: "Hospital" },
      { id_institucion: 2, nombre: "Comisaría Central", tipo: "Comisaria" }
    ],
    sedes: [
      { id_sede: 1, id_institucion: 1, direccion: "Av. Luzuriaga 123", camas_disponibles: 15, calabozos_disponibles: 0 },
      { id_sede: 2, id_institucion: 2, direccion: "Plaza de Armas S/N", camas_disponibles: 0, calabozos_disponibles: 5 }
    ],
    alertas: [],
    evidencias: []
  };

  if (!localStorage.getItem("sge_mock_db")) {
    localStorage.setItem("sge_mock_db", JSON.stringify(seed));
  }
  return JSON.parse(localStorage.getItem("sge_mock_db"));
}

let MOCK_DB = initMockDB();
const saveDB = () => localStorage.setItem("sge_mock_db", JSON.stringify(MOCK_DB));
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- 1B. UTILIDADES DE UI: NOTIFICACIONES Y CONFIRMACIONES ---
// Reemplazan alert()/confirm() nativos por componentes propios del tema.

function notificar(mensaje, tipo = "info") {
  const cont = document.getElementById("toastContainer");
  if (!cont) return;
  
  // Diccionario de SVGs elegantes (grosor 1.6 para mantener la estética de tu app)
  const iconos = { 
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`, 
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><path d="M8 12l3 3 5-5"></path></svg>`, 
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`, 
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px; flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>` 
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  // Usamos el SVG del diccionario, y si no existe el tipo, cae por defecto al de 'info'
  toast.innerHTML = `
    <span class="toast-icon" style="display: flex; align-items: center;">${iconos[tipo] || iconos.info}</span>
    <span class="toast-msg"></span>
    <button class="toast-close" aria-label="Cerrar notificación" style="background:transparent; border:none; color:inherit; cursor:pointer; font-size:14px; opacity: 0.7;">✕</button>
  `;
  
  toast.querySelector(".toast-msg").textContent = mensaje; // textContent evita inyección de HTML
  cont.appendChild(toast);
  
  const quitar = () => toast.remove();
  toast.querySelector(".toast-close").addEventListener("click", quitar);
  setTimeout(quitar, 4500);
}

function confirmar(mensaje) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modalConfirm");
    document.getElementById("modalConfirmMensaje").textContent = mensaje;
    modal.classList.remove("hidden");

    const btnSi = document.getElementById("btnConfirmAceptar");
    const btnNo = document.getElementById("btnConfirmCancelar");

    const limpiar = (resultado) => {
      modal.classList.add("hidden");
      btnSi.removeEventListener("click", onSi);
      btnNo.removeEventListener("click", onNo);
      resolve(resultado);
    };
    const onSi = () => limpiar(true);
    const onNo = () => limpiar(false);
    btnSi.addEventListener("click", onSi);
    btnNo.addEventListener("click", onNo);
  });
}

// --- 2. INTERCEPTOR DE API ---
async function api(path, options = {}) {
  console.log(`[MOCK API] ${options.method || 'GET'} ${path}`);
  const body = options.body && !(options.body instanceof FormData) ? JSON.parse(options.body) : {};

  // Auth
  if (path === "/auth/login") {
    const user = MOCK_DB.operadores.find(o => o.usuario === body.usuario) || MOCK_DB.operadores[0];
    return { token: "token-local-123", operador: user };
  }

  // Alertas
  if (path === "/alertas" && (!options.method || options.method === 'GET')) return MOCK_DB.alertas;
  if (path === "/alertas/estado/cerrada") return MOCK_DB.alertas.filter(a => a.estado === "cerrada");
  if (path === "/alertas" && options.method === 'POST') {
    const nueva = { ...body, id_alerta: generateId(), estado: "pendiente", fecha_creacion: new Date() };
    MOCK_DB.alertas.push(nueva); saveDB(); return nueva;
  }
  if (path.match(/\/alertas\/(.+)\/asignar-recurso/) && options.method === 'PUT') {
    const id = path.split("/")[2];
    const alerta = MOCK_DB.alertas.find(a => a.id_alerta === id);
    const recurso = MOCK_DB.recursos.find(r => r.id_recurso == body.id_recurso);
    if (alerta && recurso) {
      alerta.estado = "en_atencion"; alerta.id_recurso_asignado = recurso.id_recurso;
      recurso.estado = "ocupado";
      saveDB();
    }
    return { mensaje: "Recurso asignado en Mock" };
  }
  if (path.match(/\/alertas\/(.+)\/estado/) && options.method === 'PUT') {
    const id = path.split("/")[2];
    const alerta = MOCK_DB.alertas.find(a => a.id_alerta === id);
    if (alerta) {
      alerta.estado = body.estado;
      if (body.estado === "cerrada" && alerta.id_recurso_asignado) {
        const rec = MOCK_DB.recursos.find(r => r.id_recurso == alerta.id_recurso_asignado);
        if (rec) rec.estado = "disponible";
      }
      saveDB();
    }
    return { mensaje: "Estado actualizado" };
  }

  // Recursos y Usuarios
  if (path === "/recursos" && (!options.method || options.method === 'GET')) return MOCK_DB.recursos;
  if (path === "/recursos" && options.method === 'POST') {
    MOCK_DB.recursos.push({ ...body, id_recurso: Date.now(), estado: "disponible" }); saveDB(); return {};
  }
  if (path.match(/\/recursos\/(.+)/) && options.method === 'DELETE') {
    MOCK_DB.recursos = MOCK_DB.recursos.filter(r => r.id_recurso != path.split("/")[2]); saveDB(); return {};
  }
  if (path === "/operadores" && (!options.method || options.method === 'GET')) return MOCK_DB.operadores;
  
  // Instituciones
  if (path === "/instituciones") return MOCK_DB.instituciones;
  if (path === "/sedes") return MOCK_DB.sedes;

  // Evidencias e Historial
  if (path.startsWith("/evidencias/alerta/")) {
    const id = path.split("/")[3];
    return MOCK_DB.evidencias.filter(e => e.id_alerta === id);
  }
  if (path.startsWith("/historial/")) {
    const id = path.split("/")[2];
    const dbActualizada = JSON.parse(localStorage.getItem("sge_mock_db"));
    const alerta = dbActualizada.alertas.find(a => a.id_alerta === id);
    const recurso = alerta ? dbActualizada.recursos.find(r => r.id_recurso == alerta.id_recurso_asignado) : null;
    const evidencias = dbActualizada.evidencias.filter(e => e.id_alerta === id);
    return { alerta, recurso, sede: null, institucion: null, evidencias };
  }

  return { mensaje: "OK Mock" };
}

// --- 3. ESTADO GLOBAL DE LA APP ---
let TOKEN = localStorage.getItem("sge_token") || null;
let OPERADOR = JSON.parse(localStorage.getItem("sge_operador") || "null");
let mapa, marcadorTemporal;
const marcadoresAlertas = {};
let recursosDisponibles = [];
let alertasPendientesGlobal = [];

// --- 4. LOGIN Y NAVEGACIÓN ---
document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("loginUsuario").value.trim();
  const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ usuario }) });
  TOKEN = data.token; OPERADOR = data.operador;
  localStorage.setItem("sge_token", TOKEN); localStorage.setItem("sge_operador", JSON.stringify(OPERADOR));
  entrarAApp();
});

document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("sge_token"); localStorage.removeItem("sge_operador");
  TOKEN = null; OPERADOR = null;
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
  if (!mapa) initMapa();
  await cargarRecursos();
  cargarAlertas(); cargarOperadores(); cargarInstituciones(); cargarSedes(); cargarEvidencias(); cargarHistorial(); cargarPanelSupervisor();
}

function aplicarPermisosPorRol(rol) {
  document.querySelectorAll(".nav-item[data-roles]").forEach(btn => {
    btn.classList.toggle("hidden", !btn.dataset.roles.split(",").includes(rol));
  });
  document.querySelectorAll(".view[data-roles]").forEach(seccion => {
    if (!seccion.dataset.roles.split(",").includes(rol)) seccion.classList.remove("active");
  });

  // Si la vista marcada como activa por defecto en el HTML no está permitida
  // para este rol (p. ej. "supervisor" no tiene acceso a "Alertas"), activa
  // automáticamente la primera opción de menú que sí pueda ver.
  const navActivoVisible = document.querySelector(".nav-item.active:not(.hidden)");
  if (!navActivoVisible) {
    const primerNavVisible = document.querySelector(".nav-item:not(.hidden)");
    if (primerNavVisible) primerNavVisible.click();
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
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.classList.add("active");
        document.getElementById("viewTitle").textContent = btn.querySelector("span").textContent;
        if (view === "alertas" && mapa) setTimeout(() => mapa.invalidateSize(), 50);
        if (view === "supervisor") cargarPanelSupervisor();
    }
    cerrarSidebarMobile();
  });
});

// ---------- MENÚ MÓVIL (sidebar deslizante) ----------
function abrirSidebarMobile() {
  document.querySelector(".sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.remove("hidden");
}
function cerrarSidebarMobile() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.add("hidden");
}
document.getElementById("btnMenuMobile").addEventListener("click", abrirSidebarMobile);
document.getElementById("sidebarOverlay").addEventListener("click", cerrarSidebarMobile);

// --- 5. MAPA Y CREACIÓN DE ALERTAS ---
function initMapa() {
  mapa = L.map("mapaAlertas", { zoomControl: true }).setView([-9.5277, -77.5285], 14);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(mapa);
  mapa.on("click", (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById("alertaLat").value = lat.toFixed(6);
    document.getElementById("alertaLng").value = lng.toFixed(6);
    if (marcadorTemporal) mapa.removeLayer(marcadorTemporal);
    marcadorTemporal = L.circleMarker([lat, lng], { radius: 9, color: "#FF5A3C", fillColor: "#FF5A3C", fillOpacity: 0.5, weight: 2 }).addTo(mapa).bindPopup("Ubicación seleccionada").openPopup();
  });
}

document.getElementById("formAlerta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lat = document.getElementById("alertaLat").value;
  const lng = document.getElementById("alertaLng").value;
  if (!lat || !lng) return notificar("Haz clic en el mapa para marcar la ubicación antes de registrar.", "warning");
  
  await api("/alertas", {
    method: "POST",
    body: JSON.stringify({
      tipo: document.getElementById("alertaTipo").value,
      descripcion: document.getElementById("alertaDescripcion").value,
      latitud: parseFloat(lat), longitud: parseFloat(lng),
      direccion_referencial: document.getElementById("alertaDireccion").value
    })
  });
  document.getElementById("formAlerta").reset();
  if (marcadorTemporal) { mapa.removeLayer(marcadorTemporal); marcadorTemporal = null; }
  cargarAlertas();
});

// --- 6. CARGA DE ALERTAS Y KPIs ---
async function cargarAlertas() {
  const alertas = await api("/alertas");
  Object.values(marcadoresAlertas).forEach(m => mapa.removeLayer(m));

  document.getElementById("kpiTotal").textContent = alertas.length;
  document.getElementById("kpiPendientes").textContent = alertas.filter(a => a.estado === "pendiente").length;
  document.getElementById("kpiCerradas").textContent = alertas.filter(a => a.estado === "cerrada").length;

  const trendTotal = calcularTendencia(alertas, "fecha_creacion");
  const elTrendTotal = document.getElementById("kpiTotalTrend");
  if (elTrendTotal) elTrendTotal.innerHTML = renderTendenciaHTML(trendTotal, "nuevos hoy");

  const trendCerradas = calcularTendencia(alertas.filter(a => a.estado === "cerrada"), "fecha_cierre");
  const elTrendCerradas = document.getElementById("kpiCerradasTrend");
  if (elTrendCerradas) elTrendCerradas.innerHTML = renderTendenciaHTML(trendCerradas, "cerrados hoy");

  alertas.filter(a => a.estado !== "cerrada").forEach(a => {
    const color = { medica: "#4C8DFF", seguridad: "#7C5CFF", incendio: "#FF5A3C", accidente: "#FF8A3D" }[a.tipo] || "#FF5A3C";
    const marker = L.circleMarker([a.latitud, a.longitud], { radius: 8, color, fillColor: color, fillOpacity: 0.65, weight: 2 }).addTo(mapa);
    marcadoresAlertas[a.id_alerta] = marker;
  });

  renderizarColaDespacho(alertas);
}

// --- Utilidades de tendencia (hoy vs. ayer), usadas en KPIs y Panel Supervisor ---
function esDelDia(fechaIso, diasAtras) {
  if (!fechaIso) return false;
  const f = new Date(fechaIso);
  const ref = new Date();
  ref.setDate(ref.getDate() - diasAtras);
  return f.getFullYear() === ref.getFullYear() && f.getMonth() === ref.getMonth() && f.getDate() === ref.getDate();
}

function calcularTendencia(items, campoFecha) {
  const hoy = items.filter(x => esDelDia(x[campoFecha], 0)).length;
  const ayer = items.filter(x => esDelDia(x[campoFecha], 1)).length;
  let delta = 0;
  if (ayer > 0) delta = Math.round(((hoy - ayer) / ayer) * 100);
  else if (hoy > 0) delta = 100;
  return { hoy, ayer, delta };
}

function renderTendenciaHTML(t, etiqueta) {
  if (t.hoy === 0 && t.ayer === 0) {
    return `<span class="kpi-trend-neutral">Sin actividad hoy</span>`;
  }
  const subiendo = t.delta >= 0;
  const icono = subiendo ? "▲" : "▼";
  const clase = subiendo ? "kpi-trend-up" : "kpi-trend-down";
  return `<span class="${clase}">${icono} ${t.hoy} ${etiqueta}</span> <span class="kpi-trend-neutral">(${t.delta >= 0 ? "+" : ""}${t.delta}% vs ayer)</span>`;
}

// --- 7. MÓDULO DE DESPACHO (SPLIT SCREEN) ---
function renderizarColaDespacho(alertas) {
  const pendientes = alertas.filter(a => a.estado === "pendiente");
  const enAtencion = alertas.filter(a => a.estado === "en_atencion");
  alertasPendientesGlobal = pendientes;
  
  const lista = document.getElementById("listaDespachoPendientes");
  lista.innerHTML = "";

  pendientes.forEach(a => {
    const li = document.createElement("li");
    li.className = "alerta-item"; li.style.cursor = "pointer"; li.style.transition = "border-color 0.2s";
    li.onmouseover = () => li.style.borderColor = "var(--accent)";
    li.onmouseout = () => li.style.borderColor = "var(--border-soft)";
    li.onclick = () => mostrarDetalleDespacho(a.id_alerta);
    li.innerHTML = `
      <div class="alerta-item-top"><span class="alerta-tipo">${a.tipo}</span><span class="alerta-estado estado-pendiente">Pendiente</span></div>
      <span class="alerta-desc" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.descripcion}</span>
    `;
    lista.appendChild(li);
  });

  enAtencion.forEach(a => {
    const li = document.createElement("li");
    li.className = "alerta-item";
    li.innerHTML = `
      <div class="alerta-item-top"><span class="alerta-tipo">${a.tipo}</span><span class="alerta-estado estado-en_atencion">En Atención</span></div>
      <span class="alerta-desc" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.descripcion}</span>
      <div style="margin-top: 10px;">
        <button class="btn-mini btn-mini-close" onclick="cerrarCaso('${a.id_alerta}')">Cerrar caso</button>
      </div>
    `;
    lista.appendChild(li);
  });
}

function mostrarDetalleDespacho(idAlerta) {
  const alerta = alertasPendientesGlobal.find(a => a.id_alerta === idAlerta);
  if (!alerta) return;
  const panel = document.getElementById("panelDetalleDespacho");
  panel.classList.remove("empty");

  const opcionesRecursos = recursosDisponibles.map(r => `<option value="${r.id_recurso}">${r.tipo} — ${r.placa}</option>`).join("");
  const opcionesSedes = MOCK_DB.sedes.map(s => {
    const inst = MOCK_DB.instituciones.find(i => i.id_institucion === s.id_institucion);
    return `<option value="${s.id_sede}">${inst.nombre} (${s.camas_disponibles} camas libres)</option>`;
  }).join("");

  panel.innerHTML = `
    <h3 style="margin-bottom: 5px; text-transform: capitalize; color: var(--accent); font-size: 20px;">Alerta: ${alerta.tipo}</h3>
    <p style="color: var(--text-dim); margin-bottom: 20px;">ID: ${alerta.id_alerta}</p>
    <div style="background: var(--bg); padding: 15px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px;">
      <p><strong>Descripción:</strong> ${alerta.descripcion}</p>
      <p style="margin-top: 10px;"><strong>Ubicación:</strong> ${alerta.direccion_referencial || "Sin referencia"}</p>
    </div>
    <h4 style="margin-bottom: 10px; border-bottom: 1px solid var(--border-soft); padding-bottom: 5px;">Asignación Logística</h4>
    <div style="display: flex; flex-direction: column; gap: 15px;">
      <label class="field"><span>1. Asignar Recurso (PostgreSQL)</span>
        <select id="despachoRecurso"><option value="">Seleccione recurso disponible...</option>${opcionesRecursos}</select>
      </label>
      <label class="field"><span>2. Sede de Derivación (Oracle)</span>
        <select id="despachoSede"><option value="">Seleccione sede de destino...</option>${opcionesSedes}</select>
      </label>
      <button class="btn-primary" style="margin-top: 10px; padding: 15px; font-size: 16px;" onclick="ejecutarDespacho('${alerta.id_alerta}')">Despachar Unidades</button>
    </div>
  `;
}

async function ejecutarDespacho(idAlerta) {
  const idRecurso = document.getElementById("despachoRecurso").value;
  if (!idRecurso) return notificar("Selecciona un recurso antes de despachar.", "warning");
  await api(`/alertas/${idAlerta}/asignar-recurso`, { method: "PUT", body: JSON.stringify({ id_recurso: idRecurso }) });
  document.getElementById("panelDetalleDespacho").innerHTML = `<p>Unidad despachada. Selecciona otra emergencia.</p>`;
  cargarAlertas(); await cargarRecursos();
}

async function cerrarCaso(idAlerta) {
  const ok = await confirmar("¿Cerrar caso y pasar a registro de evidencias?");
  if (!ok) return;
  const alerta = MOCK_DB.alertas.find(a => a.id_alerta === idAlerta);
  if (alerta) {
    alerta.estado = "pendiente_evidencia"; 
    const rec = MOCK_DB.recursos.find(r => r.id_recurso == alerta.id_recurso_asignado);
    if (rec) rec.estado = "disponible";
    saveDB();
  }
  cargarAlertas(); await cargarRecursos(); cargarEvidencias(); cargarHistorial(); 
  notificar("Caso enviado al módulo de Evidencias.", "success");
}

// --- 8. DEMÁS MÓDULOS (CRUD SIMULADOS) ---
async function cargarRecursos() {
  const recs = await api("/recursos");
  recursosDisponibles = recs.filter(r => r.estado === "disponible");
  const tbody = document.querySelector("#tablaRecursos tbody"); tbody.innerHTML = "";
  recs.forEach(r => tbody.innerHTML += `<tr><td>${r.id_recurso}</td><td>${r.tipo}</td><td>${r.placa}</td><td><span class="estado-tag estado-${r.estado}">${r.estado}</span></td><td><button class="btn-icon" aria-label="Eliminar recurso ${r.placa}" onclick="eliminarRecurso(${r.id_recurso})">✕</button></td></tr>`);
}
async function eliminarRecurso(id) { await api(`/recursos/${id}`, { method: "DELETE" }); cargarRecursos(); }

async function cargarOperadores() {
  const ops = await api("/operadores");
  const tbody = document.querySelector("#tablaOperadores tbody"); tbody.innerHTML = "";
  ops.forEach(o => tbody.innerHTML += `<tr><td>${o.id_operador}</td><td>${o.nombre}</td><td>${o.usuario}</td><td>${o.rol}</td><td></td></tr>`);
}
async function cargarInstituciones() {
  const insts = await api("/instituciones");
  const tbody = document.querySelector("#tablaInstituciones tbody"); tbody.innerHTML = "";
  insts.forEach(i => tbody.innerHTML += `<tr><td>${i.id_institucion}</td><td>${i.nombre}</td><td>${i.tipo}</td><td></td></tr>`);
}
async function cargarSedes() {
  const sedes = await api("/sedes");
  const tbody = document.querySelector("#tablaSedes tbody"); tbody.innerHTML = "";
  sedes.forEach(s => tbody.innerHTML += `<tr><td>${s.id_sede}</td><td>${s.direccion}</td><td>${s.camas_disponibles}</td><td>${s.calabozos_disponibles}</td><td></td></tr>`);
}

// ==========================================
// MÓDULO: EVIDENCIAS MULTIMEDIA Y PREVISUALIZACIÓN
// ==========================================
let archivosSeleccionados = [];

// Límites conservadores para esta demo local (los archivos se guardan como
// base64 en localStorage, que suele tener un tope de ~5-10MB por sitio).
// Al conectar el backend real, esto se reemplaza por subida multipart/S3
// y estos límites pueden subir bastante.
const LIMITES_ARCHIVO = {
  image: 8 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  audio: 15 * 1024 * 1024
};

window.previewFiles = function(input) {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";
  archivosSeleccionados = [];

  Array.from(input.files).forEach((file) => {
    const categoria = file.type.startsWith("image/") ? "image"
      : file.type.startsWith("video/") ? "video"
      : file.type.startsWith("audio/") ? "audio"
      : null;

    if (!categoria) {
      notificar(`"${file.name}" no es una foto, video o audio válido y no se agregó.`, "warning");
      return;
    }
    if (file.size > LIMITES_ARCHIVO[categoria]) {
      const limiteMB = Math.round(LIMITES_ARCHIVO[categoria] / (1024 * 1024));
      notificar(`"${file.name}" pesa más de ${limiteMB}MB y no se agregó (límite de esta demo local).`, "warning");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      archivosSeleccionados.push({
        name: file.name,
        type: file.type,
        data: e.target.result
      });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
};

function renderPreviews() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";
  
  archivosSeleccionados.forEach((archivo, index) => {
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.display = "inline-block";
    div.style.margin = "5px";

    const btnBorrar = `<button type="button" onclick="borrarArchivo(${index})" aria-label="Quitar archivo ${archivo.name}" style="position:absolute; top:-5px; right:-5px; background:var(--accent); color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center;">✕</button>`;

    if (archivo.type && archivo.type.startsWith("image/")) {
      div.innerHTML = `<img src="${archivo.data}" style="width:100px; height:100px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">`;
    } else if (archivo.type && archivo.type.startsWith("video/")) {
      div.innerHTML = `<video src="${archivo.data}" style="width:100px; height:100px; border-radius:6px; border:1px solid var(--border); object-fit:cover;"></video>`;
    } else if (archivo.type && archivo.type.startsWith("audio/")) {
      div.innerHTML = `
        <div style="width:100px; height:100px; border-radius:6px; border:1px solid var(--border); background:var(--bg); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:6px; box-sizing:border-box;">
          <span style="font-size:22px;">🎵</span>
          <span style="font-size:10px; color:var(--text-faint); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">${archivo.name}</span>
        </div>`;
    } else {
      div.innerHTML = `<div style="width:100px; height:100px; border-radius:6px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--text-faint); text-align:center; padding:6px;">${archivo.name || "Archivo"}</div>`;
    }
    
    div.innerHTML += btnBorrar;
    container.appendChild(div);
  });
}

window.borrarArchivo = function(index) {
  archivosSeleccionados.splice(index, 1);
  renderPreviews();
};

// --- ÚNICO EVENTO SUBMIT PARA FORMULARIO DE EVIDENCIAS ---
document.getElementById("formEvidencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idAlerta = document.getElementById("evAlerta").value;
  const desc = document.getElementById("evDescripcion").value;

  if (!idAlerta || archivosSeleccionados.length === 0) {
    notificar("Selecciona al menos un archivo antes de guardar la evidencia.", "warning");
    return;
  }

  const nuevaEvidencia = {
    id_evidencia: generateId(),
    id_alerta: idAlerta,
    descripcion: desc,
    archivos: archivosSeleccionados, 
    fecha: new Date().toISOString()
  };

  MOCK_DB.evidencias.push(nuevaEvidencia);
  
  const alerta = MOCK_DB.alertas.find(a => a.id_alerta === idAlerta);
  if (alerta) {
    alerta.estado = "cerrada";
    alerta.fecha_cierre = new Date().toISOString();
  }

  saveDB();
  archivosSeleccionados = [];
  document.getElementById("formEvidencia").reset();
  document.getElementById("previewContainer").innerHTML = "";
  
  cargarEvidencias();
  cargarHistorial();
  cargarAlertas(); // Para limpiar la lista de pendientes si quedó ahí
  cargarPanelSupervisor();
  notificar("Evidencias guardadas y caso cerrado.", "success");
});

// --- 9. MEJORAS: CARGA DE VISTAS (MODAL Y GRID) ---
async function cargarEvidencias() {
  const pendientesEv = MOCK_DB.alertas.filter(a => a.estado === "pendiente_evidencia");
  const select = document.getElementById("evAlerta");
  if (select) {
      select.innerHTML = pendientesEv.map(a => 
        `<option value="${a.id_alerta}">${a.tipo} — ${a.descripcion}</option>`
      ).join("");
  }

  const cont = document.getElementById("listaEvidencias");
  if (!cont) return;

  const todas = MOCK_DB.evidencias;
  cont.innerHTML = todas.map(ev => {
    const iconos = (ev.archivos || []).map(a => {
      if (a.type && a.type.startsWith("image/")) return "🖼️";
      if (a.type && a.type.startsWith("video/")) return "🎬";
      if (a.type && a.type.startsWith("audio/")) return "🎵";
      return "📎";
    });
    const resumenArchivos = (ev.archivos && ev.archivos.length > 0)
      ? `${iconos.join(" ")} ${ev.archivos.length} archivo${ev.archivos.length > 1 ? "s" : ""}`
      : "Sin archivos";
    return `
    <div class="card" style="margin-bottom:10px;">
      <h4>Alerta #${ev.id_alerta.split("-")[0]}</h4>
      <p>${ev.descripcion}</p>
      <div class="evidencia-thumb" style="margin-top:10px;">
        <span style="font-size:12px; color:var(--text-faint)">${resumenArchivos}</span>
      </div>
    </div>
  `}).join("");
}

let filtroHistorialTexto = "";
let filtroHistorialTipo = "";

async function cargarHistorial() {
  const db = JSON.parse(localStorage.getItem("sge_mock_db"));
  if (!db) return;
  let cerradas = db.alertas.filter(a => a.estado === "cerrada");

  if (filtroHistorialTipo) cerradas = cerradas.filter(a => a.tipo === filtroHistorialTipo);
  if (filtroHistorialTexto) {
    const q = filtroHistorialTexto.toLowerCase();
    cerradas = cerradas.filter(a =>
      (a.descripcion || "").toLowerCase().includes(q) ||
      (a.direccion_referencial || "").toLowerCase().includes(q)
    );
  }

  const lista = document.getElementById("listaHistorial");
  const count = document.getElementById("countHistorial");
  if(count) count.textContent = cerradas.length;

  if (cerradas.length === 0) {
    const hayFiltro = filtroHistorialTipo || filtroHistorialTexto;
    lista.innerHTML = `<p style="color:var(--text-faint); padding: 20px;">${hayFiltro ? "Ningún caso coincide con el filtro." : "No hay emergencias cerradas."}</p>`;
    return;
  }

  lista.innerHTML = cerradas.map(a => `
    <li class="alerta-item" style="cursor:pointer;" onclick="verHistorial('${a.id_alerta}')">
      <div class="alerta-item-top">
        <span class="alerta-tipo">${a.tipo}</span>
        <span class="alerta-estado estado-cerrada">cerrada</span>
      </div>
      <span class="alerta-desc">${a.descripcion}</span>
      <span style="font-size: 11px; color: var(--accent); margin-top: 5px;">Clic para ver detalles 360°</span>
    </li>`).join("");
}

document.getElementById("historialBusqueda").addEventListener("input", (e) => {
  filtroHistorialTexto = e.target.value.trim();
  cargarHistorial();
});
document.getElementById("historialFiltroTipo").addEventListener("change", (e) => {
  filtroHistorialTipo = e.target.value;
  cargarHistorial();
});

let mapaHistorial = null; 
let marcadorHistorial = null;

function switchModalTab(tabId) {
  document.querySelectorAll(".modal-tab").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".modal-tab-content").forEach(content => {
    content.classList.remove("active");
    content.classList.add("hidden");
  });

  event.target.classList.add("active");
  const panelActivo = document.getElementById(`tab-${tabId}`);
  panelActivo.classList.add("active");
  panelActivo.classList.remove("hidden");

  if (tabId === 'info' && mapaHistorial) {
    setTimeout(() => mapaHistorial.invalidateSize(), 50);
  }
}

async function verHistorial(idAlerta) {
  const modal = document.getElementById("modalHistorial");
  modal.classList.remove("hidden");

  // Reinicia el modal a la pestaña "Información y Ubicación" cada vez que se abre
  document.querySelectorAll(".modal-tab").forEach((btn, i) => btn.classList.toggle("active", i === 0));
  document.querySelectorAll(".modal-tab-content").forEach(content => content.classList.remove("active", "hidden"));
  document.getElementById("tab-info").classList.add("active");
  document.getElementById("tab-evidencias").classList.add("hidden");
  
  const h = await api(`/historial/${idAlerta}`);
  const alerta = h.alerta || {};
  const recurso = h.recurso;
  const evidencias = h.evidencias || [];

  const elId = document.getElementById("modalAlertaId");
  if (elId) elId.textContent = `#${idAlerta.split("-")[0] || idAlerta}`;

  const datosDiv = document.getElementById("historialDatosDiv");
  if (datosDiv) {
    datosDiv.innerHTML = `
      <div class="modal-seccion">
        <h4>Alerta (Cassandra)</h4>
        <p><strong>${alerta.tipo || "-"}</strong> — ${alerta.descripcion || "-"}</p>
        <p style="color:var(--text-dim);margin-top:4px">${alerta.direccion_referencial || "Sin referencia"}</p>
      </div>
      <div class="modal-seccion">
        <h4>Recurso (PostgreSQL)</h4>
        ${recurso ? `<p>${recurso.tipo} — Placa ${recurso.placa}</p>` : `<p style="color:var(--text-faint)">No asignado.</p>`}
      </div>
    `;
  }

  if (!mapaHistorial) {
      mapaHistorial = L.map("mapaHistorial", { zoomControl: false, dragging: false }).setView([0,0], 16);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(mapaHistorial);
  }
  const lat = parseFloat(alerta.latitud) || -9.5277;
  const lng = parseFloat(alerta.longitud) || -77.5285;
  mapaHistorial.setView([lat, lng], 16);
  if (marcadorHistorial) mapaHistorial.removeLayer(marcadorHistorial);
  marcadorHistorial = L.circleMarker([lat, lng], { radius: 8, color: "#2ECC71" }).addTo(mapaHistorial);
  setTimeout(() => mapaHistorial.invalidateSize(), 50);

  const evDiv = document.getElementById("historialEvidenciasDiv");
  if (evDiv) {
    evDiv.innerHTML = evidencias.length === 0 
      ? `<p style="color:var(--text-faint); text-align:center; padding: 20px;">Sin evidencias.</p>`
      : evidencias.map(ev => `
        <div style="background:var(--bg); border:1px solid var(--border); padding:15px; border-radius:8px; margin-bottom:10px;">
          <p style="margin-bottom: 12px; font-size:13px;">${ev.descripcion}</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${ev.archivos ? ev.archivos.map(archivo => {
                if (archivo.type && archivo.type.startsWith("image/")) {
                    return `<img src="${archivo.data}" style="width: 120px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">`;
                } else if (archivo.type && archivo.type.startsWith("video/")) {
                    return `<video src="${archivo.data}" controls style="width: 160px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);"></video>`;
                } else if (archivo.type && archivo.type.startsWith("audio/")) {
                    return `
                      <div style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border); background:var(--panel-raised);">
                        <p style="font-size:11px; color:var(--text-faint); margin-bottom:6px;">🎵 ${archivo.name || "Audio"}</p>
                        <audio src="${archivo.data}" controls style="width:100%; height:32px;"></audio>
                      </div>`;
                } else {
                    return `<span class="archivo-chip">📎 ${archivo.name || archivo}</span>`;
                }
            }).join("") : "<span style='font-size:12px; color:var(--text-faint)'>Sin archivos</span>"}
          </div>
        </div>`).join("");
  }
}

// --- 10. PANEL SUPERVISOR ---
function casosPorTipo(alertas) {
  const etiquetas = { medica: "Médica", incendio: "Incendio", seguridad: "Seguridad", accidente: "Accidente" };
  return Object.keys(etiquetas).map(tipo => ({
    tipo,
    etiqueta: etiquetas[tipo],
    count: alertas.filter(a => a.tipo === tipo).length
  }));
}

function calcularTiempoPromedioResolucion(alertas) {
  const cerradas = alertas.filter(a => a.estado === "cerrada" && a.fecha_creacion && a.fecha_cierre);
  if (cerradas.length === 0) return null;
  const totalMs = cerradas.reduce((acc, a) => acc + (new Date(a.fecha_cierre) - new Date(a.fecha_creacion)), 0);
  return totalMs / cerradas.length;
}

function formatearDuracion(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${horas}h ${min}min`;
}

async function cargarPanelSupervisor() {
  const elTotal = document.getElementById("supTotal");
  if (!elTotal) return; // La vista aún no existe en el DOM (no debería pasar, pero por seguridad)

  const alertas = await api("/alertas");
  const total = alertas.length;
  const pendientes = alertas.filter(a => a.estado === "pendiente").length;
  const enAtencion = alertas.filter(a => a.estado === "en_atencion").length;
  const cerradas = alertas.filter(a => a.estado === "cerrada").length;

  elTotal.textContent = total;
  document.getElementById("supPendientes").textContent = pendientes;
  document.getElementById("supEnAtencion").textContent = enAtencion;
  document.getElementById("supCerradas").textContent = cerradas;

  const tiempoProm = calcularTiempoPromedioResolucion(alertas);
  document.getElementById("supTiempoResolucion").textContent = tiempoProm !== null
    ? formatearDuracion(tiempoProm)
    : "Sin casos cerrados aún";

  const porTipo = casosPorTipo(alertas);
  const maxCount = Math.max(1, ...porTipo.map(x => x.count));
  const cont = document.getElementById("supCasosPorTipo");
  if (cont) {
    cont.innerHTML = porTipo.map(x => `
      <div class="sup-bar-row">
        <span class="sup-bar-label">${x.etiqueta}</span>
        <div class="sup-bar-track"><div class="sup-bar-fill" style="width:${(x.count / maxCount) * 100}%"></div></div>
        <span class="sup-bar-count">${x.count}</span>
      </div>`).join("");
  }
}