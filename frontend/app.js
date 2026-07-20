// =========================================================
// SGE — App frontend
// Conecta con el backend real en API_BASE (ajusta si es necesario)
// =========================================================
//
// NOTA SOBRE ROLES (v2): el sistema ahora trabaja con 2 roles:
//   - operador       -> sus módulos operativos (Alertas, Despacho,
//                        Evidencias) + acceso de SOLO LECTURA al
//                        Panel Supervisor y al Historial 360°
//                        (funciones que antes tenía un rol
//                        "supervisor" aparte, ya eliminado).
//   - administrador  -> todo lo anterior, más el CRUD completo
//                        (crear/editar/eliminar) de Usuarios,
//                        Recursos, Instituciones, Sedes y capacidad,
//                        y el botón de eliminar en el Historial 360°.
// La seguridad real vive en el backend (requireRole() en cada ruta);
// esto de aquí es solo para que la interfaz se vea ordenada.

const API_BASE = "http://localhost:4000/api";
const FILES_BASE = API_BASE.replace("/api", "");

let TOKEN = localStorage.getItem("sge_token") || null;
let OPERADOR = JSON.parse(localStorage.getItem("sge_operador") || "null");
let mapa, marcadorTemporal;
const marcadoresAlertas = {};
let recursosDisponibles = []; // caché para armar los <select> de despacho
let alertasPendientesGlobal = [];

// Caché simple de cada módulo (para poder abrir el panel de edición
// sin tener que volver a pedirle al backend el registro exacto)
let cacheOperadores = [];
let cacheRecursos = [];
let cacheInstituciones = [];
let cacheSedes = [];

// -----------------------------------------------------------
// PUNTO 2: Colores fijos del mapa (Sedes) y colores de Alertas
// (siempre distintos entre sí, para que la leyenda no se confunda)
// -----------------------------------------------------------
const COLOR_SEDE_POR_TIPO = {
  Hospital: "#FFFFFF",
  Comisaria: "#2F6FFA",
  Bomberos: "#E63946"
};
const COLOR_ALERTA_POR_TIPO = {
  medica: "#FFC93C",
  incendio: "#FF7A1A",
  seguridad: "#8B5CF6",
  accidente: "#22D3B5"
};
const marcadoresSedes = {};

// -----------------------------------------------------------
// PUNTO 4: Reactividad — polling corto para mantener datos frescos
// sin recargar la página, complementado con botones "Actualizar"
// manuales en cada módulo (ver más abajo, sección REACTIVIDAD).
// -----------------------------------------------------------
const POLLING_MS = 9000;
let pollingHandle = null;

function esAdministrador() {
  return OPERADOR && OPERADOR.rol === "administrador";
}

// Oracle devuelve las columnas en MAYÚSCULAS (ID_INSTITUCION, NOMBRE...).
// Este helper normaliza cualquier fila a minúsculas para no repetir
// "campo.CAMPO ?? campo.campo" por todos lados.
function normalizarClaves(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  Object.keys(obj).forEach((k) => { out[k.toLowerCase()] = obj[k]; });
  return out;
}

