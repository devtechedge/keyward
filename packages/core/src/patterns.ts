import type { ProviderId } from "./types.js";

/**
 * Detection patterns for AI provider credentials.
 *
 * Order matters: the more specific pattern must come first, because a generic
 * `sk-` pattern would otherwise swallow the longer, more specific prefixes.
 */
export interface KeyPattern {
  readonly provider: ProviderId;
  readonly id: string;
  readonly regex: RegExp;
  /** The shape of a real key, used to reject obvious placeholders. */
  readonly validate?: (value: string) => boolean;
  readonly severity: "critical" | "high" | "medium";
}

const PLACEHOLDER = /(?:example|placeholder|your[_-]?key|xxxx|changeme|dummy|redacted|<[^>]+>|\bhere\b)/i;

function rejectPlaceholders(value: string): boolean {
  return !PLACEHOLDER.test(value);
}

export const KEY_PATTERNS: readonly KeyPattern[] = [
  {
    provider: "openai",
    id: "openai-admin-key",
    regex: /\bsk-admin-[A-Za-z0-9_-]{16,}\b/g,
    validate: rejectPlaceholders,
    severity: "critical",
  },
  {
    provider: "openai",
    id: "openai-project-key",
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "openai",
    id: "openai-service-account-key",
    regex: /\bsk-svcacct-[A-Za-z0-9_-]{20,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "openai",
    id: "openai-api-key",
    regex: /\bsk-[A-Za-z0-9]{32,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "anthropic",
    id: "anthropic-admin-key",
    regex: /\bsk-ant-admin01-[A-Za-z0-9_-]{20,}\b/g,
    validate: rejectPlaceholders,
    severity: "critical",
  },
  {
    provider: "anthropic",
    id: "anthropic-api-key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "openai",
    id: "openrouter-key",
    regex: /\bsk-or-v1-[A-Za-z0-9]{40,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "generic",
    id: "google-ai-key",
    regex: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "generic",
    id: "groq-key",
    regex: /\bgsk_[A-Za-z0-9]{48,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "generic",
    id: "huggingface-token",
    regex: /\bhf_[A-Za-z0-9]{34,}\b/g,
    validate: rejectPlaceholders,
    severity: "medium",
  },
  {
    provider: "generic",
    id: "xai-key",
    regex: /\bxai-[A-Za-z0-9]{60,}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
  {
    provider: "generic",
    id: "supabase-secret-key",
    regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
    validate: rejectPlaceholders,
    severity: "critical",
  },
  {
    provider: "generic",
    id: "deepseek-key",
    regex: /\bsk-[A-Za-z0-9]{32}\b/g,
    validate: rejectPlaceholders,
    severity: "high",
  },
];

/** Provider prefixes that identify a key family even when the pattern list misses it. */
export const PROVIDER_PREFIXES: ReadonlyArray<readonly [RegExp, ProviderId]> = [
  [/^sk-ant-admin01-/, "anthropic"],
  [/^sk-ant-/, "anthropic"],
  [/^sk-proj-/, "openai"],
  [/^sk-svcacct-/, "openai"],
  [/^sk-admin-/, "openai"],
  [/^sk-or-v1-/, "openai"],
  [/^sb_secret_/, "generic"],
  [/^sb_publishable_/, "generic"],
];

export function providerForPrefix(value: string): ProviderId | null {
  for (const [re, provider] of PROVIDER_PREFIXES) {
    if (re.test(value)) return provider;
  }
  return null;
}
