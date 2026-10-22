import Link from "next/link";
import { getOverview } from "../lib/overview";
import { SpendChart } from "../components/SpendChart";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "⌖",
    title: "Finds the keys you forgot",
    body: "A scan of the working tree, git history and provider inventories produces one list of every AI key your company holds, with age, idle time and scope.",
  },
  {
    icon: "⟳",
    title: "Rotates without a window of downtime",
    body: "Create, write to every consumer, prove each one now holds the new value, and only then revoke the old one. A failure rolls back.",
  },
  {
    icon: "◔",
    title: "Catches spend that looks wrong",
    body: "A median baseline rather than a mean, so one previous spike does not hide the next one. Spikes and collapses both get flagged.",
  },
];

export default async function HomePage() {
  const data = await getOverview(null);
  const top = data.spend.slice(-21);

  return (
    <main>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <span className="eyebrow">Open source AI key governance</span>
            <h1>
              Every AI key your company holds,
              <br />
              under control.
            </h1>
            <p className="lede">
              An API key is a credit card for compute now. keyward finds every AI provider key in
              your stack, rotates them across every consumer with verification and rollback, and
              tells you the moment spend breaks pattern.
            </p>

            <div className="hero-cta">
              <Link className="btn btn-primary" href="/dashboard">
                See the control plane
              </Link>
              <a
                className="btn"
                href="https://github.com/devtechedge/keyward"
                rel="noreferrer noopener"
                target="_blank"
              >
                Read the source
              </a>
            </div>

            <div className="install" id="install">
              <span className="prompt">$</span>
              <code>npx keyward scan . --history</code>
              <button
                className="copy-btn"
                type="button"
                data-copy="npx keyward scan . --history"
              >
                copy
              </button>
            </div>
            <p className="hero-note">
              Values are never printed, never logged and never stored. Findings carry a
              fingerprint and a mask.
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="title">Spend, last 21 days</span>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {data.mode === "live" ? "live" : "demo"}
              </span>
            </div>
            <div className="card-body">
              <SpendChart points={top} anomalies={data.anomalies} height={200} />
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  marginTop: 16,
                  flexWrap: "wrap",
                  fontSize: 13,
                }}
              >
                <span className="muted">
                  <span className="mono" style={{ color: "var(--accent)" }}>
                    {data.keyCount}
                  </span>{" "}
                  keys tracked
                </span>
                <span className="muted">
                  <span className="mono" style={{ color: "var(--red)" }}>
                    {data.openAnomalies}
                  </span>{" "}
                  anomalies open
                </span>
                <span className="muted">
                  <span className="mono" style={{ color: "var(--amber)" }}>
                    {data.atRiskCount}
                  </span>{" "}
                  need attention
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">What it does</span>
              <h2 style={{ marginTop: 12 }}>
                Three jobs. Most tools do one of them badly.
              </h2>
              <p className="section-lede">
                Dashboards are cheap because the data is easy. Rotation is hard because one secret
                lives in many places. keyward is built around the hard part.
              </p>
            </div>
          </div>

          <div className="features">
            {FEATURES.map((feature) => (
              <div className="feature" key={feature.title}>
                <div className="feature-icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid-2">
            <div className="card card-pad">
              <span className="eyebrow">Rotation</span>
              <h2 style={{ marginTop: 12 }}>The order is the whole trick</h2>
              <p className="muted" style={{ marginTop: 12, fontSize: 14.5 }}>
                Revoking a key before your services have picked up the replacement is how rotation
                causes an outage. keyward never does that, and it does not leave you with a secret
                nobody has a record of.
              </p>
              <pre className="code" style={{ marginTop: 18 }}>
                <code>
                  <span className="c-comment">{"1. create the replacement at the provider"}</span>
                  {"\n"}
                  <span className="c-comment">{"2. write it to every consumer, one at a time"}</span>
                  {"\n"}
                  <span className="c-comment">{"3. read each one back and prove it changed"}</span>
                  {"\n"}
                  <span className="c-comment">{"4. only now revoke the old secret"}</span>
                  {"\n\n"}
                  <span className="c-key">{"a failure at step 2 rolls back step 1"}</span>
                </code>
              </pre>
            </div>

            <div className="card card-pad">
              <span className="eyebrow">A plan</span>
              <h2 style={{ marginTop: 12 }}>Values free, so it is safe to commit</h2>
              <p className="muted" style={{ marginTop: 12, fontSize: 14.5 }}>
                A rotation plan names projects, repos, variables and paths. It never holds a
                secret, so it can live in git and be reviewed like any other configuration.
              </p>
              <pre className="code" style={{ marginTop: 18 }}>
                <code>
                  {"{\n"}
                  {"  "}
                  <span className="c-key">"version"</span>
                  {": "}
                  <span className="c-str">1</span>
                  {",\n"}
                  {"  "}
                  <span className="c-key">"secrets"</span>
                  {": [{\n"}
                  {"    "}
                  <span className="c-key">"name"</span>
                  {": "}
                  <span className="c-str">"OPENAI_API_KEY"</span>
                  {",\n"}
                  {"    "}
                  <span className="c-key">"provider"</span>
                  {": "}
                  <span className="c-str">"openai"</span>
                  {",\n"}
                  {"    "}
                  <span className="c-key">"targets"</span>
                  {": [{\n"}
                  {"      "}
                  <span className="c-key">"kind"</span>
                  {": "}
                  <span className="c-str">"vercel-env"</span>
                  {",\n"}
                  {"      "}
                  <span className="c-key">"project"</span>
                  {": "}
                  <span className="c-str">"acme-api"</span>
                  {",\n"}
                  {"      "}
                  <span className="c-key">"variable"</span>
                  {": "}
                  <span className="c-str">"OPENAI_API_KEY"</span>
                  {"\n    }]\n  }]\n}"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="card card-pad" style={{ textAlign: "center", padding: "40px 24px" }}>
            <h2>See it against your own keys</h2>
            <p className="muted" style={{ margin: "12px auto 0", maxWidth: "52ch" }}>
              The control plane is live and hosted. No install, no signup for a look.
            </p>
            <div className="hero-cta" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/dashboard">
                Open the dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
