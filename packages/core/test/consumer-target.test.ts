import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toDeliveryTarget } from "../dist/index.js";

test("a consumer becomes a delivery target the engine can write and read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-target-"));
  const file = join(dir, ".env");
  await writeFile(file, "OPENAI_API_KEY=old\n");

  const target = toDeliveryTarget(
    { type: "dotenv", target: file, name: "OPENAI_API_KEY" },
    { runId: "run_1", secretName: "OPENAI_API_KEY" },
  );

  assert.match(target.locator, /OPENAI_API_KEY/);
  assert.equal((await target.read?.())?.value, "old");

  await target.write({ value: "new" });
  assert.match(await readFile(file, "utf8"), /OPENAI_API_KEY=new/);
  assert.equal((await target.read?.())?.value, "new");
});

test("a consumer that cannot be read reports null, not a value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-target-"));
  const target = toDeliveryTarget(
    { type: "dotenv", target: join(dir, "missing.env"), name: "K" },
    { runId: "r", secretName: "K" },
  );
  assert.equal(await target.read?.(), null);
});
