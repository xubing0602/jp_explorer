const DATA_URL = "data/municipalities2025.topo.json";
const PREFECTURE_URL = "data/N03-20250101_prefecture.geojson";
const CSV_URL = "data/visits.csv";

const statusEl = document.getElementById("status");
const visitedCountEl = document.getElementById("visitedCount");
const totalCountEl = document.getElementById("totalCount");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");

const levelByKey = new Map();
const layersByKey = new Map();
const metaByKey = new Map();
let records = [];
let totalFeatures = 0;
let dataReady = false;
let csvReady = false;
let csvMissing = false;

const LEVEL_STYLES = [
  { fill: "#e1e7f0", fillOpacity: 0.22 }, // 未去过
  { fill: "#9ec5ff", fillOpacity: 0.45 }, // 路过
  { fill: "#4fd1c5", fillOpacity: 0.55 }, // 接地
  { fill: "#22c55e", fillOpacity: 0.62 }, // 访问
  { fill: "#f59e0b", fillOpacity: 0.7 }, // 宿泊
  { fill: "#ef4444", fillOpacity: 0.75 }, // 居住
];

const map = L.map("map", {
  zoomSnap: 0.5,
}).setView([36.2, 138.25], 5);

const baseLayers = {
  "Carto Light": L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors © CARTO",
    }
  ),
  OpenStreetMap: L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }
  ),
  "OpenStreetMap JP": L.tileLayer("https://tile.openstreetmap.jp/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }),
};

baseLayers["Carto Light"].addTo(map);
L.control.layers(baseLayers, null, { position: "topright" }).addTo(map);

map.createPane("prefecture");
map.getPane("prefecture").style.zIndex = 450;

function updateStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#d46666" : "";
}

function updateReadyStatus() {
  if (!dataReady) return;
  if (csvReady) {
    updateStatus("加载完成，已读取 CSV。", false);
    return;
  }
  if (csvMissing) {
    updateStatus("未找到 CSV，已使用空数据。你可以在 data/visits.csv 中编辑。", true);
    return;
  }
  updateStatus("行政区加载完成，正在读取 CSV...", false);
}

function getKey(pref, muni) {
  return `${pref}||${muni}`;
}

function getPrefecture(props) {
  return props.N03_001 || "";
}

function getMunicipality(props) {
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
    color: "#4a5563",
    weight: 1,
    fillColor: style.fill,
    fillOpacity: style.fillOpacity,
  };
}

function applyStyles() {
  layersByKey.forEach((layers, key) => {
    const level = getLevel(key);
    const style = styleForLevel(level);
    layers.forEach((layer) => layer.setStyle(style));
  });
}

function updateStats() {
  let marked = 0;
  layersByKey.forEach((_, key) => {
    if (getLevel(key) > 0) marked += 1;
  });
  visitedCountEl.textContent = marked;
  totalCountEl.textContent = totalFeatures;
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

function toCsvValue(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\"")) {
    return `"${str.replace(/\"/g, "\"\"")}"`;
  }
  return str;
}

function serializeCsv(list) {
  const lines = ["都道府县,市町村,拜访程度"];
  list.forEach((row) => {
    lines.push(
      `${toCsvValue(row.pref)},${toCsvValue(row.muni)},${toCsvValue(row.level || "")}`
    );
  });
  return `${lines.join("\n")}\n`;
}

function rebuildRecordsFromMeta() {
  const rows = [];
  metaByKey.forEach((meta, key) => {
    rows.push({
      pref: meta.pref,
      muni: meta.muni,
      level: getLevel(key),
    });
  });
  rows.sort((a, b) => (a.pref === b.pref ? a.muni.localeCompare(b.muni) : a.pref.localeCompare(b.pref)));
  records = rows;
}

function applyRecords(list) {
  levelByKey.clear();
  records = list;
  list.forEach((row) => {
    const key = getKey(row.pref, row.muni);
    levelByKey.set(key, row.level || 0);
  });
  applyStyles();
  updateStats();
}

function downloadCsv(list) {
  const blob = new Blob([serializeCsv(list)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
  link.download = `jp-visits-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

exportBtn.addEventListener("click", () => {
  if (!records.length) rebuildRecordsFromMeta();
  const merged = records.map((row) => {
    const key = getKey(row.pref, row.muni);
    return { ...row, level: getLevel(key) };
  });
  downloadCsv(merged);
});

importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) throw new Error("Empty CSV");
    applyRecords(parsed);
    csvReady = true;
    csvMissing = false;
    updateReadyStatus();
  } catch (err) {
    console.error(err);
    updateStatus("CSV 导入失败，请确认三列格式。", true);
  } finally {
    event.target.value = "";
  }
});

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
    updateReadyStatus();
  }
}

async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error("Data request failed");
    const topo = await res.json();
    const objName = topo.objects && Object.keys(topo.objects)[0];
    if (!objName) throw new Error("No objects in topojson");

    const geojson = topojson.feature(topo, topo.objects[objName]);

    totalFeatures = 0;
    layersByKey.clear();
    metaByKey.clear();
    const counted = new Set();

    L.geoJSON(geojson, {
      style: (feature) => {
        const props = feature.properties || {};
        const pref = getPrefecture(props);
        const muni = getMunicipality(props);
        const key = getKey(pref, muni);
        return styleForLevel(getLevel(key));
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const pref = getPrefecture(props);
        const muni = getMunicipality(props);
        const key = getKey(pref, muni);
        if (!pref || !muni) return;

        if (!layersByKey.has(key)) layersByKey.set(key, new Set());
        layersByKey.get(key).add(layer);

        if (!metaByKey.has(key)) {
          metaByKey.set(key, {
            pref,
            muni,
            label: `${pref}${muni}`,
          });
        }

        if (!counted.has(key)) {
          counted.add(key);
          totalFeatures += 1;
        }

        const meta = metaByKey.get(key);
        if (meta?.label) layer.bindTooltip(meta.label, { sticky: true });
      },
    }).addTo(map);

    if (geojson.bbox) {
      const [minX, minY, maxX, maxY] = geojson.bbox;
      map.fitBounds([
        [minY, minX],
        [maxY, maxX],
      ]);
    }

    dataReady = true;
    applyStyles();
    updateStats();
    if (totalFeatures === 0) {
      updateStatus("数据为空，请先生成 data/municipalities2025.topo.json。", true);
    } else {
      updateReadyStatus();
    }
  } catch (err) {
    console.error(err);
    updateStatus("数据加载失败，请确认 data/municipalities2025.topo.json 已生成。", true);
  }
}

async function loadPrefectures() {
  try {
    const res = await fetch(PREFECTURE_URL);
    if (!res.ok) throw new Error("Prefecture request failed");
    const geojson = await res.json();
    L.geoJSON(geojson, {
      pane: "prefecture",
      interactive: false,
      style: {
        color: "#1f2937",
        weight: 2.6,
        opacity: 0.9,
        fillOpacity: 0,
      },
    }).addTo(map);
  } catch (err) {
    console.warn("Prefecture boundaries failed to load", err);
  }
}

loadData();
loadCsv();
loadPrefectures();
