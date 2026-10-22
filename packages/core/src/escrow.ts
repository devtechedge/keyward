import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Encrypted escrow for the value a secret is replacing.
 *
 * Rollback needs the old value. Holding it in memory only works while the
 * process lives, so a crash halfway through a rotation leaves the consumer
 * holding a secret nobody has a record of. The escrow writes the old value to
 * disk, encrypted, so the rollback can be finished by a later run.
 *
 * The key never touches disk. It comes from the environment, and a machine
 * without it cannot open the escrow, which is the point.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface EscrowRecord {
  readonly runId: string;
  readonly secretName: string;
  readonly provider: string;
  /** The value being replaced, encrypted. */
  readonly oldValue: string;
  readonly createdAt: string;
}

export class EscrowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowError";
  }
}

export function escrowHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.KEYWARD_HOME ?? join(homedir(), ".keyward");
}

export function escrowDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(escrowHome(env), "escrow");
}

function escrowKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.KEYWARD_ESCROW_KEY;
  if (!raw) {
    throw new EscrowError("KEYWARD_ESCROW_KEY is not set");
  }
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new EscrowError("KEYWARD_ESCROW_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((part) => part.toString("base64url")).join(":");
}

function open(envelope: string, key: Buffer): string {
  const parts = envelope.split(":");
  if (parts.length !== 3) {
    throw new EscrowError("Malformed escrow record");
  }
  const [ivRaw, tagRaw, dataRaw] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Put the value being replaced into escrow.
 *
 * Returns the path it was written to, so the run report can name it.
 */
export async function escrowValue(
  record: Omit<EscrowRecord, "oldValue"> & { readonly oldValue: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const dir = escrowDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const key = escrowKey(env);
  const file = join(dir, `${record.runId}.json`);
  const payload: EscrowRecord = {
    runId: record.runId,
    secretName: record.secretName,
    provider: record.provider,
    oldValue: seal(record.oldValue, key),
    createdAt: record.createdAt,
  };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return file;
}

/** Read an escrow record back. The value is decrypted only here. */
export async function readEscrow(
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EscrowRecord | null> {
  const file = join(escrowDir(env), `${runId}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const stored = JSON.parse(raw) as EscrowRecord;
  return {
    runId: stored.runId,
    secretName: stored.secretName,
    provider: stored.provider,
    oldValue: open(stored.oldValue, escrowKey(env)),
    createdAt: stored.createdAt,
  };
}

/** Destroy an escrow record once the rotation is finished and the old key revoked. */
export async function clearEscrow(
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await rm(join(escrowDir(env), `${runId}.json`), { force: true });
}

/** List the run ids currently in escrow. */
export async function listEscrow(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  try {
    const files = await readdir(escrowDir(env));
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}
