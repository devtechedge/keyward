import { test } from "node:test";
import assert from "node:assert/strict";
import { runCycle } from "../dist/index.js";
import type { SpendSummary } from "../dist/types.js";

function summary(points: number[]): SpendSummary {
  return {
    provider: "openai",
    currency: "USD",
    totalUsd: points.reduce((a, b) => a + b, 0),
    points: points.map((spendUsd, i) => ({
      at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      spendUsd,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    })),
  };
}

test("a cycle alerts once and then stays quiet", async () => {
  const posted: string[] = [];
  const fakeFetch = (async (_input: string | URL, init?: RequestInit) => {
    posted.push(String(init?.body ?? ""));
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  const spend = summary([10, 10, 10, 10, 10, 10, 200]);

  const first = await runCycle(
    { provider: "openai", summary: spend },
    { doFetch: fakeFetch, targets: [{ channel: "slack", webhookUrl: "https://hooks.test/x" }] },
  );
  assert.equal(first.raised.length, 1);
  assert.equal(first.alerted.length, 1);
  assert.equal(posted.length, 1);

  const second = await runCycle(
    {
      provider: "openai",
      summary: spend,
      alreadyAlerted: new Set(first.alerted),
    },
    { doFetch: fakeFetch, targets: [{ channel: "slack", webhookUrl: "https://hooks.test/x" }] },
  );
  assert.equal(second.raised.length, 0);
  assert.equal(second.alerted.length, 0);
  assert.equal(posted.length, 1, "the same anomaly must not be posted twice");
});

test("a cycle that finds nothing sends nothing", async () => {
  const posted: string[] = [];
  const fakeFetch = (async (_input: string | URL, init?: RequestInit) => {
    posted.push(String(init?.body ?? ""));
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  const result = await runCycle(
    { provider: "openai", summary: summary([50, 50, 50, 50, 50, 50, 50]) },
    { doFetch: fakeFetch, targets: [{ channel: "slack", webhookUrl: "https://hooks.test/x" }] },
  );
  assert.equal(result.raised.length, 0);
  assert.equal(posted.length, 0);
});

test("a failing alert is reported and not treated as alerted", async () => {
  const fakeFetch = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  const result = await runCycle(
    { provider: "openai", summary: summary([10, 10, 10, 10, 10, 10, 200]) },
    { doFetch: fakeFetch, targets: [{ channel: "slack", webhookUrl: "https://hooks.test/x" }] },
  );
  assert.equal(result.alerted.length, 0);
  assert.equal(result.failures.length, 1);
});
