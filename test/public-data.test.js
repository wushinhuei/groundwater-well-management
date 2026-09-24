import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readJson(path) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

test("public registry matches all 111 pumping records", async () => {
  const wells = await readJson("../docs/data/wells.json");
  const pumping = await readJson("../docs/data/pumping-records/pumping-records-115.json");
  const wellNumbers = wells.map((well) => well.waterRightNo);
  const pumpingNumbers = pumping.records.map((record) => record.waterRightNo);

  assert.equal(wells.length, 111);
  assert.equal(pumping.records.length, 111);
  assert.equal(new Set(wellNumbers).size, 111);
  assert.deepEqual(new Set(wellNumbers), new Set(pumpingNumbers));
  assert.equal(wells.filter((well) => well.latitude == null || well.longitude == null).length, 0);
  assert.equal(
    wells.filter((well) => !(well.attachments || []).some((file) => file.mimeType === "application/pdf")).length,
    0
  );
  for (const well of wells) {
    const pdf = well.attachments.find((file) => file.mimeType === "application/pdf");
    const content = await readFile(new URL(`../docs/data/attachments/${pdf.storedName}`, import.meta.url));
    assert.equal(content.subarray(0, 4).toString("ascii"), "%PDF", `${well.waterRightNo} 水權狀檔案無效`);
  }
  assert.equal(wellNumbers.includes("B0112603"), true);
  assert.equal(wellNumbers.includes("B1140034"), true);
  assert.equal(wellNumbers.includes("K0124336"), true);
  assert.equal(wellNumbers.includes("B1150091"), false);
});

test("pumping history retains historical years and supplements current wells from Excel", async () => {
  const wells = await readJson("../docs/data/wells.json");
  const history = await readJson("../docs/data/pumping-history.json");
  const historyNumbers = new Set(history.records.map((record) => record.waterRightNo));
  const expectedEmpty = ["K0124336"];

  assert.equal(wells.length, 111);
  assert.equal(history.waterRightCount, 110);
  assert.equal(history.recordCount, 828);
  assert.equal(history.monthlyRecordCount, 9936);
  assert.deepEqual(history.authorityCounts, { 臺中市政府: 95, 苗栗縣政府: 15 });
  assert.equal(history.records.filter((record) => record.authority === "臺中市政府").length, 712);
  assert.equal(history.records.filter((record) => record.authority === "苗栗縣政府").length, 116);
  assert.equal(new Set(history.records.filter((record) => record.waterRightNo.startsWith("K")).map((record) => record.waterRightNo)).size, 15);
  assert.deepEqual(history.emptyWaterRightNos, expectedEmpty);
  assert.deepEqual(wells.map((well) => well.waterRightNo).filter((number) => !historyNumbers.has(number)).sort(), expectedEmpty);
  assert.equal(history.records.some((record) => record.monthlyM3.some((value) => value === 0)), true);
  assert.equal(history.records.some((record) => record.monthlyM3.some((value) => value == null)), true);
  assert.equal(history.anomalyRecordCount, 9);
  assert.deepEqual(
    history.records.find((record) => record.waterRightNo === "K0124239" && record.yearMinguo === 114).anomalies,
    [{ month: 11, reasons: ["單月值明顯高於同年度其他月份"] }]
  );
  assert.deepEqual(
    history.records.find((record) => record.waterRightNo === "B1150050" && record.yearMinguo === 115).monthlyM3,
    [0,0,0,0,0,0,0,0,null,null,null,null]
  );
  assert.equal(history.records.some((r) => r.waterRightNo === 'B1150091'), false);
  assert.equal(history.records.filter((r) => r.yearMinguo === 115 && r.monthlyM3[7] != null).length, 109);
});

test("history table shows the monthly water-right volume", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /水權量（m³）/);
  assert.match(html, /<col class="history-value-column">/);
  assert.match(app, /calculateMonthlyWaterRight/);
  assert.match(app, /registeredFlowCms \* 86400 \* daysInMonth/);
});

test("river-system filter classifies all wells and cascades station choices", async () => {
  const [wells, html, app] = await Promise.all([
    readJson("../docs/data/wells.json"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/app.js", import.meta.url), "utf8")
  ]);
  const overrides = { B0130304: "大安溪", B1150103: "大甲溪" };
  const riverNames = ["大甲溪", "大安溪", "烏溪", "大里溪"];
  const riverSystem = (well) => overrides[well.waterRightNo]
    || riverNames.find((river) => String(well.irrigationSystem || "").startsWith(river))
    || "其他";
  const counts = Object.fromEntries(
    [...riverNames, "其他"].map((river) => [river, wells.filter((well) => riverSystem(well) === river).length])
  );
  const dajiaStations = [...new Set(
    wells.filter((well) => riverSystem(well) === "大甲溪").map((well) => well.station)
  )].sort((a, b) => a.localeCompare(b, "zh-Hant"));

  assert.deepEqual(counts, { 大甲溪: 27, 大安溪: 79, 烏溪: 4, 大里溪: 1, 其他: 0 });
  assert.equal(riverSystem(wells.find((well) => well.waterRightNo === "B0130304")), "大安溪");
  assert.equal(riverSystem(wells.find((well) => well.waterRightNo === "B1150103")), "大甲溪");
  assert.deepEqual(dajiaStations, ["八寶", "大安", "大南", "大雅", "屯子腳", "西屯", "沙鹿"]);
  assert.ok(html.indexOf('id="riverFilter"') < html.indexOf('id="stationFilter"'));
  assert.ok(html.indexOf('id="stationFilter"') < html.indexOf('id="statusFilter"'));
  assert.match(app, /function renderStationFilterOptions/);
  assert.match(app, /function applyPublicFilters/);
});
