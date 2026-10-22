import type { ProviderAdapter, ProviderId } from "../types.js";
import { createOpenAIAdapter } from "./openai.js";
import { createAnthropicAdapter } from "./anthropic.js";

const registry = new Map<ProviderId, ProviderAdapter>([
  ["openai", createOpenAIAdapter()],
  ["anthropic", createAnthropicAdapter()],
]);

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = registry.get(id);
  if (!adapter) {
    throw new Error(`No adapter for provider ${id}`);
  }
  return adapter;
}

export function listAdapters(): readonly ProviderAdapter[] {
  return [...registry.values()];
}
