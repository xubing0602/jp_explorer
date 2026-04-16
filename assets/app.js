const DATA_URL = "data/municipalities2025.topo.json";
const PREFECTURE_URL = "data/prefectures2025.topo.json";
const CSV_URL = "data/visits.csv";

const statusEl = document.getElementById("status");
const visitedCountEl = document.getElementById("visitedCount");
const visitedPrefCountEl = document.getElementById("visitedPrefCount");
const exploredCountEl = document.getElementById("exploredCount");
const exploredPrefCountEl = document.getElementById("exploredPrefCount");
const totalCountEl = document.getElementById("totalCount");
const levelBarsEl = document.getElementById("levelBars");
const globalMetricsEl = document.getElementById("globalMetrics");
const prefCoverageBody = document.getElementById("prefCoverageBody");

const levelByKey = new Map();
const metaByKey = new Map();
let records = [];
let totalFeatures = 0;
let dataReady = false;
let csvReady = false;
let csvMissing = false;
let map;
let muniData;
let prefData;
let prefRowsCache = [];
let hoveredFeature = null;
let mapTooltipEl = null;

const sortState = {
  coverage: { key: "ratio", dir: "desc" },
};

const LEVEL_STYLES = [
  { fill: "#e1e7f0", fillOpacity: 0.2 },
  { fill: "#0664f0", fillOpacity: 0.45 },
  { fill: "#20b6a7", fillOpacity: 0.55 },
  { fill: "#b822c5", fillOpacity: 0.62 },
  { fill: "#f59e0b", fillOpacity: 0.7 },
  { fill: "#ef4444", fillOpacity: 0.75 },
];
const LEVEL_LABELS = ["未去过", "路过", "接地", "访问", "宿泊", "居住"];

function updateStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#d46666" : "";
}

function updateReadyStatus() {
  if (!dataReady) return;
  if (csvReady) {
    updateStatus("加载完成", false);
  } else if (csvMissing) {
    updateStatus("未找到文件，已使用空数据。请编辑 data/visits.csv。", true);
  } else {
    updateStatus("行政区加载完成，正在读取文件...", false);
  }
}

function getKey(pref, muni) {
  return `${pref}||${muni}`;
}

function getMunicipalityFromProps(props) {
  const county = props.N03_002 || "";
  const city = props.N03_003 || "";
  const ward = props.N03_004 || "";
  const isCityWard = city.endsWith("市") && ward.endsWith("区");
  if (isCityWard) return city;
  return `${county}${city}${ward}`;
}

function getLevel(key) {
  const level = levelByKey.get(key);
  if (typeof level === "number") return level;
  return 0;
}

function styleForLevel(level) {
  const safe = Math.min(5, Math.max(0, level || 0));
  const style = LEVEL_STYLES[safe] || LEVEL_STYLES[0];
  return {
    strokeColor: "#6a86a8",
    strokeOpacity: 0.7,
    strokeWeight: 1.5,
    fillColor: style.fill,
    fillOpacity: style.fillOpacity,
    clickable: true,
  };
}

function styleForFeature(feature) {
  const base = styleForLevel(feature.getProperty("level") || 0);
  if (feature.getProperty("hovered")) {
    return {
      ...base,
      strokeColor: "#6be3ff",
      strokeOpacity: 1,
      strokeWeight: 2.6,
      fillOpacity: Math.min(0.95, base.fillOpacity + 0.18),
    };
  }
  return base;
}

function ensureMapTooltip() {
  if (mapTooltipEl) return mapTooltipEl;
  const tooltip = document.createElement("div");
  tooltip.className = "map-tooltip";
  tooltip.innerHTML = `
    <div class="map-tooltip-title"></div>
    <div class="map-tooltip-meta"></div>
  `;
  document.querySelector(".map-wrap")?.appendChild(tooltip);
  mapTooltipEl = tooltip;
  return mapTooltipEl;
}

