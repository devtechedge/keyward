import type { Consumer, ConsumerAdapter, ConsumerAdapterRegistry, ConsumerContext, ConsumerType } from "./types.js";
import { dotenvConsumer } from "./dotenv.js";
import { githubConsumer } from "./github.js";
import { vercelConsumer } from "./vercel.js";

const ADAPTERS: Record<ConsumerType, ConsumerAdapter> = {
  dotenv: dotenvConsumer,
  vercel: vercelConsumer,
  github: githubConsumer,
  supabase: vercelConsumer,
  command: dotenvConsumer,
};

/**
 * The registry.
 *
 * A consumer type with no adapter is a configuration error, not a silent
 * no-op, so the caller gets a clear error rather than a rotation that quietly
 * skipped a destination.
 */
export const consumers: ConsumerAdapterRegistry = {
  get(type: ConsumerType): ConsumerAdapter {
    const adapter = ADAPTERS[type];
    if (!adapter) {
      throw new Error(
        `No consumer adapter for "${type}". Supported: ${Object.keys(ADAPTERS).join(", ")}.`,
      );
    }
    return adapter;
  },
  list(): readonly ConsumerAdapter[] {
    return Object.values(ADAPTERS);
  },
};

export { dotenvConsumer, githubConsumer, vercelConsumer };
export * from "./types.js";