// ---------- Helper de fetch autenticado ----------
async function api(path, options = {}) {
  const esFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Error en la solicitud");
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- 1B. UTILIDADES DE UI: NOTIFICACIONES Y CONFIRMACIONES ----------
function notificar(mensaje, tipo = "info") {
  const cont = document.getElementById("toastContainer");
  if (!cont) return;

  const iconos = {
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`,
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><path d="M8 12l3 3 5-5"></path></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-icon" style="display:flex;align-items:center;">${iconos[tipo] || iconos.info}</span>
    <span class="toast-msg"></span>
    <button class="toast-close" aria-label="Cerrar notificación" style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:14px;opacity:0.7;">✕</button>
  `;
  toast.querySelector(".toast-msg").textContent = mensaje;
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

function manejarError(err, prefijo = "") {
  console.error(err);
  notificar(err.message && err.message.includes("fetch")
    ? "No se pudo conectar al backend (¿está corriendo en localhost:4000?)"
    : `${prefijo}${err.message}`, "error");
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
    errorEl.textContent = (err.message || "").includes("fetch")
      ? "No se pudo conectar al backend (¿está corriendo en localhost:4000?)"
      : (err.message || "Credenciales inválidas");
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
  document.getElementById("userAvatar").textContent = OPERADOR.nombre.split(" ").map(w => w[0]).slice(0, 2).join("");
  aplicarPermisosPorRol(OPERADOR.rol);
  if (!mapa) initMapa();

  await cargarRecursos();
  await cargarInstituciones();
  cargarAlertas();
  if (esAdministrador()) cargarOperadores();
  cargarSedes();
  cargarEvidencias();
  cargarHistorial();
  cargarPanelSupervisor();

  // PUNTO 4: arranca el polling corto apenas hay sesión activa
  // (iniciarPolling se declara más abajo en este archivo, pero las
  // funciones declaradas con "function" quedan disponibles en todo
  // el script gracias al hoisting).
  iniciarPolling();
}

// -----------------------------------------------------------
// RBAC EN EL FRONTEND (solo usabilidad; la seguridad real la hace
// el backend con requireRole() en cada ruta)
// -----------------------------------------------------------
function aplicarPermisosPorRol(rol) {
  document.querySelectorAll(".nav-item[data-roles]").forEach(btn => {
    const rolesPermitidos = btn.dataset.roles.split(",");
    btn.classList.toggle("hidden", !rolesPermitidos.includes(rol));
  });
  document.querySelectorAll(".view[data-roles]").forEach(seccion => {
    const rolesPermitidos = seccion.dataset.roles.split(",");
    if (!rolesPermitidos.includes(rol)) seccion.classList.remove("active");
  });

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

// ---------- MENÚ MÓVIL ----------
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

// ---------- MÓDULO: ALERTAS + MAPA (Cassandra) ----------
function initMapa() {
  mapa = L.map("mapaAlertas", { zoomControl: true }).setView([-9.5277, -77.5285], 14); // Huaraz, Ancash
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
  }).addTo(mapa);

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

// -----------------------------------------------------------
// PUNTO 2: Marcadores de Sedes en el mapa de Alertas
// -----------------------------------------------------------
// Pinta un pin de color FIJO según el tipo de institución dueña de
// la sede: Hospitales = blanco, Comisarías = azul, Bomberos = rojo.
// Estos colores nunca cambian (a diferencia de las Alertas, que
// usan un color por tipo de emergencia) y son distintos entre sí
// para que la leyenda del módulo tenga sentido.
function renderizarMarcadoresSedes() {
  if (!mapa) return;
  Object.values(marcadoresSedes).forEach(m => mapa.removeLayer(m));

  cacheSedes.forEach(s => {
    if (s.latitud == null || s.longitud == null) return;
    const color = COLOR_SEDE_POR_TIPO[s.tipo_institucion] || "#8493A6";
    const marker = L.circleMarker([s.latitud, s.longitud], {
      radius: 7, color: "#12181f", weight: 1.5, fillColor: color, fillOpacity: 0.95
    }).addTo(mapa).bindPopup(
      `<strong>${s.nombre_institucion || "Sede"}</strong><br>` +
      `<span style="color:#8493A6;font-size:11px">${s.tipo_institucion || ""}</span><br>` +
      `${s.direccion || ""}`
    );
    marcadoresSedes[s.id_sede] = marker;
  });
}

document.getElementById("formAlerta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lat = document.getElementById("alertaLat").value;
  const lng = document.getElementById("alertaLng").value;
  if (!lat || !lng) return notificar("Haz clic en el mapa para marcar la ubicación antes de registrar.", "warning");

  try {
    await api("/alertas", {
      method: "POST",
      body: JSON.stringify({
        tipo: document.getElementById("alertaTipo").value,
        descripcion: document.getElementById("alertaDescripcion").value,
        latitud: parseFloat(lat),
        longitud: parseFloat(lng),
        direccion_referencial: document.getElementById("alertaDireccion").value
      })
    });
    document.getElementById("formAlerta").reset();
    if (marcadorTemporal) { mapa.removeLayer(marcadorTemporal); marcadorTemporal = null; }
    cargarAlertas();
    notificar("Alerta registrada.", "success");
  } catch (err) { manejarError(err, "No se pudo registrar la alerta: "); }
});

async function cargarAlertas() {
  try {
    const alertas = await api("/alertas");
    Object.values(marcadoresAlertas).forEach(m => mapa.removeLayer(m));

    document.getElementById("kpiTotal").textContent = alertas.length;
    document.getElementById("kpiPendientes").textContent = alertas.filter(a => a.estado === "pendiente").length;
    document.getElementById("kpiCerradas").textContent = alertas.filter(a => a.estado === "cerrada").length;

    const trendTotal = calcularTendencia(alertas, "fecha_creacion");
    const elTrendTotal = document.getElementById("kpiTotalTrend");
    if (elTrendTotal) elTrendTotal.innerHTML = renderTendenciaHTML(trendTotal, "nuevos hoy");

    const trendCerradas = calcularTendencia(alertas.filter(a => a.estado === "cerrada"), "fecha_actualizacion");
    const elTrendCerradas = document.getElementById("kpiCerradasTrend");
    if (elTrendCerradas) elTrendCerradas.innerHTML = renderTendenciaHTML(trendCerradas, "cerrados hoy");

    alertas.filter(a => a.estado !== "cerrada").forEach(a => {
      const color = COLOR_ALERTA_POR_TIPO[a.tipo] || "#FF5A3C";
      const marker = L.circleMarker([a.latitud, a.longitud], { radius: 8, color, fillColor: color, fillOpacity: 0.65, weight: 2 })
        .addTo(mapa)
        .bindPopup(`<strong style="text-transform:capitalize">${a.tipo}</strong><br>${a.descripcion || ""}<br><span style="color:#8493A6;font-size:11px">${a.direccion_referencial || "Sin referencia"}</span>`);
      marcadoresAlertas[a.id_alerta] = marker;
    });

    renderizarColaDespacho(alertas);
  } catch (err) { console.warn("No se pudieron cargar alertas:", err.message); }
}

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
  if (t.hoy === 0 && t.ayer === 0) return `<span class="kpi-trend-neutral">Sin actividad hoy</span>`;
  const subiendo = t.delta >= 0;
  const icono = subiendo ? "▲" : "▼";
  const clase = subiendo ? "kpi-trend-up" : "kpi-trend-down";
  return `<span class="${clase}">${icono} ${t.hoy} ${etiqueta}</span> <span class="kpi-trend-neutral">(${t.delta >= 0 ? "+" : ""}${t.delta}% vs ayer)</span>`;
}

// ---------- MÓDULO: DESPACHO (SPLIT SCREEN) ----------
function renderizarColaDespacho(alertas) {
  const pendientes = alertas.filter(a => a.estado === "pendiente");
  const enAtencion = alertas.filter(a => a.estado === "en_atencion");
  alertasPendientesGlobal = pendientes;

  const lista = document.getElementById("listaDespachoPendientes");
  if (!lista) return;
  lista.innerHTML = "";

  pendientes.forEach(a => {
    const li = document.createElement("li");
    li.className = "alerta-item";
    li.style.cursor = "pointer";
    li.style.transition = "border-color 0.2s";
    li.onmouseover = () => li.style.borderColor = "var(--accent)";
    li.onmouseout = () => li.style.borderColor = "var(--border-soft)";
    li.onclick = () => mostrarDetalleDespacho(a.id_alerta);
    li.innerHTML = `
      <div class="alerta-item-top"><span class="alerta-tipo">${a.tipo}</span><span class="alerta-estado estado-pendiente">Pendiente</span></div>
      <span class="alerta-desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.descripcion}</span>
    `;
    lista.appendChild(li);
  });

  enAtencion.forEach(a => {
    const li = document.createElement("li");
    li.className = "alerta-item";
    li.innerHTML = `
      <div class="alerta-item-top"><span class="alerta-tipo">${a.tipo}</span><span class="alerta-estado estado-en_atencion">En Atención</span></div>
      <span class="alerta-desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.descripcion}</span>
      <div style="margin-top:10px;">
        <button class="btn-mini btn-mini-close" onclick="cerrarCaso('${a.id_alerta}')">Cerrar caso</button>
      </div>
    `;
    lista.appendChild(li);
  });
}

async function mostrarDetalleDespacho(idAlerta) {
  const alerta = alertasPendientesGlobal.find(a => a.id_alerta === idAlerta);
  if (!alerta) return;
  const panel = document.getElementById("panelDetalleDespacho");
  panel.classList.remove("empty");
  panel.innerHTML = `<p style="color:var(--text-faint);">Calculando prioridad de despacho y sedes más cercanas…</p>`;

  // -----------------------------------------------------------
  // PUNTO 1: Prioridad en Despacho + Derivación por Cercanía
  // -----------------------------------------------------------
  // Ambas listas ya llegan ORDENADAS desde el backend:
  //  - recursos: por prioridad según el tipo de emergencia
  //  - sedes: por rama institucional afín + distancia Haversine (KM)
  let recursosOrdenados = [];
  let sedesOrdenadas = [];
  try {
    [recursosOrdenados, sedesOrdenadas] = await Promise.all([
      api(`/recursos/despacho/${alerta.tipo}`),
      api(`/sedes/derivacion?tipo=${alerta.tipo}&lat=${alerta.latitud}&lng=${alerta.longitud}`)
    ]);
  } catch (err) {
    console.warn("No se pudo calcular prioridad/derivación:", err.message);
  }

  const opcionesRecursos = recursosOrdenados.map((r, i) =>
    `<option value="${r.id_recurso}">#${i + 1} — ${r.tipo} — ${r.placa}</option>`
  ).join("");

  const listaPrioridadRecursos = recursosOrdenados.length === 0
    ? `<p class="despacho-vacio">No hay recursos disponibles en este momento.</p>`
    : `<div class="despacho-lista-prioridad" id="listaRecursosDespacho">${recursosOrdenados.map((r, i) => `
        <button type="button" class="despacho-opcion" data-id="${r.id_recurso}" onclick="seleccionarDespacho('recurso','${r.id_recurso}',this)">
          <span><span class="despacho-opcion-rango">#${i + 1}</span> ${r.tipo} — ${r.placa}</span>
          <span class="estado-tag estado-${r.estado}">${r.estado}</span>
        </button>`).join("")}</div>`;

  const sedesConDatos = sedesOrdenadas.map(s => normalizarClaves(s));

  const listaSedes = sedesConDatos.length === 0
    ? `<p class="despacho-vacio">No hay sedes registradas.</p>`
    : `<div class="despacho-lista-prioridad" id="listaSedesDespacho">${sedesConDatos.map((s, i) => {
        const capacidad = s.capacidad && s.capacidad.etiqueta
          ? `<span class="despacho-opcion-capacidad">${s.capacidad.etiqueta}: ${s.capacidad.valor}</span>`
          : "";
        const distancia = s.distancia_km != null
          ? `<span class="despacho-opcion-distancia">${s.distancia_km.toFixed(2)} km</span>`
          : "";
        return `
        <button type="button" class="despacho-opcion" data-id="${s.id_sede}" onclick="seleccionarDespacho('sede','${s.id_sede}',this)">
          <span class="despacho-opcion-nombre"><span class="despacho-opcion-rango">#${i + 1}</span> ${s.nombre_institucion} <span class="despacho-opcion-tipo">(${s.tipo_institucion})</span></span>
          <span class="despacho-opcion-meta">${capacidad}${distancia}</span>
        </button>`;
      }).join("")}</div>`;

  panel.innerHTML = `
    <h3 class="despacho-titulo">Alerta: ${alerta.tipo}</h3>
    <p class="despacho-id">ID: ${alerta.id_alerta}</p>
    <div class="despacho-resumen">
      <p><strong>Descripción:</strong> ${alerta.descripcion}</p>
      <p style="margin-top:8px;"><strong>Ubicación:</strong> ${alerta.direccion_referencial || "Sin referencia"}</p>
    </div>
    <h4 class="despacho-seccion-titulo">Asignación Logística</h4>
    <div style="display:flex;flex-direction:column;gap:15px;">
      <div class="field">
        <span class="despacho-campo-titulo">1. Asignar Recurso (PostgreSQL) — orden de prioridad para "${alerta.tipo}"</span>
        <input type="hidden" id="despachoRecurso">
        ${listaPrioridadRecursos}
      </div>
      <div class="field">
        <span class="despacho-campo-titulo">2. Sede de Derivación (Oracle) — por cercanía (Haversine)</span>
        <input type="hidden" id="despachoSede">
        ${listaSedes}
      </div>
      <button class="btn-primary despacho-btn-confirmar" onclick="ejecutarDespacho('${alerta.id_alerta}')">Despachar Unidades</button>
    </div>
  `;
}

// Marca como seleccionada una tarjeta de recurso o sede dentro del panel
// de Despacho, y guarda su id en el input oculto correspondiente.
function seleccionarDespacho(tipo, id, btnEl) {
  const contenedorId = tipo === "recurso" ? "listaRecursosDespacho" : "listaSedesDespacho";
  document.querySelectorAll(`#${contenedorId} .despacho-opcion`).forEach(b => b.classList.remove("is-selected"));
  btnEl.classList.add("is-selected");
  document.getElementById(tipo === "recurso" ? "despachoRecurso" : "despachoSede").value = id;
}

async function ejecutarDespacho(idAlerta) {
  const idRecurso = document.getElementById("despachoRecurso").value;
  const idSede = document.getElementById("despachoSede").value;
  if (!idRecurso) return notificar("Selecciona un recurso antes de despachar.", "warning");
  try {
    await api(`/alertas/${idAlerta}/asignar-recurso`, {
      method: "PUT",
      body: JSON.stringify({ id_recurso: idRecurso, id_sede_derivacion: idSede || null })
    });
    document.getElementById("panelDetalleDespacho").innerHTML = `<p>Unidad despachada. Selecciona otra emergencia.</p>`;
    cargarAlertas();
    await cargarRecursos();
    notificar("Unidad despachada.", "success");
  } catch (err) { manejarError(err, "No se pudo despachar: "); }
}

async function cerrarCaso(idAlerta) {
  const ok = await confirmar("Esto cerrará la alerta y liberará el recurso asignado. ¿Continuar?");
  if (!ok) return;
  try {
    await api(`/alertas/${idAlerta}/estado`, { method: "PUT", body: JSON.stringify({ estado: "cerrada" }) });
    cargarAlertas();
    await cargarRecursos();
    cargarEvidencias();
    cargarHistorial();
    cargarPanelSupervisor();
    notificar("Caso cerrado. Ya puedes subir la evidencia desde 'Evidencias multimedia'.", "success");
  } catch (err) { manejarError(err, "No se pudo cerrar el caso: "); }
}

// =========================================================
// MÓDULO: USUARIOS Y RECURSOS (PostgreSQL) — CRUD completo (admin)
// =========================================================

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
    notificar("Operador creado y replicado en Oracle/Cassandra.", "success");
  } catch (err) { manejarError(err, "No se pudo crear el operador: "); }
});