function showHoverTooltip(event) {
  const tooltip = ensureMapTooltip();
  if (!tooltip || !event || !event.feature || !event.domEvent) return;
  const titleEl = tooltip.querySelector(".map-tooltip-title");
  const metaEl = tooltip.querySelector(".map-tooltip-meta");
  const label = event.feature.getProperty("label") || "市町村";
  const level = event.feature.getProperty("level") || 0;
  if (titleEl) titleEl.textContent = label;
  if (metaEl) metaEl.textContent = `拜访程度 · ${LEVEL_LABELS[level] || "未去过"}`;

  const mapRect = document.getElementById("map")?.getBoundingClientRect();
  if (!mapRect) return;
  const x = event.domEvent.clientX - mapRect.left + 14;
  const y = event.domEvent.clientY - mapRect.top + 14;
  tooltip.style.transform = `translate(${x}px, ${y}px)`;
  tooltip.classList.add("visible");
}

function hideHoverTooltip() {
  if (!mapTooltipEl) return;
  mapTooltipEl.classList.remove("visible");
}

function clearHoveredFeature() {
  if (!hoveredFeature) return;
  hoveredFeature.setProperty("hovered", false);
  hoveredFeature = null;
}

function applyLevelsToFeatures() {
  if (!muniData) return;
  muniData.forEach((feature) => {
    const key = feature.getProperty("key");
    if (!key) return;
    const level = getLevel(key);
    feature.setProperty("level", level);
  });
}

function parseCsvLine(line) {
  const out = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        buf += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((s) => s.trim());
  const hasHeader =
    header[0]?.includes("都道府县") ||
    header[1]?.includes("市町村") ||
    header[2]?.includes("拜访");
  const start = hasHeader ? 1 : 0;
  const parsed = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const pref = (cols[0] || "").trim();
    const muni = (cols[1] || "").trim();
    if (!pref || !muni) continue;
    const rawLevel = (cols[2] || "").trim();
    const num = Number.parseInt(rawLevel, 10);
    const level = Number.isFinite(num) ? Math.min(5, Math.max(0, num)) : 0;
    parsed.push({ pref, muni, level });
  }
  return parsed;
}

function applyRecords(list) {
  levelByKey.clear();
  records = list;
  list.forEach((row) => {
    const key = getKey(row.pref, row.muni);
    levelByKey.set(key, row.level || 0);
  });
  applyLevelsToFeatures();
  refreshAnalytics();
}

function buildPrefStats() {
  const stats = new Map();
  metaByKey.forEach((meta, key) => {
    let entry = stats.get(meta.pref);
    if (!entry) {
      entry = { pref: meta.pref, total: 0, visited: 0, sum: 0, explored: 0 };
      stats.set(meta.pref, entry);
    }
    entry.total += 1;
    const level = getLevel(key);
    if (level > 0) {
      entry.visited += 1;
      entry.sum += level;
    }
    if (level >= 3) {
      entry.explored += 1;
    }
  });
  const rows = Array.from(stats.values()).map((entry) => ({
    ...entry,
    ratio: entry.total ? entry.visited / entry.total : 0,
    avg: entry.visited ? entry.sum / entry.visited : 0,
    exploredRatio: entry.total ? entry.explored / entry.total : 0,
  }));
  rows.sort((a, b) => a.pref.localeCompare(b.pref));
  return rows;
}

function updateLevelBars(levelCounts) {
  if (!levelBarsEl) return;
  const labels = ["未去过", "路过", "接地", "访问", "宿泊", "居住"];
  const max = Math.max(...levelCounts, 1);
  levelBarsEl.innerHTML = "";
  levelCounts.forEach((count, idx) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = labels[idx];
    const bar = document.createElement("div");
    bar.className = `bar level-${idx}`;
    bar.style.width = `${(count / max) * 100}%`;
    const value = document.createElement("div");
    value.className = "bar-value";
    value.textContent = `${count}`;
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(value);
    levelBarsEl.appendChild(row);
  });
}

