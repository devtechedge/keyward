import type { Anomaly, ProviderId, Severity, SpendPoint, SpendSummary } from "./types.js";

export interface AnomalyOptions {
  /** How many days of history form the baseline. */
  readonly baselineDays?: number;
  /** A day must exceed baseline by this factor to be flagged. */
  readonly spikeFactor?: number;
  /** Ignore spikes below this absolute amount, so small accounts stay quiet. */
  readonly floorUsd?: number;
  /** Only look at the most recent days. */
  readonly windowDays?: number;
}

export interface AnomalyResult {
  readonly anomalies: readonly Anomaly[];
  readonly baselineUsd: number;
  readonly latestUsd: number;
  readonly points: readonly SpendPoint[];
}

/**
 * Detect a day whose spend breaks the pattern of the days before it.
 *
 * The baseline is the median of the trailing window rather than the mean, so one
 * previous spike does not raise the bar and hide the next one. A spike is only
 * reported when it also clears an absolute floor, because a 400 percent jump on
 * three dollars is noise.
 */
export function detectAnomalies(
  summary: SpendSummary,
  options: AnomalyOptions = {},
): AnomalyResult {
  const baselineDays = options.baselineDays ?? 14;
  const spikeFactor = options.spikeFactor ?? 2.5;
  const floorUsd = options.floorUsd ?? 10;
  const windowDays = options.windowDays ?? 30;

  const sorted = [...summary.points].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const window = sorted.slice(-windowDays);
  const latest = window.at(-1);

  if (!latest) {
    return { anomalies: [], baselineUsd: 0, latestUsd: 0, points: window };
  }

  const prior = window.slice(0, -1).slice(-baselineDays);
  const baselineUsd = median(prior.map((p) => p.spendUsd));
  const anomalies: Anomaly[] = [];

  if (baselineUsd > 0 && latest.spendUsd >= floorUsd) {
    const ratio = latest.spendUsd / baselineUsd;
    if (ratio >= spikeFactor) {
      anomalies.push({
        id: `anom_${summary.provider}_${Date.parse(latest.at)}`,
        provider: summary.provider,
        detectedAt: new Date(),
        severity: severityFor(ratio, latest.spendUsd),
        observedUsd: latest.spendUsd,
        baselineUsd,
        ratio,
        scope: scopeOf(latest),
        summary: `${latest.spendUsd.toFixed(2)} USD on ${latest.at.slice(0, 10)} against a ${baselineUsd.toFixed(2)} USD baseline, ${ratio.toFixed(1)} times normal`,
        baselineDays: prior.length,
      });
    }
  }

  // A drop to near zero also matters: it usually means a key died, a job stopped
  // running, or a migration moved traffic somewhere the tool cannot see.
  if (prior.length >= 3 && latest.spendUsd < baselineUsd * 0.05 && baselineUsd >= floorUsd) {
    anomalies.push({
      id: `anom_${summary.provider}_drop_${Date.parse(latest.at)}`,
      provider: summary.provider,
      detectedAt: new Date(),
      severity: "medium",
      observedUsd: latest.spendUsd,
      baselineUsd,
      ratio: baselineUsd > 0 ? latest.spendUsd / baselineUsd : 0,
      scope: scopeOf(latest),
      summary: `Spend fell to ${latest.spendUsd.toFixed(2)} USD from a ${baselineUsd.toFixed(2)} USD baseline, which usually means a key stopped being used`,
      baselineDays: prior.length,
    });
  }

  return { anomalies, baselineUsd, latestUsd: latest.spendUsd, points: window };
}

function scopeOf(point: SpendPoint): string {
  const models = Object.keys(point.byModel ?? {});
  if (models.length > 0) return `model ${models.slice(0, 3).join(", ")}`;
  const keys = Object.keys(point.byKey ?? {});
  if (keys.length > 0) return `key ${keys.slice(0, 2).join(", ")}`;
  return "organisation total";
}

function severityFor(ratio: number, amount: number): Severity {
  if (ratio >= 10 || amount >= 5000) return "critical";
  if (ratio >= 5 || amount >= 1000) return "high";
  return "medium";
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}
