import type { ProviderId } from "./types.js";

/**
 * What keyward can actually do with each provider.
 *
 * Honesty about capability matters more than a long list. A tool that claims
 * to rotate a key it cannot rotate is worse than one that says so, because
 * somebody will trust the claim.
 */

export type Capability = "yes" | "assisted" | "partial" | "no";

export interface ProviderCapability {
  readonly id: ProviderId | string;
  readonly label: string;
  /** List the keys the organisation holds. */
  readonly inventory: Capability;
  /** Create a replacement key. */
  readonly create: Capability;
  /** Revoke the old key. */
  readonly delete: Capability;
  /** Check that a key still works. */
  readonly verify: Capability;
  readonly note: string;
}

export const CAPABILITIES: readonly ProviderCapability[] = [
  {
    id: "openai",
    label: "OpenAI",
    inventory: "yes",
    create: "yes",
    delete: "yes",
    verify: "yes",
    note: "The Admin API creates service account keys with scopes and expiry, and deletes the old one.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    inventory: "yes",
    create: "assisted",
    delete: "yes",
    verify: "yes",
    note: "Create the replacement in the console. keyward writes it, proves it landed, then deactivates the old key.",
  },
  {
    id: "vercel",
    label: "Vercel",
    inventory: "yes",
    create: "no",
    delete: "no",
    verify: "partial",
    note: "Environment variables are readable and writable, but the values are encrypted at rest so they cannot be read back.",
  },
  {
    id: "github",
    label: "GitHub",
    inventory: "partial",
    create: "no",
    delete: "no",
    verify: "partial",
    note: "Scans repositories and manages Actions secrets. It cannot list every key you hold.",
  },
];

export function capabilityFor(id: string): ProviderCapability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}
