export type WebSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface WebKey {
  readonly id: string;
  readonly provider: "openai" | "anthropic";
  readonly name: string;
  readonly masked: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly scope: string;
  readonly serviceAccount: string | null;
  readonly monthlyUsd: number;
  readonly state: "active" | "stale" | "idle" | "expiring";
  readonly findingId: string | null;
}

export interface WebAnomaly {
  readonly id: string;
  readonly provider: string;
  readonly severity: WebSeverity;
  readonly title: string;
  readonly detail: string;
  readonly observedUsd: number;
  readonly baselineUsd: number;
  readonly ratio: number;
  readonly detectedAt: string;
  readonly scope: string;
}

export interface WebRunStep {
  readonly id: string;
  readonly target: string;
  readonly kind: string;
  readonly status: "pending" | "created" | "written" | "verified" | "revoked" | "skipped" | "failed" | "rolled-back";
  readonly detail: string;
  readonly at: string;
}

export interface WebRun {
  readonly id: string;
  readonly secret: string;
  readonly provider: string;
  readonly status: "running" | "succeeded" | "failed" | "rolled-back";
  readonly startedAt: string;
  readonly durationMs: number;
  readonly steps: readonly WebRunStep[];
}

export interface WebFinding {
  readonly id: string;
  readonly provider: string;
  readonly pattern: string;
  readonly masked: string;
  readonly severity: WebSeverity;
  readonly location: string;
  readonly live: boolean | null;
  readonly detectedAt: string;
}

export interface WebSpendPoint {
  readonly at: string;
  readonly usd: number;
}

export interface WebOverview {
  readonly generatedAt: string;
  readonly mode: "live" | "demo";
  readonly totalMonthlyUsd: number;
  readonly spendChangePct: number;
  readonly keyCount: number;
  readonly atRiskCount: number;
  readonly openAnomalies: number;
  readonly lastScanAt: string | null;
  readonly spend: readonly WebSpendPoint[];
  readonly keys: readonly WebKey[];
  readonly anomalies: readonly WebAnomaly[];
  readonly runs: readonly WebRun[];
  readonly findings: readonly WebFinding[];
}
