const state = {
  publicWells: [],
  adminWells: [],
  token: sessionStorage.getItem("adminToken") || "",
  map: null,
  markers: new Map(),
  activeWell: null
};

const STATIC_MODE = location.hostname.endsWith("github.io") || location.protocol === "file:";
let staticWellsCache = null;

const $ = (id) => document.getElementById(id);

const fields = [
  "wellNumber",
  "name",
  "district",
  "section",
  "address",
  "latitude",
  "longitude",
  "purpose",
  "depthMeters",
  "diameterMm",
  "startedAt",
  "status",
  "managementUnit",
  "publicNote",
  "internalNote",
  "isPublic"
];

function api(path, options = {}) {
  if (STATIC_MODE) return staticApi(path, options);
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  return fetch(path, { ...options, headers }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "請求失敗");
    return data;
  });
}

async function staticApi(path, options = {}) {
  if (options.method && options.method !== "GET") {
    throw new Error("GitHub 測試版僅提供查詢功能");
  }
  const wells = await loadStaticWells();
  const url = new URL(path, location.origin);
  if (url.pathname.endsWith("/api/public/wells")) {
    return filterStaticWells(wells, Object.fromEntries(url.searchParams));
  }
  const detailMatch = /\/api\/public\/wells\/([^/]+)$/.exec(url.pathname);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const well = wells.find((item) => item.id === id && item.isPublic && item.status !== "停用");
    if (!well) throw new Error("查無井籍資料");
    return staticPublicWell(well);
  }
  if (url.pathname.endsWith("/api/admin/wells")) {
    return wells;
  }
  throw new Error("GitHub 測試版不支援此功能");
}

