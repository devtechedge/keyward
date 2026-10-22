export const metadata = {
  title: "Pricing - keyward",
  description:
    "keyward pricing. One plan, a monthly subscription, no usage based billing. The CLI is free and open source.",
};

const PLANS = [
  {
    name: "Open source",
    price: "Free",
    unit: "forever",
    highlight: false,
    tagline: "The CLI, on your own machine, with your own credentials.",
    features: [
      "Every scan, inventory, spend and rotation command",
      "GitHub, Vercel and local scanning",
      "Rotation with read-back verification and rollback",
      "Spend anomalies against a median baseline",
      "Slack and webhook alerts",
      "MIT licensed, self hosted, no telemetry",
    ],
    cta: "npx --yes github:devtechedge/keyward",
  },
  {
    name: "Team",
    price: "$99",
    unit: "per month",
    highlight: true,
    tagline: "For a company running agents, where the keys are spread across many places.",
    features: [
      "Everything in the open source CLI",
      "A hosted control plane with every key in one list",
      "Rotation runs for every secret, with an audit trail",
      "Scheduled scans and weekly digests",
      "Alerts to Slack with the key and the numbers attached",
      "Evidence exports for a security review",
      "Cancel any time, no usage based billing",
    ],
    cta: "Start with the CLI",
  },
];

const FAQ = [
  {
    q: "Why a subscription rather than per key?",
    a: "Because the work is the coordination, not the counting. The hard part is writing a new value to every consumer in the right order and proving it landed. That is the same work whether you have four keys or four hundred, so the price does not scale with the number of keys.",
  },
  {
    q: "Do you need my provider admin key?",
    a: "Only to read your key inventory and your spend, and to create a replacement during a rotation. The admin key is read only for anything to do with reporting. It is stored encrypted, it is never written to a log, and a value that has been seen is reduced to a fingerprint and a mask before it is stored anywhere.",
  },
  {
    q: "What happens to my keys when I cancel?",
    a: "The CLI keeps working, it always did. The hosted control plane stops. Your key material never left your machine in the first place unless you connected a provider for inventory.",
  },
  {
    q: "Is the demo on this site real?",
    a: "The control plane is live and hosted. It renders a demo dataset until a real scan or rotation is pushed into it, and it always says which mode it is in, so a demo is never passed off as live.",
  },
];

export default function PricingPage() {
  return (
    <main className="shell" style={{ paddingTop: 56, paddingBottom: 20 }}>
      <div style={{ maxWidth: "62ch" }}>
        <span className="eyebrow">Pricing</span>
        <h1 style={{ fontSize: "2.2rem", marginTop: 12 }}>One plan, a month, no surprises</h1>
        <p className="lede">
          The CLI is free and always will be. The subscription buys the hosted control plane and the
          part that is genuinely hard to do yourself: knowing where every key is, and proving a
          rotation landed.
        </p>
      </div>

      <div className="plans">
        {PLANS.map((plan) => (
          <div className={`plan${plan.highlight ? " plan-highlight" : ""}`} key={plan.name}>
            <div className="plan-head">
              <h3>{plan.name}</h3>
              <p className="plan-tagline">{plan.tagline}</p>
            </div>
            <div className="plan-price">
              <span className="plan-amount">{plan.price}</span>
              <span className="plan-unit">{plan.unit}</span>
            </div>
            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a
              className={`btn ${plan.highlight ? "btn-primary" : ""}`}
              href={plan.highlight ? "/dashboard" : "https://github.com/devtechedge/keyward"}
              rel={plan.highlight ? undefined : "noreferrer noopener"}
              target={plan.highlight ? undefined : "_blank"}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>

      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Questions</span>
            <h2 style={{ marginTop: 12 }}>The ones worth asking</h2>
          </div>
        </div>
        <div className="faq">
          {FAQ.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
