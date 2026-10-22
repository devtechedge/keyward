import type { Consumer, ConsumerAdapter, ConsumerContext } from "./consumers/types.js";
import { consumers } from "./consumers/index.js";
import type { DeliveryTarget } from "./rotation.js";

/**
 * Turn a plan consumer into a delivery target the rotation engine can use.
 *
 * The adapter interface is the seam. The engine only knows about
 * `write`, `read` and `restore`, and the adapter decides which API is
 * actually called.
 */
export function toDeliveryTarget(
  consumer: Consumer,
  context: ConsumerContext,
): DeliveryTarget {
  const adapter: ConsumerAdapter = consumers.get(consumer.type);
  const locator = adapter.describe(consumer);

  return {
    kind: kindFor(consumer.type),
    locator,
    ...(consumer.note ? { note: consumer.note } : {}),
    async write(value) {
      await adapter.write(consumer, value.value, context);
    },
    async read() {
      const current = await adapter.read(consumer, context);
      return current === null ? null : { value: current };
    },
  };
}

function kindFor(type: Consumer["type"]): DeliveryTarget["kind"] {
  switch (type) {
    case "dotenv":
      return "local-env";
    case "vercel":
      return "vercel-env";
    case "github":
      return "github-actions";
    case "supabase":
      return "supabase-env";
    default:
      return "manual";
  }
}
