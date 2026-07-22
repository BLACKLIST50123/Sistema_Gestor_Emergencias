// =========================================================
// QUÉ HACE ESTE ARCHIVO (en simple)
// =========================================================
// Este archivo tiene toda la "inteligencia" para decidir qué
// recurso o qué sede conviene mandar primero cuando llega una
// emergencia. Calcula distancias entre puntos en el mapa (sin
// guardar nada en ninguna base de datos, solo lo calcula al
// momento) y ordena las listas de Recursos y de Sedes según el tipo
// de emergencia, para que el operador vea primero lo más
// conveniente en el módulo de Despacho.

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

// ==============================
// ORDENAR RECURSOS POR PRIORIDAD (ORDENA AMBULANCIAS/PATRULLAS/BOMBEROS)
// ==============================
// Recibe la lista de Recursos disponibles y el tipo de emergencia, y
// los reordena según la tabla PRIORIDAD_RECURSOS de arriba (por
// ejemplo, en una emergencia médica primero van las ambulancias). Lo
// que no está contemplado (tipo 'otro') queda al final.
function ordenarRecursosPorPrioridad(recursos, tipoEmergencia) {
  const orden = PRIORIDAD_RECURSOS[tipoEmergencia] || [];
  const rango = (tipo) => {
    const idx = orden.indexOf(tipo);
    return idx === -1 ? orden.length : idx;
  };
  return [...recursos].sort((a, b) => rango(a.tipo) - rango(b.tipo));
}

// ==============================
// DISTANCIA HAVERSINE KM (CALCULA LA DISTANCIA ENTRE DOS PUNTOS DEL MAPA)
// ==============================
// Recibe dos coordenadas (la de la alerta y la de una sede) y
// devuelve cuántos kilómetros hay entre ellas en línea recta. Es
// solo un cálculo matemático en memoria, no se guarda en ninguna
// base de datos: se usa nada más para mostrarle al operador qué tan
// lejos está cada sede.
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

// ==============================
// ORDENAR SEDES POR RAMA Y CERCANIA (ORDENA LAS SEDES A DERIVAR)
// ==============================
// Le calcula a cada sede qué tan lejos está de la alerta (usando
// distanciaHaversineKm) y arma el orden final: primero las sedes de
// la "rama" que tiene que ver con la emergencia (por ejemplo,
// hospitales si es médica), ordenadas de la más cercana a la más
// lejana, y después el resto de sedes, también por cercanía.
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

// ==============================
// CAPACIDAD VISIBLE (QUÉ DATO DE CAPACIDAD MOSTRAR SEGÚN LA SEDE)
// ==============================
// Decide qué etiqueta y qué número mostrar en la tarjeta de cada
// sede: si es un Hospital muestra "Camas", si es una Comisaría
// muestra "Calabozos", y si es de Bomberos no muestra ningún número
// de capacidad (no aplica).
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
