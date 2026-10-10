import { ensureOllamaReady, isLoopbackUrl } from "../src/ollama.ts";
import type { LlmConfig } from "../src/types.ts";
import { assert, assertEquals, assertRejects } from "./assert.ts";

const config: LlmConfig = {
  provider: "ollama",
  model: "qwen2.5:3b",
  baseUrl: "http://127.0.0.1:11434/v1",
  manageLocal: true,
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

Deno.test("verifies unmanaged Ollama without running local commands", async () => {
  let fetched = false;
  let started = false;
  let pulled = false;
  await ensureOllamaReady({
    ...config,
    baseUrl: "http://ollama.lan:11434/v1",
    manageLocal: false,
  }, {
    fetcher: () => {
      fetched = true;
      return Promise.resolve(Response.json({ models: [{ name: "qwen2.5:3b" }] }));
    },
    startServer: () => {
      started = true;
      return Promise.resolve();
    },
    pullModel: () => {
      pulled = true;
      return Promise.resolve();
    },
  });
  assert(fetched);
  assert(!started);
  assert(!pulled);
  assert(isLoopbackUrl("http://localhost:11434/v1"));
});

Deno.test("reports unavailable or incomplete unmanaged Ollama endpoints", async () => {
  const unmanaged = { ...config, manageLocal: false };
  let started = false;
  await assertRejects(
    () =>
      ensureOllamaReady(unmanaged, {
        fetcher: () => Promise.reject(new Error("connection refused")),
        startServer: () => {
          started = true;
          return Promise.resolve();
        },
      }),
    /Start the SSH tunnel.*connection refused/,
  );
  assert(!started);

  await assertRejects(
    () =>
      ensureOllamaReady(unmanaged, {
        fetcher: () => Promise.resolve(Response.json({ models: [] })),
      }),
    /Pull it on the remote Ollama server/,
  );
});
