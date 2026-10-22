import { test } from "node:test";
import assert from "node:assert/strict";
import { scanVercelEnv } from "../dist/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("a Vercel scan finds a provider key by its variable name when the value is encrypted", async () => {
  const fakeFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/v9/projects?")) {
      return jsonResponse([
        { id: "prj_1", name: "smart-waitlist-engine" },
        { id: "prj_2", name: "synthesis" },
      ]);
    }
    if (url.includes("/env?")) {
      if (url.includes("smart-waitlist-engine")) {
        return jsonResponse({
          envs: [
            { key: "SUPABASE_SERVICE_ROLE_KEY", value: "[SENSITIVE]", type: "encrypted" },
            { key: "DATABASE_URL", value: "postgresql://u:p@host/db" },
          ],
        });
      }
      return jsonResponse({
        envs: [{ key: "OPENAI_API_KEY", value: "[SENSITIVE]", type: "encrypted" }],
      });
    }
    return jsonResponse({}, 404);
  }) as unknown as typeof fetch;

  const result = await scanVercelEnv({
    token: "vercel-token",
    teamId: "devtechedge1",
    fetch: fakeFetch,
  });

  assert.equal(result.scannedProjects, 2);
  assert.equal(result.scannedVars, 3);
  assert.equal(result.findings.length, 2, "the two provider variables are real findings");

  const critical = result.findings.filter((f) => f.severity === "critical");
  assert.equal(critical.length, 1);
  assert.ok(
    critical[0]?.source.kind === "file" &&
      /smart-waitlist-engine \/ SUPABASE_SERVICE_ROLE_KEY/.test(critical[0].source.path),
  );

  assert.ok(
    !JSON.stringify(result).includes("postgresql://u:p@host/db"),
    "a non provider value must never be echoed",
  );
});

test("a Vercel scan reports a plaintext key when Vercel hands the value over", async () => {
  const fakeFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/v9/projects?")) {
      return jsonResponse([{ id: "prj_1", name: "api" }]);
    }
    if (url.includes("/env?")) {
      return jsonResponse({
        envs: [
          { key: "APP_KEY", value: "sk-proj-abcdefghijklmnopqrstuvwxyz012345" },
        ],
      });
    }
    return jsonResponse({}, 404);
  }) as unknown as typeof fetch;

  const result = await scanVercelEnv({
    token: "vercel-token",
    teamId: "devtechedge1",
    fetch: fakeFetch,
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.secret.provider, "openai");
  assert.ok(!JSON.stringify(result).includes("abcdefghijklmnopqrstuvwxyz012345"));
});
