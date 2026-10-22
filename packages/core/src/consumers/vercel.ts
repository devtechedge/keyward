import type { Consumer, ConsumerAdapter, ConsumerContext } from "./types.js";

const VERCEL_API_BASE = "https://api.vercel.com";

/**
 * A Vercel project environment variable as a consumer.
 *
 * The Vercel API never returns an encrypted value in the clear, so a read
 * returns null unless the variable is a plain one. That is not a failure, it is
 * the truth: the value cannot be read back.
 */
export const vercelConsumer: ConsumerAdapter = {
  type: "vercel",
  describe(consumer) {
    const environments = consumer.environments?.join(", ") ?? "production";
    return `vercel ${consumer.target} (${consumer.name}, ${environments})`;
  },
  async read(consumer) {
    const token = process.env.VERCEL_TOKEN;
    if (!token) return null;
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId) return null;

    const url = `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(consumer.target)}/env/${encodeURIComponent(consumer.name)}?teamId=${encodeURIComponent(teamId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const body = (await res.json()) as { value?: string; type?: string };
    if (body.type === "encrypted" || body.type === "sensitive") return null;
    return body.value ?? null;
  },
  async write(consumer, value) {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      throw new Error("VERCEL_TOKEN is not set, cannot write a Vercel environment variable");
    }
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId) {
      throw new Error("VERCEL_TEAM_ID is not set, cannot write a Vercel environment variable");
    }
    const environments = consumer.environments ?? ["production"];
    for (const environment of environments) {
      const res = await fetch(
        `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(consumer.target)}/env/${encodeURIComponent(consumer.name)}?teamId=${encodeURIComponent(teamId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value, type: "encrypted", target: [environment] }),
        },
      );
      if (!res.ok) {
        throw new Error(
          `Vercel env write failed with ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }
    }
  },
};

export type { Consumer, ConsumerAdapter, ConsumerContext };
