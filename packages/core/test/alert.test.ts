import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverAlert, targetsFromEnv } from "../dist/index.js";
import type { Anomaly } from "../dist/types.js";

const anomaly: Anomaly = {
  id: "anom_01",
  provider: "openai",
  detectedAt: new Date("2026-10-22T00:00:00Z"),
  severity: "critical",
  observedUsd: 412.4,
  baselineUsd: 250.6,
  ratio: 1.65,
  scope: "prod-ingest",
  summary: "Spend up 65% against baseline",
  baselineDays: 14,
};

test("a Slack alert is posted with the numbers and a link", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;

  const result = await deliverAlert(
    { anomaly, provider: "openai", dashboardUrl: "https://example.test/dashboard" },
    [{ channel: "slack", webhookUrl: "https://hooks.slack.test/x" }],
    fakeFetch,
  );

  assert.deepEqual(result.delivered, ["slack"]);
  assert.equal(result.failures.length, 0);
  const body = JSON.parse(calls[0]?.body ?? "{}") as { text: string };
  assert.match(body.text, /CRITICAL/);
  assert.match(body.text, /412\.40 USD/);
  assert.match(body.text, /250\.60 USD/);
  assert.match(body.text, /https:\/\/example\.test\/dashboard/);
});

test("a failed alert is reported, not thrown", async () => {
  const fakeFetch = (async () =>
    new Response("nope", { status: 500 })) as unknown as typeof fetch;

  const result = await deliverAlert(
    { anomaly, provider: "openai" },
    [{ channel: "slack", webhookUrl: "https://hooks.slack.test/x" }],
    fakeFetch,
  );

  assert.deepEqual(result.delivered, []);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0]?.error ?? "", /500/);
});

test("a missing webhook URL fails that target without touching the others", async () => {
  const result = await deliverAlert(
    { anomaly, provider: "openai" },
    [{ channel: "slack" }, { channel: "log" }],
  );
  assert.deepEqual(result.delivered, ["log"]);
  assert.equal(result.failures.length, 1);
});

test("environment targets fall back to the log", () => {
  assert.deepEqual(
    targetsFromEnv({}).map((t) => t.channel),
    ["log"],
  );
  assert.deepEqual(
    targetsFromEnv({ KEYWARD_SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" }).map(
      (t) => t.channel,
    ),
    ["slack"],
  );
});
