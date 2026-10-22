import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearEscrow,
  escrowValue,
  listEscrow,
  readEscrow,
  type EscrowRecord,
} from "../dist/index.js";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const env = { KEYWARD_ESCROW_KEY: KEY } as NodeJS.ProcessEnv;

async function tempHome(): Promise<string> {
  const os = await import("node:os");
  const path = await import("node:path");
  const { mkdtemp } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "keyward-escrow-"));
  return dir;
}

test("an escrowed value is encrypted on disk and reads back", async () => {
  const home = await tempHome();
  const scoped = { ...env, KEYWARD_HOME: home } as NodeJS.ProcessEnv;

  const file = await escrowValue(
    {
      runId: "run_1",
      secretName: "OPENAI_API_KEY",
      provider: "openai",
      oldValue: "sk-old-secret-value",
      createdAt: new Date().toISOString(),
    },
    scoped,
  );

  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(file, "utf8");
  assert.ok(!raw.includes("sk-old-secret-value"), "the value must not be on disk in the clear");
  assert.ok(raw.includes("oldValue"), "the envelope is stored");

  const record = await readEscrow("run_1", scoped);
  assert.equal(record?.oldValue, "sk-old-secret-value");
  assert.equal(record?.secretName, "OPENAI_API_KEY");
});

test("a record cannot be opened without the escrow key", async () => {
  const home = await tempHome();
  const scoped = { ...env, KEYWARD_HOME: home } as NodeJS.ProcessEnv;
  await escrowValue(
    {
      runId: "run_2",
      secretName: "ANTHROPIC_API_KEY",
      provider: "anthropic",
      oldValue: "sk-ant-old",
      createdAt: new Date().toISOString(),
    },
    scoped,
  );

  const wrongKey = {
    ...scoped,
    KEYWARD_ESCROW_KEY: "f".repeat(64),
  } as NodeJS.ProcessEnv;
  await assert.rejects(() => readEscrow("run_2", wrongKey));
});

test("a settled record is destroyed", async () => {
  const home = await tempHome();
  const scoped = { ...env, KEYWARD_HOME: home } as NodeJS.ProcessEnv;
  await escrowValue(
    {
      runId: "run_3",
      secretName: "OPENAI_API_KEY",
      provider: "openai",
      oldValue: "sk-old",
      createdAt: new Date().toISOString(),
    },
    scoped,
  );
  assert.deepEqual(await listEscrow(scoped), ["run_3"]);
  await clearEscrow("run_3", scoped);
  assert.deepEqual(await listEscrow(scoped), []);
  assert.equal(await readEscrow("run_3", scoped), null);
});
