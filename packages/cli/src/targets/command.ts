import { spawn } from "node:child_process";
import type { DeliveryTarget } from "@keyward/core";

/**
 * A destination reached by running a command.
 *
 * The command receives the new value on stdin, so the value never appears in a
 * process listing or a shell history. The command is expected to write the value
 * wherever it needs to live.
 */
export interface CommandTargetOptions {
  readonly kind: DeliveryTarget["kind"];
  readonly locator: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly readCommand?: { readonly command: string; readonly args: readonly string[] };
  readonly note?: string;
}

export function createCommandTarget(options: CommandTargetOptions): DeliveryTarget {
  return {
    kind: options.kind,
    locator: options.locator,
    ...(options.note ? { note: options.note } : {}),
    async write(value) {
      await run(options.command, options.args, value.value);
    },
    async read() {
      if (!options.readCommand) return null;
      const out = await run(
        options.readCommand.command,
        options.readCommand.args,
        undefined,
        true,
      );
      return out ? { value: out.trim() } : null;
    },
  };
}

function run(
  command: string,
  args: readonly string[],
  stdinValue?: string,
  capture = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(capture ? stdout : "");
    });
    if (stdinValue !== undefined) {
      child.stdin.write(stdinValue);
    }
    child.stdin.end();
  });
}
