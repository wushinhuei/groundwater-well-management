import { randomUUID } from "node:crypto";

const PUBLIC_FIELDS = [
  "id",
  "wellNumber",
  "name",
  "station",
  "district",
  "section",
  "address",
  "latitude",
  "longitude",
  "twd97X",
  "twd97Y",
  "depthMeters",
  "diameterMm",
  "pumpHorsepower",
  "pumpOutletInch",
  "planFlowCms",
  "benefitedAreaHa",
  "registeredFlowCms",
  "irrigationSystem",
  "waterRightNo",
  "waterRightPeriod",
  "nextApplicationPeriod",
  "completionDate",
  "constructionYear",
  "electricityNo",
  "agriculturalPower",
  "photos",
  "startedAt",
  "status",
  "updatedAt"
];

export function publicWell(well) {
  const result = Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, well[field]]));
  result.nextApplicationPeriod = well.nextApplicationPeriod || nextApplicationFromWaterRightPeriod(well.waterRightPeriod);
  const waterRightFile = (well.attachments || []).find((file) => String(file.mimeType || "").includes("pdf"));
  result.waterRightCertificateUrl = waterRightFile ? `/api/public/water-rights/${well.id}` : "";
  result.photos = (well.photos || [])
    .filter((photo) => String(photo.mimeType || "").startsWith("image/"))
    .map((photo) => ({
      id: photo.id,
      name: photo.name,
      url: `/api/public/photos/${photo.id}`
    }));
  return result;
}