async function cargarOperadores() {
  try {
    const ops = await api("/operadores");
    cacheOperadores = ops;
    const tbody = document.querySelector("#tablaOperadores tbody");
    tbody.innerHTML = "";
    ops.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.id_operador}</td><td>${o.nombre}</td><td>${o.usuario}</td><td>${o.rol}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon btn-icon-edit" aria-label="Editar operador ${o.nombre}" onclick="abrirEditarOperador(${o.id_operador})">✎</button>
            <button class="btn-icon" aria-label="Eliminar operador ${o.nombre}" onclick="eliminarOperador(${o.id_operador})">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

async function eliminarOperador(id) {
  const ok = await confirmar("Esto desactivará al operador en las 4 bases de datos (cascada). ¿Continuar?");
  if (!ok) return;
  try {
    await api(`/operadores/${id}`, { method: "DELETE" });
    cargarOperadores();
    notificar("Operador desactivado en cascada.", "success");
  } catch (err) { manejarError(err, "No se pudo eliminar el operador: "); }
}

function abrirEditarOperador(id) {
  const o = cacheOperadores.find(x => x.id_operador === id);
  if (!o) return;
  abrirModalEditar({
    titulo: `Editar operador #${id}`,
    campos: [
      { id: "editNombre", label: "Nombre completo", tipo: "text", valor: o.nombre, requerido: true },
      { id: "editUsuario", label: "Usuario", tipo: "text", valor: o.usuario, requerido: true },
      { id: "editRol", label: "Rol", tipo: "select", valor: o.rol, requerido: true, opciones: [
        { value: "operador", label: "Operador" },
        { value: "administrador", label: "Administrador" }
      ]},
      { id: "editPassword", label: "Nueva contraseña (opcional)", tipo: "password", valor: "", requerido: false }
    ],
    onGuardar: async () => {
      const nombre = document.getElementById("editNombre").value;
      const usuario = document.getElementById("editUsuario").value;
      const rol = document.getElementById("editRol").value;
      const contrasena = document.getElementById("editPassword").value;
      await api(`/operadores/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nombre, usuario, rol, ...(contrasena ? { contrasena } : {}) })
      });
      cargarOperadores();
      notificar("Operador actualizado y replicado.", "success");
    }
  });
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
    notificar("Recurso creado y replicado en Oracle/Cassandra.", "success");
  } catch (err) { manejarError(err, "No se pudo crear el recurso: "); }
});

async function cargarRecursos() {
  try {
    const recs = await api("/recursos");
    cacheRecursos = recs;
    recursosDisponibles = recs.filter(r => r.estado === "disponible");

    const tbody = document.querySelector("#tablaRecursos tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    recs.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id_recurso}</td><td>${r.tipo}</td><td>${r.placa}</td>
        <td><span class="estado-tag estado-${r.estado}">${r.estado === "ocupado" ? "En Emergencia" : r.estado}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon btn-icon-edit" aria-label="Editar recurso ${r.placa}" onclick="abrirEditarRecurso(${r.id_recurso})">✎</button>
            <button class="btn-icon" aria-label="Eliminar recurso ${r.placa}" onclick="eliminarRecurso(${r.id_recurso})">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.warn(err.message); }
}

async function eliminarRecurso(id) {
  const ok = await confirmar("¿Desactivar este recurso? También se propaga a sus réplicas.");
  if (!ok) return;
  try {
    await api(`/recursos/${id}`, { method: "DELETE" });
    cargarRecursos();
    notificar("Recurso desactivado.", "success");
  } catch (err) { manejarError(err, "No se pudo eliminar el recurso: "); }
}

function abrirEditarRecurso(id) {
  const r = cacheRecursos.find(x => x.id_recurso === id);
  if (!r) return;
  abrirModalEditar({
    titulo: `Editar recurso #${id}`,
    campos: [
      { id: "editTipo", label: "Tipo", tipo: "select", valor: r.tipo, requerido: true, opciones: [
        { value: "ambulancia", label: "Ambulancia" },
        { value: "patrulla", label: "Patrulla" },
        { value: "bomberos", label: "Bomberos" },
        { value: "otro", label: "Otro" }
      ]},
      { id: "editPlaca", label: "Placa", tipo: "text", valor: r.placa, requerido: true },
      { id: "editEstado", label: "Estado", tipo: "select", valor: r.estado, requerido: true, opciones: [
        { value: "disponible", label: "Disponible" },
        { value: "ocupado", label: "En Emergencia" },
        { value: "mantenimiento", label: "Mantenimiento" },
        { value: "fuera_de_servicio", label: "Fuera de servicio" }
      ]}
    ],
    onGuardar: async () => {
      const tipo = document.getElementById("editTipo").value;
      const placa = document.getElementById("editPlaca").value;
      const estado = document.getElementById("editEstado").value;
      await api(`/recursos/${id}`, { method: "PUT", body: JSON.stringify({ tipo, placa, estado }) });
      cargarRecursos();
      notificar("Recurso actualizado y replicado.", "success");
    }
  });
}

// =========================================================
// MÓDULO: GESTIÓN INSTITUCIONAL (Oracle) — CRUD completo (admin)
// =========================================================

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
    notificar("Institución creada y replicada.", "success");
  } catch (err) { manejarError(err, "No se pudo crear la institución: "); }
});

