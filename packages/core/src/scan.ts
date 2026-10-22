import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { KEY_PATTERNS, type KeyPattern } from "./patterns.js";
import { fingerprint, mask } from "./redact.js";
import type { Finding, FindingSource, Severity } from "./types.js";

export interface ScanOptions {
  /** Directory or file to scan. */
  readonly root: string;
  /** Skip files larger than this. */
  readonly maxFileBytes?: number;
  /** Include git history. */
  readonly includeHistory?: boolean;
  /** Directories never walked. */
  readonly ignore?: readonly string[];
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly filesScanned: number;
  readonly bytesScanned: number;
  readonly durationMs: number;
}

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "coverage",
  ".turbo",
  ".cache",
];

/** Binary-ish extensions that never contain readable text. */
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".pdf", ".zip", ".gz", ".tar",
  ".bz2", ".xz", ".7z", ".rar", ".mp3", ".mp4", ".mov", ".wav", ".webm", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".so", ".dylib", ".dll", ".exe", ".class", ".jar", ".wasm", ".sqlite",
  ".db", ".bin", ".node", ".pdf",
]);

function severityFor(pattern: KeyPattern): Severity {
  return pattern.severity;
}

function remediationFor(provider: string, patternId: string): string[] {
  switch (patternId) {
    case "openai-admin-key":
      return [
        "Rotate immediately: this key can create and delete every other key in the organisation.",
        "Open the OpenAI organisation Admin keys page, create a replacement, update consumers, then delete this key.",
        "Check the org audit log for unexpected key creation or deletion.",
      ];
    case "anthropic-admin-key":
      return [
        "Rotate immediately: this key can read usage, cost and spend limits for the whole organisation.",
        "Create a replacement in the Claude Console Admin keys page, update consumers, then delete this key.",
      ];
    case "openai-project-key":
    case "openai-service-account-key":
    case "openai-api-key":
      return [
        "Create a replacement key in the same project.",
        "Update every consumer, verify the new key is in use, then revoke this one.",
        "Purge the value from git history if it was committed.",
      ];
    case "anthropic-api-key":
      return [
        "Create a replacement in the Claude Console workspace keys page.",
        "Update consumers, verify, then revoke.",
      ];
    default:
      return [
        `Rotate the ${provider} credential at the provider, update consumers, then revoke this one.`,
      ];
  }
}

function scanText(
  text: string,
  source: FindingSource,
  findings: Finding[],
): void {
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const pattern of KEY_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const value = match[0];
        if (pattern.validate && !pattern.validate(value)) continue;
        const id = `${pattern.id}:${fingerprint(value).slice(0, 12)}`;
        if (findings.some((f) => f.id === id)) continue;
        const located: FindingSource =
          source.kind === "file" ? { ...source, line: index + 1 } : source;
        findings.push({
          id,
          secret: {
            fingerprint: fingerprint(value),
            masked: mask(value),
            provider: pattern.provider,
          },
          source: located,
          severity: severityFor(pattern),
          live: null,
          reason: `${pattern.id} found in ${describeSource(located)}`,
          remediation: remediationFor(pattern.provider, pattern.id),
        });
      }
    }
  }
}

function describeSource(source: FindingSource): string {
  switch (source.kind) {
    case "file":
      return `${source.path}:${source.line}`;
    case "git-history":
      return `${source.path} at ${source.commit.slice(0, 8)}`;
    case "process-env":
      return `environment variable ${source.name}`;
    case "provider":
      return `${source.provider} provider inventory`;
  }
}

async function walk(root: string, ignore: readonly string[], maxBytes: number) {
  const { readdir, stat } = await import("node:fs/promises");
  const { join, extname } = await import("node:path");
  const files: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.includes(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (BINARY_EXT.has(extname(entry.name).toLowerCase())) continue;
      try {
        const info = await stat(full);
        if (info.size > maxBytes) continue;
        files.push(full);
      } catch {
        continue;
      }
    }
  }
  return files;
}

async function gitHistory(root: string): Promise<Array<{ path: string; commit: string; text: string }>> {
  const out: Array<{ path: string; commit: string; text: string }> = [];
  const run = (args: string[]) =>
    new Promise<string>((resolve) => {
      const child = spawn("git", args, { cwd: root, windowsHide: true });
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.on("close", () => resolve(stdout));
      child.on("error", () => resolve(""));
    });

  const revs = await run(["log", "--all", "--pretty=format:%H", "--diff-filter=A", "--", "."]);
  const commits = revs.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 200);
  for (const commit of commits) {
    const names = await run(["show", "--name-only", "--pretty=format:", commit]);
    const paths = names.split("\n").map((r) => r.trim()).filter(Boolean);
    for (const path of paths.slice(0, 50)) {
      const blob = await run(["show", `${commit}:${path}`]);
      if (blob) out.push({ path, commit, text: blob });
    }
  }
  return out;
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const started = Date.now();
  const maxBytes = options.maxFileBytes ?? 2_000_000;
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
  const findings: Finding[] = [];
  let bytes = 0;

  const files = await walk(options.root, ignore, maxBytes);
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    bytes += text.length;
    const { relative } = await import("node:path");
    const rel = relative(options.root, file);
    scanText(text, { kind: "file", path: rel, line: 0 }, findings);
  }

  if (options.includeHistory) {
    for (const entry of await gitHistory(options.root)) {
      scanText(entry.text, { kind: "git-history", path: entry.path, commit: entry.commit }, findings);
    }
  }

  return {
    findings,
    filesScanned: files.length,
    bytesScanned: bytes,
    durationMs: Date.now() - started,
  };
}
