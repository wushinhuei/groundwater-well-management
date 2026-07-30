import test from "node:test";
import assert from "node:assert/strict";
import { createWell, filterPublicWells, getPublicWell, nextApplicationFromWaterRightPeriod, updateWell } from "../src/wells.js";

test("public listing hides private wells and internal fields", () => {
  const publicItem = createWell({
    wellNumber: "A-001",
    name: "公開井",
    district: "后里區",
    latitude: 24.1,
    longitude: 120.1,
    purpose: "灌溉",
    status: "使用中",
    isPublic: true,
    internalNote: "不可公開",
    attachments: [{ id: "pdf-1", name: "公開井抽水井.pdf", mimeType: "application/pdf" }]
  }, "tester");
  const privateItem = createWell({
    wellNumber: "B-001",
    name: "內部井",
    district: "后里區",
    latitude: 24.2,
    longitude: 120.2,
    purpose: "備援",
    status: "使用中",
    isPublic: false
  }, "tester");

  const results = filterPublicWells([publicItem, privateItem]);
  assert.equal(results.length, 1);
  assert.equal(results[0].wellNumber, "A-001");
  assert.equal(results[0].internalNote, undefined);
  assert.equal(results[0].attachments, undefined);
  assert.equal(results[0].waterRightCertificateUrl, `/api/public/water-rights/${publicItem.id}`);
});

test("public detail excludes disabled wells", () => {
  const disabled = createWell({
    wellNumber: "A-002",
    name: "停用井",
    district: "后里區",
    latitude: 24.1,
    longitude: 120.1,
    purpose: "灌溉",
    status: "停用",
    isPublic: true
  }, "tester");

  assert.equal(getPublicWell([disabled], disabled.id), null);
});

test("admin update appends audit trail and attachments", () => {
  const well = createWell({
    wellNumber: "A-003",
    name: "原始名稱",
    district: "后里區",
    latitude: 24.1,
    longitude: 120.1,
    purpose: "灌溉",
    status: "使用中",
    isPublic: true
  }, "tester");

  const updated = updateWell(well, {
    name: "更新名稱",
    attachments: [{ id: "file-1", name: "scan.pdf" }]
  }, "admin");

  assert.equal(updated.name, "更新名稱");
  assert.equal(updated.attachments.length, 1);
  assert.equal(updated.auditTrail.at(-1).action, "updated");
});

test("next application date is three months before water right end date", () => {
  assert.equal(nextApplicationFromWaterRightPeriod("112.08.08 至 117.08.07"), "117.05.07");
  assert.equal(nextApplicationFromWaterRightPeriod("114.10.11 至 119.10.10"), "119.07.10");
});
