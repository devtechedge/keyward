import { test } from "node:test";
import assert from "node:assert/strict";
import { rotate, type DeliveryTarget } from "../dist/index.js";
import type { ProviderAdapter, ProviderCredentials, ProviderKey } from "../dist/types.js";

function fakeAdapter(): {
  adapter: ProviderAdapter;
  created: string[];
  revoked: string[];
} {
  const created: string[] = [];
  const revoked: string[] = [];
  const adapter: ProviderAdapter = {
    id: "openai",
    displayName: "OpenAI",
    supportsInventory: true,
    supportsRotation: true,
    supportsSpend: true,
    async listKeys() {
      return [];
    },
    async createKey(_c, opts) {
      created.push(opts.name);
      const key: ProviderKey = {
        id: `key_${created.length}`,
        name: opts.name,
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: null,
        maskedValue: "sk-…",
      };
      return { key, value: { value: `new-secret-${created.length}` } };
    },
    async revokeKey(_c, id) {
      revoked.push(id);
    },
    async getSpend() {
      return { provider: "openai", points: [], totalUsd: 0, currency: "USD" };
    },
    async verify() {
      return true;
    },
  };
  return { adapter, created, revoked };
}

interface MemoryTarget {
  readonly target: DeliveryTarget;
  current(): string | null;
}

function memoryTarget(id: string, fail = false): MemoryTarget {
  let current: string | null = "old-secret";
  const target: DeliveryTarget = {
    kind: "local-env",
    locator: id,
    async write(value) {
      if (fail) throw new Error("write refused");
      current = value.value;
    },
    async read() {
      return current === null ? null : { value: current };
    },
    async restore(previous) {
      current = previous?.value ?? null;
    },
  };
  return { target, current: () => current };
}

const credentials: ProviderCredentials = {
  provider: "openai",
  adminToken: { value: "admin" },
};

const plan = {
  id: "plan",
  secretName: "OPENAI_API_KEY",
  provider: "openai" as const,
  createdAt: new Date(),
  targets: [],
  overlapSeconds: 3600,
};

test("a successful rotation writes every target then reports verified", async () => {
  const { adapter } = fakeAdapter();
  const a = memoryTarget("a");
  const b = memoryTarget("b");
  const outcome = await rotate({
    plan,
    credentials,
    adapter,
    targets: [a.target, b.target],
  });

  assert.equal(outcome.run.status, "succeeded");
  assert.equal(a.current(), "new-secret-1");
  assert.equal(b.current(), "new-secret-1");
  assert.equal(outcome.run.steps.filter((s) => s.status === "verified").length, 2);
});

test("a failed write rolls back earlier targets and does not revoke", async () => {
  const { adapter, revoked } = fakeAdapter();
  const a = memoryTarget("a");
  const b = memoryTarget("b", true);
  const outcome = await rotate({
    plan,
    credentials,
    adapter,
    targets: [a.target, b.target],
  });

  assert.equal(outcome.run.status, "rolled-back");
  assert.equal(a.current(), "old-secret", "the earlier target must be restored");
  assert.equal(revoked.length, 0, "the old key must not be revoked after a failure");
  assert.match(outcome.run.rollbackReason ?? "", /Failure at b/);
});

test("a read back that does not match is treated as a failure", async () => {
  const { adapter } = fakeAdapter();
  const liar: DeliveryTarget = {
    kind: "local-env",
    locator: "liar",
    async write() {
      /* writes nothing */
    },
    async read() {
      return { value: "something-else" };
    },
  };
  const outcome = await rotate({
    plan,
    credentials,
    adapter,
    targets: [liar],
  });

  assert.equal(outcome.run.status, "rolled-back");
  const failed = outcome.run.steps.find((s) => s.status === "failed");
  assert.match(failed?.error ?? "", /did not match/);
});

test("a provider that refuses to create a key changes nothing", async () => {
  const { adapter } = fakeAdapter();
  const original = adapter.createKey;
  adapter.createKey = async () => {
    throw new Error("provider refused");
  };
  void original;
  const a = memoryTarget("a");
  const outcome = await rotate({
    plan,
    credentials,
    adapter,
    targets: [a.target],
  });

  assert.equal(outcome.run.status, "failed");
  assert.equal(a.current(), "old-secret");
  assert.equal(outcome.created, null);
});

test("a destination that cannot be restored is reported honestly", async () => {
  const { adapter } = fakeAdapter();
  const unrollbackable: DeliveryTarget = {
    kind: "vercel-env",
    locator: "v",
    async write() {
      /* succeeds */
    },
    async read() {
      return null;
    },
  };
  const failing: DeliveryTarget = {
    kind: "local-env",
    locator: "f",
    async write() {
      throw new Error("nope");
    },
  };
  const outcome = await rotate({
    plan,
    credentials,
    adapter,
    targets: [unrollbackable, failing],
  });

  assert.equal(outcome.run.status, "rolled-back");
  const unrestorable = outcome.run.steps.find((s) =>
    /cannot be restored automatically/.test(s.error ?? ""),
  );
  assert.ok(unrestorable, "the destination that cannot be restored must be called out");
});
