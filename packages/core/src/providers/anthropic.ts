import type {
  ProviderAdapter,
  ProviderCredentials,
  ProviderKey,
  SpendQuery,
  SpendSummary,
} from "../types.js";
import type { FetchLike } from "./openai.js";

export interface AnthropicContext {
  readonly fetch?: FetchLike;
  readonly baseUrl?: string;
}

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicApiKey {
  readonly id: string;
  readonly name: string;
  readonly created_at?: string;
  readonly last_used_at?: string | null;
  readonly expires_at?: string | null;
  readonly redacted_value?: string;
}

interface AnthropicUsageRow {
  readonly starting_at?: string;
  readonly ending_at?: string;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly request_count?: number;
  readonly model?: string;
  readonly api_key_id?: string;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createAnthropicAdapter(context: AnthropicContext = {}): ProviderAdapter {
  const doFetch: FetchLike = context.fetch ?? ((input, init) => fetch(input, init));
  const base = context.baseUrl ?? ANTHROPIC_BASE;

  async function admin(
    credentials: ProviderCredentials,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return doFetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        "x-api-key": credentials.adminToken.value,
        ...(init.headers ?? {}),
      },
    });
  }

  return {
    id: "anthropic",
    displayName: "Anthropic",
    supportsInventory: true,
    supportsRotation: true,
    supportsSpend: true,

    async listKeys(credentials) {
      const res = await admin(credentials, "/v1/organizations/api_keys?limit=100");
      if (!res.ok) {
        throw new Error(`Anthropic key list failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { readonly data?: readonly AnthropicApiKey[] };
      return (body.data ?? []).map(
        (k): ProviderKey => ({
          id: k.id,
          name: k.name,
          createdAt: parseDate(k.created_at) ?? new Date(0),
          lastUsedAt: parseDate(k.last_used_at),
          expiresAt: parseDate(k.expires_at),
          maskedValue: k.redacted_value ?? "sk-ant-…",
        }),
      );
    },

    async createKey(credentials, options) {
      const body: Record<string, unknown> = { name: options.name };
      if (options.expiresInSeconds !== undefined) {
        // Anthropic takes an absolute expiry, not a duration.
        body.expires_at = new Date(
          Date.now() + options.expiresInSeconds * 1000,
        ).toISOString();
      }
      if (options.scopes && options.scopes.length > 0) body.scopes = options.scopes;

      const res = await admin(credentials, "/v1/organizations/api_keys", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Anthropic key create failed: ${res.status} ${await res.text()}`);
      }
      const created = (await res.json()) as AnthropicApiKey & { readonly value?: string };
      if (!created.value) {
        throw new Error("Anthropic returned no key value; the value is only shown once at creation");
      }
      return {
        key: {
          id: created.id,
          name: created.name,
          createdAt: parseDate(created.created_at) ?? new Date(),
          lastUsedAt: parseDate(created.last_used_at),
          expiresAt: parseDate(created.expires_at),
          maskedValue: created.redacted_value ?? "sk-ant-…",
        },
        value: { value: created.value },
      };
    },

    async revokeKey(credentials, keyId) {
      const res = await admin(credentials, `/v1/organizations/api_keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Anthropic key revoke failed: ${res.status} ${await res.text()}`);
      }
    },

    async getSpend(credentials, query: SpendQuery): Promise<SpendSummary> {
      const params = new URLSearchParams({
        starting_at: query.from.toISOString(),
        ending_at: query.to.toISOString(),
        bucket_width: query.bucket,
        "group_by[]": "model",
      });
      const res = await admin(
        credentials,
        `/v1/organizations/usage_report/messages?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(`Anthropic usage query failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { readonly data?: readonly AnthropicUsageRow[] };
      const points = (body.data ?? []).map((row) => {
        const byModel: Record<string, number> = {};
        if (row.model) byModel[row.model] = 1;
        const byKey: Record<string, number> = {};
        if (row.api_key_id) byKey[row.api_key_id] = 1;
        return {
          at: row.starting_at ?? new Date().toISOString(),
          spendUsd: 0,
          inputTokens: row.input_tokens ?? 0,
          outputTokens: row.output_tokens ?? 0,
          requests: row.request_count ?? 0,
          ...(Object.keys(byModel).length > 0 ? { byModel } : {}),
          ...(Object.keys(byKey).length > 0 ? { byKey } : {}),
        };
      });
      return {
        provider: "anthropic",
        points,
        totalUsd: points.reduce((sum, p) => sum + p.spendUsd, 0),
        currency: "USD",
      };
    },

    async verify(credentials, value) {
      const res = await doFetch(`${base}/v1/models`, {
        headers: {
          "x-api-key": value.value,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      });
      return res.ok;
    },
  };
}
