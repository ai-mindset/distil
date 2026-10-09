import type { FetchLike, LlmConfig } from "./types.ts";

export interface OllamaDependencies {
  fetcher?: FetchLike;
  startServer?: () => Promise<void>;
  pullModel?: (model: string) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function ensureOllamaReady(
  config: LlmConfig,
  dependencies: OllamaDependencies = {},
): Promise<void> {
  if (config.provider !== "ollama") return;
  if (config.manageLocal && !isLoopbackUrl(config.baseUrl)) {
    throw new Error("Managed Ollama requires a loopback endpoint");
  }

  const fetcher = dependencies.fetcher ?? fetch;
  const startServer = dependencies.startServer ?? startOllamaServer;
  const pullModel = dependencies.pullModel ?? pullOllamaModel;
  const sleep = dependencies.sleep ?? delay;
  const tagsUrl = ollamaTagsUrl(config.baseUrl);

  let fetchError: unknown;
  let models: string[] | undefined;
  try {
    models = await fetchModels(fetcher, tagsUrl);
  } catch (error) {
    fetchError = error;
  }
  if (!models && !config.manageLocal) {
    throw new Error(
      `Could not reach the configured Ollama endpoint at ${
        new URL(config.baseUrl).origin
      }. ` +
        `Start the SSH tunnel or remote service and retry: ${message(fetchError)}`,
    );
  }
  if (!models) {
    await startServer();
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(500);
      models = await fetchModels(fetcher, tagsUrl).catch(() => undefined);
      if (models) break;
    }
  }
  if (!models) {
    throw new Error(
      "Ollama did not start. Install Ollama, then run 'ollama serve' and retry.",
    );
  }

  if (!hasModel(models, config.model)) {
    if (!config.manageLocal) {
      throw new Error(
        `Ollama model ${config.model} is not available at the configured endpoint. ` +
          "Pull it on the remote Ollama server and retry.",
      );
    }
    await pullModel(config.model);
  }
}

export function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ||
    hostname === "[::1]";
}

async function fetchModels(fetcher: FetchLike, url: string): Promise<string[]> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const payload = await response.json() as {
    models?: Array<{ name?: string; model?: string }>;
  };
  if (!Array.isArray(payload.models)) throw new Error("Ollama returned malformed JSON");
  return payload.models.flatMap((model) => [model.name, model.model])
    .filter((name): name is string => typeof name === "string");
}

function startOllamaServer(): Promise<void> {
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command("ollama", {
      args: ["serve"],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        "Ollama is not installed. Install it from https://ollama.com/download and retry.",
      );
    }
    throw error;
  }
  child.unref();
  return Promise.resolve();
}

async function pullOllamaModel(model: string): Promise<void> {
  let output: Deno.CommandOutput;
  try {
    output = await new Deno.Command("ollama", {
      args: ["pull", model],
      stdout: "inherit",
      stderr: "piped",
    }).output();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error("Ollama is not installed");
    }
    throw error;
  }
  if (!output.success) {
    const details = new TextDecoder().decode(output.stderr).trim();
    throw new Error(
      `Could not pull Ollama model ${model}${details ? `: ${details}` : ""}`,
    );
  }
}

function ollamaTagsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.origin}/api/tags`;
}

function hasModel(models: string[], requested: string): boolean {
  const normalized = requested.replace(/^ollama\//, "");
  const withoutLatest = normalized.replace(/:latest$/, "");
  return models.some((model) => {
    const candidate = model.replace(/:latest$/, "");
    return model === normalized || candidate === withoutLatest;
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
