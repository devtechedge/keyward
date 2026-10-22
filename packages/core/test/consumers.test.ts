import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumers, dotenvConsumer } from "../dist/index.js";

test("a dotenv consumer reads and writes one variable and leaves the rest alone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-consumer-"));
  const file = join(dir, ".env");
  await writeFile(file, "A=1\nOPENAI_API_KEY=old-value\nB=2\n");

  const consumer = { type: "dotenv" as const, target: file, name: "OPENAI_API_KEY" };

  const read = await dotenvConsumer.read(consumer);
  assert.equal(read, "old-value");

  await dotenvConsumer.write(consumer, "new-value", {
    runId: "run_1",
    secretName: "OPENAI_API_KEY",
  });

  const content = await readFile(file, "utf8");
  assert.match(content, /OPENAI_API_KEY=new-value/);
  assert.match(content, /^A=1$/m);
  assert.match(content, /^B=2$/m);
  assert.equal(await dotenvConsumer.read(consumer), "new-value");
});

test("a dotenv consumer creates the file when it does not exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-consumer-"));
  const file = join(dir, "nested", ".env");
  const consumer = { type: "dotenv" as const, target: file, name: "K" };

  assert.equal(await dotenvConsumer.read(consumer), null);
  await dotenvConsumer.write(consumer, "v", { runId: "r", secretName: "K" });
  assert.equal(await dotenvConsumer.read(consumer), "v");
});

test("a consumer that cannot be read returns null rather than an empty string", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-consumer-"));
  const consumer = { type: "dotenv" as const, target: join(dir, "missing.env"), name: "K" };
  assert.equal(await dotenvConsumer.read(consumer), null);
});

test("the registry returns an adapter for every known type and errors otherwise", () => {
  assert.equal(consumers.get("dotenv").type, "dotenv");
  assert.equal(consumers.get("vercel").type, "vercel");
  assert.equal(consumers.get("github").type, "github");
  assert.throws(() => consumers.get("nowhere" as never), /No consumer adapter/);
});