async function cargarInstituciones() {
  try {
    const instsRaw = await api("/instituciones");
    const insts = instsRaw.map(normalizarClaves);
    cacheInstituciones = insts;

    const tbody = document.querySelector("#tablaInstituciones tbody");
    if (tbody) {
      tbody.innerHTML = "";
      insts.forEach(i => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i.id_institucion}</td><td>${i.nombre}</td><td>${i.tipo}</td>
          <td>
            <div class="table-actions">
              <button class="btn-icon btn-icon-edit" aria-label="Editar institución ${i.nombre}" onclick="abrirEditarInstitucion(${i.id_institucion})">✎</button>
              <button class="btn-icon" aria-label="Eliminar institución ${i.nombre}" onclick="eliminarInstitucion(${i.id_institucion})">✕</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Refresca el <select> de institución del formulario de Sedes
    const selSede = document.getElementById("sedeInstitucion");
    if (selSede) {
      const seleccionActual = selSede.value;
      selSede.innerHTML = insts.map(i => `<option value="${i.id_institucion}" data-tipo="${i.tipo}">${i.nombre}</option>`).join("");
      if (seleccionActual) selSede.value = seleccionActual;
      aplicarValidacionCapacidadSede();
    }

    renderizarTablaRelacionInstitucional();
  } catch (err) { console.warn(err.message); }
}

async function eliminarInstitucion(id) {
  const ok = await confirmar("Esto desactivará la institución y sus sedes en cascada. ¿Continuar?");
  if (!ok) return;
  try {
    await api(`/instituciones/${id}`, { method: "DELETE" });
    cargarInstituciones();
    cargarSedes();
    notificar("Institución desactivada en cascada.", "success");
  } catch (err) { manejarError(err, "No se pudo eliminar la institución: "); }
}

function abrirEditarInstitucion(id) {
  const i = cacheInstituciones.find(x => x.id_institucion === id);
  if (!i) return;
  abrirModalEditar({
    titulo: `Editar institución #${id}`,
    campos: [
      { id: "editInstNombre", label: "Nombre", tipo: "text", valor: i.nombre, requerido: true },
      { id: "editInstTipo", label: "Tipo", tipo: "select", valor: i.tipo, requerido: true, opciones: [
        { value: "Hospital", label: "Hospital" },
        { value: "Comisaria", label: "Comisaría" },
        { value: "Bomberos", label: "Bomberos" }
      ]}
    ],
    onGuardar: async () => {
      const nombre = document.getElementById("editInstNombre").value;
      const tipo = document.getElementById("editInstTipo").value;
      await api(`/instituciones/${id}`, { method: "PUT", body: JSON.stringify({ nombre, tipo }) });
      cargarInstituciones();
      notificar("Institución actualizada y replicada.", "success");
    }
  });
}

// ---------- SEDES Y CAPACIDAD (Oracle) — CRUD completo (admin) ----------

// -----------------------------------------------------------
// PUNTO 3: Validación de Formulario — según el tipo de institución
// seleccionada, solo se habilita el campo de capacidad que le
// corresponde: Hospital -> camas, Comisaría -> calabozos,
// Bomberos -> ninguno (ambos deshabilitados / "ninguno").
// -----------------------------------------------------------
function aplicarValidacionCapacidadSede() {
  const select = document.getElementById("sedeInstitucion");
  const campoCamas = document.getElementById("sedeCamas");
  const campoCalabozos = document.getElementById("sedeCalabozos");
  if (!select || !campoCamas || !campoCalabozos) return;

  const opcion = select.selectedOptions[0];
  const tipo = opcion ? opcion.dataset.tipo : null;

  campoCamas.disabled = tipo !== "Hospital";
  campoCalabozos.disabled = tipo !== "Comisaria";
  if (campoCamas.disabled) campoCamas.value = "";
  if (campoCalabozos.disabled) campoCalabozos.value = "";

  campoCamas.placeholder = tipo === "Hospital" ? "Camas" : "Ninguno";
  campoCalabozos.placeholder = tipo === "Comisaria" ? "Calabozos" : "Ninguno";
}
document.getElementById("sedeInstitucion").addEventListener("change", aplicarValidacionCapacidadSede);

// -----------------------------------------------------------
// PUNTO 6: Modal de geolocalización para el registro de Sedes
// -----------------------------------------------------------
let mapaGeoPicker = null;
let marcadorGeoPicker = null;
let coordsGeoSeleccionadas = null;

function abrirModalGeo() {
  document.getElementById("modalGeo").classList.remove("hidden");
  document.getElementById("btnConfirmarGeo").disabled = true;
  document.getElementById("geoPickerLat").value = "";
  document.getElementById("geoPickerLng").value = "";
  coordsGeoSeleccionadas = null;

  setTimeout(() => {
    if (!mapaGeoPicker) {
      mapaGeoPicker = L.map("mapaGeoPicker", { zoomControl: true }).setView([-9.5277, -77.5285], 13);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
      }).addTo(mapaGeoPicker);
      mapaGeoPicker.on("click", (e) => {
        const { lat, lng } = e.latlng;
        coordsGeoSeleccionadas = { lat, lng };
        document.getElementById("geoPickerLat").value = lat.toFixed(6);
        document.getElementById("geoPickerLng").value = lng.toFixed(6);
        document.getElementById("btnConfirmarGeo").disabled = false;
        if (marcadorGeoPicker) mapaGeoPicker.removeLayer(marcadorGeoPicker);
        marcadorGeoPicker = L.circleMarker([lat, lng], {
          radius: 9, color: "#FF5A3C", fillColor: "#FF5A3C", fillOpacity: 0.6, weight: 2
        }).addTo(mapaGeoPicker);
      });
    }
    mapaGeoPicker.invalidateSize();
  }, 60);
}

