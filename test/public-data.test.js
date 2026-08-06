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
  assert.equal(wells.filter((well) => well.latitude == null || well.longitude == null).length, 15);
  assert.equal(wellNumbers.includes("B0112603"), true);
  assert.equal(wellNumbers.includes("B1140034"), true);
  assert.equal(wellNumbers.includes("K0124336"), false);
});
