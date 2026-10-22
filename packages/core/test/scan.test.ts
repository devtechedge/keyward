import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../dist/scan.js";
import { fingerprint, mask } from "../dist/redact.js";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("masking keeps a short prefix and suffix and nothing else", () => {
  const value = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
  const masked = mask(value);
  assert.ok(masked.startsWith("sk-p"));
  assert.ok(masked.includes("…"));
  assert.ok(!masked.includes("ghijkl"));
});

test("the same secret always produces the same fingerprint", () => {
  assert.equal(fingerprint("abc"), fingerprint("abc"));
  assert.notEqual(fingerprint("abc"), fingerprint("abd"));
});

test("a scan finds a provider key in a file and never echoes the value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-scan-"));
  await writeFile(
    join(dir, ".env"),
    'OPENAI_API_KEY="sk-proj-abcdefghijklmnopqrstuvwxyz012345"\n',
  );
  const result = await scan({ root: dir });
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding?.secret.provider, "openai");
  assert.equal(finding?.severity, "high");
  assert.ok(!JSON.stringify(result.findings).includes("abcdefghijklmnopqrstuvwxyz012345"));
});

test("placeholders are not reported", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-scan-"));
  await writeFile(
    join(dir, ".env.example"),
    "OPENAI_API_KEY=sk-proj-your-key-goes-here-000000000000\n",
  );
  const result = await scan({ root: dir });
  assert.equal(result.findings.length, 0);
});

test("an admin key is rated critical and a project key is not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyward-scan-"));
  await mkdir(join(dir, "nested"));
  await writeFile(join(dir, "nested", "a.txt"), "KEY=sk-admin-abcdefghijklmnopqrstuvwx\n");
  await writeFile(
    join(dir, "nested", "b.txt"),
    "KEY=sk-proj-abcdefghijklmnopqrstuvwxyz012345\n",
  );
  const result = await scan({ root: dir });
  const severities = result.findings.map((f) => f.severity).sort();
  assert.deepEqual(severities, ["critical", "high"]);
});
