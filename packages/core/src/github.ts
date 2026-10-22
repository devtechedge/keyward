import type { Finding, FindingSource, Severity } from "./types.js";
import { KEY_PATTERNS } from "./patterns.js";
import { fingerprint, mask } from "./redact.js";

/**
 * Scan a GitHub organisation or user for provider keys.
 *
 * Deliberately conservative: forks, archived and private repositories are skipped,
 * only text-like files are read, and the number of calls per run is capped so the
 * scan stays well inside the GitHub rate limit.
 *
 * Findings carry a fingerprint and a mask. A raw value never leaves this module.
 */

const API = "https://api.github.com";
const DEFAULT_PER_CALL_DELAY_MS = 80;
const DEFAULT_REPO_LIMIT = 25;
const DEFAULT_FILE_LIMIT = 400;

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "rb", "java", "cs",
  "kt", "php", "sql", "tf", "sh", "ps1", "bash", "zsh", "vue", "svelte", "md",
  "txt", "yml", "yaml", "json", "json5", "toml", "ini", "cfg", "properties", "env",
  "example", "sample", "lock", "gradle", "xml", "html", "css", "scss", "tsconfig",
  "schema", "conf",
]);

function isInterestingFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name.startsWith(".") && name.includes("env")) return true;
  const lower = name.toLowerCase();
  if (lower.includes("license") || lower.includes("credits")) return false;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GitHubScanOptions {
  readonly token: string;
  /** Organisation or user name. */
  readonly owner: string;
  readonly limitRepos?: number;
  readonly limitFiles?: number;
  readonly perCallDelayMs?: number;
  readonly fetch?: typeof fetch;
}

export interface GitHubScanResult {
  readonly scannedRepos: number;
  readonly filesScanned: number;
  readonly findings: readonly Finding[];
  readonly providersFound: readonly string[];
}

interface GhRepo {
  readonly name: string;
  readonly default_branch?: string | null;
  readonly fork: boolean;
  readonly archived: boolean;
  readonly private: boolean;
}

interface GhTreeEntry {
  readonly path?: string;
  readonly type?: string;
  readonly size?: number | null;
}

export async function scanGitHubOwner(options: GitHubScanOptions): Promise<GitHubScanResult> {
  const doFetch = options.fetch ?? fetch;
  const limitRepos = options.limitRepos ?? DEFAULT_REPO_LIMIT;
  const limitFiles = options.limitFiles ?? DEFAULT_FILE_LIMIT;
  const delay = options.perCallDelayMs ?? DEFAULT_PER_CALL_DELAY_MS;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "keyward",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const reposRes = await doFetch(
    `${API}/users/${options.owner}/repos?per_page=100&type=all`,
    { headers },
  );
  if (!reposRes.ok) {
    throw new Error(`GitHub: list repositories failed with ${reposRes.status}`);
  }
  const repos = ((await reposRes.json()) as GhRepo[])
    .filter((r) => !r.fork && !r.archived && !r.private)
    .slice(0, limitRepos);

  const findings: Finding[] = [];
  const seen = new Set<string>();
  let filesScanned = 0;

  const perRepoCap = Math.max(10, Math.floor(limitFiles / Math.max(1, repos.length)));

  for (const repo of repos) {
    const branch = repo.default_branch ?? "main";
    const treeRes = await doFetch(
      `${API}/repos/${options.owner}/${repo.name}/git/trees/${branch}?recursive=1`,
      { headers },
    );
    if (!treeRes.ok) continue;
    const tree = ((await treeRes.json()) as { tree?: readonly GhTreeEntry[] }).tree ?? [];
    const candidates = tree
      .filter(
        (t) =>
          t.type === "blob" &&
          Boolean(t.path) &&
          t.size != null &&
          t.size > 0 &&
          t.size < 262_144 &&
          isInterestingFile(t.path as string),
      )
      .slice(0, perRepoCap);

    for (const candidate of candidates) {
      await sleep(delay);
      const path = candidate.path as string;
      const rawRes = await doFetch(
        `${API}/repos/${options.owner}/${repo.name}/contents/${encodeURIComponent(path)}`,
        {
          headers: { ...headers, Accept: "application/vnd.github.raw" },
          redirect: "follow",
        },
      );
      if (!rawRes.ok) continue;
      const text = await rawRes.text();
      filesScanned += 1;

      for (const finding of findInText(text)) {
        if (seen.has(finding.id)) continue;
        seen.add(finding.id);
        const source: FindingSource = {
          kind: "file",
          path: `${options.owner}/${repo.name}/${path}`,
          line: finding.source.kind === "file" ? finding.source.line : 0,
        };
        findings.push({ ...finding, source });
      }
    }
  }

  return {
    scannedRepos: repos.length,
    filesScanned,
    findings,
    providersFound: [...new Set(findings.map((f) => f.secret.provider))],
  };
}

/**
 * Find provider keys in a block of text.
 *
 * Shared by the GitHub and Vercel scanners so both report the same way.
 */
export function findInText(text: string): Finding[] {
  const findings: Finding[] = [];
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
        findings.push({
          id,
          secret: {
            fingerprint: fingerprint(value),
            masked: mask(value),
            provider: pattern.provider,
          },
          source: { kind: "file", path: "", line: index + 1 },
          severity: pattern.severity,
          live: null,
          reason: `${pattern.id} found`,
          remediation: [
            `Rotate the ${pattern.provider} credential at the provider, update every consumer, verify, then revoke.`,
          ],
        });
      }
    }
  }

  return findings;
}