export function nextApplicationFromWaterRightPeriod(period) {
  const text = String(period || "");
  const dates = [...text.matchAll(/(\d{2,3})[./](\d{1,2})[./](\d{1,2})/g)];
  const end = dates.at(-1);
  if (!end) return "";
  const rocYear = Number(end[1]);
  const month = Number(end[2]);
  const day = Number(end[3]);
  if (!Number.isFinite(rocYear) || !Number.isFinite(month) || !Number.isFinite(day)) return "";

  const westernYear = rocYear + 1911;
  const date = new Date(Date.UTC(westernYear, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() - 3);
  const nextRocYear = date.getUTCFullYear() - 1911;
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextRocYear}.${nextMonth}.${nextDay}`;
}

export function getPublicWell(wells, id) {
  const well = wells.find((item) => item.id === id && item.isPublic && item.status !== "停用");
  return well ? publicWell(well) : null;
}

export function filterPublicWells(wells, query = {}) {
  const keyword = String(query.keyword || "").trim().toLowerCase();
  const district = String(query.district || "").trim();
  const station = String(query.station || "").trim();
  const status = String(query.status || "").trim();

  return wells
    .filter((well) => well.isPublic && well.status !== "停用")
    .filter((well) => !keyword || [well.wellNumber, well.name, well.address, well.section].some((value) => String(value || "").toLowerCase().includes(keyword)))
    .filter((well) => !district || well.district === district)
    .filter((well) => !station || well.station === station)
    .filter((well) => !status || well.status === status)
    .map(publicWell);
}

export function normalizeWell(input) {
  return {
    wellNumber: String(input.wellNumber || "").trim(),
    name: String(input.name || "").trim(),
    station: String(input.station || "").trim(),
    district: String(input.district || "").trim(),
    section: String(input.section || "").trim(),
    address: String(input.address || "").trim(),
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    twd97X: String(input.twd97X || "").trim(),
    twd97Y: String(input.twd97Y || "").trim(),
    purpose: String(input.purpose || "").trim(),
    depthMeters: Number(input.depthMeters || 0),
    diameterMm: Number(input.diameterMm || 0),
    pumpHorsepower: Number(input.pumpHorsepower || 0),
    pumpOutletInch: Number(input.pumpOutletInch || 0),
    planFlowCms: Number(input.planFlowCms || 0),
    benefitedAreaHa: Number(input.benefitedAreaHa || 0),
    registeredFlowCms: Number(input.registeredFlowCms || 0),
    irrigationSystem: String(input.irrigationSystem || "").trim(),
    waterRightNo: String(input.waterRightNo || "").trim(),
    waterRightPeriod: String(input.waterRightPeriod || "").trim(),
    nextApplicationPeriod: String(input.nextApplicationPeriod || "").trim(),
    completionDate: String(input.completionDate || "").trim(),
    constructionYear: String(input.constructionYear || "").trim(),
    electricityNo: String(input.electricityNo || "").trim(),
    agriculturalPower: String(input.agriculturalPower || "").trim(),
    startedAt: String(input.startedAt || "").trim(),
    status: String(input.status || "使用中").trim(),
    managementUnit: String(input.managementUnit || "").trim(),
    publicNote: String(input.publicNote || "").trim(),
    internalNote: String(input.internalNote || "").trim(),
    isPublic: Boolean(input.isPublic)
  };
}

export function createWell(input, actor) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    ...normalizeWell(input),
    attachments: input.attachments || [],
    photos: input.photos || [],
    auditTrail: [{ action: "created", actor, at: now }],
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  };
}

export function updateWell(existing, input, actor) {
  const now = new Date().toISOString();
  const existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
  const incomingAttachments = Array.isArray(input.attachments) ? input.attachments : [];
  const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
  const incomingPhotos = Array.isArray(input.photos) ? input.photos : [];
  return {
    ...existing,
    ...normalizeWell({ ...existing, ...input }),
    attachments: [...existingAttachments, ...incomingAttachments],
    photos: [...existingPhotos, ...incomingPhotos],
    auditTrail: [...(existing.auditTrail || []), { action: "updated", actor, at: now }],
    updatedAt: now,
    updatedBy: actor
  };
}

export function seedWells() {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-da-an-001",
      wellNumber: "GW-DA-001",
      name: "大安溪右岸一號井",
      district: "后里區",
      section: "月眉段",
      address: "臺中市后里區月眉段示範點",
      latitude: 24.3158,
      longitude: 120.7202,
      purpose: "灌溉",
      depthMeters: 68,
      diameterMm: 250,
      startedAt: "2018-06-15",
      status: "使用中",
      managementUnit: "管理處地下水井小組",
      publicNote: "供灌溉調度查詢使用。",
      internalNote: "紙本資料待補掃描附件。",
      isPublic: true,
      attachments: [],
      auditTrail: [{ action: "seeded", actor: "system", at: now }],
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system"
    },
    {
      id: "seed-da-jia-002",
      wellNumber: "GW-DJ-002",
      name: "大甲溪補注觀測井",
      district: "外埔區",
      section: "六分段",
      address: "臺中市外埔區六分段示範點",
      latitude: 24.3401,
      longitude: 120.6544,
      purpose: "觀測",
      depthMeters: 42,
      diameterMm: 150,
      startedAt: "2020-09-20",
      status: "使用中",
      managementUnit: "管理處地下水井小組",
      publicNote: "公開資訊已去除內部附件。",
      internalNote: "含水位觀測紀錄，後續可另建模組。",
      isPublic: true,
      attachments: [],
      auditTrail: [{ action: "seeded", actor: "system", at: now }],
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system"
    },
    {
      id: "seed-internal-003",
      wellNumber: "GW-IN-003",
      name: "內部盤點井",
      district: "豐原區",
      section: "社皮段",
      address: "內部資料不公開",
      latitude: 24.2501,
      longitude: 120.7218,
      purpose: "備援",
      depthMeters: 55,
      diameterMm: 200,
      startedAt: "2017-03-10",
      status: "盤點中",
      managementUnit: "管理處地下水井小組",
      publicNote: "",
      internalNote: "示範非公開井籍，前台不顯示。",
      isPublic: false,
      attachments: [],
      auditTrail: [{ action: "seeded", actor: "system", at: now }],
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system"
    }
  ];
}
