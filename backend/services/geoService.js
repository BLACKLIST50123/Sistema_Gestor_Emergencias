/**
 * =========================================================
 * SERVICIO DE GEOLOCALIZACIÓN Y PRIORIDADES DE DESPACHO
 * =========================================================
 *
 * PUNTO 1 de la actualización pedida:
 *  - Fórmula de Haversine para calcular distancia en línea recta
 *    (KM) entre la alerta y cada Sede. Este dato NUNCA se persiste
 *    en ninguna base de datos: se calcula al vuelo en cada request
 *    y se envía solo como información adicional al frontend.
 *  - Reglas de prioridad de RECURSOS (Postgres) según el tipo de
 *    emergencia, para ordenar el módulo de Despacho.
 *  - Reglas de prioridad de SEDES (Oracle) según el tipo de
 *    emergencia: primero la rama afín (misma naturaleza que la
 *    emergencia), ordenada por cercanía, y luego el resto también
 *    por cercanía.
 */

// -------------------------------------------------
// Orden de prioridad de RECURSOS por tipo de emergencia
// -------------------------------------------------
// Las claves coinciden con Recursos.tipo en PostgreSQL
// ('ambulancia','patrulla','bomberos'); 'otro' siempre va al final.
const PRIORIDAD_RECURSOS = {
  medica: ["ambulancia", "bomberos", "patrulla"],
  incendio: ["bomberos", "patrulla", "ambulancia"],
  seguridad: ["patrulla", "ambulancia", "bomberos"],
  accidente: ["ambulancia", "patrulla", "bomberos"]
};

// -------------------------------------------------
// Rama institucional afín por tipo de emergencia
// -------------------------------------------------
// Las claves coinciden con Instituciones.tipo en Oracle
// ('Hospital','Comisaria','Bomberos').
const RAMA_AFIN_POR_EMERGENCIA = {
  medica: "Hospital",
  incendio: "Bomberos",
  seguridad: "Comisaria",
  accidente: "Hospital" // Punto 1: "Accidente: Hospitales más cercanos primero"
};

/**
 * Ordena una lista de Recursos disponibles según la prioridad de
 * despacho definida para el tipo de emergencia. Los tipos no
 * contemplados en la lista de prioridad (ej. 'otro') quedan al final,
 * en el mismo orden relativo en que llegaron.
 *
 * @param {Array<object>} recursos - filas de Recursos (Postgres)
 * @param {string} tipoEmergencia - 'medica'|'incendio'|'seguridad'|'accidente'
 * @returns {Array<object>} copia ordenada
 */
function ordenarRecursosPorPrioridad(recursos, tipoEmergencia) {
  const orden = PRIORIDAD_RECURSOS[tipoEmergencia] || [];
  const rango = (tipo) => {
    const idx = orden.indexOf(tipo);
    return idx === -1 ? orden.length : idx;
  };
  return [...recursos].sort((a, b) => rango(a.tipo) - rango(b.tipo));
}

/**
 * Distancia en línea recta (KM) entre dos coordenadas usando la
 * Fórmula de Haversine. No se guarda en ninguna BD: es un dato
 * calculado en memoria, solo para informar al operador.
 */
function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) {
    return null;
  }
  const R = 6371; // radio medio de la Tierra en KM
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula la distancia Haversine de cada sede a un punto de origen
 * (la alerta) y las ordena: primero las de la rama institucional
 * afín al tipo de emergencia (ordenadas por cercanía), luego el
 * resto de sedes también ordenadas por cercanía.
 *
 * @param {Array<object>} sedes - cada sede debe traer { latitud, longitud, tipo_institucion, ... }
 * @param {string} tipoEmergencia
 * @param {number} latOrigen
 * @param {number} lngOrigen
 * @returns {Array<object>} sedes con distancia_km agregada, ya ordenadas
 */
function ordenarSedesPorRamaYCercania(sedes, tipoEmergencia, latOrigen, lngOrigen) {
  const ramaAfin = RAMA_AFIN_POR_EMERGENCIA[tipoEmergencia] || null;

  const conDistancia = sedes.map((s) => ({
    ...s,
    distancia_km: distanciaHaversineKm(latOrigen, lngOrigen, s.latitud, s.longitud)
  }));

  const esAfin = (s) => ramaAfin && s.tipo_institucion === ramaAfin;

  const afines = conDistancia.filter(esAfin);
  const resto = conDistancia.filter((s) => !esAfin(s));

  const porCercania = (a, b) => {
    // Sedes sin coordenadas (distancia null) van al final de su grupo
    if (a.distancia_km === null && b.distancia_km === null) return 0;
    if (a.distancia_km === null) return 1;
    if (b.distancia_km === null) return -1;
    return a.distancia_km - b.distancia_km;
  };

  afines.sort(porCercania);
  resto.sort(porCercania);

  return [...afines, ...resto];
}

/**
 * Determina qué campo de capacidad debe mostrarse para una sede,
 * según el tipo de institución dueña de esa sede.
 * Hospital -> camas | Comisaria -> calabozos | Bomberos -> ninguno
 */
function capacidadVisible(tipoInstitucion, sede) {
  if (tipoInstitucion === "Hospital") {
    return { etiqueta: "Camas", valor: sede.camas_disponibles ?? 0 };
  }
  if (tipoInstitucion === "Comisaria") {
    return { etiqueta: "Calabozos", valor: sede.calabozos_disponibles ?? 0 };
  }
  return { etiqueta: null, valor: null };
}

module.exports = {
  PRIORIDAD_RECURSOS,
  RAMA_AFIN_POR_EMERGENCIA,
  ordenarRecursosPorPrioridad,
  distanciaHaversineKm,
  ordenarSedesPorRamaYCercania,
  capacidadVisible
};