function updateGlobalMetrics(marked, visitedPref, avgLevel, explored, exploredPref) {
  if (!globalMetricsEl) return;
  const ratio = totalFeatures ? (marked / totalFeatures) * 100 : 0;
  const exploredRatio = totalFeatures ? (explored / totalFeatures) * 100 : 0;
  const ratioPref = totalFeatures ? (visitedPref / 47) * 100 : 0;
  const exploredRatioPref = totalFeatures ? (exploredPref / 47) * 100 : 0;
  globalMetricsEl.innerHTML = `
    <div class="metric"><span>已解锁市町村</span><strong>${marked} (${ratio.toFixed(1)}%)</strong> </div>
    <div class="metric"><span>已解锁县</span><strong>${visitedPref} (${ratioPref.toFixed(1)}%)</strong></div>
    <div class="metric"><span>已探索市町村</span><strong>${explored} (${exploredRatio.toFixed(1)}%)</strong></div>
    <div class="metric"><span>已探索县</span><strong>${exploredPref} (${exploredRatioPref.toFixed(1)}%)</strong></div>
    <div class="metric"><span>平均解锁程度</span><strong>${avgLevel.toFixed(2)}</strong></div>
  `;
}

function sortRows(rows, state) {
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    const dir = state.dir === "asc" ? 1 : -1;
    const key = state.key;
    if (key === "pref") return a.pref.localeCompare(b.pref) * dir;
    return (a[key] - b[key]) * dir;
  });
  return sorted;
}

