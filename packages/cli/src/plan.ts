import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DeliveryTarget, RotationPlan, RotationTarget } from "@keyward/core";
import { createFileTarget } from "./targets/file.js";
import { createCommandTarget } from "./targets/command.js";

/**
 * A rotation plan describes where a secret physically lives.
 *
 * The file is values free. It names projects, repos, variable names and paths.
 * No secret ever appears in it, so it is safe to commit and safe to paste.
 */
export interface PlanFile {
  readonly version: 1;
  readonly secrets: readonly SecretPlan[];
}

export interface SecretPlan {
  readonly name: string;
  readonly provider: "openai" | "anthropic";
  /** How long both the old and the new secret stay valid, in seconds. */
  readonly overlapSeconds?: number;
  readonly targets: readonly TargetPlan[];
}

export interface TargetPlan {
  readonly id: string;
  readonly kind: RotationTarget["kind"];
  /** Vercel project name for a vercel-env target. */
  readonly project?: string;
  /** Environment names, for example production, preview. */
  readonly environments?: readonly string[];
  /** Variable name to write. */
  readonly variable?: string;
  /** Absolute or relative path, for a local env file target. */
  readonly path?: string;
  /** Repository in owner/name form, for a GitHub Actions target. */
  readonly repo?: string;
  /** A command to run, for anything else. The new value arrives on stdin. */
  readonly command?: string;
  readonly args?: readonly string[];
  readonly note?: string;
}

export function parsePlan(text: string): PlanFile {
  const parsed = JSON.parse(text) as PlanFile;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported plan version ${parsed.version}`);
  }
  return parsed;
}

export async function loadPlan(file: string): Promise<PlanFile> {
  return parsePlan(await readFile(file, "utf8"));
}

/**
 * Turn a plan into concrete delivery targets.
 *
 * The order matters and is deliberate: the local file and the CI secrets go
 * first, then the hosted environments. A consumer that runs a migration during
 * deploy should see the new value before the old one disappears.
 */
export function buildTargets(plan: SecretPlan, baseDir: string): DeliveryTarget[] {
  const targets: DeliveryTarget[] = [];

  for (const target of plan.targets) {
    if (target.kind === "local-env" && target.path) {
      targets.push(
        createFileTarget({
          path: resolve(baseDir, target.path),
          ...(target.variable ? { variable: target.variable } : {}),
          kind: target.kind,
          locator: target.id,
          ...(target.note ? { note: target.note } : {}),
        }),
      );
      continue;
    }

    if (target.kind === "github-actions" && target.repo && target.variable) {
      targets.push(
        createCommandTarget({
          kind: target.kind,
          locator: target.id,
          command: "gh",
          args: ["secret", "set", target.variable, "--repo", target.repo, "--body", "-"],
          readCommand: undefined,
          ...(target.note ? { note: target.note } : {}),
        }),
      );
      continue;
    }

    if (target.kind === "vercel-env" && target.project && target.variable) {
      const environments = target.environments ?? ["production"];
      for (const environment of environments) {
        targets.push(
          createCommandTarget({
            kind: target.kind,
            locator: `${target.id}:${environment}`,
            command: "vercel",
            args: [
              "env",
              "add",
              target.variable,
              environment,
              "--project",
              target.project,
              "--force",
              "--yes",
              "--value",
              "-",
            ],
            ...(target.note ? { note: target.note } : {}),
          }),
        );
      }
      continue;
    }

    if (target.command) {
      targets.push(
        createCommandTarget({
          kind: target.kind,
          locator: target.id,
          command: target.command,
          args: target.args ?? [],
          ...(target.note ? { note: target.note } : {}),
        }),
      );
      continue;
    }

    throw new Error(
      `Target ${target.id} has no usable definition. Give it a path, a command, or a project.`,
    );
  }

  return targets;
}

export function toRotationPlan(secret: SecretPlan, baseDir: string): RotationPlan {
  return {
    id: `plan_${secret.name}`,
    secretName: secret.name,
    provider: secret.provider,
    createdAt: new Date(),
    overlapSeconds: secret.overlapSeconds ?? 3600,
    targets: secret.targets.map((t) => ({
      id: t.id,
      kind: t.kind,
      locator: join(baseDir, t.path ?? t.id),
      ...(t.note ? { note: t.note } : {}),
    })),
  };
}
