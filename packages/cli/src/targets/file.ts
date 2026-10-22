import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeliveryTarget } from "@keyward/core";

/**
 * A destination that can be written and read back.
 *
 * Each implementation stores one secret. The file target keeps the previous value
 * in memory only long enough to restore it, so a rollback never needs a second
 * copy on disk.
 */
export interface FileTargetOptions {
  readonly path: string;
  /** Name of the variable inside the file, when the file holds several. */
  readonly variable?: string;
  readonly kind: DeliveryTarget["kind"];
  readonly locator: string;
  readonly note?: string;
}

export function createFileTarget(options: FileTargetOptions): DeliveryTarget {
  let previous: string | null = null;
  return {
    kind: options.kind,
    locator: options.locator,
    ...(options.note ? { note: options.note } : {}),
    async write(value) {
      await mkdir(dirname(options.path), { recursive: true });
      if (options.variable) {
        const current = await readFile(options.path, "utf8").catch(() => "");
        const re = new RegExp(`^${escapeRegExp(options.variable)}=.*$`, "m");
        const next = re.test(current)
          ? current.replace(re, `${options.variable}=${value.value}`)
          : `${current.trimEnd()}\n${options.variable}=${value.value}\n`;
        await writeFile(options.path, next);
        return;
      }
      await writeFile(options.path, value.value, { mode: 0o600 });
    },
    async read() {
      const current = await readFile(options.path, "utf8").catch(() => null);
      if (current === null) return null;
      if (!options.variable) return { value: current.trim() };
      const match = current.match(new RegExp(`^${escapeRegExp(options.variable)}=(.*)$`, "m"));
      return match?.[1] ? { value: match[1].trim() } : null;
    },
    async restore(old) {
      if (old === null) return;
      if (options.variable) {
        const current = await readFile(options.path, "utf8").catch(() => "");
        const re = new RegExp(`^${escapeRegExp(options.variable)}=.*$`, "m");
        const next = re.test(current)
          ? current.replace(re, `${options.variable}=${old.value}`)
          : `${current.trimEnd()}\n${options.variable}=${old.value}\n`;
        await writeFile(options.path, next);
        return;
      }
      await writeFile(options.path, old.value, { mode: 0o600 });
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
