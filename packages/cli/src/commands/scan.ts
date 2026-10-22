import { scan } from "@keyward/core";
import { heading, line, paint, severityColor, style } from "../ui.js";

export interface ScanCommandOptions {
  readonly root: string;
  readonly history?: boolean;
  readonly json?: boolean;
}

export async function runScan(options: ScanCommandOptions): Promise<number> {
  const result = await scan({
    root: options.root,
    includeHistory: options.history,
  });

  if (options.json) {
    line(
      JSON.stringify(
        {
          findings: result.findings.map((f) => ({
            id: f.id,
            provider: f.secret.provider,
            masked: f.secret.masked,
            severity: f.severity,
            source: f.source,
            reason: f.reason,
            remediation: f.remediation,
          })),
          filesScanned: result.filesScanned,
          durationMs: result.durationMs,
        },
        null,
        2,
      ),
    );
    return result.findings.length > 0 ? 1 : 0;
  }

  heading(`Scanned ${result.filesScanned} files in ${result.durationMs} ms`);

  if (result.findings.length === 0) {
    line(paint("No AI provider keys found.", style.green));
    return 0;
  }

  const bySeverity = new Map<string, number>();
  for (const finding of result.findings) {
    bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
  }
  line(
    paint(
      `${result.findings.length} finding(s): ` +
        [...bySeverity.entries()]
          .map(([sev, count]) => `${sev} ${count}`)
          .join(", "),
      style.bold,
    ),
  );

  for (const finding of result.findings) {
    const where =
      finding.source.kind === "file"
        ? `${finding.source.path}:${finding.source.line}`
        : finding.source.kind === "git-history"
          ? `${finding.source.path} @ ${finding.source.commit.slice(0, 8)}`
          : finding.source.kind === "process-env"
            ? `env ${finding.source.name}`
            : finding.source.provider;
    line(
      `  ${paint(finding.severity.toUpperCase().padEnd(8), severityColor(finding.severity))}` +
        ` ${finding.secret.masked.padEnd(24)} ${finding.secret.provider.padEnd(10)} ${where}`,
    );
  }

  heading("What to do next");
  const first = result.findings[0];
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

  return result.findings.length > 0 ? 1 : 0;
}
