import { findInText } from "./github.js";
import { fingerprint, mask } from "./redact.js";
import type { Finding, Severity } from "./types.js";

/**
 * Scan Vercel project environment variables for provider keys.
 *
 * Two signals, because one is not enough.
 *
 * The **value** is the direct signal, but Vercel only returns a plaintext value
 * for a plain environment variable. A sensitive or encrypted variable comes back
 * as a mask or as ciphertext, so a value scan alone reports nothing on a real
 * account.
 *
 * The **name** is the signal that actually works. A variable called
 * `OPENAI_API_KEY` is a stored AI credential whatever the value looks like. So
 * the name is matched against the provider variable names as well, and that
 * finding stands on its own.
 *
 * No raw value ever leaves this module.
 */

const VERCEL_API_BASE = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VercelApiError";
  }
}

interface JsonObject {
  [key: string]: unknown;
}

async function vercelCall(
  path: string,
  token: string,
  doFetch: typeof fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await doFetch(`${VERCEL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new VercelApiError(`Vercel network error: ${(err as Error).message}`);
  }
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new VercelApiError(
      `Vercel API error ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }
  return json;
}

function asArray(value: unknown, what: string): JsonObject[] {
  if (Array.isArray(value)) return value as JsonObject[];
  if (value && typeof value === "object") {
    const obj = value as JsonObject;
    if (Array.isArray(obj.projects)) return obj.projects as JsonObject[];
    if (Array.isArray(obj.envs)) return obj.envs as JsonObject[];
    if (Array.isArray(obj.env)) return obj.env as JsonObject[];
    if (Array.isArray(obj.data)) return obj.data as JsonObject[];
  }
  throw new VercelApiError(`Vercel response missing ${what} array`);
}

/**
 * Environment variable names that hold an AI provider credential.
 *
 * A name match is a real finding even when the value is unreadable, because
 * the credential is still stored there.
 */
const PROVIDER_VARIABLES: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly provider: string;
  readonly severity: Severity;
}> = [
  { pattern: /^(OPENAI|ANTHROPIC|GOOGLE|GEMINI|GROQ|MISTRAL|XAI|DEEPSEEK|HUGGINGFACE|HF|OPENROUTER|TOGETHER|MOONSHOT|COHERE|REPLICATE|PERPLEXITY)_API_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^(OPENAI|ANTHROPIC)_ADMIN_KEY$/i, provider: "openai", severity: "critical" },
  { pattern: /^(OPENAI|ANTHROPIC)_ADMIN_API_KEY$/i, provider: "openai", severity: "critical" },
  { pattern: /^OPENAI_ADMIN_KEY$/i, provider: "openai", severity: "critical" },
  { pattern: /^ANTHROPIC_ADMIN_KEY$/i, provider: "anthropic", severity: "critical" },
  { pattern: /^(OPENAI|ANTHROPIC)_SERVICE_ACCOUNT_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^(OPENAI|ANTHROPIC)_PROJECT_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^(TAVILY|LANGCHAIN|LANGSMITH|EXA|FIRECRAWL|PERPLEXITY_API)_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^SUPABASE_(SERVICE_ROLE|SECRET|ADMIN)_KEY$/i, provider: "generic", severity: "critical" },
  { pattern: /^GOOGLE_API_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^GEMINI_API_KEY$/i, provider: "generic", severity: "high" },
  { pattern: /^XAI_API_KEY$/i, provider: "generic", severity: "high" },
];

export interface VercelScanOptions {
  readonly token: string;
  readonly teamId: string;
  readonly limitProjects?: number;
  readonly fetch?: typeof fetch;
}

export interface VercelScanResult {
  readonly scannedProjects: number;
  readonly scannedVars: number;
  readonly findings: readonly Finding[];
  readonly providersFound: readonly string[];
}

function nameFinding(
  envKey: string,
  project: string,
  provider: string,
  severity: Severity,
): Finding {
  return {
    id: `vercel-name:${provider}:${envKey}:${project}`,
    secret: {
      fingerprint: fingerprint(`${project}:${envKey}`),
      masked: mask(envKey),
      provider: provider as Finding["secret"]["provider"],
    },
    source: { kind: "file", path: `${project} / ${envKey}`, line: 0 },
    severity,
    live: null,
    reason: `${envKey} is stored in the Vercel project ${project}`,
    remediation: [
      "The value is encrypted at rest, so it cannot be read back, but the credential is still there.",
      "Rotate it at the provider, write the replacement to the Vercel environment, then revoke the old one.",
    ],
  };
}

/**
 * Read every project's environment variables and look for provider keys.
 */
export async function scanVercelEnv(
  options: VercelScanOptions,
): Promise<VercelScanResult> {
  const doFetch = options.fetch ?? fetch;
  const projects = asArray(
    await vercelCall(
      `/v9/projects?teamId=${encodeURIComponent(options.teamId)}`,
      options.token,
      doFetch,
    ),
    "projects",
  );
  const limited =
    options.limitProjects && options.limitProjects > 0
      ? projects.slice(0, options.limitProjects)
      : projects;

  const findings: Finding[] = [];
  const seen = new Set<string>();
  let scannedVars = 0;

  for (const project of limited) {
    const name =
      typeof project.name === "string" ? project.name : String(project.id ?? "");
    if (!name) continue;

    const envJson = await vercelCall(
      `/v9/projects/${encodeURIComponent(name)}/env?teamId=${encodeURIComponent(options.teamId)}`,
      options.token,
      doFetch,
    );
    const envs = asArray(envJson, "env");

    for (const env of envs) {
      const envKey = typeof env.key === "string" ? env.key : "";
      if (!envKey) continue;
      scannedVars += 1;

      // Signal one, the name. This is the one that works on a real account.
      for (const rule of PROVIDER_VARIABLES) {
        if (!rule.pattern.test(envKey)) continue;
        const finding = nameFinding(envKey, name, rule.provider, rule.severity);
        if (seen.has(finding.id)) continue;
        seen.add(finding.id);
        findings.push(finding);
      }

      // Signal two, the value, when Vercel hands it over in the clear.
      let value: unknown = env.value;
      if (value && typeof value === "object" && "value" in (value as JsonObject)) {
        value = (value as JsonObject).value;
      }
      if (typeof value !== "string" || value === "") continue;

      for (const finding of findInText(value)) {
        if (seen.has(finding.id)) continue;
        seen.add(finding.id);
        findings.push({
          ...finding,
          source: { kind: "file", path: `${name} / ${envKey}`, line: 0 },
          reason: `${finding.reason} in the Vercel environment variable ${envKey} of project ${name}`,
        });
      }
    }
  }

  return {
    scannedProjects: limited.length,
    scannedVars,
    findings,
    providersFound: [...new Set(findings.map((f) => f.secret.provider))],
  };
}
