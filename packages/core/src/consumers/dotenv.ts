import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Consumer, ConsumerAdapter, ConsumerContext } from "./types.js";

/**
 * A dotenv file as a consumer.
 *
 * The value is read and written as one variable inside the file, so a file
 * holding several secrets is not disturbed.
 */
export const dotenvConsumer: ConsumerAdapter = {
  type: "dotenv",
  describe(consumer) {
    return `${consumer.target} (${consumer.name})`;
  },
  async read(consumer) {
    let content: string;
    try {
      content = await readFile(consumer.target, "utf8");
    } catch {
      return null;
    }
    const match = content.match(
      new RegExp(`^${escapeRegExp(consumer.name)}=(.*)$`, "m"),
    );
    if (!match?.[1]) return null;
    return match[1].trim().replace(/^["']|["']$/g, "");
  },
  async write(consumer, value) {
    await mkdir(dirname(consumer.target), { recursive: true });
    let content = "";
    try {
      content = await readFile(consumer.target, "utf8");
    } catch {
      content = "";
    }
    const line = `${consumer.name}=${value}`;
    const re = new RegExp(`^${escapeRegExp(consumer.name)}=.*$`, "m");
    const next = re.test(content)
      ? content.replace(re, line)
      : `${content.trimEnd()}\n${line}\n`;
    await writeFile(consumer.target, next);
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