function cerrarModalGeo() {
  document.getElementById("modalGeo").classList.add("hidden");
}

document.getElementById("btnAbrirGeoSede").addEventListener("click", abrirModalGeo);

document.getElementById("btnConfirmarGeo").addEventListener("click", () => {
  if (!coordsGeoSeleccionadas) return;
  document.getElementById("sedeLat").value = coordsGeoSeleccionadas.lat.toFixed(6);
  document.getElementById("sedeLng").value = coordsGeoSeleccionadas.lng.toFixed(6);

  const resumen = document.getElementById("sedeGeoResumen");
  resumen.textContent = `📍 ${coordsGeoSeleccionadas.lat.toFixed(4)}, ${coordsGeoSeleccionadas.lng.toFixed(4)}`;
  resumen.classList.remove("hidden");
  document.getElementById("sedeGeoGuia").classList.add("hidden");

  cerrarModalGeo();
});

document.getElementById("formSede").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idInstitucion = document.getElementById("sedeInstitucion").value;
  if (!idInstitucion) return notificar("Primero registra una institución.", "warning");

  const campoCamas = document.getElementById("sedeCamas");
  const campoCalabozos = document.getElementById("sedeCalabozos");
  const lat = document.getElementById("sedeLat").value;
  const lng = document.getElementById("sedeLng").value;

  try {
    await api("/sedes", {
      method: "POST",
      body: JSON.stringify({
        id_institucion: parseInt(idInstitucion, 10),
        direccion: document.getElementById("sedeDireccion").value,
        camas_disponibles: campoCamas.disabled ? 0 : parseInt(campoCamas.value || "0", 10),
        calabozos_disponibles: campoCalabozos.disabled ? 0 : parseInt(campoCalabozos.value || "0", 10),
        latitud: lat ? parseFloat(lat) : null,
        longitud: lng ? parseFloat(lng) : null
      })
    });
    document.getElementById("formSede").reset();
    document.getElementById("sedeLat").value = "";
    document.getElementById("sedeLng").value = "";
    document.getElementById("sedeGeoResumen").classList.add("hidden");
    document.getElementById("sedeGeoGuia").classList.remove("hidden");
    aplicarValidacionCapacidadSede();
    cargarSedes();
    notificar("Sede creada y replicada.", "success");
  } catch (err) { manejarError(err, "No se pudo crear la sede: "); }
});

