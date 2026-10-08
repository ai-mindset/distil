import { ensureOllamaReady, isLoopbackUrl } from "../src/ollama.ts";
import type { LlmConfig } from "../src/types.ts";
import { assert, assertEquals } from "./assert.ts";

const config: LlmConfig = {
  provider: "ollama",
  model: "qwen2.5:3b",
  baseUrl: "http://127.0.0.1:11434/v1",
  timeoutMs: 1_000,
  retries: 0,
};

Deno.test("starts Ollama and pulls a missing model", async () => {
  let running = false;
  let starts = 0;
  const pulled: string[] = [];
  await ensureOllamaReady(config, {
    sleep: () => Promise.resolve(),
    startServer: () => {
      starts++;
      running = true;
      return Promise.resolve();
    },
    pullModel: (model) => {
      pulled.push(model);
      return Promise.resolve();
    },
    fetcher: () => {
      if (!running) return Promise.reject(new Error("connection refused"));
      return Promise.resolve(Response.json({ models: [{ name: "other:latest" }] }));
    },
  });

  assertEquals(starts, 1);
  assertEquals(pulled, ["qwen2.5:3b"]);
});

Deno.test("does not pull an existing latest-tag model", async () => {
  let pulled = false;
  await ensureOllamaReady(config, {
    pullModel: () => {
      pulled = true;
      return Promise.resolve();
    },
    fetcher: () => Promise.resolve(Response.json({ models: [{ name: "qwen2.5:3b" }] })),
  });
  assert(!pulled);
});

Deno.test("skips Ollama lifecycle management for remote compatible endpoints", async () => {
  let fetched = false;
  await ensureOllamaReady({ ...config, baseUrl: "https://ollama.com/v1" }, {
    fetcher: () => {
      fetched = true;
      return Promise.resolve(Response.json({}));
    },
  });
  assert(!fetched);
  assert(isLoopbackUrl("http://localhost:11434/v1"));
});
