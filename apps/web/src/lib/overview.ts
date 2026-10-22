import { demoOverview } from "./demo";
import { hasDatabase, query } from "./db";
import type {
  WebAnomaly,
  WebFinding,
  WebKey,
  WebOverview,
  WebRun,
  WebSpendPoint,
} from "./types";

/**
 * Read the control plane state.
 *
 * A visitor with no account gets the demo dataset, so the public view is a
 * working product rather than an empty shell. A visitor with an account
 * reference gets their own data, and only theirs.
 */
export async function getOverview(accountRef?: string | null): Promise<WebOverview> {
  if (!accountRef || !hasDatabase()) {
    return demoOverview();
  }

  try {
    const [spendRows, keyRows, anomalyRows, runRows, findingRows, metaRows] = await Promise.all([
      query<{ at: string; usd: string }>(
        "select bucket as at, sum(spend_usd)::text as usd from keyward_spend_daily where account_ref = $1 group by bucket order by bucket",
        [accountRef],
      ),
      query<{
        id: string;
        provider: string;
        name: string;
        masked: string;
        created_at: string;
        last_used_at: string | null;
        expires_at: string | null;
        scope: string | null;
        service_account: string | null;
        monthly_usd: string;
        state: string;
        finding_id: string | null;
      }>(
        "select id, provider, name, masked, created_at, last_used_at, expires_at, scope, service_account, monthly_usd, state, finding_id from keyward_keys where account_ref = $1 order by created_at desc",
        [accountRef],
      ),
      query<{
        id: string;
        provider: string;
        severity: string;
        title: string;
        detail: string;
        observed_usd: string;
        baseline_usd: string;
        ratio: string;
        detected_at: string;
        scope: string;
      }>(
        "select id, provider, severity, title, detail, observed_usd, baseline_usd, ratio, detected_at, scope from keyward_anomalies where account_ref = $1 order by detected_at desc limit 50",
        [accountRef],
      ),
      query<{
        id: string;
        secret: string;
        provider: string;
        status: string;
        started_at: string;
        duration_ms: number;
        steps: unknown;
      }>(
        "select id, secret, provider, status, started_at, duration_ms, steps from keyward_runs where account_ref = $1 order by started_at desc limit 20",
        [accountRef],
      ),
      query<{
        id: string;
        provider: string;
        pattern: string;
        masked: string;
        severity: string;
        location: string;
        live: boolean | null;
        detected_at: string;
      }>(
        "select id, provider, pattern, masked, severity, location, live, detected_at from keyward_findings where account_ref = $1 order by detected_at desc limit 100",
        [accountRef],
      ),
      query<{ total_usd: string; key_count: string; at_risk: string; last_scan: string | null }>(
        "select (select coalesce(sum(spend_usd),0) from keyward_spend_daily where account_ref = $1 and bucket >= date_trunc('month', now()))::text as total_usd, (select count(*) from keyward_keys where account_ref = $1)::text as key_count, (select count(*) from keyward_keys where account_ref = $1 and state <> 'active')::text as at_risk, (select max(detected_at) from keyward_findings where account_ref = $1)::text as last_scan",
        [accountRef],
      ),
    ]);

    const spend: WebSpendPoint[] = spendRows.map((r) => ({
      at: r.at,
      usd: Number(r.usd),
    }));
    const webKeys: WebKey[] = keyRows.map((r) => ({
      id: r.id,
      provider: r.provider as WebKey["provider"],
      name: r.name,
      masked: r.masked,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      expiresAt: r.expires_at,
      scope: r.scope ?? "organisation default",
      serviceAccount: r.service_account,
      monthlyUsd: Number(r.monthly_usd),
      state: r.state as WebKey["state"],
      findingId: r.finding_id,
    }));
    const webAnomalies: WebAnomaly[] = anomalyRows.map((r) => ({
      id: r.id,
      provider: r.provider,
      severity: r.severity as WebAnomaly["severity"],
      title: r.title,
      detail: r.detail,
      observedUsd: Number(r.observed_usd),
      baselineUsd: Number(r.baseline_usd),
      ratio: Number(r.ratio),
      detectedAt: r.detected_at,
      scope: r.scope,
    }));
    const webRuns: WebRun[] = runRows.map((r) => ({
      id: r.id,
      secret: r.secret,
      provider: r.provider,
      status: r.status as WebRun["status"],
      startedAt: r.started_at,
      durationMs: Number(r.duration_ms),
      steps: (r.steps ?? []) as WebRun["steps"],
    }));
    const webFindings: WebFinding[] = findingRows.map((r) => ({
      id: r.id,
      provider: r.provider,
      pattern: r.pattern,
      masked: r.masked,
      severity: r.severity as WebFinding["severity"],
      location: r.location,
      live: r.live,
      detectedAt: r.detected_at,
    }));

    const meta = metaRows[0];
    const previous = spend.slice(-31, -1).reduce((sum, p) => sum + p.usd, 0);
    const total = Number(meta?.total_usd ?? 0);

    return {
      generatedAt: new Date().toISOString(),
      mode: "live",
      totalMonthlyUsd: total,
      spendChangePct: previous > 0 ? ((total - previous) / previous) * 100 : 0,
      keyCount: Number(meta?.key_count ?? webKeys.length),
      atRiskCount: Number(meta?.at_risk ?? 0),
      openAnomalies: webAnomalies.length,
      lastScanAt: meta?.last_scan ?? null,
      spend,
      keys: webKeys,
      anomalies: webAnomalies,
      runs: webRuns,
      findings: webFindings,
    };
  } catch {
    return demoOverview();
  }
}
