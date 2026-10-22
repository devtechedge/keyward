import {
  DEFAULT_POLICIES,
  detectAnomalies,
  findStaleKeys,
  getAdapter,
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

  const all = [];
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
  const results: Array<{ summary: SpendSummary; anomalies: ReturnType<typeof detectAnomalies> }> = [];

  for (const connection of connections) {
    const adapter = getAdapter(connection.provider);
    const token = await readCredential(connection.tokenFile);
    const summary = await adapter.getSpend(
      { provider: connection.provider, adminToken: { value: token } },
      { from, to, bucket: "1d" },
    );
    results.push({ summary, anomalies: detectAnomalies(summary) });
  }

  if (options.json) {
    line(
      JSON.stringify(
        results.map((r) => ({
          provider: r.summary.provider,
          totalUsd: r.summary.totalUsd,
          points: r.summary.points,
          anomalies: r.anomalies.anomalies,
        })),
        null,
        2,
      ),
    );
    return 0;
  }

  for (const result of results) {
    heading(`${result.summary.provider}: ${result.summary.totalUsd.toFixed(2)} USD over ${days} days`);
    for (const anomaly of result.anomalies.anomalies) {
      line(paint(`  ${anomaly.severity.toUpperCase()} ${anomaly.summary}`, style.yellow));
    }
    if (result.anomalies.anomalies.length === 0) {
      line(paint("  No spend anomalies.", style.green));
    }
  }
  return 0;
}
