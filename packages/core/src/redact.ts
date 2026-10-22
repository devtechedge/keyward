import { createHash } from "node:crypto";
import type { MaskedSecret, ProviderId, SecretValue } from "./types.js";

/**
 * Stable, non-reversible fingerprint for a secret.
 *
 * The same secret always produces the same fingerprint, so a fingerprint can be used
 * as a join key across scans, inventories and rotation runs. The salt keeps the
 * fingerprint from being reversible by dictionary attack on a known key format.
 */
export function fingerprint(secret: string, salt = "keyward-v1"): string {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex").slice(0, 32);
}

/**
 * Mask a secret for display. Keeps a short prefix and a short suffix so an operator
 * can tell two keys apart without the value ever being recoverable.
 */
export function mask(secret: string, visible = 4): string {
  if (secret.length <= visible * 2 + 3) {
    return `${secret.slice(0, 1)}***`;
  }
  return `${secret.slice(0, visible)}…${secret.slice(-visible)}`;
}

export function toMasked(
  secret: string,
  provider: ProviderId,
  extra: { readonly providerKeyId?: string; readonly name?: string } = {},
): MaskedSecret {
  return {
    fingerprint: fingerprint(secret),
    masked: mask(secret),
    provider,
    ...(extra.providerKeyId ? { providerKeyId: extra.providerKeyId } : {}),
    ...(extra.name ? { name: extra.name } : {}),
  };
}

export function asSecret(value: string): SecretValue {
  return { value };
}
