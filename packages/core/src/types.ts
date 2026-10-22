/**
 * Shared vocabulary for keyward.
 *
 * The rule that shapes these types: a raw secret value never appears in a type that
 * crosses a process, network or persistence boundary. Anything that has seen a secret
 * is either the secret itself in memory, or a masked reference to it.
 */

/** A secret that is allowed to exist in memory, and nowhere else. */
export interface SecretValue {
  readonly value: string;
}

/**
 * A secret that has left the process. It carries only enough to identify the secret
 * to a human and to a provider API, never enough to use it.
 */
export interface MaskedSecret {
  /** Stable, non-reversible fingerprint. Same secret always yields the same value. */
  readonly fingerprint: string;
  /** Human readable hint, for example `sk-proj-a1b2…9xyz`. */
  readonly masked: string;
  /** Which provider issued it. */
  readonly provider: ProviderId;
  /** Provider side identifier, when the provider exposes one. */
  readonly providerKeyId?: string;
  /** Logical name assigned by the owner. */
  readonly name?: string;
}

export type ProviderId = "openai" | "anthropic" | "generic";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Where a key was found. */
export type FindingSource =
  | { readonly kind: "file"; readonly path: string; readonly line: number }
  | { readonly kind: "git-history"; readonly path: string; readonly commit: string }
  | { readonly kind: "provider"; readonly provider: ProviderId }
  | { readonly kind: "process-env"; readonly name: string };

export interface Finding {
  readonly id: string;
  readonly secret: MaskedSecret;
  readonly source: FindingSource;
  readonly severity: Severity;
  /** True when the secret was verified live against the provider. */
  readonly live: boolean | null;
  /** Why this severity, in one line. */
  readonly reason: string;
  /** Remediation steps, provider specific. */
  readonly remediation: readonly string[];
}

/** One AI key as the provider reports it. */
export interface ProviderKey {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly maskedValue: string;
  /** Set for provider service accounts, where usage rolls up to the account. */
  readonly serviceAccount?: string;
}

export interface SpendPoint {
  /** Bucket start, ISO 8601. */
  readonly at: string;
  readonly spendUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly requests: number;
  /** Present when the provider can break spend down by key. */
  readonly byKey?: Readonly<Record<string, number>>;
  readonly byModel?: Readonly<Record<string, number>>;
}

export interface SpendSummary {
  readonly provider: ProviderId;
  readonly points: readonly SpendPoint[];
  readonly totalUsd: number;
  readonly currency: "USD";
}

export interface Anomaly {
  readonly id: string;
  readonly provider: ProviderId;
  readonly detectedAt: Date;
  readonly severity: Severity;
  /** What the spend was. */
  readonly observedUsd: number;
  /** What the baseline predicted. */
  readonly baselineUsd: number;
  /** observed / baseline, for example 3.4 for a 340 percent jump. */
  readonly ratio: number;
  readonly scope: string;
  readonly summary: string;
  /** Longer explanation of what happened and what to do. */
  readonly detail?: string;
  readonly baselineDays: number;
}

/** A consumer of a secret that must be updated during rotation. */
export interface RotationTarget {
  /** Stable id, used in logs and in the report. */
  readonly id: string;
  /** What kind of destination this is. */
  readonly kind: TargetKind;
  /** Where the secret physically lives, for example `acme/app` or `repo:acme/api`. */
  readonly locator: string;
  /** Optional note for the operator. */
  readonly note?: string;
}

export type TargetKind =
  | "vercel-env"
  | "github-actions"
  | "supabase-env"
  | "local-env"
  | "fly-secret"
  | "netlify-env"
  | "cloudflare-secret"
  | "manual";
export type RotationStepStatus =
  | "pending"
  | "created"
  | "written"
  | "verified"
  | "revoked"
  | "skipped"
  | "failed"
  | "rolled-back";

export interface RotationStep {
  readonly targetId: string;
  readonly kind: TargetKind;
  readonly status: RotationStepStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly detail: string;
  /** Set when the step failed. */
  readonly error?: string;
}

export interface RotationPlan {
  readonly id: string;
  readonly secretName: string;
  readonly provider: ProviderId;
  readonly createdAt: Date;
  readonly targets: readonly RotationTarget[];
  /** Overlap window during which both the old and new secret are valid. */
  readonly overlapSeconds: number;
}

export interface RotationRun {
  readonly id: string;
  readonly planId: string;
  readonly secretName: string;
  readonly provider: ProviderId;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly steps: readonly RotationStep[];
  readonly status: "running" | "succeeded" | "failed" | "rolled-back";
  /** Set when the run was rolled back. */
  readonly rollbackReason?: string;
}

export interface Policy {
  readonly id: string;
  readonly name: string;
  /** Which providers it applies to. Empty means all. */
  readonly providers: readonly ProviderId[];
  /** How often a secret should be rotated. */
  readonly rotateAfterDays: number;
  /** Warn when a secret has not been used for this long. */
  readonly idleAfterDays: number;
  /** Alert when a single day of spend exceeds baseline by this factor. */
  readonly spendSpikeFactor: number;
  /** Alert when a single day of spend crosses this amount in USD. */
  readonly spendSpikeFloorUsd: number;
  readonly enabled: boolean;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  /** True when the provider exposes an API to list the keys an org holds. */
  readonly supportsInventory: boolean;
  /** True when the provider exposes an API to create a replacement key. */
  readonly supportsRotation: boolean;
  /** True when the provider exposes an API to read spend. */
  readonly supportsSpend: boolean;
  listKeys(credentials: ProviderCredentials): Promise<readonly ProviderKey[]>;
  /** Create a replacement key. Returns the raw value once, for delivery. */
  createKey(
    credentials: ProviderCredentials,
    options: { readonly name: string; readonly expiresInSeconds?: number; readonly scopes?: readonly string[] },
  ): Promise<{ readonly key: ProviderKey; readonly value: SecretValue }>;
  revokeKey(credentials: ProviderCredentials, keyId: string): Promise<void>;
  getSpend(credentials: ProviderCredentials, options: SpendQuery): Promise<SpendSummary>;
  /** Check whether a raw secret still works. */
  verify(credentials: ProviderCredentials, value: SecretValue): Promise<boolean>;
}

export interface ProviderCredentials {
  readonly provider: ProviderId;
  /** Admin key or organisation token, as the provider requires. */
  readonly adminToken: SecretValue;
  /** Optional project or workspace scoping. */
  readonly projectId?: string;
}

export interface SpendQuery {
  readonly from: Date;
  readonly to: Date;
  readonly bucket: "1d" | "1h";
}
