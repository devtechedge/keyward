import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "@keyward/core";

export interface StoredConnection {
  readonly provider: ProviderId;
  /** Path to the file holding the admin token. */
  readonly tokenFile: string;
  readonly addedAt: string;
  readonly label?: string;
}

export interface KeywardConfig {
  readonly connections: readonly StoredConnection[];
  /** Where the admin tokens live. Defaults to ~/.keyward/credentials. */
  readonly credentialDir?: string;
}

/**
 * The config never holds a secret value. It holds the path to a file that does,
 * so a config committed to git or pasted into a chat carries nothing useful.
 */
export async function loadConfig(root = homedir()): Promise<KeywardConfig> {
  const path = join(root, ".keyward", "config.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as KeywardConfig;
    return { credentialDir: join(root, ".keyward", "credentials"), ...parsed };
  } catch {
    return { connections: [], credentialDir: join(root, ".keyward", "credentials") };
  }
}

export async function saveConfig(
  config: KeywardConfig,
  root = homedir(),
): Promise<void> {
  const dir = join(root, ".keyward");
  await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true, mode: 0o700 }));
  await writeFile(join(dir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function saveCredential(
  provider: ProviderId,
  value: string,
  root = homedir(),
): Promise<string> {
  const dir = join(root, ".keyward", "credentials");
  await import("node:fs/promises").then((fs) =>
    fs.mkdir(dir, { recursive: true, mode: 0o700 }),
  );
  const file = join(dir, `${provider}.txt`);
  await writeFile(file, value, { mode: 0o600 });
  return file;
}

export async function readCredential(file: string): Promise<string> {
  return (await readFile(file, "utf8")).trim();
}
