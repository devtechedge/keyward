import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/** Terminal helpers. Kept tiny and dependency free on purpose. */
export const style = {
  reset: "[0m",
  bold: "[1m",
  dim: "[2m",
  red: "[31m",
  yellow: "[33m",
  green: "[32m",
  cyan: "[36m",
  grey: "[90m",
};

export function supportsColor(): boolean {
  return Boolean(stdout.isTTY) && process.env.NO_COLOR === undefined;
}

export function paint(text: string, code: string): string {
  if (!supportsColor()) return text;
  return `${code}${text}${style.reset}`;
}

export function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return style.red;
    case "high":
      return style.yellow;
    case "medium":
      return style.cyan;
    default:
      return style.grey;
  }
}

export function heading(text: string): void {
  stdout.write(`\n${paint(text, style.bold)}\n`);
}

export function line(text = ""): void {
  stdout.write(`${text}\n`);
}

/** Read a value without echoing it, for admin keys. */
export async function promptSecret(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  process.stdout.write(question);
  const wasRaw = (rl as unknown as { output?: unknown }).output;
  if (wasRaw && typeof wasRaw === "object" && wasRaw !== null && "write" in wasRaw) {
    const output = wasRaw as { write: (s: string) => void };
    output.write = () => {};
  }
  const answer = await rl.question("");
  stdout.write("\n");
  rl.close();
  return answer.trim();
}

export async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}
