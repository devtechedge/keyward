import { test } from "node:test";
import assert from "node:assert/strict";
import { findInText, scanGitHubOwner } from "../dist/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("findInText reports a key with a mask and never the value", () => {
  const findings = findInText('KEY="sk-proj-abcdefghijklmnopqrstuvwxyz012345"');
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.equal(finding?.secret.provider, "openai");
  assert.ok(!JSON.stringify(findings).includes("abcdefghijklmnopqrstuvwxyz012345"));
  assert.ok(finding?.secret.masked.includes("…"));
});

test("findInText skips placeholders", () => {
  const findings = findInText("KEY=sk-proj-your-key-goes-here-000000000000");
  assert.equal(findings.length, 0);
});

test("a GitHub scan walks the tree and reports where a key was", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/users/acme/repos")) {
      return jsonResponse([
        { name: "api", default_branch: "main", fork: false, archived: false, private: false },
        { name: "forked", default_branch: "main", fork: true, archived: false, private: false },
      ]);
    }
    if (url.includes("/git/trees/")) {
      return jsonResponse({
        tree: [{ path: "src/config.ts", type: "blob", size: 120 }],
      });
    }
    if (url.includes("/contents/")) {
      return new Response('export const K = "sk-admin-abcdefghijklmnopqrstuvwx";', {
        status: 200,
      });
    }
    return jsonResponse({}, 404);
  }) as unknown as typeof fetch;

  const result = await scanGitHubOwner({
    token: "ghp_test",
    owner: "acme",
    perCallDelayMs: 0,
    fetch: fakeFetch,
  });

  assert.equal(result.scannedRepos, 1, "forks must be skipped");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.secret.provider, "openai");
  assert.equal(result.findings[0]?.severity, "critical");
  assert.match(result.findings[0]?.source.path ?? "", /acme\/api\/src\/config\.ts/);
  assert.ok(
    !JSON.stringify(result).includes("abcdefghijklmnopqrstuvwx"),
    "the raw value must never appear in a scan result",
  );
  assert.ok(calls.every((c) => !c.includes("forked")));
});
