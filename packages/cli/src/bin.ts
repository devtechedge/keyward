#!/usr/bin/env node
import { parseArgs } from "node:util";
import { getAdapter, listAdapters } from "@keyward/core";
import { heading, line, paint, style } from "./ui.js";
import { loadConfig } from "./config.js";
import { runScan } from "./commands/scan.js";
import { runConnect, runInventory, runSpend } from "./commands/providers.js";
import { runRotate } from "./commands/rotate.js";

const USAGE = `keyward - find, rotate and police every AI API key your company holds

Usage
  keyward <command> [options]

Commands
  scan [path]              Scan a directory for AI provider keys
  connect                  Store an organisation admin key for a provider
  inventory                List the keys your providers hold, with age and staleness
  spend                    Read spend and flag anomalies against a baseline
  rotate <plan.json>       Rotate a secret across every consumer, with verification
  doctor                   Check which providers are connected and reachable
  adapters                 Show the supported providers

Options
  --provider <id>          openai | anthropic
  --token <value>          Admin key, for connect
  --label <text>           Name for the connection
  --secret <name>          Secret to rotate, when the plan holds several
  --days <n>               Days of spend to read
  --policy <id>            Policy to evaluate inventory against
  --github <owner>         Scan a GitHub account instead of a directory
  --vercel <team>          Scan a Vercel team instead of a directory
  --history                Include git history when scanning
  --dry-run                Show what a rotation would do, change nothing
  --json                   Machine readable output
  -h, --help               Show this help

Examples
  keyward scan . --history
  keyward scan --github devtechedge
  keyward scan --vercel devtechedge1
  keyward connect --provider openai --token sk-admin-...
  keyward inventory
  keyward spend --days 30
  keyward rotate plan.json --dry-run
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string" },
      token: { type: "string" },
      label: { type: "string" },
      secret: { type: "string" },
      days: { type: "string" },
      policy: { type: "string" },
      history: { type: "boolean" },
      github: { type: "string" },
      vercel: { type: "string" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    line(USAGE);
    return command ? 0 : 1;
  }

  switch (command) {
    case "scan":
      return runScan({
        root: positionals[1] ?? ".",
        ...(values.history ? { history: true } : {}),
        ...(values.json ? { json: true } : {}),
        ...(values.github ? { github: values.github } : {}),
        ...(values.vercel ? { vercel: values.vercel } : {}),
      });

    case "connect":
      if (!values.provider) {
        line(paint("connect needs --provider openai or --provider anthropic", style.yellow));
        return 2;
      }
      return runConnect({
        provider: values.provider as "openai" | "anthropic",
        ...(values.token ? { token: values.token } : {}),
        ...(values.label ? { label: values.label } : {}),
      });

    case "inventory":
      return runInventory({
        ...(values.provider ? { provider: values.provider as "openai" | "anthropic" } : {}),
        ...(values.json ? { json: true } : {}),
        ...(values.policy ? { policy: values.policy } : {}),
      });

    case "spend":
      return runSpend({
        ...(values.provider ? { provider: values.provider as "openai" | "anthropic" } : {}),
        ...(values.days ? { days: Number(values.days) } : {}),
        ...(values.json ? { json: true } : {}),
      });

    case "rotate": {
      const planFile = positionals[1];
      if (!planFile) {
        line(paint("rotate needs the path to a plan file", style.yellow));
        return 2;
      }
      return runRotate({
        planFile,
        ...(values.secret ? { secret: values.secret } : {}),
        ...(values["dry-run"] ? { dryRun: true } : {}),
        ...(values.json ? { json: true } : {}),
      });
    }

    case "doctor": {
      const config = await loadConfig();
      heading("Connections");
      if (config.connections.length === 0) {
        line(paint("  none", style.yellow));
      }
      for (const connection of config.connections) {
        const adapter = getAdapter(connection.provider);
        let status = "unknown";
        try {
          const { readCredential } = await import("./config.js");
          const token = await readCredential(connection.tokenFile);
          await adapter.listKeys({
            provider: connection.provider,
            adminToken: { value: token },
          });
          status = "reachable";
        } catch (error) {
          status = `unreachable: ${error instanceof Error ? error.message : String(error)}`;
        }
        const ok = status === "reachable";
        line(
          `  ${paint(ok ? "ok" : "!!", ok ? style.green : style.red)}  ${connection.provider.padEnd(12)} ${status}`,
        );
      }
      return 0;
    }

    case "adapters": {
      heading("Supported providers");
      for (const adapter of listAdapters()) {
        line(
          `  ${adapter.id.padEnd(12)} inventory=${adapter.supportsInventory} rotation=${adapter.supportsRotation} spend=${adapter.supportsSpend}`,
        );
      }
      return 0;
    }

    default:
      line(paint(`Unknown command: ${command}`, style.red));
      line(USAGE);
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    line(paint(error instanceof Error ? error.message : String(error), style.red));
    process.exitCode = 1;
  });
