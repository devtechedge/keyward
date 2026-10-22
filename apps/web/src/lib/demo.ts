import { detectAnomalies } from "@keyward/core";
import type {
  WebAnomaly,
  WebFinding,
  WebKey,
  WebOverview,
  WebRun,
  WebSpendPoint,
} from "./types";

/**
 * Demo data for the hosted control plane.
 *
 * It exists so the public view is a working product rather than an empty shell,
 * and so a new user sees what the thing looks like before connecting a provider.
 * Every number here is shaped like a real account: keys with ages and idle time,
 * a spend series with one real spike in it, and a rotation that was rolled back.
 */

const now = Date.now();
const day = 86_400_000;
const iso = (offsetDays: number): string => new Date(now - offsetDays * day).toISOString();

function spendSeries(): WebSpendPoint[] {
  const points: WebSpendPoint[] = [];
  const shape = [
    118, 124, 131, 127, 140, 136, 149, 143, 158, 151, 164, 172, 168, 181, 176, 190, 185, 197,
    204, 198, 212, 219, 208, 226, 241, 233, 258, 249, 271, 288, 412, 468,
  ];
  shape.forEach((usd, i) => {
    points.push({ at: iso(shape.length - 1 - i), usd });
  });
  return points;
}

const keys: WebKey[] = [
  {
    id: "key_9fq2",
    provider: "openai",
    name: "prod-ingest",
    masked: "sk-proj-a1b2…9xyz",
    createdAt: iso(212),
    lastUsedAt: iso(0),
    expiresAt: null,
    scope: "api.responses.write",
    serviceAccount: "prod-ingest",
    monthlyUsd: 1284.4,
    state: "active",
    findingId: null,
  },
  {
    id: "key_3kd8",
    provider: "openai",
    name: "admin-org-root",
    masked: "sk-admin-7f31…bb02",
    createdAt: iso(241),
    lastUsedAt: iso(3),
    expiresAt: null,
    scope: "organisation admin",
    serviceAccount: null,
    monthlyUsd: 0,
    state: "stale",
    findingId: "f_01",
  },
  {
    id: "key_lm40",
    provider: "anthropic",
    name: "support-summariser",
    masked: "sk-ant-4c19…7de1",
    createdAt: iso(121),
    lastUsedAt: iso(1),
    expiresAt: iso(24),
    scope: "workspace default",
    serviceAccount: null,
    monthlyUsd: 862.1,
    state: "expiring",
    findingId: null,
  },
  {
    id: "key_pa77",
    provider: "openai",
    name: "batch-evals",
    masked: "sk-proj-55aa…1c4e",
    createdAt: iso(46),
    lastUsedAt: iso(64),
    expiresAt: null,
    scope: "api.responses.write",
    serviceAccount: "batch-evals",
    monthlyUsd: 0,
    state: "idle",
    findingId: "f_02",
  },
  {
    id: "key_qs12",
    provider: "anthropic",
    name: "ops-reviewer",
    masked: "sk-ant-9d02…31fa",
    createdAt: iso(318),
    lastUsedAt: iso(9),
    expiresAt: null,
    scope: "workspace default",
    serviceAccount: null,
    monthlyUsd: 96.7,
    state: "stale",
    findingId: null,
  },
  {
    id: "key_rt03",
    provider: "openai",
    name: "docs-embeddings",
    masked: "sk-proj-2b8f…66aa",
    createdAt: iso(19),
    lastUsedAt: iso(0),
    expiresAt: iso(345),
    scope: "api.embeddings.write",
    serviceAccount: "docs-embeddings",
    monthlyUsd: 41.3,
    state: "active",
    findingId: null,
  },
];

const anomalies: WebAnomaly[] = [
  {
    id: "an_01",
    provider: "openai",
    severity: "critical",
    title: "Spend up 65% against baseline",
    detail:
      "prod-ingest crossed 412 USD in a day against a 250 USD baseline, concentrated on gpt-5.6-sol. A leaked key looks like this.",
    observedUsd: 412.4,
    baselineUsd: 250.6,
    ratio: 1.65,
    detectedAt: iso(1),
    scope: "prod-ingest",
  },
  {
    id: "an_02",
    provider: "openai",
    severity: "high",
    title: "Key created outside the change window",
    detail:
      "admin-org-root was created 241 days ago and has not been rotated since. It can mint and delete every other key in the organisation.",
    observedUsd: 0,
    baselineUsd: 0,
    ratio: 0,
    detectedAt: iso(0),
    scope: "admin-org-root",
  },
  {
    id: "an_03",
    provider: "anthropic",
    severity: "medium",
    title: "Spend fell to near zero",
    detail:
      "support-summariser went quiet overnight. Usually that means a key died, a job stopped, or traffic moved somewhere keyward cannot see.",
    observedUsd: 3.1,
    baselineUsd: 96.7,
    ratio: 0.03,
    detectedAt: iso(0),
    scope: "support-summariser",
  },
];

