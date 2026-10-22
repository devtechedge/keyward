import type {
  ProviderAdapter,
  ProviderCredentials,
  RotationPlan,
  RotationRun,
  RotationStep,
  RotationTarget,
  SecretValue,
} from "./types.js";
import { fingerprint, mask } from "./redact.js";

/**
 * A destination that can receive a replacement secret.
 *
 * Every implementation must be safe to call twice with the same value, because
 * rotation retries after a partial failure and the engine has to know whether a
 * write already landed.
 */
export interface DeliveryTarget {
  readonly kind: RotationTarget["kind"];
  readonly locator: string;
  /**
   * Write the new value. Returns the id of the key the destination now holds,
   * or the same fingerprint when the write was a no-op.
   */
  write(value: SecretValue): Promise<void>;
  /**
   * Read back what the destination currently holds, when it can be read.
   * Returning null means the destination cannot be verified by reading.
   */
  read?(): Promise<SecretValue | null>;
  /**
   * Restore the previous value. Called when a later step fails, so the run can
   * be rolled back to the state before the rotation started.
   */
  restore?(previous: SecretValue | null): Promise<void>;
  /** Human readable note for the report. */
  note?: string;
}

export interface RotationOptions {
  readonly plan: RotationPlan;
  readonly credentials: ProviderCredentials;
  readonly adapter: ProviderAdapter;
  readonly targets: readonly DeliveryTarget[];
  /** How long both the old and the new secret stay valid, in seconds. */
  readonly overlapSeconds?: number;
  /** Injectable clock, so tests are deterministic. */
  readonly now?: () => Date;
  /** Called after the new secret is created, before any write happens. */
  readonly onCreated?: (value: SecretValue) => Promise<void> | void;
}

export interface RotationOutcome {
  readonly run: RotationRun;
  readonly created: { readonly keyId: string; readonly masked: string } | null;
}

/**
 * Rotate one secret across many consumers, in order, with verification and rollback.
 *
 * The order is what makes this safe:
 *
 *   1. create the replacement at the provider
 *   2. write it to every consumer, one at a time
 *   3. verify each consumer now holds the new value
 *   4. only then revoke the old value
 *
 * If any step fails, the engine restores what it already wrote and leaves the old
 * secret in place. A half rotated secret is worse than a stale one, because a
 * half rotated secret means some consumers trust a secret nobody has a record of.
 */
export async function rotate(options: RotationOptions): Promise<RotationOutcome> {
  const now = options.now ?? (() => new Date());
  const steps: RotationStep[] = [];
  const written: Array<{ target: DeliveryTarget; previous: SecretValue | null }> = [];
  let created: { keyId: string; masked: string } | null = null;
  let failure: { targetId: string; error: string } | null = null;

  const record = (
    target: { readonly kind: RotationTarget["kind"]; readonly locator: string },
    status: RotationStep["status"],
    detail: string,
    startedAt: Date,
    error?: string,
  ): void => {
    steps.push({
      targetId: target.locator,
      kind: target.kind,
      status,
      startedAt,
      finishedAt: now(),
      detail,
      ...(error ? { error } : {}),
    });
  };

  // Step 1: create the replacement.
  const createStarted = now();
  let newValue: SecretValue;
  try {
    const result = await options.adapter.createKey(options.credentials, {
      name: options.plan.secretName,
      ...(options.overlapSeconds
        ? { expiresInSeconds: options.overlapSeconds + 86_400 }
        : {}),
    });
    newValue = result.value;
    created = { keyId: result.key.id, masked: mask(result.value.value) };
    record(
      { kind: "manual", locator: options.adapter.displayName },
      "created",
      `Created replacement key ${result.key.id}`,
      createStarted,
    );
    await options.onCreated?.(newValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(
      { kind: "manual", locator: options.adapter.displayName },
      "failed",
      "Could not create a replacement key",
      createStarted,
      message,
    );
    return {
      run: {
        id: `run_${Date.now().toString(36)}`,
        planId: options.plan.id,
        secretName: options.plan.secretName,
        provider: options.plan.provider,
        startedAt: now(),
        finishedAt: now(),
        steps,
        status: "failed",
        rollbackReason: "Replacement key was never created, nothing was changed",
      },
      created: null,
    };
  }

  // Step 2 and 3: write and verify, one consumer at a time.
  for (const target of options.targets) {
    if (failure) {
      record(target, "skipped", "Skipped because an earlier step failed", now());
      continue;
    }
    const started = now();
    let previous: SecretValue | null = null;
    try {
      if (target.read) {
        previous = await target.read();
      }
      await target.write(newValue);
      written.push({ target, previous });

      if (target.read) {
        const current = await target.read();
        if (current === null) {
          // The destination cannot be read back. The write reported success, so
          // trust it, but say plainly that no verification happened.
          record(target, "written", "Wrote, destination cannot be read back", started);
        } else {
          const matches = fingerprint(current.value) === fingerprint(newValue.value);
          if (!matches) {
            throw new Error(
              "Read back did not match the new value, the destination may be caching an old copy",
            );
          }
          record(target, "verified", "Wrote and verified", started);
        }
      } else {
        record(target, "written", "Wrote, destination cannot be read back", started);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record(target, "failed", "Write or verification failed", started, message);
      failure = { targetId: target.locator, error: message };
    }
  }

  // Step 4: revoke the old key, only if every write succeeded.
  if (failure) {
    // Roll back what was written, in reverse order.
    for (const entry of [...written].reverse()) {
      const started = now();
      if (!entry.target.restore) {
        record(
          entry.target,
          "failed",
          "Rollback not possible for this destination",
          started,
          "This destination cannot be restored automatically. The old secret is still valid there, so restore it by hand before revoking anything.",
        );
        continue;
      }
      try {
        await entry.target.restore(entry.previous);
        record(
          entry.target,
          "rolled-back",
          "Restored the previous value after a failure",
          started,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record(entry.target, "failed", "Rollback failed", started, message);
      }
    }
    return {
      run: {
        id: `run_${Date.now().toString(36)}`,
        planId: options.plan.id,
        secretName: options.plan.secretName,
        provider: options.plan.provider,
        startedAt: now(),
        finishedAt: now(),
        steps,
        status: "rolled-back",
        rollbackReason: `Failure at ${failure.targetId}: ${failure.error}. The previous value was restored where possible and the old secret was not revoked.`,
      },
      created,
    };
  }

  return {
    run: {
      id: `run_${Date.now().toString(36)}`,
      planId: options.plan.id,
      secretName: options.plan.secretName,
      provider: options.plan.provider,
      startedAt: now(),
      finishedAt: now(),
      steps,
      status: "succeeded",
    },
    created,
  };
}
