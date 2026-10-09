import { collectContent } from "./content.ts";
import { loadConfig } from "./config.ts";
import { StrandsDecisionClient } from "./decision.ts";
import { OpenAICompatibleClient } from "./llm.ts";
import { ensureOllamaReady } from "./ollama.ts";
import { generateDistil } from "./prompts.ts";
import {
  ContentSelector,
  resolveAllPending,
  type ReviewPolicy,
  type SelectionResult,
  unresolvedSelections,
} from "./selection.ts";
import { saveDigest } from "./storage.ts";
import type { ProgressUpdate } from "./types.ts";
import { DistilWebApp, startServer } from "./web.ts";

export const VERSION = "0.3.0";

export interface CliOptions {
  command?: "run" | "preview" | "serve" | "setup";
  config: string;
  days: number;
  hostname: string;
  port: number;
  browser: boolean;
  includeSeen: boolean;
  reviewPolicy?: ReviewPolicy;
  help: boolean;
  version: boolean;
}

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    config: "config.toml",
    days: 7,
    hostname: "127.0.0.1",
    port: 5001,
    browser: true,
    includeSeen: false,
    help: false,
    version: false,
  };
  const remaining = [...args];
  if (remaining[0] && !remaining[0].startsWith("-")) {
    const command = remaining.shift();
    if (
      command !== "run" && command !== "preview" && command !== "serve" &&
      command !== "setup"
    ) {
      throw new Error(`Unknown command: ${command}`);
    }
    options.command = command;
  }

  while (remaining.length > 0) {
    const argument = remaining.shift()!;
    const [flag, inlineValue] = splitFlag(argument);
    switch (flag) {
      case "--config":
        options.config = inlineValue ?? requiredValue(flag, remaining);
        break;
      case "--days":
        options.days = integerValue(inlineValue ?? requiredValue(flag, remaining), flag);
        break;
      case "--host":
        options.hostname = inlineValue ?? requiredValue(flag, remaining);
        break;
      case "--port":
        options.port = integerValue(inlineValue ?? requiredValue(flag, remaining), flag);
        break;
      case "--no-browser":
        if (inlineValue !== undefined) {
          throw new Error("--no-browser does not take a value");
        }
        options.browser = false;
        break;
      case "--include-seen":
        if (inlineValue !== undefined) {
          throw new Error("--include-seen does not take a value");
        }
        options.includeSeen = true;
        break;
      case "--review-policy": {
        const value = inlineValue ?? requiredValue(flag, remaining);
        if (value !== "include" && value !== "exclude") {
          throw new Error("--review-policy must be include or exclude");
        }
        options.reviewPolicy = value;
        break;
      }
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-V":
        options.version = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3650) {
    throw new Error("--days must be an integer between 1 and 3650");
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  if (!options.hostname.trim()) throw new Error("--host must not be empty");
  if (options.reviewPolicy && options.command !== "run") {
    throw new Error("--review-policy is only valid with the run command");
  }
  return options;
}

export async function main(args = Deno.args): Promise<number> {
  try {
    const options = parseCliArgs(args);
    if (options.version) {
      console.log(`distil ${VERSION}`);
      return 0;
    }
    if (options.help || !options.command) {
      console.log(helpText());
      return 0;
    }

    const config = await loadConfig(options.config);
    if (options.command === "setup") {
      let localService = false;
      if (config.llm.provider === "ollama") {
        await ensureOllamaReady(config.llm);
        console.log(`Ollama is ready with ${config.llm.model}.`);
        localService = true;
      }
      if (config.decision.enabled) {
        await new StrandsDecisionClient(config.decision).health();
        console.log(`Strands Decider is ready at ${config.decision.baseUrl}.`);
        localService = true;
      }
      if (!localService) {
        console.log("No local setup is required for this provider.");
      }
      return 0;
    }

    if (options.command === "run" || options.command === "preview") {
      console.log(`Fetching ${config.feeds.length} source(s)…`);
      const result = await collectContent(config.feeds, {
        daysBack: options.days,
        onProgress: printProgress,
      });
      if (result.items.length === 0) {
        throw new Error("No items collected. Increase --days or check source health.");
      }
      console.log(`Collected ${result.items.length} item(s).`);
      const selector = new ContentSelector(config.decision, config.domain.focus);
      let selection = await selector.select(result.items, {
        includeSeen: options.includeSeen,
        onProgress: printProgress,
      });
      if (selection.warning) console.error(`Warning: ${selection.warning}`);
      const unresolved = unresolvedSelections(selection);
      const reviewPolicy = options.reviewPolicy;
      printSelection(selection);
      if (options.command === "preview") return 0;
      if (unresolved.length > 0 && !reviewPolicy) {
        throw new Error(
          `${unresolved.length} item(s) require review. Use the web app for per-item review or rerun with --review-policy=include or --review-policy=exclude.`,
        );
      }
      if (unresolved.length > 0 && reviewPolicy) {
        selection = resolveAllPending(selection, reviewPolicy);
        console.log(
          `${
            reviewPolicy === "include" ? "Included" : "Excluded"
          } ${unresolved.length} unresolved item(s) by explicit CLI policy.`,
        );
      }
      if (selection.selected.length === 0) {
        throw new Error(
          "No new relevant items selected. Use --include-seen to reconsider seen items.",
        );
      }
      await ensureOllamaReady(config.llm);
      const client = new OpenAICompatibleClient(config.llm);
      const digest = await generateDistil(client, selection.selected, {
        domain: config.domain.focus,
        readingTimeMinutes: config.output.readingTimeMinutes,
        onStage: (stage) => console.log(stage),
      });
      const path = await saveDigest(config.output.directory, digest);
      console.log(`Saved to ${path}`);
      try {
        await selector.markReviewed(selection);
      } catch (error) {
        console.error(
          `Warning: digest saved, but seen-item state was not updated: ${message(error)}`,
        );
      }
      return 0;
    }

    const client = new OpenAICompatibleClient(config.llm);
    const app = new DistilWebApp({
      config,
      client,
      ensureProvider: () => ensureOllamaReady(config.llm),
    });
    const server = startServer(app, {
      hostname: options.hostname,
      port: options.port,
      onListen: (address) => {
        const browserHost = options.hostname === "0.0.0.0" || options.hostname === "::"
          ? "127.0.0.1"
          : options.hostname;
        const url = `http://${browserHost}:${address.port}`;
        console.log(`Distil is running at ${url}`);
        if (options.browser) void openBrowser(url);
      },
    });
    await server.finished;
    return 0;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function helpText(): string {
  return `Distil ${VERSION} — focused research digests from RSS and YouTube

Usage:
  distil run [--config FILE] [--days N] [--include-seen] [--review-policy POLICY]
  distil preview [--config FILE] [--days N] [--include-seen]
  distil serve [--config FILE] [--host HOST] [--port N] [--no-browser]
  distil setup [--config FILE]

Commands:
  run       Fetch configured sources, generate a digest, and save it
  preview   Fetch and explain item selection without calling the LLM
  serve     Start the local web UI (default: http://127.0.0.1:5001)
  setup     Prepare and verify configured local services

Options:
  --config FILE   Configuration file (default: config.toml)
  --days N        Lookback window for run (default: 7)
  --include-seen  Reconsider items recorded by a completed run
  --review-policy Resolve all uncertain items with include or exclude (run only)
  --host HOST     Web bind address (default: 127.0.0.1)
  --port N        Web port (default: 5001)
  --no-browser    Do not open the web UI automatically
  -h, --help      Show this help
  -V, --version   Show the version`;
}

function printSelection(result: SelectionResult): void {
  const unresolved = unresolvedSelections(result);
  console.log(
    `Selected ${result.selected.length}/${result.items.length} item(s) for generation; ${unresolved.length} require review.`,
  );
  for (const selection of unresolved) {
    console.log(
      `REVIEW ${selection.item.title}\n  ${selection.reason}\n  ${selection.item.link}`,
    );
  }
}

function printProgress(update: ProgressUpdate): void {
  const label = update.stage === "collecting" ? "collect" : "select";
  console.log(`[${label} ${update.completed}/${update.total}] ${update.message}`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openBrowser(url: string): Promise<void> {
  const command = Deno.build.os === "windows"
    ? { name: "cmd", args: ["/c", "start", "", url] }
    : Deno.build.os === "darwin"
    ? { name: "open", args: [url] }
    : { name: "xdg-open", args: [url] };
  try {
    const result = await new Deno.Command(command.name, {
      args: command.args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).output();
    if (!result.success) console.error("Warning: could not open the browser.");
  } catch {
    console.error("Warning: could not open the browser.");
  }
}

function splitFlag(argument: string): [string, string | undefined] {
  const equals = argument.indexOf("=");
  return equals < 0
    ? [argument, undefined]
    : [argument.slice(0, equals), argument.slice(equals + 1)];
}

function requiredValue(flag: string, remaining: string[]): string {
  const value = remaining.shift();
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}

function integerValue(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${flag} requires an integer`);
  return Number(value);
}
