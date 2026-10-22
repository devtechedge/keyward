import { getAdapter, type ProviderId, type ProviderKey } from "@keyward/core";
import { DEFAULT_POLICIES, findStaleKeys, type Policy } from "@keyward/core";
import { heading, line, paint, style } from "../ui.js";
import { loadConfig, readCredential } from "../config.js";

export interface DueOptions {
  readonly provider?: ProviderId;
  readonly policy?: string;
  readonly json?: boolean;
  readonly now?: Date;
}

export interface DueSecret {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly ageDays: number;
  readonly idleDays: number | null;
  readonly reason: string;
}

/**
 * Work out which secrets are due for rotation.
 *
 * A secret is due when a policy says it is old enough, or when it has gone
 * unused long enough to be safe to revoke. The output is what a scheduler
 * acts on, and what a dry run shows.
 */
export async function listDue(options: DueOptions = {}): Promise<DueSecret[]> {
  const config = await loadConfig();
  const connections = options.provider
    ? config.connections.filter((c) => c.provider === options.provider)
    : config.connections;
  if (connections.length === 0) {
    return [];
  }

  const policy: Policy =
    DEFAULT_POLICIES.find((p) => p.id === options.policy) ?? DEFAULT_POLICIES[0]!;
  const now = options.now ?? new Date();

  const due: DueSecret[] = [];
  for (const connection of connections) {
    const adapter = getAdapter(connection.provider);
    const token = await readCredential(connection.tokenFile);
    const keys: readonly ProviderKey[] = await adapter.listKeys({
      provider: connection.provider,
      adminToken: { value: token },
    });
    const stale = findStaleKeys(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        provider: connection.provider,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      policy,
      { now },
    );
    for (const item of stale) {
      due.push({
        id: item.keyId,
        name: item.name,
        provider: item.provider,
        ageDays: item.ageDays,
        idleDays: item.idleDays,
        reason: item.reason,
      });
    }
  }
  return due;
}

export interface DueCommandOptions extends DueOptions {
  readonly dryRun?: boolean;
}

/**
 * The due command. A dry run is the default, because a rotation that was not
 * planned is a rotation that breaks something.
 */
export async function runDue(options: DueCommandOptions): Promise<number> {
  const due = await listDue(options);

  if (options.json) {
    line(JSON.stringify(due, null, 2));
    return due.length > 0 ? 1 : 0;
  }

  if (due.length === 0) {
    line(paint("Nothing is due for rotation.", style.green));
    return 0;
  }

  heading(`${due.length} secret(s) due for rotation`);
  for (const item of due) {
    line(
      `  ${paint(item.provider.padEnd(10), style.cyan)} ${item.name.padEnd(28)} ${item.reason}`,
    );
  }
  line(
    paint(
      "Rotate each one with: keyward rotate plan.json --secret <name> --dry-run",
      style.grey,
    ),
  );
  return 1;
}