async function cargarSedes() {
  try {
    const sedesRaw = await api("/sedes");
    const sedes = sedesRaw.map(normalizarClaves);
    cacheSedes = sedes;

    const tbody = document.querySelector("#tablaSedes tbody");
    if (tbody) {
      tbody.innerHTML = "";
      sedes.forEach(s => {
        const tr = document.createElement("tr");
        const acciones = esAdministrador() ? `
            <div class="table-actions">
              <button class="btn-icon btn-icon-edit" aria-label="Editar sede ${s.direccion}" onclick="abrirEditarSede(${s.id_sede})">✎</button>
              <button class="btn-icon" aria-label="Eliminar sede ${s.direccion}" onclick="eliminarSede(${s.id_sede})">✕</button>
            </div>` : "";
        tr.innerHTML = `
          <td>${s.id_sede}</td><td>${s.direccion}</td><td>${s.camas_disponibles}</td><td>${s.calabozos_disponibles}</td>
          <td>${acciones}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    renderizarMarcadoresSedes();
    renderizarTablaRelacionInstitucional();
  } catch (err) { console.warn(err.message); }
}

// -----------------------------------------------------------
// PUNTO 3: Tabla de relaciones (Institución <-> Sede <-> capacidad)
// -----------------------------------------------------------
function renderizarTablaRelacionInstitucional() {
  const tbody = document.querySelector("#tablaRelacionInstitucional tbody");
  if (!tbody) return;

  if (cacheSedes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-faint);">Aún no hay sedes registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = cacheSedes.map((s, i) => {
    const inst = cacheInstituciones.find(x => x.id_institucion === s.id_institucion);
    const tipo = s.tipo_institucion || (inst ? inst.tipo : "—");
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${s.nombre_institucion || (inst ? inst.nombre : "—")}</td>
        <td>${tipo}</td>
        <td>${s.direccion}</td>
        <td>${tipo === "Hospital" ? s.camas_disponibles : "—"}</td>
        <td>${tipo === "Comisaria" ? s.calabozos_disponibles : "—"}</td>
      </tr>`;
  }).join("");
}

async function eliminarSede(id) {
  const ok = await confirmar("¿Desactivar esta sede? También se propaga a sus réplicas.");
  if (!ok) return;
  try {
    await api(`/sedes/${id}`, { method: "DELETE" });
    cargarSedes();
    notificar("Sede desactivada.", "success");
  } catch (err) { manejarError(err, "No se pudo eliminar la sede: "); }
}

function abrirEditarSede(id) {
  const s = cacheSedes.find(x => x.id_sede === id);
  if (!s) return;
  abrirModalEditar({
    titulo: `Editar sede #${id}`,
    campos: [
      { id: "editSedeInstitucion", label: "Institución", tipo: "select", valor: String(s.id_institucion), requerido: true,
        opciones: cacheInstituciones.map(i => ({ value: String(i.id_institucion), label: i.nombre })) },
      { id: "editSedeDireccion", label: "Dirección", tipo: "text", valor: s.direccion, requerido: true },
      { id: "editSedeCamas", label: "Camas disponibles", tipo: "number", valor: s.camas_disponibles, requerido: false },
      { id: "editSedeCalabozos", label: "Calabozos disponibles", tipo: "number", valor: s.calabozos_disponibles, requerido: false },
      { id: "editSedeLat", label: "Latitud (opcional)", tipo: "text", valor: s.latitud ?? "", requerido: false },
      { id: "editSedeLng", label: "Longitud (opcional)", tipo: "text", valor: s.longitud ?? "", requerido: false }
    ],
    onGuardar: async () => {
      const id_institucion = parseInt(document.getElementById("editSedeInstitucion").value, 10);
      const direccion = document.getElementById("editSedeDireccion").value;
      const camas_disponibles = parseInt(document.getElementById("editSedeCamas").value || "0", 10);
      const calabozos_disponibles = parseInt(document.getElementById("editSedeCalabozos").value || "0", 10);
      const latRaw = document.getElementById("editSedeLat").value;
      const lngRaw = document.getElementById("editSedeLng").value;
      await api(`/sedes/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          id_institucion, direccion, camas_disponibles, calabozos_disponibles,
          latitud: latRaw ? parseFloat(latRaw) : null,
          longitud: lngRaw ? parseFloat(lngRaw) : null
        })
      });
      cargarSedes();
      notificar("Sede actualizada y replicada.", "success");
    }
  });
}

// =========================================================
// PANEL DE EDICIÓN GENÉRICO (pequeño, reutilizable)
// Se usa para Operadores, Recursos, Instituciones y Sedes: arma el
// formulario dinámicamente a partir de una lista de "campos" y
// ejecuta onGuardar() al enviar. "Cancelar" solo cierra el panel,
// sin aplicar ningún cambio.
// =========================================================
let onGuardarActual = null;

function abrirModalEditar({ titulo, campos, onGuardar }) {
  document.getElementById("modalEditarTitulo").textContent = titulo;
  const cont = document.getElementById("modalEditarCampos");
  cont.innerHTML = campos.map(c => {
    if (c.tipo === "select") {
      return `
        <label class="field"><span>${c.label}</span>
          <select id="${c.id}" ${c.requerido ? "required" : ""}>
            ${c.opciones.map(o => `<option value="${o.value}" ${String(o.value) === String(c.valor) ? "selected" : ""}>${o.label}</option>`).join("")}
          </select>
        </label>`;
    }
    return `
      <label class="field"><span>${c.label}</span>
        <input type="${c.tipo}" id="${c.id}" value="${c.valor ?? ""}" ${c.requerido ? "required" : ""}>
      </label>`;
  }).join("");

  onGuardarActual = onGuardar;
  document.getElementById("modalEditar").classList.remove("hidden");
}

function cerrarModalEditar() {
  document.getElementById("modalEditar").classList.add("hidden");
  onGuardarActual = null;
}

document.getElementById("formEditar").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!onGuardarActual) return;
  try {
    await onGuardarActual();
    cerrarModalEditar();
  } catch (err) { manejarError(err, "No se pudo guardar el cambio: "); }
});

// =========================================================
// MÓDULO: EVIDENCIAS MULTIMEDIA (MongoDB, archivos reales)
// =========================================================
let archivosSeleccionados = [];

window.previewFiles = function (input) {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";
  archivosSeleccionados = Array.from(input.files);
  renderPreviews();
};

function renderPreviews() {
  const container = document.getElementById("previewContainer");
  container.innerHTML = "";
  archivosSeleccionados.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.display = "inline-block";
    div.style.margin = "5px";

    const btnBorrar = `<button type="button" onclick="borrarArchivo(${index})" aria-label="Quitar archivo ${file.name}" style="position:absolute;top:-5px;right:-5px;background:var(--accent);color:white;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;">✕</button>`;

    if (file.type.startsWith("image/")) {
      div.innerHTML = `<img src="${url}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">`;
    } else if (file.type.startsWith("video/")) {
      div.innerHTML = `<video src="${url}" style="width:100px;height:100px;border-radius:6px;border:1px solid var(--border);object-fit:cover;"></video>`;
    } else {
      div.innerHTML = `<div style="width:100px;height:100px;border-radius:6px;border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:6px;box-sizing:border-box;"><span style="font-size:22px;">🎵</span><span style="font-size:10px;color:var(--text-faint);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${file.name}</span></div>`;
    }
    div.innerHTML += btnBorrar;
    container.appendChild(div);
  });
}

window.borrarArchivo = function (index) {
  archivosSeleccionados.splice(index, 1);
  renderPreviews();
};

document.getElementById("formEvidencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idAlerta = document.getElementById("evAlerta").value;
  const descripcion = document.getElementById("evDescripcion").value;

  if (!idAlerta) return notificar("Selecciona una alerta cerrada.", "warning");
  if (archivosSeleccionados.length === 0) return notificar("Selecciona al menos un archivo.", "warning");

  try {
    // El primer archivo va en el POST principal /evidencias (crea el
    // documento en MongoDB). El resto se agrega con /evidencias/:id/archivos.
    const formData = new FormData();
    formData.append("id_alerta", idAlerta);
    formData.append("descripcion", descripcion);
    formData.append("archivo", archivosSeleccionados[0]);
    const creada = await api("/evidencias", { method: "POST", body: formData });

    for (let i = 1; i < archivosSeleccionados.length; i++) {
      const fd = new FormData();
      fd.append("archivo", archivosSeleccionados[i]);
      await api(`/evidencias/${creada.id_evidencia}/archivos`, { method: "POST", body: fd });
    }

    archivosSeleccionados = [];
    document.getElementById("formEvidencia").reset();
    document.getElementById("previewContainer").innerHTML = "";
    cargarEvidencias();
    cargarHistorial();
    notificar("Evidencia guardada correctamente.", "success");
  } catch (err) { manejarError(err, "No se pudo guardar la evidencia: "); }
});

async function cargarEvidencias() {
  try {
    const cerradas = await api("/alertas/estado/cerrada");
    const select = document.getElementById("evAlerta");
    if (select) {
      select.innerHTML = cerradas.map(a => `<option value="${a.id_alerta}">${a.tipo} — ${(a.descripcion || "").slice(0, 40)}</option>`).join("");
    }

    const cont = document.getElementById("listaEvidencias");
    if (!cont) return;

    if (cerradas.length === 0) {
      cont.innerHTML = `<p style="color:var(--text-faint);font-size:13px;grid-column:1/-1">Aún no hay casos cerrados.</p>`;
      return;
    }

    const todas = [];
    for (const a of cerradas) {
      const evs = await api(`/evidencias/alerta/${a.id_alerta}`);
      todas.push(...evs);
    }

    cont.innerHTML = todas.length === 0
      ? `<p style="color:var(--text-faint);font-size:13px;grid-column:1/-1">Ningún caso cerrado tiene evidencia todavía.</p>`
      : todas.map(ev => `
        <div class="evidencia-card">
          <div class="evidencia-id">#${ev.id_evidencia.slice(0, 8)}</div>
          <p class="evidencia-desc">${ev.descripcion}</p>
          <div class="evidencia-archivos">
            ${(ev.archivos_multimedia || []).map(a => `
              <a class="archivo-chip" href="${FILES_BASE}${a.ruta_archivo}" target="_blank">${a.tipo === "video" ? "🎬" : "🖼️"} ${a.nombre_archivo}</a>
            `).join("")}
          </div>
        </div>
      `).join("");
  } catch (err) { console.warn(err.message); }
}

// =========================================================
// MÓDULO: HISTORIAL 360°
// =========================================================
let filtroHistorialTexto = "";
let filtroHistorialTipo = "";
let cacheHistorialCerradas = [];

async function cargarHistorial() {
  try {
    const cerradas = await api("/alertas/estado/cerrada");
    cacheHistorialCerradas = cerradas;
    let filtradas = cerradas;

    if (filtroHistorialTipo) filtradas = filtradas.filter(a => a.tipo === filtroHistorialTipo);
    if (filtroHistorialTexto) {
      const q = filtroHistorialTexto.toLowerCase();
      filtradas = filtradas.filter(a =>
        (a.descripcion || "").toLowerCase().includes(q) ||
        (a.direccion_referencial || "").toLowerCase().includes(q)
      );
    }

    const lista = document.getElementById("listaHistorial");
    const count = document.getElementById("countHistorial");
    if (count) count.textContent = filtradas.length;

    if (filtradas.length === 0) {
      const hayFiltro = filtroHistorialTipo || filtroHistorialTexto;
      lista.innerHTML = `<p style="color:var(--text-faint);padding:20px;">${hayFiltro ? "Ningún caso coincide con el filtro." : "No hay emergencias cerradas."}</p>`;
      return;
    }

    lista.innerHTML = filtradas.map(a => `
      <li class="alerta-item">
        <div class="alerta-item-top" style="cursor:pointer;" onclick="verHistorial('${a.id_alerta}')">
          <span class="alerta-tipo">${a.tipo}</span>
          <span class="alerta-estado estado-cerrada">cerrada</span>
        </div>
        <span class="alerta-desc" style="cursor:pointer;" onclick="verHistorial('${a.id_alerta}')">${a.descripcion}</span>
        <div class="alerta-item-acciones">
          <button class="btn-mini btn-mini-primary" onclick="verHistorial('${a.id_alerta}')">Ver Historial 360°</button>
          ${esAdministrador() ? `<button class="btn-mini btn-mini-close" onclick="eliminarDelHistorial('${a.id_alerta}')">Eliminar</button>` : ""}
        </div>
      </li>
    `).join("");
  } catch (err) { console.warn(err.message); }
}

document.getElementById("historialBusqueda").addEventListener("input", (e) => {
  filtroHistorialTexto = e.target.value.trim();
  cargarHistorial();
});
document.getElementById("historialFiltroTipo").addEventListener("change", (e) => {
  filtroHistorialTipo = e.target.value;
  cargarHistorial();
});

// Elimina una emergencia del Historial 360° — SOLO Administrador.
// El Operador puede ver el historial pero no tiene este botón disponible
// (ni en la lista ni en el modal); aunque intentara llamarlo a mano, el
// backend igual lo rechaza con 403 porque la ruta usa requireRole("administrador").
async function eliminarDelHistorial(idAlerta) {
  const ok = await confirmar("Esto elimina la emergencia del Historial 360° de forma permanente (incluida su evidencia). ¿Continuar?");
  if (!ok) return;
  try {
    await api(`/alertas/${idAlerta}`, { method: "DELETE" });
    document.getElementById("modalHistorial").classList.add("hidden");
    cargarHistorial();
    cargarPanelSupervisor();
    notificar("Emergencia eliminada del historial.", "success");
  } catch (err) { manejarError(err, "No se pudo eliminar del historial: "); }
}

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

  if (tabId === "info" && mapaHistorial) {
    setTimeout(() => mapaHistorial.invalidateSize(), 50);
  }
}

async function verHistorial(idAlerta) {
  const modal = document.getElementById("modalHistorial");
  modal.classList.remove("hidden");

  document.querySelectorAll(".modal-tab").forEach((btn, i) => btn.classList.toggle("active", i === 0));
  document.querySelectorAll(".modal-tab-content").forEach(content => content.classList.remove("active", "hidden"));
  document.getElementById("tab-info").classList.add("active");
  document.getElementById("tab-evidencias").classList.add("hidden");

  // Botón "Eliminar emergencia" del modal: solo visible para Administrador
  const btnEliminarModal = document.getElementById("btnEliminarHistorialModal");
  if (btnEliminarModal) {
    btnEliminarModal.classList.toggle("hidden", !esAdministrador());
    btnEliminarModal.onclick = () => eliminarDelHistorial(idAlerta);
  }

  try {
    const h = await api(`/historial/${idAlerta}`);
    const alerta = h.alerta || {};
    const recurso = h.recurso;
    const institucion = h.institucion ? normalizarClaves(h.institucion) : null;
    const sede = h.sede ? normalizarClaves(h.sede) : null;
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
          <h4>Recurso que atendió (PostgreSQL)</h4>
          ${recurso ? `<p>${recurso.tipo} — Placa ${recurso.placa}</p>` : `<p style="color:var(--text-faint)">No se asignó ningún recurso a esta alerta.</p>`}
        </div>
        <div class="modal-seccion">
          <h4>Institución / sede de derivación (Oracle)</h4>
          ${institucion ? `<p>${institucion.nombre} ${sede ? `— ${sede.direccion}` : ""}</p>` : `<p style="color:var(--text-faint)">No hubo derivación a ninguna institución.</p>`}
        </div>
      `;
    }

    if (!mapaHistorial) {
      mapaHistorial = L.map("mapaHistorial", { zoomControl: false, dragging: false }).setView([0, 0], 16);
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
        ? `<p style="color:var(--text-faint);text-align:center;padding:20px;">Sin evidencias.</p>`
        : evidencias.map(ev => `
          <div style="background:var(--bg);border:1px solid var(--border);padding:15px;border-radius:8px;margin-bottom:10px;">
            <p style="margin-bottom:12px;font-size:13px;">${ev.descripcion}</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${(ev.archivos_multimedia || []).map(a => {
                if (a.tipo === "video") return `<video src="${FILES_BASE}${a.ruta_archivo}" controls style="width:160px;height:100px;object-fit:cover;border-radius:6px;border:1px solid var(--border);"></video>`;
                return `<img src="${FILES_BASE}${a.ruta_archivo}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">`;
              }).join("") || "<span style='font-size:12px;color:var(--text-faint)'>Sin archivos</span>"}
            </div>
          </div>`).join("");
    }
  } catch (err) { manejarError(err, "Error al cargar el historial: "); }
}

document.getElementById("modalHistorial").addEventListener("click", (e) => {
  if (e.target.id === "modalHistorial") e.target.classList.add("hidden");
});

// =========================================================
// PANEL SUPERVISOR (ahora dentro del rol "operador" + "administrador")
// =========================================================
function casosPorTipo(alertas) {
  const etiquetas = { medica: "Médica", incendio: "Incendio", seguridad: "Seguridad", accidente: "Accidente" };
  return Object.keys(etiquetas).map(tipo => ({
    tipo, etiqueta: etiquetas[tipo], count: alertas.filter(a => a.tipo === tipo).length
  }));
}

function calcularTiempoPromedioResolucion(alertas) {
  const cerradas = alertas.filter(a => a.estado === "cerrada" && a.fecha_creacion && a.fecha_actualizacion);
  if (cerradas.length === 0) return null;
  const totalMs = cerradas.reduce((acc, a) => acc + (new Date(a.fecha_actualizacion) - new Date(a.fecha_creacion)), 0);
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
  if (!elTotal) return;

  try {
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
      ? formatearDuracion(tiempoProm) : "Sin casos cerrados aún";

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
  } catch (err) { console.warn(err.message); }
}

// =========================================================
// PUNTO 4: REACTIVIDAD — botones "Actualizar" + polling corto
// =========================================================
// Solución elegida para este stack (frontend estático sin build,
// backend REST sin WebSockets/SSE): polling corto (cada 9s) de las
// vistas con datos más volátiles (mapa de Alertas y Despacho),
// combinado con un botón "Actualizar" estético en cada módulo para
// forzar un refresco inmediato bajo demanda. Es la opción más simple
// y confiable de implementar sobre Express + fetch, sin agregar
// dependencias nuevas (Socket.io/SSE quedan como mejora futura,
// documentada en el README).

async function conSpinner(idBoton, fn) {
  const btn = document.getElementById(idBoton);
  if (btn) btn.classList.add("is-loading");
  try {
    await fn();
  } finally {
    if (btn) btn.classList.remove("is-loading");
  }
}

function refrescarModuloDeVistaActiva() {
  const vistaActiva = document.querySelector(".nav-item.active:not(.hidden)");
  const view = vistaActiva ? vistaActiva.dataset.view : null;
  if (view === "alertas" || view === "despacho") {
    cargarAlertas();
  }
}

function iniciarPolling() {
  if (pollingHandle) return;
  pollingHandle = setInterval(() => {
    if (document.visibilityState === "hidden") return;
    if (!TOKEN) return;
    refrescarModuloDeVistaActiva();
  }, POLLING_MS);
}

function detenerPolling() {
  if (pollingHandle) {
    clearInterval(pollingHandle);
    pollingHandle = null;
  }
}

const refrescoBotones = [
  ["btnActualizarMapa", () => Promise.all([cargarAlertas(), cargarSedes()])],
  ["btnActualizarDespacho", () => cargarAlertas()],
  ["btnActualizarOperadores", () => cargarOperadores()],
  ["btnActualizarRecursos", () => cargarRecursos()],
  ["btnActualizarInstituciones", () => cargarInstituciones()],
  ["btnActualizarSedes", () => cargarSedes()],
  ["btnActualizarEvidencias", () => cargarEvidencias()],
  ["btnActualizarHistorial", () => cargarHistorial()]
];

refrescoBotones.forEach(([id, fn]) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", () => conSpinner(id, fn));
});

document.getElementById("btnLogout").addEventListener("click", detenerPolling);
