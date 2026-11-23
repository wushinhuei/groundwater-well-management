import { openElectricityHistory } from "./electricity-history.js?v=8c757c9a9f8e";
const state = {
  publicWells: [],
  allPublicWells: [],
  adminWells: [],
  token: sessionStorage.getItem("adminToken") || "",
  map: null,
  markers: new Map(),
  activeWell: null,
  pumpingHistory: new Map(),
  pumpingHistoryLoaded: false,
  activeHistoryWaterRightNo: "",
  expiringOnly: false
};

const STATIC_MODE = location.hostname.endsWith("github.io") || location.protocol === "file:";
let staticWellsCache = null;
let pumpingHistoryPromise = null;
const RIVER_ORDER = ["大甲溪", "大安溪", "烏溪", "大里溪", "其他"];
const RIVER_OVERRIDES = {
  B0130304: "大安溪",
  B1150103: "大甲溪"
};

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

function riverSystem(well) {
  if (RIVER_OVERRIDES[well.waterRightNo]) return RIVER_OVERRIDES[well.waterRightNo];
  const irrigationSystem = String(well.irrigationSystem || "");
  return RIVER_ORDER.find((river) => river !== "其他" && irrigationSystem.startsWith(river)) || "其他";
}

function api(path, options = {}) {
  // Public queries use the published registry on localhost as well as GitHub Pages.
  if (STATIC_MODE || /^\/api\/public\/wells(?:\/|\?|$)/.test(path)) return staticApi(path, options);
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

async function loadPumpingHistory() {
  if (!pumpingHistoryPromise) {
    pumpingHistoryPromise = fetch(`data/pumping-history.json?v=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("無法讀取歷史抽水資料");
        return response.json();
      })
      .then((payload) => {
        const grouped = new Map();
        for (const record of payload.records || []) {
          const records = grouped.get(record.waterRightNo) || [];
          records.push(record);
          grouped.set(record.waterRightNo, records);
        }
        grouped.forEach((records) => records.sort((a, b) => b.yearMinguo - a.yearMinguo));
        state.pumpingHistory = grouped;
        state.pumpingHistoryLoaded = true;
        return grouped;
      })
      .catch((error) => {
        console.error(error);
        state.pumpingHistoryLoaded = true;
        return state.pumpingHistory;
      });
  }
  return pumpingHistoryPromise;
}

function filterStaticWells(wells, query = {}) {
  const district = String(query.district || "").trim();
  const river = String(query.river || "").trim();
  const station = String(query.station || "").trim();
  const status = String(query.status || "").trim();
  return wells
    .filter((well) => well.isPublic && well.status !== "停用")
    .filter((well) => !district || well.district === district)
    .filter((well) => !river || riverSystem(well) === river)
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

function focusMarker(marker) {
  marker.openPopup();
  state.map.setView(marker.getLatLng(), 15, { animate: true });
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

function fillFilterOptions(id, values, label, preferredValue = "") {
  const select = $(id);
  const uniqueValues = [...new Set(values.filter(Boolean))];
  select.innerHTML = `<option value="">${label}</option>` + uniqueValues
    .map((value) => `<option>${escapeHtml(value)}</option>`)
    .join("");
  select.value = uniqueValues.includes(preferredValue) ? preferredValue : "";
}

function renderStationFilterOptions(preferredValue = $("stationFilter").value) {
  const river = $("riverFilter").value;
  const stations = state.allPublicWells
    .filter((well) => !river || riverSystem(well) === river)
    .map((well) => well.station)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  fillFilterOptions("stationFilter", stations, "全部工作站", preferredValue);
}

function renderFilterOptions() {
  const selectedRiver = $("riverFilter").value;
  const selectedStation = $("stationFilter").value;
  const selectedStatus = $("statusFilter").value;
  const rivers = RIVER_ORDER.filter((river) => state.allPublicWells.some((well) => riverSystem(well) === river));
  fillFilterOptions("riverFilter", rivers, "全部溪系", selectedRiver);
  renderStationFilterOptions(selectedStation);
  const statuses = [...new Set([...state.allPublicWells.map((well) => well.status), "故障待修"].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  fillFilterOptions("statusFilter", statuses, "全部狀態", selectedStatus);
}

function applyPublicFilters() {
  const river = $("riverFilter").value;
  const station = $("stationFilter").value;
  const status = $("statusFilter").value;
  state.publicWells = state.allPublicWells.filter((well) =>
    (!river || riverSystem(well) === river)
    && (!station || well.station === station)
    && (!status || well.status === status)
  );
  renderCurrentPublicResults();
}

function waterRightEndDate(period) {
  const matches = [...String(period || "").matchAll(/(\d{2,4})[.\/-](\d{1,2})[.\/-](\d{1,2})/g)];
  if (!matches.length) return null;
  const match = matches[matches.length - 1];
  const rawYear = Number(match[1]);
  const year = rawYear < 1911 ? rawYear + 1911 : rawYear;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function waterRightEndLabel(period) {
  const matches = [...String(period || "").matchAll(/(\d{2,4})[.\/-](\d{1,2})[.\/-](\d{1,2})/g)];
  if (!matches.length) return "";
  const match = matches[matches.length - 1];
  return `${match[1]}.${String(match[2]).padStart(2, "0")}.${String(match[3]).padStart(2, "0")}`;
}

function expiringWells(wells, baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const cutoff = new Date(start);
  cutoff.setMonth(cutoff.getMonth() + 2);
  cutoff.setHours(23, 59, 59, 999);
  return wells.filter((well) => {
    const endDate = waterRightEndDate(well.waterRightPeriod);
    return endDate && endDate >= start && endDate <= cutoff;
  });
}

function renderCurrentPublicResults() {
  const expiring = expiringWells(state.allPublicWells);
  const wells = state.expiringOnly ? expiring : state.publicWells;
  const basicButton = $("basicFilterButton");
  const button = $("expiringFilterButton");
  button.textContent = `水權期限即將到期 ${expiring.length} 筆`;
  button.setAttribute("aria-pressed", String(state.expiringOnly));
  basicButton.setAttribute("aria-pressed", String(!state.expiringOnly));
  $("riverFilter").disabled = state.expiringOnly;
  $("stationFilter").disabled = state.expiringOnly;
  $("statusFilter").disabled = state.expiringOnly;
  $("resultTitle").textContent = state.expiringOnly ? "水權即將到期" : "查詢結果";
  renderPublicList(wells);
  updateMap(wells);
}

function renderPublicList(wells) {
  $("resultCount").textContent = `${wells.length} 筆`;
  $("publicResults").innerHTML = wells.length ? wells.map((well) => `
    <article class="well-card">
      <h3>${escapeHtml(well.wellNumber)} ${escapeHtml(well.name)}</h3>
      <div class="meta${state.expiringOnly ? " meta-expiry" : ""}">
        ${state.expiringOnly
          ? `<span class="tag tag-station">${escapeHtml(well.station || "未填寫")}站</span>
            <span class="tag tag-expiry">到期日 ${escapeHtml(waterRightEndLabel(well.waterRightPeriod))}</span>`
          : `${well.district ? `<span class="tag">${escapeHtml(well.district)}</span>` : ""}
            <span class="tag">${escapeHtml(well.status)}</span>
            ${!hasNumericCoordinate(well.latitude, well.longitude)
              ? `<span class="tag">座標待補</span>`
              : !isWithinServiceArea(well.latitude, well.longitude)
                ? `<span class="tag tag-alert">座標異常</span>`
                : ""}`}
      </div>
      <p>${escapeHtml(well.address || well.section || "未填位置說明")}</p>
      <div class="card-actions">
        <button data-detail="${well.id}">查看資料</button>
        ${hasNumericCoordinate(well.latitude, well.longitude) ? `<button data-locate="${well.id}">定位</button>` : ""}
        ${well.waterRightCertificateUrl ? `<button data-water-right="${well.waterRightCertificateUrl}">水權狀</button>` : ""}
      </div>
    </article>
  `).join("") : `<p class="empty">查無公開井籍資料。</p>`;
}

async function loadPublicWells(useFilters = false) {
  if (!useFilters) {
    const wells = await api("/api/public/wells");
    state.allPublicWells = wells;
    renderFilterOptions();
  }
  applyPublicFilters();
}

async function showPublicDetail(id) {
  const [well] = await Promise.all([
    api(`/api/public/wells/${id}`),
    loadPumpingHistory()
  ]);
  state.activeWell = well;
  const historyRecords = state.pumpingHistory.get(well.waterRightNo) || [];
  const hasHistory = historyRecords.length > 0;
  $("publicDetail").innerHTML = `
    <div class="panel-head">
      <h2>${escapeHtml(well.wellNumber)} ${escapeHtml(well.name)}</h2>
      <div class="detail-head-actions">
        <button type="button" class="history-open-button" data-pumping-history="${escapeHtml(well.waterRightNo)}" ${hasHistory ? "" : "disabled"}>
          ${hasHistory ? "歷史抽水紀錄" : "尚無歷史資料"}
        </button>
        <button type="button" class="history-open-button" data-electricity-history>歷史用電度數及費用</button>
        <span>${escapeHtml(well.updatedAt?.slice(0, 10) || "")}</span>
      </div>
    </div>
    <div class="detail-split">
      <div class="detail-grid">
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
    focusMarker(marker);
  }
}

function formatPumpingValue(value) {
  if (value == null) return "未填報";
  return `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value)} m³`;
}

function calculateMonthlyWaterRight(record, monthIndex) {
  const registeredFlowCms = Number(state.activeWell?.registeredFlowCms);
  if (!Number.isFinite(registeredFlowCms) || registeredFlowCms <= 0) return null;
  const westernYear = Number(record.yearMinguo) + 1911;
  const daysInMonth = new Date(westernYear, monthIndex + 1, 0).getDate();
  return registeredFlowCms * 86400 * daysInMonth;
}

function renderPumpingHistoryYear(record) {
  const values = record.monthlyM3 || [];
  const anomalies = new Map((record.anomalies || []).map((anomaly) => [anomaly.month, anomaly]));
  const numericValues = values.filter((value) => value != null);
  const maximum = Math.max(...numericValues, 0);
  $("pumpingHistorySummary").innerHTML = `
    <div><span>主管機關</span><strong>${escapeHtml(record.authority)}</strong></div>
    <div><span>年度合計</span><strong>${formatPumpingValue(record.sourceTotalM3 ?? numericValues.reduce((sum, value) => sum + value, 0))}</strong></div>
    <div><span>填報月份</span><strong>${numericValues.length} / 12</strong></div>
  `;
  $("pumpingHistoryChart").innerHTML = values.map((value, index) => {
    const anomaly = anomalies.get(index + 1);
    const percentage = value == null || maximum === 0 ? 0 : Math.max((value / maximum) * 100, value === 0 ? 0 : 3);
    const stateClass = `${value == null ? " missing" : value === 0 ? " zero" : ""}${anomaly ? " anomaly" : ""}`;
    const anomalyText = anomaly ? `；疑似異常：${anomaly.reasons.join("、")}` : "";
    return `
      <div class="history-bar-item${stateClass}" title="${index + 1}月：${escapeHtml(formatPumpingValue(value))}${escapeHtml(anomalyText)}">
        <span class="history-bar-value">${value == null ? "--" : new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(value)}</span>
        <span class="history-bar-track"><span class="history-bar" style="height:${percentage}%"></span></span>
        <span class="history-bar-month">${index + 1}月</span>
      </div>
    `;
  }).join("");
  $("pumpingHistoryRows").innerHTML = values.map((value, index) => {
    const anomaly = anomalies.get(index + 1);
    const monthlyWaterRight = calculateMonthlyWaterRight(record, index);
    return `
    <tr class="${anomaly ? "anomaly" : ""}" ${anomaly ? `title="疑似異常：${escapeHtml(anomaly.reasons.join("、"))}"` : ""}>
      <td>${index + 1}月</td>
      <td class="number-cell">${value == null ? "" : escapeHtml(new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value))}</td>
      <td class="number-cell water-right-cell" title="依水權登記量及當月天數換算">${monthlyWaterRight == null ? "" : escapeHtml(new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(monthlyWaterRight))}</td>
      <td><span class="reporting-status ${value == null ? "missing" : "reported"}">${value == null ? "未填報" : "已填報"}</span></td>
    </tr>
  `;
  }).join("");
}

function openPumpingHistory(waterRightNo) {
  const records = state.pumpingHistory.get(waterRightNo) || [];
  if (!records.length) return;
  state.activeHistoryWaterRightNo = waterRightNo;
  const well = state.activeWell;
  $("pumpingHistoryTitle").textContent = `${well?.wellNumber || waterRightNo} ${well?.name || ""}`;
  $("pumpingHistoryYear").innerHTML = records
    .map((record) => `<option value="${record.yearMinguo}">民國${record.yearMinguo}年</option>`)
    .join("");
  renderPumpingHistoryYear(records[0]);
  $("pumpingHistoryDialog").showModal();
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
      <div class="photo-grid ${photos.length === 1 ? "single" : ""}">
        ${photos.map((photo) => `
          <figure>
            <button type="button" class="photo-zoom" data-photo-url="${escapeHtml(photo.url)}" data-photo-name="${escapeHtml(photo.name || "現場照片")}" aria-label="放大${escapeHtml(photo.name || "現場照片")}">
              <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "現場照片")}" loading="lazy">
            </button>
            <figcaption>${escapeHtml(photo.name || "現場照片")}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function openPhotoLightbox(url, name) {
  const dialog = $("photoLightbox");
  $("photoLightboxImage").src = url;
  $("photoLightboxImage").alt = name;
  $("photoLightboxCaption").textContent = name;
  dialog.showModal();
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

$("riverFilter").addEventListener("change", () => {
  state.expiringOnly = false;
  renderStationFilterOptions();
  applyPublicFilters();
});
["stationFilter", "statusFilter"].forEach((id) => {
  $(id).addEventListener("change", () => {
    state.expiringOnly = false;
    applyPublicFilters();
  });
});
$("expiringFilterButton").addEventListener("click", () => {
  state.expiringOnly = true;
  $("publicDetail").innerHTML = "";
  renderCurrentPublicResults();
});
$("basicFilterButton").addEventListener("click", () => {
  state.expiringOnly = false;
  $("publicDetail").innerHTML = "";
  renderCurrentPublicResults();
});
$("publicResults").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.detail || button.dataset.locate;
  if (button.dataset.detail) showPublicDetail(id);
  if (button.dataset.locate) {
    const marker = state.markers.get(id);
    if (marker) {
      focusMarker(marker);
    }
  }
  if (button.dataset.waterRight) {
    window.open(button.dataset.waterRight, "_blank");
  }
});

$("publicDetail").addEventListener("click", (event) => {
  if (event.target.closest("[data-electricity-history]")) { openElectricityHistory(state.activeWell); return; }
  const historyButton = event.target.closest("[data-pumping-history]");
  if (historyButton && !historyButton.disabled) {
    openPumpingHistory(historyButton.dataset.pumpingHistory);
    return;
  }
  const button = event.target.closest("[data-photo-url]");
  if (!button) return;
  openPhotoLightbox(button.dataset.photoUrl, button.dataset.photoName || "現場照片");
});

$("pumpingHistoryYear").addEventListener("change", (event) => {
  const records = state.pumpingHistory.get(state.activeHistoryWaterRightNo) || [];
  const selected = records.find((record) => record.yearMinguo === Number(event.target.value));
  if (selected) renderPumpingHistoryYear(selected);
});
$("pumpingHistoryClose").addEventListener("click", () => $("pumpingHistoryDialog").close());
$("pumpingHistoryDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

$("photoLightboxClose").addEventListener("click", () => $("photoLightbox").close());
$("photoLightbox").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
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
loadPumpingHistory();
if (STATIC_MODE) {
  setInterval(async () => {
    staticWellsCache = null;
    await loadPublicWells();
  }, 5 * 60 * 1000);
}
