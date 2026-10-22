# Security

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Older | No |

## Reporting a vulnerability

Email **devtechedge@gmail.com** with the subject `keyward security report`.

Please include:

- What is affected: the CLI, the web app, the rotation engine, a provider adapter or a consumer adapter.
- The version or commit.
- Steps to reproduce, without including a real credential.
- The impact you believe it has.
- Any suggested fix or mitigation.

Do not open a public issue for a vulnerability. Do not send live API keys, admin tokens or production
configuration. Use fake values assembled at runtime if you need to show a parsing or rotation problem.

I will acknowledge a report within 48 hours and aim to have a fix or mitigation within 7 days for a
confirmed issue. I will credit the reporter if they want credit.

## Scope

In scope:

- The `keyward` CLI, in particular the rotation engine and the escrow.
- The hosted control plane, in particular the account connections and the API routes.
- A provider adapter that reports a key as live when it is not, or fails to revoke a key it claimed
  to revoke.

Out of scope:

- A provider's own security posture. keyward uses the provider's Admin API and inherits its
  permissions.
- Rotating a key that a customer did not connect.
- Denial of service against the hosted app.
- Social engineering of a customer into pasting a credential into a chat.

## How this project handles secrets

This is a tool that deals with credentials, so its own handling is the first thing to check.

**A raw secret never crosses a process, network or persistence boundary.** The types enforce it.
`SecretValue` is the only type in the core that may hold a value, and anything that has seen a secret
becomes a `MaskedSecret` carrying a non-reversible fingerprint and a mask.

- **Findings are deduplicated by fingerprint.** One leaked key in twelve files is one finding.
- **The scanner never prints a value.** A test asserts the value is absent from the JSON output, and
  the CI smoke test asserts the same.
- **A rotation plan holds no values.** It names projects, repos, variables and paths, so it is safe
  in git and safe to review.
- **The value being replaced is escrowed, encrypted.** If a rotation dies halfway, a later run can
  still finish the rollback, because the old value was not only ever in memory. The escrow key comes
  from the environment and never touches disk.
- **A connected credential is encrypted at rest.** The hosted app stores the iv, tag and ciphertext,
  and decrypts only for the request that needs it. The key lives in the server environment.
- **Every row is scoped to an account.** A visitor without an account sees the demo dataset, never
  another account's data.
- **The old key is revoked last.** After a failure, the engine restores what it wrote and says
  plainly when a destination cannot be restored.

## Deployment notes

- `KEYWARD_ENCRYPTION_KEY` must be 32 bytes, hex or base64. Without it the hosted app cannot
  connect an account.
- `KEYWARD_ESCROW_KEY` is the same for the CLI, and only needed for rotations.
- `STRIPE_WEBHOOK_SECRET` is required for the billing webhook. The signature is verified before the
  body is read.
