const STORAGE_KEY = "visited_munis_v1";
const DATA_URL = "data/municipalities2025.topo.json";

const statusEl = document.getElementById("status");
const visitedCountEl = document.getElementById("visitedCount");
const totalCountEl = document.getElementById("totalCount");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const clearBtn = document.getElementById("clearBtn");

const visited = new Set(loadVisited());
const layerByCode = new Map();
let totalFeatures = 0;

const map = L.map("map", {
  zoomSnap: 0.5,
}).setView([36.2, 138.25], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

function loadVisited() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.warn("Failed to parse stored data", err);
  }
  return [];
}

function persistVisited() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visited)));
}

function getCode(props) {
  return (
    props.N03_007 ||
    props.N03_008 ||
    props.JIS ||
    props.jis ||
    props.code ||
    props.CODE ||
    null
  );
}

function getLabel(props) {
  const parts = [props.N03_001, props.N03_002, props.N03_003, props.N03_004];
  const fallback = props.name || props.NAME || "";
  const text = parts.filter(Boolean).join("");
  return text || fallback || "市町村";
}

function styleFor(code) {
  const isVisited = visited.has(code);
  return {
    color: "#806f5a",
    weight: 1,
    fillColor: isVisited ? "#2f6b5e" : "#d8cfc4",
    fillOpacity: isVisited ? 0.75 : 0.45,
  };
}

function updateStats() {
  let visitedCount = 0;
  visited.forEach((code) => {
    if (layerByCode.has(code)) visitedCount += 1;
  });
  visitedCountEl.textContent = visitedCount;
  totalCountEl.textContent = totalFeatures;
}

function updateStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#8a2f2f" : "";
}

function applyStyles() {
  layerByCode.forEach((layer, code) => {
    layer.setStyle(styleFor(code));
  });
}

function toggleVisited(code) {
  if (visited.has(code)) {
    visited.delete(code);
  } else {
    visited.add(code);
  }
  persistVisited();
  const layer = layerByCode.get(code);
  if (layer) layer.setStyle(styleFor(code));
  updateStats();
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

exportBtn.addEventListener("click", () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    visited: Array.from(visited),
  };
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
  downloadJson(payload, `jp-visited-${stamp}.json`);
});

importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.visited;
    if (!Array.isArray(list)) throw new Error("Invalid format");
    visited.clear();
    list.forEach((code) => visited.add(String(code)));
    persistVisited();
    applyStyles();
    updateStats();
    updateStatus("导入成功，已更新标记。", false);
  } catch (err) {
    console.error(err);
    updateStatus("导入失败，请确认 JSON 格式。", true);
  } finally {
    event.target.value = "";
  }
});

clearBtn.addEventListener("click", () => {
  visited.clear();
  persistVisited();
  applyStyles();
  updateStats();
  updateStatus("已清空所有标记。", false);
});

async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error("Data request failed");
    const topo = await res.json();
    const objName = topo.objects && Object.keys(topo.objects)[0];
    if (!objName) throw new Error("No objects in topojson");

    const geojson = topojson.feature(topo, topo.objects[objName]);

    totalFeatures = 0;

    L.geoJSON(geojson, {
      style: (feature) => {
        const code = String(getCode(feature.properties || {}) || "");
        return styleFor(code);
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const codeRaw = getCode(props);
        if (!codeRaw) return;
        const code = String(codeRaw);
        const name = getLabel(props);
        layer.bindTooltip(name, { sticky: true });
        layerByCode.set(code, layer);
        totalFeatures += 1;
        layer.on("click", () => toggleVisited(code));
      },
    }).addTo(map);

    if (geojson.bbox) {
      const [minX, minY, maxX, maxY] = geojson.bbox;
      map.fitBounds([
        [minY, minX],
        [maxY, maxX],
      ]);
    }

    updateStats();
    if (totalFeatures === 0) {
      updateStatus("数据为空，请先生成 data/municipalities2025.topo.json。", true);
    } else {
      updateStatus("加载完成，开始标记吧。", false);
    }
  } catch (err) {
    console.error(err);
    updateStatus("数据加载失败，请确认 data/municipalities2025.topo.json 已生成。", true);
  }
}

loadData();