const runs: WebRun[] = [
  {
    id: "run_7c21",
    secret: "OPENAI_API_KEY",
    provider: "openai",
    status: "rolled-back",
    startedAt: iso(2),
    durationMs: 8420,
    steps: [
      {
        id: "s1",
        target: "OpenAI organisation",
        kind: "provider",
        status: "created",
        detail: "Created replacement key key_7c21a",
        at: iso(2),
      },
      {
        id: "s2",
        target: "vercel:acme-api production",
        kind: "vercel-env",
        status: "verified",
        detail: "Wrote and verified",
        at: iso(2),
      },
      {
        id: "s3",
        target: "github actions:acme/api",
        kind: "github-actions",
        status: "failed",
        detail: "Write or verification failed: gh secret set exited with 1",
        at: iso(2),
      },
      {
        id: "s4",
        target: "vercel:acme-api production",
        kind: "vercel-env",
        status: "rolled-back",
        detail: "Restored the previous value after a failure",
        at: iso(2),
      },
    ],
  },
  {
    id: "run_3f88",
    secret: "ANTHROPIC_API_KEY",
    provider: "anthropic",
    status: "succeeded",
    startedAt: iso(6),
    durationMs: 5130,
    steps: [
      {
        id: "s1",
        target: "Anthropic organisation",
        kind: "provider",
        status: "created",
        detail: "Created replacement key key_3f88b",
        at: iso(6),
      },
      {
        id: "s2",
        target: "local .env",
        kind: "local-env",
        status: "verified",
        detail: "Wrote and verified",
        at: iso(6),
      },
      {
        id: "s3",
        target: "github actions:acme/worker",
        kind: "github-actions",
        status: "verified",
        detail: "Wrote and verified",
        at: iso(6),
      },
    ],
  },
];

const findings: WebFinding[] = [
  {
    id: "f_01",
    provider: "openai",
    pattern: "openai-admin-key",
    masked: "sk-admin-7f31…bb02",
    severity: "critical",
    location: "infra/terraform/main.tf:103",
    live: true,
    detectedAt: iso(0),
  },
  {
    id: "f_02",
    provider: "openai",
    pattern: "openai-project-key",
    masked: "sk-proj-55aa…1c4e",
    severity: "high",
    location: "services/worker/.env.production",
    live: true,
    detectedAt: iso(0),
  },
  {
    id: "f_03",
    provider: "anthropic",
    pattern: "anthropic-api-key",
    masked: "sk-ant-4c19…7de1",
    severity: "high",
    location: "packages/shared/src/llm.ts",
    live: null,
    detectedAt: iso(0),
  },
];

export function demoOverview(): WebOverview {
  const spend = spendSeries();
  const totalMonthlyUsd = spend.reduce((sum, p) => sum + p.usd, 0);
  const previous = spend.slice(-31, -1).reduce((sum, p) => sum + p.usd, 0);

  // The demo anomalies are produced by the same engine the CLI uses, so the
  // public view shows real detection behaviour rather than a hard coded list.
  const detected = detectAnomalies(
    {
      provider: "openai",
      currency: "USD",
      totalUsd: totalMonthlyUsd,
      points: spend.map((p) => ({
        at: p.at,
        spendUsd: p.usd,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
      })),
    },
    { baselineDays: 14, spikeFactor: 1.35, floorUsd: 50 },
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "demo",
    totalMonthlyUsd,
    spendChangePct: previous > 0 ? ((totalMonthlyUsd - previous) / previous) * 100 : 0,
    keyCount: keys.length,
    atRiskCount: keys.filter((k) => k.state !== "active").length,
    openAnomalies: anomalies.length,
    lastScanAt: iso(0),
    spend,
    keys,
    anomalies,
    runs,
    findings,
    ...(detected.anomalies.length > 0 ? { detected } : {}),
  };
}
