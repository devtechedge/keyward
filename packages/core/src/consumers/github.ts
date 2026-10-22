import { spawn } from "node:child_process";
import type { Consumer, ConsumerAdapter, ConsumerContext } from "./types.js";

/**
 * A GitHub Actions secret as a consumer.
 *
 * The value is piped into the `gh` command on stdin, so it never appears in a
 * process listing or a shell history.
 */
export const githubConsumer: ConsumerAdapter = {
  type: "github",
  describe(consumer) {
    return `github actions ${consumer.target} (${consumer.name})`;
  },
  async read(consumer) {
    // A GitHub Actions secret cannot be read back, the API never returns it.
    return null;
  },
  async write(consumer, value, context: ConsumerContext) {
    await run(
      "gh",
      ["secret", "set", consumer.name, "--repo", consumer.target, "--body", "-"],
      value,
    );
    void context;
  },
};

function run(command: string, args: readonly string[], stdinValue: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 200)}`));
    });
    child.stdin.write(stdinValue);
    child.stdin.end();
  });
}
