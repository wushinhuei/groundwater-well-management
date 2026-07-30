import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createWell,
  filterPublicWells,
  getPublicWell,
  publicWell,
  seedWells,
  updateWell
} from "./src/wells.js";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const UPLOAD_DIR = join(DATA_DIR, "attachments");
const DB_FILE = join(DATA_DIR, "wells.json");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const TOKEN = "demo-admin-token";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf"
};

async function ensureData() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOAD_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    await writeFile(DB_FILE, JSON.stringify(seedWells(), null, 2), "utf8");
  }
}

async function readWells() {
  await ensureData();
  const raw = await readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function saveWells(wells) {
  await writeFile(DB_FILE, JSON.stringify(wells, null, 2), "utf8");
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(value));
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function routeId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function requireAdmin(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    sendJson(res, 401, { message: "需要後台登入。" });
    return false;
  }
  return true;
}

async function saveAttachment(file) {
  if (!file?.dataUrl || !file?.name) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl);
  if (!match) return null;
  const ext = extname(file.name).toLowerCase() || ".bin";
  const safeName = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = join(UPLOAD_DIR, safeName);
  await writeFile(filePath, Buffer.from(match[2], "base64"));
  return {
    id: randomUUID(),
    name: basename(file.name),
    mimeType: match[1],
    size: file.size || 0,
    storedName: safeName,
    uploadedAt: new Date().toISOString()
  };
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await parseBody(req);
    if (body.username === ADMIN_USER && body.password === ADMIN_PASSWORD) {
      sendJson(res, 200, { token: TOKEN, user: ADMIN_USER });
    } else {
      sendJson(res, 401, { message: "帳號或密碼不正確。" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/wells") {
    const wells = await readWells();
    sendJson(res, 200, filterPublicWells(wells, Object.fromEntries(url.searchParams)));
    return;
  }

  const publicWellMatch = /^\/api\/public\/wells\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && publicWellMatch) {
    const wells = await readWells();
    const well = getPublicWell(wells, routeId(publicWellMatch[1]));
    if (!well) sendJson(res, 404, { message: "找不到公開井籍。" });
    else sendJson(res, 200, well);
    return;
  }

  const publicWaterRightMatch = /^\/api\/public\/water-rights\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && publicWaterRightMatch) {
    const wells = await readWells();
    const well = wells.find((item) => item.id === routeId(publicWaterRightMatch[1]) && item.isPublic && item.status !== "停用");
    const file = well?.attachments?.find((item) => String(item.mimeType || "").includes("pdf"));
    if (!file) {
      sendJson(res, 404, { message: "找不到公開水權狀。" });
      return;
    }
    const filePath = join(UPLOAD_DIR, file.storedName);
    const sourcePath = file.storedName?.startsWith("\\\\") ? file.storedName : filePath;
    res.writeHead(200, {
      "content-type": file.mimeType || "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(file.name)}"`
    });
    res.end(await readFile(sourcePath));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/wells") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await readWells());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/wells") {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const wells = await readWells();
    const attachments = [];
    const photos = [];
    if (Array.isArray(body.attachments)) {
      for (const file of body.attachments) {
        const saved = await saveAttachment(file);
        if (saved) attachments.push(saved);
      }
    }
    if (Array.isArray(body.photos)) {
      for (const file of body.photos) {
        if (!String(file?.dataUrl || "").startsWith("data:image/")) continue;
        const saved = await saveAttachment(file);
        if (saved) photos.push(saved);
      }
    }
    const well = createWell({ ...body, attachments, photos }, ADMIN_USER);
    wells.unshift(well);
    await saveWells(wells);
    sendJson(res, 201, well);
    return;
  }

  const adminWellMatch = /^\/api\/admin\/wells\/([^/]+)$/.exec(url.pathname);
  if ((req.method === "PUT" || req.method === "PATCH") && adminWellMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const wells = await readWells();
    const index = wells.findIndex((well) => well.id === routeId(adminWellMatch[1]));
    if (index === -1) {
      sendJson(res, 404, { message: "找不到井籍。" });
      return;
    }
    const newAttachments = [];
    const newPhotos = [];
    if (Array.isArray(body.attachments)) {
      for (const file of body.attachments) {
        if (file.id) continue;
        const saved = await saveAttachment(file);
        if (saved) newAttachments.push(saved);
      }
    }
    if (Array.isArray(body.photos)) {
      for (const file of body.photos) {
        if (file.id || !String(file?.dataUrl || "").startsWith("data:image/")) continue;
        const saved = await saveAttachment(file);
        if (saved) newPhotos.push(saved);
      }
    }
    wells[index] = updateWell(wells[index], { ...body, attachments: newAttachments, photos: newPhotos }, ADMIN_USER);
    await saveWells(wells);
    sendJson(res, 200, wells[index]);
    return;
  }

  const publicPhotoMatch = /^\/api\/public\/photos\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && publicPhotoMatch) {
    const wells = await readWells();
    const photoId = routeId(publicPhotoMatch[1]);
    const publicWellWithPhoto = wells.find((well) =>
      well.isPublic &&
      well.status !== "停用" &&
      (well.photos || []).some((photo) => photo.id === photoId)
    );
    const photo = publicWellWithPhoto?.photos?.find((item) => item.id === photoId);
    if (!photo || !String(photo.mimeType || "").startsWith("image/")) {
      sendJson(res, 404, { message: "找不到公開照片。" });
      return;
    }
    const filePath = join(UPLOAD_DIR, photo.storedName);
    const sourcePath = photo.storedName?.startsWith("\\\\") ? photo.storedName : filePath;
    res.writeHead(200, {
      "content-type": photo.mimeType || "image/jpeg",
      "cache-control": "public, max-age=3600"
    });
    res.end(await readFile(sourcePath));
    return;
  }

  const attachmentMatch = /^\/api\/admin\/attachments\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && attachmentMatch) {
    if (!requireAdmin(req, res)) return;
    const wells = await readWells();
    const attachment = wells.flatMap((well) => well.attachments || []).find((file) => file.id === routeId(attachmentMatch[1]));
    if (!attachment) {
      sendJson(res, 404, { message: "找不到附件。" });
      return;
    }
    const filePath = join(UPLOAD_DIR, attachment.storedName);
    const sourcePath = attachment.storedName?.startsWith("\\\\") ? attachment.storedName : filePath;
    res.writeHead(200, {
      "content-type": attachment.mimeType || "application/octet-stream",
      "content-disposition": `inline; filename="${encodeURIComponent(attachment.name)}"`
    });
    res.end(await readFile(sourcePath));
    return;
  }

  sendJson(res, 404, { message: "API not found" });
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!resolve(filePath).startsWith(resolve(PUBLIC_DIR))) {
    sendText(res, 403, "Forbidden");
    return;
  }
  try {
    const ext = extname(filePath).toLowerCase();
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(302, { location: "/" });
    res.end();
  }
}

await ensureData();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { message: "伺服器發生錯誤。" });
  }
}).listen(PORT, () => {
  console.log(`Groundwater well system running at http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
});
