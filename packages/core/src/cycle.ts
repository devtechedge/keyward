import { deliverAlert, targetsFromEnv } from "./alert.js";
import { detectAnomalies } from "./anomaly.js";
import type { Anomaly } from "./types.js";
import type { ProviderId, SpendSummary } from "./types.js";

/**
 * The scheduled cycle.
 *
 * A key tool is only useful if it runs without a human. This module holds the
 * logic a cron worker or a CI schedule calls: read spend, decide whether
 * something is wrong, alert once, and remember what has already been alerted.
 *
 * The caller owns the clock and the persistence. This module is pure so it can be
 * tested and run from anywhere.
 */

export interface CycleInput {
  readonly provider: ProviderId;
  readonly summary: SpendSummary;
  /** Severities that should raise an alert. */
  readonly alertOn?: readonly Anomaly["severity"][];
  /** Anomalies already alerted on, keyed by anomaly id. */
  readonly alreadyAlerted?: ReadonlySet<string>;
}

export interface CycleResult {
  readonly anomalies: readonly Anomaly[];
  /** Anomalies that were newly raised by this cycle. */
  readonly raised: readonly Anomaly[];
  readonly alerted: readonly string[];
  readonly failures: ReadonlyArray<{ readonly channel: string; readonly error: string }>;
}

const DEFAULT_ALERT_ON: readonly Anomaly["severity"][] = ["critical", "high"];

/**
 * Run one cycle for one provider.
 *
 * An anomaly is only alerted once. The caller stores the returned ids and
 * passes them back next time, so a spike does not produce the same message
 * every hour.
 */
export async function runCycle(
  input: CycleInput,
  options: {
    readonly doFetch?: typeof fetch;
    readonly targets?: ReturnType<typeof targetsFromEnv>;
    readonly dashboardUrl?: string;
  } = {},
): Promise<CycleResult> {
  const detected = detectAnomalies(input.summary);
  const anomalies = detected.anomalies;
  const already = input.alreadyAlerted ?? new Set<string>();
  const alertOn = input.alertOn ?? DEFAULT_ALERT_ON;

  const raised = anomalies.filter(
    (a) => alertOn.includes(a.severity) && !already.has(a.id),
  );

  if (raised.length === 0) {
    return { anomalies, raised, alerted: [], failures: [] };
  }

  const targets = options.targets ?? targetsFromEnv();
  const alerted: string[] = [];
  const failures: Array<{ channel: string; error: string }> = [];

  for (const anomaly of raised) {
    const delivery = await deliverAlert(
      {
        anomaly,
        provider: input.provider,
        scope: anomaly.scope,
        ...(options.dashboardUrl ? { dashboardUrl: options.dashboardUrl } : {}),
      },
      targets,
      options.doFetch ?? fetch,
    );
    if (delivery.delivered.length > 0) {
      alerted.push(anomaly.id);
    }
    for (const failure of delivery.failures) {
      failures.push({ channel: failure.channel, error: failure.error });
    }
  }

  return { anomalies, raised, alerted, failures };
}