function renderCoverageTable(rows) {
  if (!prefCoverageBody) return;
  const sorted = sortRows(rows, sortState.coverage);
  prefCoverageBody.innerHTML = "";
  sorted.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.pref}</td>
      <td>${row.total}</td>
      <td>${row.visited}</td>
      <td>${(row.ratio * 100).toFixed(1)}%</td>
      <td>${row.explored}</td>
      <td>${(row.exploredRatio * 100).toFixed(1)}%</td>
      <td>${row.avg.toFixed(2)}</td>
    `;
    prefCoverageBody.appendChild(tr);
  });
}

function refreshAnalytics() {
  if (!dataReady) return;
  let marked = 0;
  let sumLevels = 0;
  let visitedCountForAvg = 0;
  let explored = 0;
  const levelCounts = [0, 0, 0, 0, 0, 0];

  metaByKey.forEach((_, key) => {
    const level = getLevel(key);
    levelCounts[level] += 1;
    if (level > 0) {
      marked += 1;
      sumLevels += level;
      visitedCountForAvg += 1;
    }
    if (level >= 3) {
      explored += 1;
    }
  });

  const prefRows = buildPrefStats();
  prefRowsCache = prefRows;
  const visitedPref = prefRows.filter((row) => row.visited > 0).length;
  const exploredPref = prefRows.filter((row) => row.explored > 0).length;
  const avgLevel = visitedCountForAvg ? sumLevels / visitedCountForAvg : 0;

  visitedCountEl.textContent = marked;
  totalCountEl.textContent = totalFeatures;
  visitedPrefCountEl.textContent = visitedPref;
  exploredCountEl.textContent = explored;
  exploredPrefCountEl.textContent = exploredPref;

  updateLevelBars(levelCounts);
  updateGlobalMetrics(marked, visitedPref, avgLevel, explored, exploredPref);
  renderCoverageTable(prefRows);
}

function setupSortHandlers() {
  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const table = btn.dataset.table;
      const key = btn.dataset.key;
      const state = sortState[table];
      if (!state) return;
      if (state.key === key) {
        state.dir = state.dir === "asc" ? "desc" : "asc";
      } else {
        state.key = key;
        state.dir = key === "pref" ? "asc" : "desc";
      }
      renderCoverageTable(prefRowsCache);
    });
  });
}

function scheduleChunk(callback) {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(callback, { timeout: 120 });
  } else {
    setTimeout(callback, 16);
  }
}

async function loadCsv() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error("CSV request failed");
    const text = await res.text();
    const parsed = parseCsv(text);
    applyRecords(parsed);
    csvReady = true;
    updateReadyStatus();
  } catch (err) {
    console.warn(err);
    csvMissing = true;
    applyRecords([]);
    updateReadyStatus();
  }
}

async function loadMunicipalities() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("Data request failed");
  const topo = await res.json();
  const objName = topo.objects && Object.keys(topo.objects)[0];
  if (!objName) throw new Error("No objects in topojson");
  const geojson = topojson.feature(topo, topo.objects[objName]);
  if (geojson.bbox && map) {
    const [minX, minY, maxX, maxY] = geojson.bbox;
    const bounds = new google.maps.LatLngBounds(
      { lat: minY, lng: minX },
      { lat: maxY, lng: maxX }
    );
    map.fitBounds(bounds);
  }
  const features = geojson.features || [];
  let index = 0;
  const counted = new Set();
  totalFeatures = 0;
  metaByKey.clear();

  const processChunk = () => {
    const slice = features.slice(index, index + 1600);
    if (!slice.length) {
      dataReady = true;
      refreshAnalytics();
      updateReadyStatus();
      return;
    }
    const added = muniData.addGeoJson({
      type: "FeatureCollection",
      features: slice,
    });
    added.forEach((feature) => {
      const pref = feature.getProperty("N03_001") || "";
      const muni = getMunicipalityFromProps({
        N03_002: feature.getProperty("N03_002") || "",
        N03_003: feature.getProperty("N03_003") || "",
        N03_004: feature.getProperty("N03_004") || "",
      });
      if (!pref || !muni) return;
      const key = getKey(pref, muni);
      feature.setProperty("key", key);
      feature.setProperty("level", getLevel(key));
      feature.setProperty("label", `${pref}${muni}`);
      feature.setProperty("hovered", false);
      if (!metaByKey.has(key)) {
        metaByKey.set(key, { pref, muni });
      }
      if (!counted.has(key)) {
        counted.add(key);
        totalFeatures += 1;
      }
    });
    index += slice.length;
    scheduleChunk(processChunk);
  };

  scheduleChunk(processChunk);
}

async function loadPrefectures() {
  try {
    const res = await fetch(PREFECTURE_URL);
    if (!res.ok) throw new Error("Prefecture request failed");
    const topo = await res.json();
    const objName = topo.objects && Object.keys(topo.objects)[0];
    if (!objName) throw new Error("No objects in prefecture topojson");
    const geojson = topojson.feature(topo, topo.objects[objName]);
    prefData.addGeoJson(geojson);
  } catch (err) {
    console.warn("Prefecture boundaries failed to load", err);
  }
}

function initMap() {
  if (!window.google || !google.maps) {
    updateStatus("Google Maps API 未加载，请检查 API Key。", true);
    return;
  }
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 36.2, lng: 138.25 },
    zoom: 5,
    mapTypeId: "roadmap",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    // below style is a modified version of "Night Mode" from Google Maps styling wizard: https://mapstyle.withgoogle.com/
    styles: [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#242f3e"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#746855"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#242f3e"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#d59563"
      }
    ]
  },
  {
    "featureType": "poi",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#d59563"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#263c3f"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#6b9a76"
      }
    ]
  },
  {
    "featureType": "road",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#38414e"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#212a37"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9ca5b3"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#746855"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#1f2835"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#f3d19c"
      }
    ]
  },
  {
    "featureType": "transit",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "transit",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#2f3948"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "stylers": [
      {
        "visibility": "on"
      },
      {
        "weight": 3
      }
    ]
  },
  {
    "featureType": "transit.station",
    "stylers": [
      {
        "visibility": "on"
      }
    ]
  },
  {
    "featureType": "transit.station",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#d59563"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#17263c"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#515c6d"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#17263c"
      }
    ]
  }
]
  }
)

;

  muniData = new google.maps.Data({ map });
  prefData = new google.maps.Data({ map });
  muniData.setStyle((feature) => styleForFeature(feature));
  muniData.addListener("mouseover", (event) => {
    clearHoveredFeature();
    hoveredFeature = event.feature;
    hoveredFeature.setProperty("hovered", true);
    showHoverTooltip(event);
  });
  muniData.addListener("mouseout", () => {
    clearHoveredFeature();
    hideHoverTooltip();
  });
  prefData.setStyle({
    strokeColor: "#3b82f6",
    strokeOpacity: 0.8,
    strokeWeight: 2.5,
    fillOpacity: 0,
    clickable: false,
  });

  setupSortHandlers();
  loadCsv();
  loadMunicipalities().catch((err) => {
    console.error(err);
    updateStatus("数据加载失败，请确认 data/municipalities2025.topo.json 已生成。", true);
  });
  loadPrefectures();
}

initMap();
