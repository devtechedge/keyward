import { cookies } from "next/headers";
import { SpendChart } from "../../components/SpendChart";
import { getOverview } from "../../lib/overview";
import type { WebKey, WebRun } from "../../lib/types";

export const dynamic = "force-dynamic";

/**
 * The control plane always renders the current state.
 *
 * It is not cached, because a dashboard that says "live data" and then shows a
 * stale build is worse than no dashboard. The read is one query per table
 * against a pooler, which is fast enough for a page a human loads.
 */

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function relative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

const STATE_PILL: Record<WebKey["state"], string> = {
  active: "pill-ok",
  stale: "pill-high",
  idle: "pill-muted",
  expiring: "pill-medium",
};

const STATE_LABEL: Record<WebKey["state"], string> = {
  active: "active",
  stale: "stale",
  idle: "idle",
  expiring: "expiring",
};

export default async function DashboardPage() {
  const store = await cookies();
  const accountRef = store.get("kw_account")?.value ?? null;
  const data = await getOverview(accountRef);

  const values = data.spend.map((p) => p.usd);
  const peak = values.length > 0 ? Math.max(...values) : 0;
  const avgPerDay = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const baseline = median(values.slice(0, -1));

  const byKey = new Map<string, number>();
  for (const key of data.keys) {
    if (key.monthlyUsd <= 0) continue;
    byKey.set(key.name, (byKey.get(key.name) ?? 0) + key.monthlyUsd);
  }
  const breakdown = [...byKey.entries()]
    .map(([label, usd]) => ({ label, usd }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  return (
    <main className="shell" style={{ paddingTop: 40, paddingBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 26,
        }}
      >
        <div>
          <span className="eyebrow">Control plane</span>
          <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Your AI keys, under control</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className={`mode-badge ${data.mode === "live" ? "mode-live" : "mode-demo"}`}>
            <span className="dot" />
            {data.mode === "live" ? "Live data" : "Demo data"}
          </span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            refreshed {relative(data.generatedAt)}
          </span>
        </div>
      </div>

      <section className="stats">
        <div className="stat">
          <div className="stat-label">Spend this month</div>
          <div className="stat-value">{money(data.totalMonthlyUsd)}</div>
          <div className="stat-sub">
            <span className={data.spendChangePct > 0 ? "delta-up" : "delta-down"}>
              {data.spendChangePct > 0 ? "▲" : "▼"} {Math.abs(data.spendChangePct).toFixed(1)}%
            </span>{" "}
            against the previous window
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Keys under management</div>
          <div className="stat-value">{data.keyCount}</div>
          <div className="stat-sub">
            across {new Set(data.keys.map((k) => k.provider)).size} provider
            {new Set(data.keys.map((k) => k.provider)).size === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Keys needing attention</div>
          <div className="stat-value" style={{ color: data.atRiskCount > 0 ? "var(--amber)" : undefined }}>
            {data.atRiskCount}
          </div>
          <div className="stat-sub">stale, idle or about to expire</div>
        </div>
        <div className="stat">
          <div className="stat-label">Open anomalies</div>
          <div className="stat-value" style={{ color: data.openAnomalies > 0 ? "var(--red)" : undefined }}>
            {data.openAnomalies}
          </div>
          <div className="stat-sub">
            last scan {data.lastScanAt ? relative(data.lastScanAt) : "never"}
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head">
            <span className="title">
              Spend by day
              <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>
                dashed line is the baseline
              </span>
            </span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {data.spend.length} days
            </span>
          </div>
          <div className="card-body">
            <SpendChart points={data.spend} anomalies={data.anomalies} height={240} />
            <div className="split-stat">
              <SplitStat label="Average per day" value={money(avgPerDay)} />
              <SplitStat label="Peak day" value={money(peak)} />
              <SplitStat label="Baseline" value={money(baseline)} />
            </div>
            {breakdown.length > 0 ? (
              <div className="breakdown">
                <div className="breakdown-head">Where the money goes</div>
                {breakdown.map((row) => (
                  <div className="breakdown-row" key={row.label}>
                    <span className="breakdown-label">{row.label}</span>
                    <span className="breakdown-track" aria-hidden="true">
                      <span
                        className="breakdown-fill"
                        style={{
                          width: `${(row.usd / (breakdown[0]?.usd || 1)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="breakdown-value mono">{money(row.usd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13.8, marginTop: 20, marginBottom: 0 }}>
                No spend has been read yet. Connect a provider on the settings page, or run
                <code className="mono" style={{ margin: "0 4px" }}>
                  keyward spend --days 30
                </code>
                and the numbers appear here.
              </p>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <span className="title">Anomalies</span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {data.anomalies.length} open
            </span>
          </div>
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 6 }}>
            {data.anomalies.length === 0 ? (
              <div className="empty">Nothing unusual. That is the good state.</div>
            ) : (
              data.anomalies.map((anomaly) => (
                <div className="anomaly" key={anomaly.id}>
                  <span
                    className="anomaly-bar"
                    style={{
                      background:
                        anomaly.severity === "critical"
                          ? "var(--red)"
                          : anomaly.severity === "high"
                            ? "var(--orange)"
                            : "var(--amber)",
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="anomaly-title">
                      {anomaly.title}
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {" "}
                        - {anomaly.scope}
                      </span>
                    </div>
                    <div className="anomaly-detail">{anomaly.detail}</div>
                    <div className="faint" style={{ fontSize: 12, marginTop: 5 }}>
                      detected {relative(anomaly.detectedAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <span className="title">Key inventory</span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            values are never shown, only fingerprints and ages
          </span>
        </div>
        {data.keys.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ fontSize: 13.8, margin: 0 }}>
              The provider inventory is empty for this account. Connect OpenAI or Anthropic on the
              settings page and keyward will list every key the organisation holds, with its age and
              idle time.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Provider</th>
                  <th>Scope</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Monthly</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.keys.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <div style={{ fontWeight: 560 }}>{key.name}</div>
                      <div className="faint mono">{key.masked}</div>
                    </td>
                    <td className="muted">{key.provider}</td>
                    <td className="muted">{key.scope}</td>
                    <td className="muted">{daysSince(key.createdAt)}d ago</td>
                    <td className="muted">
                      {key.lastUsedAt ? relative(key.lastUsedAt) : "never used"}
                    </td>
                    <td className="muted">{key.monthlyUsd > 0 ? money(key.monthlyUsd) : "-"}</td>
                    <td>
                      <span className={`pill ${STATE_PILL[key.state]}`}>{STATE_LABEL[key.state]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head">
            <span className="title">Rotation runs</span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              ordered, verified, reversible
            </span>
          </div>
          <div className="card-body">
            {data.runs.length === 0 ? (
              <p className="muted" style={{ fontSize: 13.8, margin: 0 }}>
                No rotation has run yet. Every run creates the replacement, writes it to each consumer,
                proves the change landed, and only then revokes the old key.
              </p>
            ) : (
              data.runs.map((run) => <RunBlock key={run.id} run={run} />)
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <span className="title">Findings from the last scan</span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {data.findings.length} found
            </span>
          </div>
          <div className="card-body" style={{ paddingTop: 6, paddingBottom: 10 }}>
            {data.findings.length === 0 ? (
              <div className="empty">No keys in the working tree.</div>
            ) : (
              <>
                {data.findings.map((finding) => (
                  <div className="anomaly" key={finding.id}>
                    <span
                      className="anomaly-bar"
                      style={{
                        background:
                          finding.severity === "critical"
                            ? "var(--red)"
                            : finding.severity === "high"
                              ? "var(--orange)"
                              : "var(--amber)",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                    <div className="anomaly-title mono">{finding.masked}</div>
                    <div className="anomaly-detail">
                      {finding.pattern}
                      {finding.location && finding.location !== "unknown"
                        ? ` in ${finding.location}`
                        : ""}
                      {finding.live === true ? " - confirmed still live" : ""}
                    </div>
                    </div>
                  </div>
                ))}
                <div className="severity-row">
                  {(["critical", "high", "medium"] as const).map((level) => {
                    const count = data.findings.filter((f) => f.severity === level).length;
                    if (count === 0) return null;
                    return (
                      <span key={level} className={`pill pill-${level}`}>
                        {count} {level}
                      </span>
                    );
                  })}
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    every one is a live credential
                  </span>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function SplitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="split-stat-item">
      <div className="split-stat-label">{label}</div>
      <div className="split-stat-value">{value}</div>
    </div>
  );
}

function RunBlock({ run }: { run: WebRun }) {
  const mark: Record<string, string> = {
    verified: "mark-verified",
    revoked: "mark-verified",
    written: "mark-written",
    created: "mark-created",
    failed: "mark-failed",
    "rolled-back": "mark-rolled-back",
    pending: "",
    skipped: "",
  };
  const glyph: Record<string, string> = {
    verified: "✓",
    revoked: "✓",
    written: "•",
    created: "+",
    failed: "✕",
    "rolled-back": "↺",
    pending: "·",
    skipped: "·",
  };

  return (
    <div style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          className={`pill ${
            run.status === "succeeded"
              ? "pill-ok"
              : run.status === "rolled-back"
                ? "pill-medium"
                : "pill-critical"
          }`}
        >
          {run.status}
        </span>
        <span style={{ fontWeight: 570 }}>{run.secret}</span>
        <span className="faint" style={{ fontSize: 12.5 }}>
          {relative(run.startedAt)} - {(run.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="steps">
        {run.steps.map((step) => (
          <div className="step" key={step.id}>
            <span className={`step-mark ${mark[step.status] ?? ""}`}>{glyph[step.status] ?? "·"}</span>
            <div style={{ minWidth: 0 }}>
              <div className="step-title">{step.target}</div>
              <div className="step-detail">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
