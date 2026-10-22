<div align="center">

# keyward

**Find, rotate and police every AI API key your company holds.**

An API key is a credit card for compute now. keyward finds every AI provider key in
your stack, rotates them across every consumer with verification and rollback, and tells
you the moment spend breaks pattern.

[Live control plane](https://keyward-seven.vercel.app) ·
[Source](https://github.com/devtechedge/keyward) ·
[Dashboard](https://keyward-seven.vercel.app/dashboard)

</div>

---

## The problem

Three jobs hide inside "AI key management", and most tools only do one of them.

| Job | State of the market |
| --- | --- |
| **See every key you hold** | Solved and nearly free. GitHub secret scanning blocks OpenAI and Anthropic keys by default. gitleaks and trufflehog are mature. |
| **See what the keys cost** | Saturated. Five credible tools charge under $30 a month for a spend dashboard. |
| **Rotate a key across everything that uses it** | **Not solved.** One logical secret lives in Vercel, GitHub Actions, Supabase, a local `.env` and CI. Rotating it means creating the replacement, writing it to every consumer in the right order, proving each one now holds the new value, and only then revoking the old one. Every open source tool in this space ships "no rollback" or "manual-assist". |

keyward is built around the third job.

## What makes rotation hard

Most rotation advice is wrong in one specific way: **it revokes too early**.

```
1. create the replacement at the provider
2. write it to every consumer, one at a time
3. read each one back and prove it changed
4. only now revoke the old secret
```

If you deactivate the old key before your services have picked up the replacement, you
cause an outage. If you rotate weekly without a dual key window, you cause an outage
every week.

And rotation does not close the real hole. A key copied before the rotation is still
valid. That is why keyward also reports key age, idle time and scope, so you can see
which credentials are worth the trouble of rotating at all.

## Install

```bash
npm install -g @keyward/cli
# or, without installing
npx keyward scan . --history
```

## Use

```bash
# Find every AI provider key in the working tree and in git history
keyward scan . --history

# Connect a provider. The admin key is stored in a 0600 file, never in the config.
keyward connect --provider openai --token sk-admin-...

# List every key your organisation holds, with age, idle time and policy verdicts
keyward inventory

# Read spend and flag anomalies against a median baseline
keyward spend --days 30

# Rotate across every consumer, with verification and rollback
keyward rotate plan.json --dry-run
keyward rotate plan.json

# Check which providers are connected and reachable
keyward doctor
```

Values are never printed, never logged and never stored. Findings carry a
non-reversible fingerprint and a mask.

## A rotation plan

The plan names projects, repos, variables and paths. It never holds a secret, so it is
safe to commit and safe to review like any other configuration.

```json
{
  "version": 1,
  "secrets": [
    {
      "name": "OPENAI_API_KEY",
      "provider": "openai",
      "overlapSeconds": 3600,
      "targets": [
        { "id": "vercel-prod", "kind": "vercel-env", "project": "acme-api",
          "environments": ["production"], "variable": "OPENAI_API_KEY" },
        { "id": "gha-api", "kind": "github-actions", "repo": "acme/api",
          "variable": "OPENAI_API_KEY" },
        { "id": "local", "kind": "local-env", "path": ".env.local",
          "variable": "OPENAI_API_KEY" }
      ]
    }
  ]
}
```

Supported target kinds: `vercel-env`, `github-actions`, `supabase-env`, `local-env`,
`fly-secret`, `netlify-env`, `cloudflare-secret` and `manual`. Anything with a command
works too, and the new value arrives on stdin so it never lands in a process listing or
a shell history.

## Providers

| Provider | Inventory | Rotate | Spend |
| --- | --- | --- | --- |
| OpenAI | yes, Admin API | yes, service account and admin keys with expiry and scopes | yes |
| Anthropic | yes, Admin API | yes, organisation keys | yes |

Detection covers OpenAI (admin, project, service account), Anthropic (admin and
standard), OpenRouter, Google AI, Groq, Hugging Face, xAI, Supabase and DeepSeek.

## Anomalies

The baseline is the **median** of the trailing window, not the mean, so one previous
spike does not raise the bar and hide the next one. A spike is only reported when it
also clears an absolute floor, because a 400 percent jump on three dollars is noise.
A collapse in spend is reported too, because that usually means a key died, a job
stopped, or traffic moved somewhere you cannot see.

## Architecture

```
packages/core   provider adapters, detection, rotation engine, anomaly detection
packages/cli    the keyward command
apps/web        the hosted control plane, Next.js, server rendered
```

The hosted control plane reads from Neon. When no database is configured it serves a
demo dataset and says so, so the public view is never a broken shell and never implies
live data that is not there.

## Security properties

- A raw secret never crosses a process, network or persistence boundary in this codebase.
  Types enforce it: `SecretValue` is the only type that may hold a value, and anything
  that has seen a secret becomes a `MaskedSecret` with a fingerprint.
- Findings are deduplicated by fingerprint, so one leaked key in twelve files is one
  finding.
- Rotation runs are append only. The old key is revoked last, and a failure restores
  what was written and says clearly when a destination cannot be restored.
- The plan file holds no values, so it is safe in git.

## Development

```bash
npm install
npm run build
npm test
npm run dev:web
```

## Licence

Apache 2.0. See [LICENSE](LICENSE).
