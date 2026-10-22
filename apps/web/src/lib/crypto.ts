import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for the credentials a customer connects to the hosted control plane.
 *
 * A provider admin key can read an organisation's whole spend and mint new
 * keys, so it is stored encrypted at rest with a key that never leaves the
 * server environment. The plaintext is decrypted only in the request that
 * needs it.
 *
 * The envelope is `iv:tag:ciphertext`, all base64url.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class EncryptionNotConfiguredError extends Error {
  constructor(message = "Encryption is not configured") {
    super(message);
    this.name = "EncryptionNotConfiguredError";
  }
}

/**
 * Read the encryption key from the environment.
 *
 * Accepts a 64 character hex string or a base64 encoded 32 byte value.
 */
export function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.KEYWARD_ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionNotConfiguredError("KEYWARD_ENCRYPTION_KEY is not set");
  }
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new EncryptionNotConfiguredError(
      "KEYWARD_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
  return key;
}

export function encryptSecret(
  plaintext: string,
  key: Buffer = encryptionKey(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(":");
}

export function decryptSecret(
  envelope: string,
  key: Buffer = encryptionKey(),
): string {
  const parts = envelope.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value");
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
 * A reference to a stored secret that carries no value.
 *
 * The fingerprint lets a caller tell two stored credentials apart without
 * decrypting either of them.
 */
export function secretFingerprint(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex").slice(0, 16);
}
