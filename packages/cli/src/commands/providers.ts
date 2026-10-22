import {
  DEFAULT_POLICIES,
  deliverAlert,
  detectAnomalies,
  findStaleKeys,
  getAdapter,
  targetsFromEnv,
  type Anomaly,
  type Policy,
  type ProviderId,
  type SpendSummary,
} from "@keyward/core";
import { heading, line, paint, style } from "../ui.js";
import { loadConfig, readCredential } from "../config.js";

export interface ConnectOptions {
  readonly provider: ProviderId;
  readonly token?: string;
  readonly label?: string;
}

export async function runConnect(options: ConnectOptions): Promise<number> {
  const { saveConfig, saveCredential } = await import("../config.js");
  const token = options.token;
  if (!token) {
    line(
      paint(
        "Pass the admin key with --token, or use the interactive prompt.",
        style.yellow,
      ),
    );
    return 2;
  }
  const file = await saveCredential(options.provider, token);
  const config = await loadConfig();
  await saveConfig({
    ...config,
    connections: [
      ...config.connections.filter((c) => c.provider !== options.provider),
      {
        provider: options.provider,
        tokenFile: file,
        addedAt: new Date().toISOString(),
        ...(options.label ? { label: options.label } : {}),
      },
    ],
  });
  line(
    paint(
      `Connected ${options.provider}. The token is stored at ${file} and never in the config file.`,
      style.green,
    ),
  );
  return 0;
}

export interface InventoryOptions {
  readonly provider?: ProviderId;
  readonly json?: boolean;
  readonly policy?: string;
}

export async function runInventory(options: InventoryOptions): Promise<number> {
  const config = await loadConfig();
  const connections = options.provider
    ? config.connections.filter((c) => c.provider === options.provider)
    : config.connections;

  if (connections.length === 0) {
    line(paint("No providers connected. Run: keyward connect --provider openai", style.yellow));
    return 2;
  }

  const policy: Policy =
    DEFAULT_POLICIES.find((p) => p.id === options.policy) ?? DEFAULT_POLICIES[0]!;

  const all: Array<{
    connection: (typeof config.connections)[number];
    keys: Awaited<ReturnType<ReturnType<typeof getAdapter>["listKeys"]>>;
  }> = [];

  for (const connection of connections) {
    const adapter = getAdapter(connection.provider);
    const token = await readCredential(connection.tokenFile);
    const keys = await adapter.listKeys({
      provider: connection.provider,
      adminToken: { value: token },
    });
    all.push({ connection, keys });
  }

  if (options.json) {
    line(
      JSON.stringify(
        all.map((entry) => ({
          provider: entry.connection.provider,
          keys: entry.keys,
        })),
        null,
        2,
      ),
    );
    return 0;
  }

  for (const entry of all) {
    heading(`${entry.connection.provider} (${entry.keys.length} keys)`);
    for (const key of entry.keys) {
      line(
        `  ${key.maskedValue.padEnd(22)} ${key.name.padEnd(28)} created ${key.createdAt.toISOString().slice(0, 10)}` +
          (key.lastUsedAt ? ` last used ${key.lastUsedAt.toISOString().slice(0, 10)}` : " never used"),
      );
    }
    const stale = findStaleKeys(
      entry.keys.map((k) => ({
        id: k.id,
        name: k.name,
        provider: entry.connection.provider,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      policy,
    );
    if (stale.length > 0) {
      line(paint(`  ${stale.length} key(s) need attention under the ${policy.name} policy:`, style.yellow));
      for (const item of stale) {
        line(`    - ${item.name}: ${item.reason}`);
      }
    }
  }
  return 0;
}

export interface SpendOptions {
  readonly provider?: ProviderId;
  readonly days?: number;
  readonly json?: boolean;
  /** Send an alert for each anomaly found. */
  readonly alert?: boolean;
  /** Where the operator can look, included in the alert. */
  readonly dashboardUrl?: string;
}

export async function runSpend(options: SpendOptions): Promise<number> {
  const config = await loadConfig();
  const connections = options.provider
    ? config.connections.filter((c) => c.provider === options.provider)
    : config.connections;
  if (connections.length === 0) {
    line(paint("No providers connected.", style.yellow));
    return 2;
  }

  const days = options.days ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const results: Array<{
    provider: ProviderId;
    totalUsd: number;
    points: SpendSummary["points"];
    anomalies: Anomaly[];
  }> = [];

  for (const connection of connections) {
    const adapter = getAdapter(connection.provider);
    const token = await readCredential(connection.tokenFile);
    const summary = await adapter.getSpend(
      { provider: connection.provider, adminToken: { value: token } },
      { from, to, bucket: "1d" },
    );
    const detected = detectAnomalies(summary);
    results.push({
      provider: connection.provider,
      totalUsd: summary.totalUsd,
      points: [...summary.points],
      anomalies: [...detected.anomalies],
    });
  }

  if (options.json) {
    line(
      JSON.stringify(
        results.map((r) => ({
          provider: r.provider,
          totalUsd: r.totalUsd,
          points: r.points,
          anomalies: r.anomalies,
        })),
        null,
        2,
      ),
    );
    return 0;
  }

  let anomalyCount = 0;
  for (const result of results) {
    heading(`${result.provider}: ${result.totalUsd.toFixed(2)} USD over ${days} days`);
    for (const anomaly of result.anomalies) {
      anomalyCount += 1;
      line(paint(`  ${anomaly.severity.toUpperCase()} ${anomaly.summary}`, style.yellow));
      if (anomaly.detail) line(paint(`    ${anomaly.detail}`, style.grey));
    }
    if (result.anomalies.length === 0) {
      line(paint("  No spend anomalies.", style.green));
    }
  }

  if (options.alert && anomalyCount > 0) {
    const targets = targetsFromEnv();
    for (const result of results) {
      for (const anomaly of result.anomalies) {
        const delivery = await deliverAlert(
          {
            anomaly,
            provider: result.provider,
            scope: anomaly.scope,
            ...(options.dashboardUrl ? { dashboardUrl: options.dashboardUrl } : {}),
          },
          targets,
        );
        if (delivery.delivered.length > 0) {
          line(paint(`  Alert delivered via ${delivery.delivered.join(", ")}`, style.green));
        }
        for (const failure of delivery.failures) {
          line(paint(`  Alert to ${failure.channel} failed: ${failure.error}`, style.red));
        }
      }
    }
  }

  return 0;
}
