import type {
  ProviderAdapter,
  ProviderCredentials,
  ProviderKey,
  SpendQuery,
  SpendSummary,
} from "../types.js";

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export interface AdapterContext {
  readonly fetch?: FetchLike;
  readonly baseUrl?: string;
}

interface OpenAIAdminKey {
  readonly id: string;
  readonly name: string;
  readonly created_at: number;
  readonly last_used_at?: number | null;
  readonly expires_at?: number | null;
  readonly redacted_value?: string;
  readonly value?: string;
  readonly owner?: { readonly name?: string };
}

interface OpenAIListResponse {
  readonly data: readonly OpenAIAdminKey[];
}

interface OpenAIMessageUsage {
  readonly results?: readonly {
    readonly starting_at?: number;
    readonly ending_at?: number;
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly num_model_requests?: number;
    readonly model?: string;
    readonly api_key_id?: string;
  }[];
}

const OPENAI_BASE = "https://api.openai.com";

function seconds(ms: number | null | undefined): Date | null {
  if (!ms) return null;
  return new Date(ms * 1000);
}

export function createOpenAIAdapter(context: AdapterContext = {}): ProviderAdapter {
  const doFetch: FetchLike = context.fetch ?? ((input, init) => fetch(input, init));
  const base = context.baseUrl ?? OPENAI_BASE;

  async function admin(
    credentials: ProviderCredentials,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return doFetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.adminToken.value}`,
        ...(init.headers ?? {}),
      },
    });
  }

  return {
    id: "openai",
    displayName: "OpenAI",
    supportsInventory: true,
    supportsRotation: true,
    supportsSpend: true,

    async listKeys(credentials) {
      const res = await admin(credentials, "/v1/organization/admin_api_keys?limit=100");
      if (!res.ok) {
        throw new Error(`OpenAI admin key list failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as OpenAIListResponse;
      return body.data.map(
        (k): ProviderKey => ({
          id: k.id,
          name: k.name,
          createdAt: seconds(k.created_at) ?? new Date(0),
          lastUsedAt: seconds(k.last_used_at),
          expiresAt: seconds(k.expires_at),
          maskedValue: k.redacted_value ?? "sk-…",
          ...(k.owner?.name ? { serviceAccount: k.owner.name } : {}),
        }),
      );
    },

    async createKey(credentials, options) {
      const body: Record<string, unknown> = { name: options.name };
      if (options.expiresInSeconds !== undefined) body.expires_in_seconds = options.expiresInSeconds;
      if (options.scopes && options.scopes.length > 0) body.scopes = options.scopes;

      const res = await admin(credentials, "/v1/organization/admin_api_keys", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`OpenAI key create failed: ${res.status} ${await res.text()}`);
      }
      const created = (await res.json()) as OpenAIAdminKey;
      if (!created.value) {
        throw new Error("OpenAI returned no key value; the value is only shown once at creation");
      }
      return {
        key: {
          id: created.id,
          name: created.name,
          createdAt: seconds(created.created_at) ?? new Date(),
          lastUsedAt: seconds(created.last_used_at),
          expiresAt: seconds(created.expires_at),
          maskedValue: created.redacted_value ?? "sk-…",
        },
        value: { value: created.value },
      };
    },

    async revokeKey(credentials, keyId) {
      const res = await admin(credentials, `/v1/organization/admin_api_keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`OpenAI key revoke failed: ${res.status} ${await res.text()}`);
      }
    },

    async getSpend(credentials, query: SpendQuery): Promise<SpendSummary> {
      const bucket = query.bucket;
      const params = new URLSearchParams({
        bucket_width: bucket,
        start_time: String(Math.floor(query.from.getTime() / 1000)),
        end_time: String(Math.floor(query.to.getTime() / 1000)),
      });
      const res = await admin(
        credentials,
        `/v1/organization/usage/completions?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(`OpenAI usage query failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as OpenAIMessageUsage;
      const points = (body.results ?? []).map((row) => ({
        at: new Date((row.starting_at ?? 0) * 1000).toISOString(),
        spendUsd: 0,
        inputTokens: row.input_tokens ?? 0,
        outputTokens: row.output_tokens ?? 0,
        requests: row.num_model_requests ?? 0,
        ...(row.model ? { byModel: { [row.model]: 1 } } : {}),
      }));
      return {
        provider: "openai",
        points,
        totalUsd: points.reduce((sum, p) => sum + p.spendUsd, 0),
        currency: "USD",
      };
    },

    async verify(credentials, value) {
      // The cheapest live check is a request that a project key can make but a
      // revoked key cannot. A models list is the conventional probe.
      const res = await doFetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${value.value}` },
      });
      return res.ok;
    },
  };
}
