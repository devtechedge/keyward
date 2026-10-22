import { scan, scanGitHubOwner, scanVercelEnv, type Finding } from "@keyward/core";
import { heading, line, paint, severityColor, style } from "../ui.js";

export interface ScanCommandOptions {
  readonly root: string;
  readonly history?: boolean;
  readonly json?: boolean;
  /** GitHub owner to scan instead of a local directory. */
  readonly github?: string;
  /** Vercel team id to scan instead of a local directory. */
  readonly vercel?: string;
}

function reportFindings(findings: readonly Finding[], context: string): void {
  if (findings.length === 0) {
    line(paint(`No AI provider keys found in ${context}.`, style.green));
    return;
  }

  const bySeverity = new Map<string, number>();
  for (const finding of findings) {
    bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
  }
  line(
    paint(
      `${findings.length} finding(s): ` +
        [...bySeverity.entries()].map(([sev, count]) => `${sev} ${count}`).join(", "),
      style.bold,
    ),
  );

  for (const finding of findings) {
    const where =
      finding.source.kind === "file"
        ? `${finding.source.path}:${finding.source.line}`
        : finding.source.kind === "git-history"
          ? `${finding.source.path} at ${finding.source.commit.slice(0, 8)}`
          : finding.source.kind === "process-env"
            ? `env ${finding.source.name}`
            : finding.source.provider;
    line(
      `  ${paint(finding.severity.toUpperCase().padEnd(8), severityColor(finding.severity))}` +
        ` ${finding.secret.masked.padEnd(24)} ${finding.secret.provider.padEnd(10)} ${where}`,
    );
  }

  heading("What to do next");
  const first = findings[0];
  if (first) {
    line(paint(first.reason, style.grey));
    first.remediation.forEach((step, i) => {
      line(`  ${i + 1}. ${step}`);
    });
  }
  line(
    paint(
      "Rotate the key at the provider, update every consumer, verify, then revoke. Do not revoke first.",
      style.grey,
    ),
  );
}

function toJson(findings: readonly Finding[]): string {
  return JSON.stringify(
    findings.map((f) => ({
      id: f.id,
      provider: f.secret.provider,
      masked: f.secret.masked,
      severity: f.severity,
      source: f.source,
      reason: f.reason,
      remediation: f.remediation,
    })),
    null,
    2,
  );
}

export async function runScan(options: ScanCommandOptions): Promise<number> {
  if (options.github) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      line(paint("A GitHub scan needs GITHUB_TOKEN in the environment.", style.yellow));
      return 2;
    }
    const result = await scanGitHubOwner({ token, owner: options.github });
    if (options.json) {
      line(toJson(result.findings));
      return result.findings.length > 0 ? 1 : 0;
    }
    heading(
      `Scanned ${result.filesScanned} files across ${result.scannedRepos} repositories in ${options.github}`,
    );
    reportFindings(result.findings, `the ${options.github} GitHub account`);
    return result.findings.length > 0 ? 1 : 0;
  }

  if (options.vercel) {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      line(paint("A Vercel scan needs VERCEL_TOKEN in the environment.", style.yellow));
      return 2;
    }
    const result = await scanVercelEnv({ token, teamId: options.vercel });
    if (options.json) {
      line(toJson(result.findings));
      return result.findings.length > 0 ? 1 : 0;
    }
    heading(
      `Scanned ${result.scannedVars} environment variables across ${result.scannedProjects} projects`,
    );
    reportFindings(result.findings, `the Vercel team ${options.vercel}`);
    return result.findings.length > 0 ? 1 : 0;
  }

  const result = await scan({
    root: options.root,
    includeHistory: options.history,
  });

  if (options.json) {
    line(toJson(result.findings));
    return result.findings.length > 0 ? 1 : 0;
  }

  heading(`Scanned ${result.filesScanned} files in ${result.durationMs} ms`);
  reportFindings(result.findings, options.root);

  return result.findings.length > 0 ? 1 : 0;
}
