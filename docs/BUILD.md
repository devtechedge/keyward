# 2026-10-22

## keyward built from scratch and shipped (public repo devtechedge/keyward)

Dev asked for a complete build of the Greg Isenberg idea (find, rotate and police every AI API key,
$99/month, passive income), committed directly to a new GitHub repo with many visible commits, with
the full /dev-memory /curator /journey /learn /oss /refine workflow set added to the project, repo
presentation applied, and the app hosted on Vercel rather than locally, with a frontend an
end user would find appealing.

### Product decision taken

The tweet's spec is wrong on one point and the market is crowded, so the build is aimed at the one
gap that is not solved: **fan-out rotation with read-back verification and rollback**. Discovery is
free (GitHub secret scanning, gitleaks, trufflehog), spend dashboards are saturated (five tools
under $30/month), and the providers now expose Admin APIs that expire and scope keys natively, so
those two halves are commodity. The defensible part is rotating one logical secret across Vercel,
GitHub Actions, Supabase, local .env and CI in the right order, proving each consumer changed, and
only then revoking.

"Rotates them every week" was rejected: rotation without a dual key window causes an outage, weekly
cadence is contrary to provider and practitioner guidance, and rotation does not help a key that was
copied before the rotation. Age, idle time and scope are reported so operators know which keys are
worth rotating.

### Repo and stack

- Repo `devtechedge/keyward`, public, created 22 Oct 2026. Clone at
  `C:\Users\Devayan Mandal\Documents\GitHub\keyward`.
- Monorepo with npm workspaces: `packages/core` (types, redaction, detection, rotation engine,
  anomaly detection, policy, OpenAI and Anthropic adapters), `packages/cli` (the `keyward` command),
  `apps/web` (Next.js 16 control plane).
- Zero runtime dependency in the CLI beyond `zod`. Core and CLI have no dependency on the web app.
- Web app has no charting library, inline SVG sparklines, one hand written CSS file, server
  components throughout. Landing page 29.6 KB HTML, about 19 KB inline script.
- Hosting: Vercel project `keyward` in team `devtechedge1`, production alias
  `https://keyward-seven.vercel.app`. Neon store `neon-carmine-island` connected, schema in
  `apps/web/db/schema.sql`, and `POST /api/setup` creates the tables idempotently.
- Vercel build wiring: root `vercel.json` with `buildCommand: npm run build:web` and
  `outputDirectory: apps/web/.next`, because the project root is the monorepo root.
- The project name `keyward` collides with an unrelated global Vercel project, so the alias is
  `keyward-seven.vercel.app`. `keyward.vercel.app` is NOT this project.

### Commits, all SSH signed and verified on GitHub

Ten commits for core and CLI, then the web app, then docs and presentation. Every commit was made
unsigned and rewritten with the SSH signature through `osswork/sign_commit.py`, because git for
Windows cannot reach the ssh-agent pipe. Helper used this session:
`C:\Users\DEVAYA~1\AppData\Local\Temp\opencode\commit_signed.py`.

### Tests

15 tests in `packages/core` using `node:test` against the built output, covering masked scanning,
placeholder rejection, severity, rotation success, rollback on write failure, no revoke after a
failure, read-back mismatch, provider create failure, unrestorable destination honesty, and the
anomaly baseline rules. CI runs typecheck, tests, build and a CLI smoke test that asserts the
scanner never echoes the value.

### Fixes made during the build

- Tests import from `dist`, so the typecheck script now builds first. CI was red until this.
- The rotation engine treated a destination that cannot be read back as a mismatch. It now reports
  it as written and unverifiable, and a destination with no restore support is called out loudly
  during rollback instead of being silently skipped.
- The light theme left the sticky header dark. The header now uses `color-mix` on the theme token.

### Presentation

About description 339 characters, 11 topics, homepage set to the production alias. Release v0.1.0
points at the green commit. MIT licence at the root. CI green on main. README follows the
presentation skeleton with Live Demo first, honest demo-mode status blockquote, four screenshots and
a tech stack table. Social preview PNG is at `docs/screenshots/social-preview.png` and still needs
a manual upload, because GitHub has no API for it.

### Project scoped agent workflows

`.agents/skills/` in the repository holds dev-memory, curator, journey, learn, oss and refine, with
`.agents/README.md` as the index and the two hard rules of the codebase stated in it. These document
how the project is worked on for anyone reading the source. They do not replace the machine store.

### Open items

- Social preview upload is manual and left to Dev.
- npm publish is manual: there is no npm account, so the release workflow is `workflow_dispatch`
  only and waits for an `NPM_TOKEN`.
- The hosted app serves demo data until a real scan or rotation is pushed to Neon.
- The Supabase anon key leak in `collabspace-express` is still open and is the one real credential
  exposure found in this session's audit. It is the same key keyward exists to find.
