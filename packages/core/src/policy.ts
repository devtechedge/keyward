import type { Policy, ProviderId } from "./types.js";

/**
 * Policies describe when a secret should be rotated and when the spend should be
 * flagged. They are evaluated against provider inventory and spend data.
 */
export const DEFAULT_POLICIES: readonly Policy[] = [
  {
    id: "pol_baseline",
    name: "Baseline",
    providers: [],
    rotateAfterDays: 90,
    idleAfterDays: 30,
    spendSpikeFactor: 2.5,
    spendSpikeFloorUsd: 10,
    enabled: true,
  },
  {
    id: "pol_strict",
    name: "Strict",
    providers: [],
    rotateAfterDays: 30,
    idleAfterDays: 14,
    spendSpikeFactor: 1.8,
    spendSpikeFloorUsd: 5,
    enabled: true,
  },
  {
    id: "pol_relaxed",
    name: "Relaxed",
    providers: [],
    rotateAfterDays: 365,
    idleAfterDays: 90,
    spendSpikeFactor: 4,
    spendSpikeFloorUsd: 50,
    enabled: true,
  },
];

export interface StaleKey {
  readonly keyId: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly ageDays: number;
  readonly idleDays: number | null;
  readonly reason: string;
}

export interface StaleKeyOptions {
  readonly now?: Date;
}

/**
 * Find keys that a policy says should have been rotated or retired.
 *
 * A key that is old but still in active use is a different problem from a key that
 * is old and unused, and they get different advice.
 */
export function findStaleKeys(
  keys: readonly {
    readonly id: string;
    readonly name: string;
    readonly provider: ProviderId;
    readonly createdAt: Date;
    readonly lastUsedAt: Date | null;
  }[],
  policy: Policy,
  options: StaleKeyOptions = {},
): readonly StaleKey[] {
  const now = options.now ?? new Date();
  const stale: StaleKey[] = [];

  for (const key of keys) {
    if (policy.providers.length > 0 && !policy.providers.includes(key.provider)) continue;

    const ageDays = daysBetween(key.createdAt, now);
    const idleDays = key.lastUsedAt ? daysBetween(key.lastUsedAt, now) : null;

    if (ageDays >= policy.rotateAfterDays) {
      stale.push({
        keyId: key.id,
        name: key.name,
        provider: key.provider,
        ageDays,
        idleDays,
        reason:
          idleDays !== null && idleDays < policy.idleAfterDays
            ? `Created ${ageDays} days ago and used ${idleDays} days ago, older than the ${policy.rotateAfterDays} day rotation window`
            : `Created ${ageDays} days ago, older than the ${policy.rotateAfterDays} day rotation window`,
      });
      continue;
    }

    if (idleDays !== null && idleDays >= policy.idleAfterDays) {
      stale.push({
        keyId: key.id,
        name: key.name,
        provider: key.provider,
        ageDays,
        idleDays,
        reason: `Unused for ${idleDays} days, past the ${policy.idleAfterDays} day idle threshold`,
      });
    }
  }

  return stale;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