async function loadStaticWells() {
  if (!staticWellsCache) {
    const response = await fetch(`data/wells.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("無法讀取 GitHub 測試資料");
    staticWellsCache = await response.json();
  }
  return staticWellsCache;
}

function filterStaticWells(wells, query = {}) {
  const district = String(query.district || "").trim();
  const station = String(query.station || "").trim();
  const status = String(query.status || "").trim();
  return wells
    .filter((well) => well.isPublic && well.status !== "停用")
    .filter((well) => !district || well.district === district)
    .filter((well) => !station || well.station === station)
    .filter((well) => !status || well.status === status)
    .map(staticPublicWell);
}

function staticPublicWell(well) {
  const pdf = (well.attachments || []).find((file) => String(file.mimeType || "").includes("pdf"));
  return {
    ...well,
    waterRightCertificateUrl: pdf ? encodeURI(`data/attachments/${pdf.storedName}`) : "",
    photos: (well.photos || [])
      .filter((photo) => String(photo.mimeType || "").startsWith("image/"))
      .map((photo) => ({
        id: photo.id,
        name: photo.name,
        url: encodeURI(`data/attachments/${photo.storedName}`)
      }))
  };
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  if (viewId === "adminView" && state.token) loadAdminWells();
  if (viewId === "publicView") setTimeout(() => state.map?.invalidateSize(), 50);
}

const SERVICE_AREA_BOUNDS = [[23.95, 120.4], [24.8, 121.4]];
const SERVICE_AREA_POLYGONS = [
  [
    [24.04, 120.47], [24.34, 120.51], [24.46, 120.72], [24.45, 121.18],
    [24.25, 121.36], [24.06, 121.16], [23.99, 120.86], [24.0, 120.55]
  ],
  [
    [24.28, 120.55], [24.64, 120.62], [24.72, 120.78], [24.68, 121.18],
    [24.45, 121.25], [24.33, 121.1], [24.3, 120.85]
  ]
];

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    maxBounds: SERVICE_AREA_BOUNDS,
    maxBoundsViscosity: 1
  }).fitBounds(SERVICE_AREA_BOUNDS, { padding: [20, 20] });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);

}

function hasNumericCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function isPointInPolygon(latitude, longitude, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects = (latI > latitude) !== (latJ > latitude)
      && longitude < ((lngJ - lngI) * (latitude - latI)) / (latJ - latI) + lngI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isWithinServiceArea(latitude, longitude) {
  return hasNumericCoordinate(latitude, longitude)
    && SERVICE_AREA_POLYGONS.some((polygon) => isPointInPolygon(latitude, longitude, polygon));
}

function markerPosition(latitude, longitude) {
  return [
    Math.min(Math.max(latitude, SERVICE_AREA_BOUNDS[0][0]), SERVICE_AREA_BOUNDS[1][0]),
    Math.min(Math.max(longitude, SERVICE_AREA_BOUNDS[0][1]), SERVICE_AREA_BOUNDS[1][1])
  ];
}

function updateMap(wells) {
  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();
  const bounds = [];
  wells.forEach((well) => {
    if (!hasNumericCoordinate(well.latitude, well.longitude)) return;
    const isAbnormal = !isWithinServiceArea(well.latitude, well.longitude);
    const position = isAbnormal
      ? markerPosition(well.latitude, well.longitude)
      : [well.latitude, well.longitude];
    const marker = L.circleMarker(position, {
      radius: isAbnormal ? 9 : 8,
      color: "#ffffff",
      weight: 2,
      fillColor: isAbnormal ? "#c83e3e" : "#2f7fbf",
      fillOpacity: 0.9
    }).addTo(state.map);
    const warning = isAbnormal
      ? `<br><strong style="color:#b42318">座標異常</strong><br>原始座標：${well.latitude}, ${well.longitude}`
      : "";
    marker.bindPopup(`<strong>${well.wellNumber}</strong><br>${well.name}<br>${well.district || ""}${warning}`);
    marker.on("click", () => showPublicDetail(well.id));
    state.markers.set(well.id, marker);
    if (!isAbnormal) bounds.push(position);
  });
  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
  } else {
    state.map.fitBounds(SERVICE_AREA_BOUNDS, { padding: [20, 20] });
  }
}

function renderFilterOptions() {
  const fill = (id, values, label) => {
    const select = $(id);
    select.innerHTML = `<option value="">${label}</option>` + [...new Set(values.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-Hant"))
      .map((value) => `<option>${escapeHtml(value)}</option>`)
      .join("");
  };
  fill("stationFilter", state.publicWells.map((well) => well.station), "全部工作站");
  fill("statusFilter", [...state.publicWells.map((well) => well.status), "故障待修"], "全部狀態");
}

function renderPublicList(wells) {
  $("resultCount").textContent = `${wells.length} 筆`;
  $("publicResults").innerHTML = wells.length ? wells.map((well) => `
    <article class="well-card">
      <h3>${escapeHtml(well.wellNumber)} ${escapeHtml(well.name)}</h3>
      <div class="meta">
        <span class="tag">${escapeHtml(well.district)}</span>
        <span class="tag">${escapeHtml(well.status)}</span>
        ${hasNumericCoordinate(well.latitude, well.longitude) && !isWithinServiceArea(well.latitude, well.longitude)
          ? `<span class="tag tag-alert">座標異常</span>`
          : ""}
      </div>
      <p>${escapeHtml(well.address || well.section || "未填位置說明")}</p>
      <div class="card-actions">
        <button data-detail="${well.id}">查看資料</button>
        <button data-locate="${well.id}">定位</button>
        ${well.waterRightCertificateUrl ? `<button data-water-right="${well.waterRightCertificateUrl}">水權狀</button>` : ""}
      </div>
    </article>
  `).join("") : `<p class="empty">查無公開井籍資料。</p>`;
}

async function loadPublicWells(useFilters = false) {
  const params = new URLSearchParams();
  if (useFilters) {
    params.set("station", $("stationFilter").value);
    params.set("status", $("statusFilter").value);
  }
  const wells = await api(`/api/public/wells?${params}`);
  state.publicWells = wells;
  if (!useFilters) renderFilterOptions();
  renderPublicList(wells);
  updateMap(wells);
}

async function showPublicDetail(id) {
  const well = await api(`/api/public/wells/${id}`);
  state.activeWell = well;
  $("publicDetail").innerHTML = `
    <div class="panel-head">
      <h2>${escapeHtml(well.wellNumber)} ${escapeHtml(well.name)}</h2>
      <span>${escapeHtml(well.updatedAt?.slice(0, 10) || "")}</span>
    </div>
    <div class="detail-split">
      <div class="detail-grid">
        ${detailItem("地段/地址", well.address || well.section)}
        ${detailItem("座標系統", coordinateText(well))}
        ${detailItem("工作站", well.station)}
        ${detailItem("灌溉系統", well.irrigationSystem)}
        ${detailItem("井深", `${well.depthMeters || 0} m`)}
        ${detailItem("管徑", `${well.diameterMm || 0} mm`)}
        ${detailItem("抽水機馬力", well.pumpHorsepower ? `${well.pumpHorsepower} HP` : "")}
        ${detailItem("抽水機口徑", well.pumpOutletInch ? `${well.pumpOutletInch} 吋` : "")}
        ${detailItem("計畫出水量", well.planFlowCms ? `${well.planFlowCms} cms` : "")}
        ${detailItem("受益面積", well.benefitedAreaHa ? `${well.benefitedAreaHa} ha` : "")}
        ${detailItem("水權登記量", well.registeredFlowCms ? `${well.registeredFlowCms} cms` : "")}
        ${detailItem("水權狀號", well.waterRightNo)}
        ${detailItem("核准水權年限", well.waterRightPeriod)}
        ${detailItem("完工日期", well.completionDate)}
        ${detailItem("用電電號", well.electricityNo)}
        ${detailItem("農業用電", well.agriculturalPower)}
        ${detailItem("狀態", well.status)}
      </div>
      ${renderPhotos(well.photos)}
    </div>
  `;
  const marker = state.markers.get(id);
  if (marker) {
    state.map.setView(marker.getLatLng(), 15);
    marker.openPopup();
  }
}

function detailItem(label, value) {
  const content = Array.isArray(value)
    ? value.map((line) => `<span>${escapeHtml(line)}</span>`).join("")
    : escapeHtml(value || "未填");
  return `<div class="detail-item"><strong>${escapeHtml(label)}</strong>${content}</div>`;
}

function coordinateText(well) {
  const rows = [];
  if (hasNumericCoordinate(well.latitude, well.longitude)) {
    rows.push(`WGS84 經緯度：${well.latitude}, ${well.longitude}`);
  } else {
    rows.push("尚無有效座標");
  }
  if (well.twd97X && well.twd97Y) {
    rows.push(`TWD97 / TM2：X ${well.twd97X}, Y ${well.twd97Y}`);
  }
  return rows;
}

function renderPhotos(photos = []) {
  if (!photos.length) return "";
  return `
    <section class="photo-section">
      <h3>現場照片</h3>
      <div class="photo-grid">
        ${photos.map((photo) => `
          <figure>
            <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "現場照片")}" loading="lazy">
            <figcaption>${escapeHtml(photo.name || "現場照片")}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAdminList() {
  $("adminCount").textContent = `${state.adminWells.length} 筆`;
  $("adminList").innerHTML = state.adminWells.map((well) => `
    <article class="well-card">
      <h3>${escapeHtml(well.wellNumber)} ${escapeHtml(well.name)}</h3>
      <div class="meta">
        <span class="tag">${escapeHtml(well.district)}</span>
        <span class="tag">${escapeHtml(well.status)}</span>
        <span class="tag">${well.isPublic ? "公開" : "內部"}</span>
        <span class="tag">照片 ${well.photos?.length || 0}</span>
        <span class="tag">附件 ${well.attachments?.length || 0}</span>
      </div>
      <p>${escapeHtml(well.internalNote || well.publicNote || "無備註")}</p>
      <div class="card-actions">
        <button data-edit="${well.id}">編輯</button>
        ${(well.attachments || []).map((file) => `<button data-file="${file.id}">${escapeHtml(file.name)}</button>`).join("")}
      </div>
    </article>
  `).join("") || `<p class="empty">尚未建立井籍。</p>`;
}

async function loadAdminWells() {
  state.adminWells = await api("/api/admin/wells");
  renderAdminList();
}

function fillForm(well) {
  $("formTitle").textContent = well ? "編輯井籍" : "新增井籍";
  $("wellId").value = well?.id || "";
  fields.forEach((field) => {
    const input = $(field);
    if (!input) return;
    if (input.type === "checkbox") input.checked = Boolean(well?.[field] ?? true);
    else input.value = well?.[field] ?? "";
  });
  $("attachments").value = "";
  $("photos").value = "";
}

function readFiles(input) {
  const files = [...input.files];
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, size: file.size, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
}

async function saveWell(event) {
  event.preventDefault();
  const body = {};
  fields.forEach((field) => {
    const input = $(field);
    body[field] = input.type === "checkbox" ? input.checked : input.value;
  });
  body.attachments = await readFiles($("attachments"));
  body.photos = await readFiles($("photos"));
  const id = $("wellId").value;
  await api(id ? `/api/admin/wells/${id}` : "/api/admin/wells", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body)
  });
  fillForm(null);
  await loadAdminWells();
  await loadPublicWells();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

["stationFilter", "statusFilter"].forEach((id) => {
  $(id).addEventListener("change", () => loadPublicWells(true));
});
$("publicResults").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.detail || button.dataset.locate;
  if (button.dataset.detail) showPublicDetail(id);
  if (button.dataset.locate) {
    const marker = state.markers.get(id);
    if (marker) {
      state.map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    }
  }
  if (button.dataset.waterRight) {
    window.open(button.dataset.waterRight, "_blank");
  }
});

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: $("username").value, password: $("password").value })
  });
  state.token = result.token;
  sessionStorage.setItem("adminToken", state.token);
  $("loginPanel").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  await loadAdminWells();
});

$("wellForm").addEventListener("submit", saveWell);
$("resetForm").addEventListener("click", () => fillForm(null));
$("adminList").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.edit) {
    fillForm(state.adminWells.find((well) => well.id === button.dataset.edit));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (button.dataset.file) {
    window.open(`/api/admin/attachments/${button.dataset.file}`, "_blank");
  }
});

initMap();
fillForm(null);
if (state.token) {
  $("loginPanel").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
}
loadPublicWells();
if (STATIC_MODE) {
  setInterval(async () => {
    staticWellsCache = null;
    await loadPublicWells(true);
  }, 5 * 60 * 1000);
}
