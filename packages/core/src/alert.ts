import type { Anomaly, ProviderId, Severity } from "./types.js";

/**
 * Deliver an anomaly somewhere a human will actually see.
 *
 * A rotation tool that only writes to its own database is a log, not a control
 * plane. Slack is the channel most teams already watch, so it is the default.
 * Delivery never throws: a failed alert must not fail the scan that produced it.
 */

export type AlertChannel = "slack" | "webhook" | "log";

export interface AlertTarget {
  readonly channel: AlertChannel;
  /** Slack incoming webhook URL, for the slack channel. */
  readonly webhookUrl?: string;
  /** Generic endpoint that receives the alert as JSON, for the webhook channel. */
  readonly endpoint?: string;
}

export interface AlertPayload {
  readonly anomaly: Anomaly;
  readonly provider: ProviderId;
  /** Human label for the key or scope the anomaly belongs to. */
  readonly scope?: string;
  /** Where the operator can look, usually the hosted dashboard. */
  readonly dashboardUrl?: string;
  /** Name of the product sending the alert. */
  readonly product?: string;
}

export interface DeliveryResult {
  readonly delivered: readonly AlertChannel[];
  readonly failures: ReadonlyArray<{ readonly channel: AlertChannel; readonly error: string }>;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

function slackMessage(payload: AlertPayload): string {
  const { anomaly } = payload;
  const product = payload.product ?? "keyward";
  const lines = [
    `*[${SEVERITY_LABEL[anomaly.severity]}] ${product}: ${anomaly.summary}*`,
    `Provider: ${anomaly.provider}`,
    `Scope: ${payload.scope ?? anomaly.scope}`,
    `Observed ${anomaly.observedUsd.toFixed(2)} USD against a ${anomaly.baselineUsd.toFixed(2)} USD baseline (${anomaly.ratio.toFixed(2)}x)`,
    `Baseline window: ${anomaly.baselineDays} days`,
  ];
  if (payload.dashboardUrl) {
    lines.push(`<${payload.dashboardUrl}|Open the control plane>`);
  }
  return lines.join("\n");
}

function webhookBody(payload: AlertPayload): Record<string, unknown> {
  return {
    source: payload.product ?? "keyward",
    provider: payload.provider,
    scope: payload.scope ?? payload.anomaly.scope,
    severity: payload.anomaly.severity,
    title: payload.anomaly.summary,
    detail: payload.anomaly.detail ?? payload.anomaly.summary,
    observedUsd: payload.anomaly.observedUsd,
    baselineUsd: payload.anomaly.baselineUsd,
    ratio: payload.anomaly.ratio,
    baselineDays: payload.anomaly.baselineDays,
    detectedAt: payload.anomaly.detectedAt.toISOString(),
    dashboardUrl: payload.dashboardUrl,
  };
}

/**
 * Send an anomaly to every configured target.
 *
 * Returns what was delivered and what failed. It never throws, because a
 * notification problem must not mask a finding.
 */
export async function deliverAlert(
  payload: AlertPayload,
  targets: readonly AlertTarget[],
  doFetch: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const delivered: AlertChannel[] = [];
  const failures: Array<{ channel: AlertChannel; error: string }> = [];

  for (const target of targets) {
    try {
      if (target.channel === "slack") {
        if (!target.webhookUrl) throw new Error("no Slack webhook URL configured");
        const res = await doFetch(target.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: slackMessage(payload) }),
        });
        if (!res.ok) {
          throw new Error(`Slack webhook returned ${res.status}`);
        }
        delivered.push("slack");
        continue;
      }

      if (target.channel === "webhook") {
        if (!target.endpoint) throw new Error("no webhook endpoint configured");
        const res = await doFetch(target.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookBody(payload)),
        });
        if (!res.ok) {
          throw new Error(`webhook returned ${res.status}`);
        }
        delivered.push("webhook");
        continue;
      }

      const line = slackMessage(payload);
      process.stdout.write(`[keyward] ${line.replace(/\*/g, "")}\n`);
      delivered.push("log");
    } catch (error) {
      failures.push({
        channel: target.channel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { delivered, failures };
}

/**
 * Read alert targets from the environment.
 *
 * `KEYWARD_SLACK_WEBHOOK_URL` and `KEYWARD_ALERT_WEBHOOK_URL` are both
 * optional. With neither set, alerts go to the log so nothing is lost.
 */
export function targetsFromEnv(env: NodeJS.ProcessEnv = process.env): AlertTarget[] {
  const targets: AlertTarget[] = [];
  if (env.KEYWARD_SLACK_WEBHOOK_URL) {
    targets.push({ channel: "slack", webhookUrl: env.KEYWARD_SLACK_WEBHOOK_URL });
  }
  if (env.KEYWARD_ALERT_WEBHOOK_URL) {
    targets.push({ channel: "webhook", endpoint: env.KEYWARD_ALERT_WEBHOOK_URL });
  }
  if (targets.length === 0) {
    targets.push({ channel: "log" });
  }
  return targets;
}
