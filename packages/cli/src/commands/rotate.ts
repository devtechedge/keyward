import { getAdapter, rotate } from "@keyward/core";
import { heading, line, paint, style } from "../ui.js";
import { loadConfig, readCredential } from "../config.js";
import { buildTargets, loadPlan, toRotationPlan } from "../plan.js";

export interface RotateOptions {
  readonly planFile: string;
  readonly secret?: string;
  readonly dryRun?: boolean;
  readonly json?: boolean;
}

export async function runRotate(options: RotateOptions): Promise<number> {
  const plan = await loadPlan(options.planFile);
  const baseDir = options.planFile.replace(/[\\/][^\\/]+$/, "");
  const secret = options.secret
    ? plan.secrets.find((s) => s.name === options.secret)
    : plan.secrets[0];

  if (!secret) {
    line(paint("No matching secret in the plan.", style.red));
    return 2;
  }

  const config = await loadConfig();
  const connection = config.connections.find((c) => c.provider === secret.provider);
  if (!connection) {
    line(
      paint(
        `No ${secret.provider} connection. Run: keyward connect --provider ${secret.provider}`,
        style.yellow,
      ),
    );
    return 2;
  }

  const targets = buildTargets(secret, baseDir);

  if (options.dryRun) {
    heading(`Dry run: rotating ${secret.name} across ${targets.length} target(s)`);
    for (const target of targets) {
      line(`  ${target.kind.padEnd(18)} ${target.locator}`);
    }
    line(
      paint(
        "Nothing was changed. Run without --dry-run to rotate. The old key is revoked last, and only if every write verified.",
        style.grey,
      ),
    );
    return 0;
  }

  const adapter = getAdapter(secret.provider);
  const token = await readCredential(connection.tokenFile);
  const rotationPlan = toRotationPlan(secret, baseDir);

  const outcome = await rotate({
    plan: rotationPlan,
    credentials: { provider: secret.provider, adminToken: { value: token } },
    adapter,
    targets,
    overlapSeconds: secret.overlapSeconds,
  });

  if (options.json) {
    line(JSON.stringify(outcome, null, 2));
    return outcome.run.status === "succeeded" ? 0 : 1;
  }

  heading(`Rotation ${outcome.run.status}: ${secret.name}`);
  for (const step of outcome.run.steps) {
    const mark =
      step.status === "failed"
        ? paint("x", style.red)
        : step.status === "rolled-back"
          ? paint("~", style.yellow)
          : step.status === "verified"
            ? paint("v", style.green)
            : paint(".", style.grey);
    line(`  ${mark} ${step.status.padEnd(12)} ${step.targetId}  ${step.detail}`);
    if (step.error) line(paint(`      ${step.error}`, style.red));
  }
  if (outcome.run.rollbackReason) {
    line(paint(outcome.run.rollbackReason, style.yellow));
  }
  return outcome.run.status === "succeeded" ? 0 : 1;
}
